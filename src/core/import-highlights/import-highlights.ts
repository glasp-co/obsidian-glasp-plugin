import type { TFile } from "obsidian";
import { APIError } from "src/glasp-api/error";
import {
	type ObsidianApp,
	ObsidianNotice,
	type ObsidianPlugin,
} from "src/obsidian-api";
import type { StorageData } from "src/types/storage";

type Constructor = {
	obApp: ObsidianApp;
	obPlugin: ObsidianPlugin;
	storageData: StorageData;
};

type LastUpdatedKey =
	| "lastUpdated"
	| "kindleLastUpdated"
	| "summaryLastUpdated"
	| "bookmarkLastUpdated";

/**
 * The server returns at most this many results per page. A page smaller than
 * this is treated as the last page.
 */
const PAGE_SIZE = 50;

/**
 * Hard safety cap on the number of pages fetched in a single run. At PAGE_SIZE
 * per page this bounds a run to ~50k items and, more importantly, guarantees
 * termination even if the server ever returns a non-advancing cursor (which
 * would otherwise loop forever and grow memory without bound).
 */
const MAX_PAGES = 1000;

/**
 * How many note writes to run concurrently. Bounds memory and file-system
 * pressure during a large first sync instead of firing thousands of writes at
 * once.
 */
const WRITE_CONCURRENCY = 16;

/**
 * Frontmatter key used to stamp which Glasp source produced a note. Lets the
 * de-duplication index for a source (e.g. bookmarks) ignore notes written by a
 * different source (e.g. summaries) even when both point at the same folder, so
 * a bookmark import can never overwrite a richer summary note (and vice versa).
 */
const SOURCE_TYPE_KEY = "Glasp";

/**
 * Describes one importable source (web / Kindle highlights, summaries or
 * bookmarks). The paging, de-duplication and file creation logic is identical
 * across sources, so the differences (endpoint, template, normalizer, folder,
 * last-updated cursor, filename) are injected here.
 */
export type HighlightImportSource<T extends { url: string; title: string }> = {
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
	 * summary fetching its full body). Best-effort: it should resolve to the
	 * original item on failure rather than reject.
	 */
	hydrate?: (item: T) => Promise<T>;
	/**
	 * Value of the `Glasp:` frontmatter marker this source writes. When set, the
	 * de-dup index only matches notes carrying the same marker, isolating this
	 * source from notes written by other sources in a shared folder.
	 */
	sourceType?: string;
};

export class ImportHighlights {
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;
	private storageData: StorageData;

	constructor({ obApp, obPlugin, storageData }: Constructor) {
		this.obApp = obApp;
		this.obPlugin = obPlugin;
		this.storageData = storageData;
	}

	async run<T extends { url: string; title: string }>(
		source: HighlightImportSource<T>,
	) {
		new ObsidianNotice(`Updating ${source.label}`);

		try {
			const items = await this.pagingFetch({
				fetchPage: source.fetchPage,
				updatedAfter: this.storageData[source.lastUpdatedKey],
			});

			if (!items.length) {
				this.updateLastUpdate(source.lastUpdatedKey);
				return;
			}

			const failed = await this.writeItems(source, items);
			if (failed > 0) {
				// Some notes could not be written. Do NOT advance the cursor, so those
				// items are retried on the next sync instead of being skipped forever.
				new ObsidianNotice(
					`Updated ${source.label} but ${failed} item(s) could not be saved; will retry next sync.`,
				);
			} else {
				this.updateLastUpdate(source.lastUpdatedKey);
			}
		} catch (e) {
			if (e instanceof APIError) {
				if (e.status === 401) {
					new ObsidianNotice("Access token is invalid");
					return;
				}
			}
			new ObsidianNotice(`Failed to update ${source.label}`);
		}
	}

	/**
	 * Iteratively fetch every page after `updatedAfter`. Terminates on an empty
	 * page, a short (last) page, a null cursor, a non-advancing cursor (server
	 * bug guard) or the MAX_PAGES cap — so it can never loop forever.
	 */
	private async pagingFetch<T extends { url: string; title: string }>({
		fetchPage,
		updatedAfter,
	}: {
		fetchPage: HighlightImportSource<T>["fetchPage"];
		updatedAfter?: string;
	}): Promise<T[]> {
		const items: T[] = [];
		let pageCursor: string | undefined;

		for (let page = 0; page < MAX_PAGES; page++) {
			const response = await fetchPage({ pageCursor, updatedAfter });

			const results = response.results ?? [];
			if (!results.length) {
				break;
			}
			items.push(...results);

			// A short page is the last page.
			if (results.length < PAGE_SIZE) {
				break;
			}

			const next = response.nextPageCursor;
			// No further cursor, or a cursor that did not advance: stop rather
			// than re-fetching the same page forever.
			if (!next || next === pageCursor) {
				break;
			}
			pageCursor = next;

			if (page === MAX_PAGES - 1) {
				new ObsidianNotice(
					`Reached the ${MAX_PAGES}-page limit; some items may not have been imported this run.`,
				);
			}
		}

		return items;
	}

	/** Returns the number of items that could not be written. */
	private async writeItems<T extends { url: string; title: string }>(
		source: HighlightImportSource<T>,
		items: T[],
	): Promise<number> {
		// De-duplicate by URL up front (keep the latest occurrence) so two items
		// sharing a URL can never race to create the same file.
		const deduped = Array.from(
			new Map(items.map((item) => [item.url, item])).values(),
		);

		// Build a URL -> existing-file index once (O(files)) instead of scanning
		// every file for every item (O(items * files)).
		const index = this.buildFileIndex(source.folder, source.sourceType);

		// Write in bounded-concurrency batches to cap memory / FS pressure. Each
		// item is isolated so one bad item (e.g. an unwritable filename) cannot
		// abort the whole run.
		let failed = 0;
		for (let i = 0; i < deduped.length; i += WRITE_CONCURRENCY) {
			const batch = deduped.slice(i, i + WRITE_CONCURRENCY);
			const results = await Promise.all(
				batch.map(async (item) => {
					try {
						// Optional per-item enrichment (e.g. fetch a summary's full body).
						const resolved = source.hydrate ? await source.hydrate(item) : item;
						const existing = index.get(item.url);
						if (existing) {
							await this.obApp.updateFile({
								file: existing,
								template: source.template,
								data: source.normalize(resolved),
							});
						} else {
							const created = await this.obApp.createFile({
								folder: source.folder,
								filename: source.filename
									? source.filename(resolved)
									: resolved.title,
								template: source.template,
								data: source.normalize(resolved),
							});
							// Guard against a later item resolving to the same URL/path.
							index.set(item.url, created);
						}
						return true;
					} catch (_e) {
						// Skip this item; keep importing the rest.
						return false;
					}
				}),
			);
			failed += results.filter((ok) => !ok).length;
		}
		return failed;
	}

	private buildFileIndex(
		folder: string,
		sourceType?: string,
	): Map<string, TFile> {
		const index = new Map<string, TFile>();
		const prefix = `${folder}/`;
		for (const file of this.obApp.getAllFiles()) {
			if (!file.path.startsWith(prefix)) {
				continue;
			}
			const frontmatter = this.obApp.getFileMetadataCache(file)?.frontmatter;
			// When this source stamps a marker, only match notes from the same source
			// so a shared folder cannot cross-clobber another source's notes.
			if (sourceType && frontmatter?.[SOURCE_TYPE_KEY] !== sourceType) {
				continue;
			}
			const url = frontmatter?.URL;
			if (typeof url === "string" && url) {
				index.set(url, file);
			}
		}
		return index;
	}

	private updateLastUpdate(key: LastUpdatedKey) {
		this.storageData[key] = new Date().toISOString();
		this.obPlugin.saveData(this.storageData);
	}
}
