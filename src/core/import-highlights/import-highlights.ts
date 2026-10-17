import type { TFile } from "obsidian";
import { APIError } from "src/glasp-api/error";
import { RequestPacer } from "src/glasp-api/request-pacer";
import { ContentSkippedError } from "src/glasp-api/summary/glasp-summary-api";
import type { ObsidianApp } from "src/obsidian-api/obsidian-app";
import {
	NOTE_NAME_MAX_BYTES,
	NOTE_NAME_SHORT_BYTES,
	escapeFilename,
} from "./filename";
import { PathReserver, pathKey } from "./note-paths";
import type { FailureStage, SourceCounts, SyncFailure } from "./sync-report";

export type LastUpdatedKey =
	| "lastUpdated"
	| "kindleLastUpdated"
	| "summaryLastUpdated"
	| "bookmarkLastUpdated";

/**
 * Hard safety cap on the number of pages fetched in a single run. It bounds a
 * run to ~47k items and, more importantly, guarantees termination even if the
 * server ever returns a non-advancing cursor (which would otherwise loop
 * forever and grow memory without bound). It stays below the API's daily
 * request limit, so a long run is not refused at its last pages because of a
 * few other requests that day.
 */
const MAX_PAGES = 950;

/**
 * Tries per page. A page whose request fails on the way (no answer, a
 * connection error, a server error) is asked for again, since one failed page
 * fails the whole fetch and a large one would otherwise never finish.
 */
const PAGE_ATTEMPTS = 3;

const isTransientError = (e: unknown): boolean =>
	e instanceof APIError && (e.status === 0 || e.status >= 500);

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How many note writes to run concurrently. Bounds memory and file-system
 * pressure during a large first sync instead of firing thousands of writes at
 * once.
 */
const WRITE_CONCURRENCY = 16;

/** How many times a create is retried on the next free name. */
const CREATE_ATTEMPTS = 5;

/**
 * Minimum gap between two page requests of one source, so a large fetch
 * (a first sync, or one after a reset) stays under the API's per-minute
 * limit instead of failing part-way on every run.
 */
const PAGE_REQUEST_INTERVAL_MS = 650;

/**
 * How far behind the newest item fetched the saved cursor stays. A change can
 * carry an update time a little earlier than items already fetched, and a
 * repeated request can be answered as it was a moment before; either could
 * otherwise skip a change. The items fetched again because of it
 * are remembered (see `writtenAhead`) and left alone when they come back
 * unchanged.
 */
const CURSOR_SAFETY_MARGIN_MS = 10 * 60 * 1000;

/** At most this many items per source are remembered as written ahead of the cursor. */
const MAX_WRITTEN_AHEAD = 2000;

/**
 * The items written (URL → `updated_at`) that the next sync fetches again,
 * those newer than `cursorMs` (all of them for an empty cursor), newest first.
 */
const writtenAheadOf = (
	before: Readonly<Record<string, string>>,
	written: ReadonlyMap<string, string>,
	cursorMs: number,
): Record<string, string> => {
	const merged = new Map<string, string>(Object.entries(before));
	for (const [url, at] of written) {
		merged.set(url, at);
	}
	const kept = [...merged].filter(
		([, version]) => Number.isNaN(cursorMs) || versionTime(version) > cursorMs,
	);
	kept.sort((a, b) => versionTime(b[1]) - versionTime(a[1]));
	return Object.fromEntries(kept.slice(0, MAX_WRITTEN_AHEAD));
};

const fnv1a = (text: string): string => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
};

/**
 * An item's version as remembered in `writtenAhead`: its `updated_at` and a
 * hash of the item as the API sent it, since a change does not always move
 * `updated_at` (a Kindle book can keep its update time when highlights are
 * added). The same as 0.4.1's, so a device still on 0.4.1 that shares
 * data.json keeps matching it.
 */
const versionOf = (item: Item): string =>
	`${String(item.updated_at ?? "")}#${fnv1a(JSON.stringify(item))}`;

/**
 * A hash of what an item's note is made from (`shown`, the item normalized
 * for the template). A value the note never shows can change from one answer
 * to the next while nothing on the page does, and that alone must not
 * overwrite an edited note.
 */
const shownHashFrom = (shown: unknown): string => {
	let hashed = shown;
	if (shown && typeof shown === "object") {
		// Derived from `tags` by Obsidian's YAML parser, which an Obsidian
		// update can change.
		const { tags_yaml: _derived, ...rest } = shown as Record<string, unknown>;
		hashed = rest;
	}
	return fnv1a(JSON.stringify(hashed) ?? "");
};

/** `shownHashFrom` the item as fetched; null when it cannot be normalized. */
const shownHashOf = <T extends Item>(
	item: T,
	normalize: (item: T) => unknown,
): string | null => {
	try {
		return shownHashFrom(normalize(item));
	} catch (_e) {
		return null;
	}
};

/**
 * A `shownAhead` entry: the `writtenAhead` version it was taken with, and the
 * hash of what the note is made from.
 */
const shownEntry = (version: string, hash: string): string =>
	`${version} ${hash}`;

const splitShownEntry = (entry: string): [string, string] => {
	const i = entry.lastIndexOf(" ");
	return [entry.slice(0, i), entry.slice(i + 1)];
};

/**
 * The `shownAhead` entries worth keeping: those taken with the version
 * `ahead` remembers for their item (one taken with another, e.g. before a
 * device on 0.4.1 wrote the item again, says nothing about its note).
 */
const shownAheadOf = (
	before: Readonly<Record<string, string>>,
	shown: ReadonlyMap<string, string>,
	ahead: Readonly<Record<string, string>>,
): Record<string, string> => {
	const merged = new Map<string, string>(Object.entries(before));
	for (const [url, entry] of shown) {
		merged.set(url, entry);
	}
	const kept: Record<string, string> = {};
	for (const [url, entry] of merged) {
		if (ahead[url] !== undefined && splitShownEntry(entry)[0] === ahead[url]) {
			kept[url] = entry;
		}
	}
	return kept;
};

/** The `updated_at` part of a remembered version, as it was sent. */
const versionUpdatedAt = (version: string): string =>
	version.slice(0, version.lastIndexOf("#"));

/** The `updated_at` part of a remembered version, in ms. */
const versionTime = (version: string): number =>
	Date.parse(version.split("#")[0]);

const sameEntries = (
	a: Readonly<Record<string, string>>,
	b: Readonly<Record<string, string>>,
): boolean => {
	const keys = Object.keys(a);
	return (
		keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
	);
};

/**
 * Frontmatter key used to stamp which Glasp source produced a note. Lets the
 * de-duplication index for a source (e.g. bookmarks) ignore notes written by a
 * different source (e.g. summaries) even when both point at the same folder, so
 * a bookmark import can never overwrite a richer summary note (and vice versa).
 */
const SOURCE_TYPE_KEY = "Glasp";

/** The `Glasp:` values the summary and bookmark sources stamp. */
const MARKED_SOURCES: ReadonlySet<string> = new Set(["summary", "bookmark"]);

type Item = { url: string; title: string; updated_at?: string };

/**
 * Describes one importable source (web / Kindle highlights, summaries or
 * bookmarks). The paging, de-duplication and file creation logic is identical
 * across sources, so the differences (endpoint, template, normalizer, folder,
 * last-updated cursor, filename) are injected here.
 */
export type HighlightImportSource<T extends Item> = {
	label: string;
	folder: string;
	template: string;
	lastUpdatedKey: LastUpdatedKey;
	fetchPage: (args: {
		pageCursor?: string;
		updatedAfter?: string;
	}) => Promise<{ results: T[]; nextPageCursor: string | null }>;
	normalize: (item: T) => unknown;
	/** Derive the note filename from an item. Defaults to the item title. */
	filename?: (item: T) => string;
	/**
	 * Optional async enrichment run per item just before it is written (e.g. a
	 * summary fetching its full body). If it rejects, the item fails: an
	 * existing note is left untouched, a new item gets its note without the
	 * extra data, and the item is fetched again next sync.
	 */
	hydrate?: (item: T) => Promise<T>;
	/**
	 * Value of the `Glasp:` frontmatter marker this source writes. When set, the
	 * de-dup index only matches notes carrying the same marker, isolating this
	 * source from notes written by other sources in a shared folder.
	 */
	sourceType?: string;
};

export type SourceResult = SourceCounts & { failures: SyncFailure[] };

/**
 * `backfill`: fetch every item, not just those changed since the cursor, and
 * create a note only for items that have none anywhere in the vault (e.g.
 * items an earlier version could not save). Existing notes are not touched and
 * the cursor is not moved.
 *
 * `unmarkedFolders`: the output folders of the sources that stamp no `Glasp:`
 * marker (web and Kindle highlights). A marked source sharing one of them
 * cannot tell its own unmarked notes (a custom template may leave the marker
 * out) from theirs.
 */
export type RunOptions = { backfill?: boolean; unmarkedFolders?: string[] };

/** A cursor as a run read it when it started. */
export type CursorRead = {
	value: string;
	generation: number;
	/** Items written ahead of the cursor, URL → version (see `writtenAhead`). */
	written: Readonly<Record<string, string>>;
	/** For those, what their notes are made from (see `shownAhead`). */
	shown: Readonly<Record<string, string>>;
};

/**
 * Read and commit a source's sync cursor. `generation` changes when a setting
 * invalidates work in progress (turning on "Include full page content" resets
 * the summary cursor). A run commits its cursor only if, when the write runs,
 * both the generation and the cursor are still what it read, so a reset made
 * or saved after the run started always wins.
 */
export type CursorStore = {
	read: (key: LastUpdatedKey) => CursorRead;
	commit: (
		key: LastUpdatedKey,
		value: string,
		read: CursorRead,
		written: Record<string, string>,
		shown: Record<string, string>,
	) => Promise<boolean>;
};

export type NoteVault = Pick<
	ObsidianApp,
	| "getAllFiles"
	| "getFileMetadataCache"
	| "readFrontmatter"
	| "frontmatterAtPath"
	| "frontmatterOf"
	| "isSameFile"
	| "resolveFolder"
	| "pathTakenChecker"
	| "render"
	| "createFileAt"
	| "updateFile"
>;

type Constructor = {
	obApp: NoteVault;
	cursors: CursorStore;
	notify: (message: string) => void;
	/** Gap between page requests; tests pass 0. */
	pageIntervalMs?: number;
	/** True once the plugin is unloaded: nothing more is fetched or written. */
	isCancelled?: () => boolean;
	/**
	 * Notes created by this plugin instance, by URL, per source. Merged into
	 * the index because Obsidian indexes a new note's frontmatter a moment
	 * after it is created.
	 */
	sessionNotes?: (key: LastUpdatedKey) => Map<string, TFile>;
};

export const describeError = (e: unknown): string => {
	if (e instanceof APIError) {
		if (e.status === 0) {
			return `Could not reach Glasp${e.message ? ` (${e.message})` : ""}`;
		}
		return `Glasp API error (HTTP ${e.status})${e.message ? `: ${e.message}` : ""}`;
	}
	if (e instanceof Error) {
		return e.message || e.name;
	}
	return String(e);
};

const isAlreadyExists = (e: unknown): boolean =>
	/already exists|EEXIST/i.test(describeError(e));

const isNameTooLong = (e: unknown): boolean =>
	/ENAMETOOLONG|name too long/i.test(describeError(e));

/** The folder as Obsidian names it: "/" as separator, no leading or trailing "/". */
export const normalizeFolder = (folder: string): string =>
	String(folder ?? "")
		.normalize("NFC")
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.trim();

/** An item's `updated_at` in ms, or NaN. */
const updatedAtMs = (item: Item): number =>
	Date.parse(String(item.updated_at ?? ""));

type Planned =
	| {
			kind: "update";
			item: Item;
			/** What the note is made from, remembered once it is written. */
			hash: string | null;
			file: TFile;
			content: string;
	  }
	| {
			kind: "create";
			item: Item;
			hash: string | null;
			name: string;
			title: string;
			path: string;
			content: string;
	  };

export class ImportHighlights {
	private obApp: NoteVault;
	private cursors: CursorStore;
	private notify: (message: string) => void;
	private pageIntervalMs: number;
	private isCancelled: () => boolean;
	private sessionNotes: (key: LastUpdatedKey) => Map<string, TFile>;

	constructor({
		obApp,
		cursors,
		notify,
		pageIntervalMs,
		isCancelled,
		sessionNotes,
	}: Constructor) {
		this.obApp = obApp;
		this.cursors = cursors;
		this.notify = notify;
		this.pageIntervalMs = pageIntervalMs ?? PAGE_REQUEST_INTERVAL_MS;
		this.isCancelled = isCancelled ?? (() => false);
		const own = new Map<LastUpdatedKey, Map<string, TFile>>();
		this.sessionNotes =
			sessionNotes ??
			((key) => {
				let notes = own.get(key);
				if (!notes) {
					notes = new Map();
					own.set(key, notes);
				}
				return notes;
			});
	}

	async run<T extends Item>(
		input: HighlightImportSource<T>,
		{ backfill = false, unmarkedFolders = [] }: RunOptions = {},
	): Promise<SourceResult> {
		const result: SourceResult = {
			source: input.label,
			fetched: 0,
			created: 0,
			updated: 0,
			unchanged: 0,
			failed: 0,
			failures: [],
		};
		// A source-level failure keeps the cursor where it is.
		let holdCursor = false;
		const sourceFailure = (stage: FailureStage, message: string) => {
			holdCursor = true;
			result.failures.push({ source: input.label, stage, message });
		};
		if (this.isCancelled()) {
			return result;
		}

		const configured = normalizeFolder(input.folder);
		if (!configured) {
			sourceFailure(
				"folder",
				"The vault root cannot be the output folder. Choose a folder in Settings → Glasp.",
			);
			return result;
		}
		// The folder as it exists (a saved name can differ in letter case or
		// accent encoding, e.g. after syncing from another device), or null.
		const existingFolder = this.obApp.resolveFolder(configured);
		const folder = existingFolder ?? configured;
		const source = { ...input, folder };
		// Web or Kindle notes in this folder (or below it) carry no marker either,
		// so there only a note with this source's marker counts as its own;
		// unless its template writes no marker, and then an unmarked note is all
		// its own notes can be.
		const ownKey = pathKey(folder);
		const writesMarker =
			!!source.sourceType &&
			new RegExp(
				`^${SOURCE_TYPE_KEY}:[ \t]*["']?${source.sourceType}["']?[ \t]*\r?$`,
				"m",
			).test(source.template);
		const sharedWithUnmarked =
			writesMarker &&
			unmarkedFolders.some((other) => {
				const key = pathKey(normalizeFolder(other));
				return !!key && (key === ownKey || key.startsWith(`${ownKey}/`));
			});

		const cursor = this.cursors.read(source.lastUpdatedKey);
		this.notify(`Updating ${source.label}`);
		const startedAt = Date.now();

		let items: T[];
		try {
			items = await this.pagingFetch({
				fetchPage: source.fetchPage,
				updatedAfter: backfill ? "" : cursor.value,
				// With the folder missing, one page tells whether there is anything
				// to write; fetching the rest every sync would only spend requests.
				maxPages: existingFolder ? MAX_PAGES : 1,
				onLimit: () =>
					result.failures.push({
						source: source.label,
						stage: "fetch",
						message: `Stopped after ${MAX_PAGES} pages (about ${MAX_PAGES * 50} items); older items than those were not imported.`,
					}),
			});
		} catch (e) {
			if (e instanceof APIError && e.status === 401) {
				this.notify("Access token is invalid");
				sourceFailure("fetch", "The access token is invalid (HTTP 401).");
				return result;
			}
			if (!this.isCancelled()) {
				this.notify(`Failed to update ${source.label}`);
			}
			sourceFailure("fetch", describeError(e));
			return result;
		}
		result.fetched = items.length;

		// A missing folder is reported only when there is something to write,
		// and then the cursor holds, so nothing is skipped. It is not created:
		// the user may have deleted it on purpose.
		if (!existingFolder && items.length) {
			sourceFailure(
				"folder",
				`The folder "${configured}" does not exist. Create it, or choose another folder in Settings → Glasp.`,
			);
			return result;
		}

		// The oldest `updated_at` among the items that failed (null when one of
		// them has none we can read); +Infinity when none failed.
		let firstFailedAt: number | null = Number.POSITIVE_INFINITY;
		// Items written or found up to date in this run, URL → version, and
		// URL → what their notes are made from.
		const written = new Map<string, string>();
		const shown = new Map<string, string>();
		if (items.length) {
			try {
				firstFailedAt = await this.writeItems(
					source,
					items,
					result,
					backfill,
					!sharedWithUnmarked,
					backfill ? {} : cursor.written,
					backfill ? {} : cursor.shown,
					written,
					shown,
				);
			} catch (e) {
				sourceFailure("unexpected", describeError(e));
			}
		}
		if (backfill || this.isCancelled() || holdCursor) {
			return result;
		}
		const previous = Date.parse(cursor.value);
		// A cursor later than now (a device clock that ran ahead) would make the
		// server return nothing ever again, so it is always replaced.
		const fromTheFuture = !Number.isNaN(previous) && previous > startedAt;

		// No failure: the safety margin before this device's clock, but never
		// past the newest item fetched (its `updated_at`), so a large batch of
		// changes made long ago is not fetched again on every sync while a device
		// clock that runs ahead skips nothing. Failures: up to just before the
		// oldest item that failed. Every
		// older item was written, so the failed items and everything after them
		// come back next time, and progress is kept. An item whose time cannot
		// be read keeps the cursor where it is. The cursor never moves back,
		// except that a cursor later than now is replaced.
		let next = cursor.value;
		if (firstFailedAt !== null && (items.length || fromTheFuture)) {
			let newest = Number.NEGATIVE_INFINITY;
			for (const item of items) {
				const at = updatedAtMs(item);
				if (at > newest) {
					newest = at;
				}
			}
			let commitAt =
				fromTheFuture || !Number.isFinite(newest)
					? startedAt - CURSOR_SAFETY_MARGIN_MS
					: Math.min(newest - 1, startedAt - CURSOR_SAFETY_MARGIN_MS);
			if (firstFailedAt !== Number.POSITIVE_INFINITY) {
				commitAt = Math.min(commitAt, firstFailedAt - 1);
			}
			if (Number.isNaN(previous) || commitAt > previous || fromTheFuture) {
				next = new Date(commitAt).toISOString();
			}
		}
		// The next sync fetches again every item newer than the cursor; those it
		// finds unchanged are left alone, so a note edited, moved or deleted
		// since is not rewritten, copied or brought back.
		const ahead = writtenAheadOf(cursor.written, written, Date.parse(next));
		const shownAhead = shownAheadOf(cursor.shown, shown, ahead);
		if (
			next === cursor.value &&
			sameEntries(ahead, cursor.written) &&
			sameEntries(shownAhead, cursor.shown)
		) {
			// Nothing to move past and nothing new to remember: no write.
			return result;
		}
		try {
			await this.cursors.commit(
				source.lastUpdatedKey,
				next,
				cursor,
				ahead,
				shownAhead,
			);
		} catch (e) {
			if (!this.isCancelled()) {
				result.failures.push({
					source: source.label,
					stage: "cursor",
					message: `The sync position could not be saved: ${describeError(e)}`,
				});
			}
		}
		return result;
	}

	/**
	 * Fetch every page after `updatedAfter`. A page can hold fewer items than
	 * the page size even when more follow, so only an empty page, a missing
	 * cursor, a cursor that did not advance (a guard against looping) or the
	 * MAX_PAGES cap ends it.
	 */
	private async pagingFetch<T extends Item>({
		fetchPage,
		updatedAfter,
		maxPages,
		onLimit,
	}: {
		fetchPage: HighlightImportSource<T>["fetchPage"];
		updatedAfter?: string;
		maxPages: number;
		onLimit: () => void;
	}): Promise<T[]> {
		const items: T[] = [];
		let pageCursor: string | undefined;
		const pacer = new RequestPacer(this.pageIntervalMs);

		for (let page = 0; page < maxPages; page++) {
			if (this.isCancelled()) {
				break;
			}
			await pacer.turn();
			let response: Awaited<ReturnType<typeof fetchPage>>;
			for (let attempt = 1; ; attempt++) {
				try {
					response = await fetchPage({ pageCursor, updatedAfter });
					break;
				} catch (e) {
					if (
						attempt >= PAGE_ATTEMPTS ||
						!isTransientError(e) ||
						this.isCancelled()
					) {
						throw e;
					}
					await sleep(this.pageIntervalMs * 3 * attempt);
					if (this.isCancelled()) {
						throw e;
					}
				}
			}

			const results = response.results ?? [];
			items.push(...results);

			const next = response.nextPageCursor;
			if (!results.length || !next || next === pageCursor) {
				break;
			}
			pageCursor = next;

			if (page === MAX_PAGES - 1 && maxPages === MAX_PAGES) {
				this.notify(
					`Reached the ${MAX_PAGES}-page limit; some items may not have been imported this run.`,
				);
				onLimit();
			}
		}

		return items;
	}

	/** Returns the oldest `updated_at` of the items that failed (see `run`). */
	private async writeItems<T extends Item>(
		source: HighlightImportSource<T>,
		items: T[],
		result: SourceResult,
		backfill: boolean,
		looseOwnFolder: boolean,
		alreadyWritten: Readonly<Record<string, string>>,
		alreadyShown: Readonly<Record<string, string>>,
		written: Map<string, string>,
		shown: Map<string, string>,
	): Promise<number | null> {
		let firstFailedAt: number | null = Number.POSITIVE_INFINITY;
		let contentSkipped = 0;
		// An item that failed at any stage (e.g. a new summary written without
		// its content) is not remembered, so the next sync tries it again.
		const failedUrls = new Set<string>();
		const remember = (item: Item, hash: string | null) => {
			const version = versionOf(item);
			written.set(item.url, version);
			if (hash !== null) {
				shown.set(item.url, shownEntry(version, hash));
			}
		};
		const wrote = (item: Item, hash: string | null) => {
			if (!failedUrls.has(item.url)) {
				remember(item, hash);
			}
		};
		const fail = (
			item: Item,
			stage: FailureStage,
			e: unknown,
			path?: string,
		) => {
			failedUrls.add(item.url);
			result.failed++;
			const at = updatedAtMs(item);
			if (Number.isNaN(at)) {
				firstFailedAt = null;
			} else if (firstFailedAt !== null) {
				firstFailedAt = Math.min(firstFailedAt, at);
			}
			if (e instanceof ContentSkippedError) {
				// One row for all of them, below.
				contentSkipped++;
				return;
			}
			const message = describeError(e);
			result.failures.push({
				source: source.label,
				stage,
				message:
					stage === "normalize" && /Invalid (time value|Date)/.test(message)
						? "Its date from Glasp could not be read (Invalid time value)."
						: message,
				title: String(item.title ?? ""),
				url: String(item.url ?? ""),
				...(path ? { path } : {}),
			});
		};

		// De-duplicate by URL, keeping the most recently updated, so two items
		// sharing a URL can never race to create the same file. Then write the
		// oldest first: if the run stops part-way (e.g. at a request limit), the
		// items written are the oldest ones, and the cursor can move up to them.
		const byUrl = new Map<string, T>();
		for (const item of items) {
			const seen = byUrl.get(item.url);
			if (!seen || !(updatedAtMs(seen) > updatedAtMs(item))) {
				byUrl.set(item.url, item);
			}
		}
		const sortKey = (item: Item) => {
			const at = updatedAtMs(item);
			return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
		};
		const { index, anyNote } = await this.buildFileIndex(
			source.folder,
			source.sourceType,
			source.lastUpdatedKey,
			{ vaultWide: backfill, looseOwnFolder },
		);
		let candidates = [...byUrl.values()];
		// Written by this device's last sync and unchanged since: left alone,
		// whatever has happened to its note.
		const fresh = candidates.filter((item) => {
			const remembered = alreadyWritten[item.url];
			if (remembered === undefined) {
				return true;
			}
			const hash = shownHashOf(item, source.normalize);
			if (remembered !== versionOf(item)) {
				// Something in the item changed. Left alone only when its update
				// time did not move and nothing its note shows changed, by
				// the hash taken with the remembered version: a web or Kindle note
				// shows only the day, and a note written but not remembered (the
				// plugin unloaded right after) can show more than what was.
				const entry = alreadyShown[item.url];
				if (
					entry === undefined ||
					hash === null ||
					versionUpdatedAt(remembered) !== String(item.updated_at ?? "")
				) {
					return true;
				}
				const [takenWith, shownHash] = splitShownEntry(entry);
				if (takenWith !== remembered || shownHash !== hash) {
					return true;
				}
			}
			remember(item, hash);
			return false;
		});
		result.unchanged += candidates.length - fresh.length;
		candidates = fresh;
		if (backfill) {
			// Only items without a note of their own anywhere in the vault (a note
			// may have been moved out of the output folder); the others are left
			// exactly as they are.
			result.unchanged += candidates.filter((item) =>
				anyNote.has(item.url),
			).length;
			candidates = candidates.filter((item) => !anyNote.has(item.url));
		}
		const ordered = candidates.sort((a, b) => sortKey(a) - sortKey(b));
		const created = this.sessionNotes(source.lastUpdatedKey);
		const reserver = new PathReserver(this.obApp.pathTakenChecker());

		// Write in bounded-concurrency batches to cap memory / FS pressure. Each
		// item is isolated so one bad item cannot abort the whole run.
		for (let i = 0; i < ordered.length; i += WRITE_CONCURRENCY) {
			if (this.isCancelled()) {
				break;
			}
			const batch = ordered.slice(i, i + WRITE_CONCURRENCY);

			// 1. Optional per-item enrichment, concurrently. If it fails, an
			// existing note is left untouched; a new item still gets its note,
			// without the extra data. Either way the item fails, so it is fetched
			// again next sync and filled in then.
			const hydrated = await Promise.all(
				batch.map(async (item) => {
					if (!source.hydrate) {
						return { item, resolved: item };
					}
					try {
						return { item, resolved: await source.hydrate(item) };
					} catch (e) {
						fail(item, "hydrate", e);
						// While backfilling, create nothing: the next click creates the
						// note with its body (a normal sync would not fetch it again).
						return backfill || index.has(item.url)
							? null
							: { item, resolved: item };
					}
				}),
			);

			// 2. Render, and pick each new note's path, one item at a time in a
			// fixed order, so two items whose names clean up to the same file
			// name can never be given the same path.
			const planned: Planned[] = [];
			for (const entry of hydrated) {
				if (!entry) continue;
				const { item, resolved } = entry;
				let data: unknown;
				try {
					data = source.normalize(resolved);
				} catch (e) {
					fail(item, "normalize", e);
					continue;
				}
				let content: string;
				try {
					content = this.obApp.render(source.template, data);
				} catch (e) {
					fail(item, "render", e);
					continue;
				}
				// Hydrated items (a summary with its full body) are hashed as
				// fetched, as they are when they come back.
				const hash =
					resolved === item
						? shownHashFrom(data)
						: shownHashOf(item, source.normalize);
				const existing = index.get(item.url);
				if (existing) {
					planned.push({
						kind: "update",
						item,
						hash,
						file: existing,
						content,
					});
					continue;
				}
				if (backfill) {
					// A note the next click could not find would be created again by
					// every click.
					const problem = this.readBackProblem(
						content,
						item.url,
						source.sourceType,
						looseOwnFolder,
					);
					if (problem) {
						fail(item, "create", new Error(problem));
						continue;
					}
				}
				try {
					const title = String(
						(source.filename ? source.filename(resolved) : resolved.title) ??
							"",
					);
					const name = escapeFilename(title, NOTE_NAME_MAX_BYTES);
					const path = reserver.reserve(source.folder, name);
					planned.push({
						kind: "create",
						item,
						hash,
						name,
						title,
						path,
						content,
					});
				} catch (e) {
					fail(item, "create", e);
				}
			}

			// 3. Write, concurrently. Nothing starts after the plugin is unloaded.
			await Promise.all(
				planned.map(async (plan) => {
					if (this.isCancelled()) {
						return;
					}
					if (plan.kind === "update") {
						try {
							const rewritten = await this.obApp.updateFile(
								plan.file,
								plan.content,
								source.label,
							);
							if (rewritten) {
								result.updated++;
							} else {
								result.unchanged++;
							}
							wrote(plan.item, plan.hash);
						} catch (e) {
							fail(plan.item, "update", e, plan.file.path);
						}
						return;
					}
					try {
						const file = await this.createWithRetry(
							source.folder,
							plan,
							reserver,
							source.sourceType,
						);
						// Guard against a later item resolving to the same URL/path, and
						// against the next pass not seeing it before Obsidian indexes it.
						if (file) {
							index.set(plan.item.url, file);
							created.set(plan.item.url, file);
						}
						result.created++;
						wrote(plan.item, plan.hash);
					} catch (e) {
						const path = e instanceof CreateError ? e.path : plan.path;
						fail(
							plan.item,
							"create",
							e instanceof CreateError ? e.original : e,
							path,
						);
					}
				}),
			);
		}

		if (contentSkipped > 0) {
			result.failures.push({
				source: source.label,
				stage: "hydrate",
				message: backfill
					? `${contentSkipped === 1 ? "1 summary was" : `${contentSkipped} summaries were`} not created because Glasp's request limit for full page content was reached. Run Create missing notes again later (for example tomorrow) to create them.`
					: `Full page content was not downloaded for ${contentSkipped === 1 ? "1 summary" : `${contentSkipped} summaries`} because Glasp's request limit was reached. They are fetched on the next syncs, oldest first.`,
			});
		}
		return firstFailedAt;
	}

	/**
	 * Create at the reserved path. If the vault says the path exists after all,
	 * move to the next free name (up to CREATE_ATTEMPTS tries in all); if the
	 * file system says the name is too long, retry once with a shorter name.
	 */
	private async createWithRetry(
		folder: string,
		plan: Extract<Planned, { kind: "create" }>,
		reserver: PathReserver,
		sourceType: string | undefined,
	): Promise<TFile> {
		let path = plan.path;
		let name = plan.name;
		let shortened = false;
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.obApp.createFileAt(path, plan.content);
			} catch (e) {
				if (attempt >= CREATE_ATTEMPTS) {
					throw new CreateError(path, e);
				}
				if (isAlreadyExists(e)) {
					// This item's own note, appeared since the index was built (synced
					// in from another device, say): matched next time, not copied.
					if (await this.isOwnNoteAt(path, plan.item.url, sourceType)) {
						throw new CreateError(
							path,
							new Error(
								"A note for this item appeared here during the sync (for example from another device); it is matched on the next sync.",
							),
						);
					}
					path = reserver.reserve(folder, name);
					continue;
				}
				if (isNameTooLong(e) && !shortened) {
					shortened = true;
					name = escapeFilename(plan.title, NOTE_NAME_SHORT_BYTES);
					path = reserver.reserve(folder, name);
					continue;
				}
				throw new CreateError(path, e);
			}
		}
	}

	/** Whether the file at `path` is a note of this source for `url`. */
	private async isOwnNoteAt(
		path: string,
		url: string,
		sourceType: string | undefined,
	): Promise<boolean> {
		const frontmatter = await this.obApp.frontmatterAtPath(path);
		if (frontmatter?.URL !== url) {
			return false;
		}
		const marker = frontmatter[SOURCE_TYPE_KEY];
		return sourceType
			? marker === sourceType
			: !(typeof marker === "string" && MARKED_SOURCES.has(marker));
	}

	/**
	 * Why the next Create missing notes could not find a note with this content
	 * (so it would create it again on every click), or null.
	 */
	private readBackProblem(
		content: string,
		url: string,
		sourceType: string | undefined,
		looseOwnFolder: boolean,
	): string | null {
		const frontmatter = this.obApp.frontmatterOf(content);
		if (frontmatter?.URL !== url) {
			return "Its template does not write the item's URL as `URL:` in the frontmatter, so the note could not be found again; Create missing notes did not create it.";
		}
		if (
			sourceType &&
			frontmatter[SOURCE_TYPE_KEY] !== sourceType &&
			!looseOwnFolder
		) {
			return `Its template leaves out the \`Glasp: ${sourceType}\` line, which a folder shared with web or Kindle notes needs to find the note again; Create missing notes did not create it.`;
		}
		return null;
	}

	/**
	 * URL -> existing note, for one source's folder (subfolders included). A
	 * note Obsidian has not indexed yet (just synced in, or just created) is
	 * read directly, so it is not mistaken for a missing one and duplicated.
	 */
	private async buildFileIndex(
		folder: string,
		sourceType: string | undefined,
		key: LastUpdatedKey,
		scan: { vaultWide: boolean; looseOwnFolder: boolean },
	): Promise<{ index: Map<string, TFile>; anyNote: Set<string> }> {
		const index = new Map<string, TFile>();
		// For Create missing notes: URLs that already have a note of this source.
		const anyNote = new Set<string>();
		const prefix = `${folder}/`;
		for (const file of this.obApp.getAllFiles()) {
			if (!file.path.endsWith(".md")) {
				continue;
			}
			const inFolder = file.path.startsWith(prefix);
			if (!inFolder && !scan.vaultWide) {
				continue;
			}
			// Read the file itself when Obsidian has no frontmatter for it: not
			// indexed yet (just synced in or just created), or frontmatter it
			// cannot parse (0.3.0 wrote some, e.g. for a tag with a comma). The
			// note is then updated in place, which also repairs it. Elsewhere in
			// the vault only what Obsidian has indexed is used, and a note read
			// directly only when it starts with frontmatter Obsidian could not
			// parse (Obsidian then lists a "yaml" section but no frontmatter).
			const cache = this.obApp.getFileMetadataCache(file);
			const frontmatter =
				cache?.frontmatter ??
				(inFolder || cache?.sections?.[0]?.type === "yaml"
					? await this.obApp.readFrontmatter(file)
					: null);
			const marker = frontmatter?.[SOURCE_TYPE_KEY];
			const url = frontmatter?.URL;
			if (typeof url !== "string" || !url) {
				continue;
			}
			// A source that stamps a marker only matches its own notes; one that
			// does not (web, Kindle) never matches a note a marked source wrote,
			// so a shared or nested folder cannot cross-clobber notes. Any other
			// `Glasp:` value (e.g. one a user's own template adds) is not a marker.
			const marked = typeof marker === "string" && MARKED_SOURCES.has(marker);
			const own = sourceType ? marker === sourceType : !marked;
			// In its own folder a marked source also counts unmarked notes (its
			// template may leave the marker out), unless web or Kindle notes can
			// be there too.
			if (own || (inFolder && scan.looseOwnFolder && !marked)) {
				anyNote.add(url);
			}
			if (inFolder && own) {
				index.set(url, file);
			}
		}
		for (const [url, file] of this.sessionNotes(key)) {
			if (
				!index.has(url) &&
				file.path.startsWith(prefix) &&
				this.obApp.isSameFile(file)
			) {
				index.set(url, file);
				anyNote.add(url);
			}
		}
		return { index, anyNote };
	}
}

/** A create that failed at `path` (the last path tried). */
class CreateError extends Error {
	constructor(
		readonly path: string,
		readonly original: unknown,
	) {
		super(describeError(original));
	}
}
