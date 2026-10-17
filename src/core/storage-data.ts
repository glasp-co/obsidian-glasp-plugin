import type {
	CursorKey,
	StorageData,
	UpdateFrequency,
} from "src/types/storage";
import { readStoredReport } from "./import-highlights/sync-report";

/** Anything else (hand-edited, or from a newer version) falls back to daily. */
const UPDATE_FREQUENCIES: readonly UpdateFrequency[] = ["60", "1440", "10080"];

/** JSON with object keys sorted, so two states can be compared by value. */
const stableJson = (value: unknown): string =>
	JSON.stringify(value, (_key, v) => {
		if (!v || typeof v !== "object" || Array.isArray(v)) return v;
		const sorted: Record<string, unknown> = {};
		for (const k of Object.keys(v).sort()) {
			sorted[k] = (v as Record<string, unknown>)[k];
		}
		return sorted;
	});

/** Do two saved states hold the same data, whatever their key order? */
export const sameData = (a: unknown, b: unknown): boolean =>
	stableJson(a) === stableJson(b);

/**
 * What `Plugin.loadData()` returned, sorted: an object is a readable data.json,
 * `null` means there is none yet, anything else (Obsidian gives `undefined`
 * when the file exists but cannot be read or parsed, e.g. after a sync tool
 * left a merge conflict in it) means it must not be overwritten.
 */
export const readStorageFile = (
	raw: unknown,
): { readable: boolean; data: Partial<StorageData> | null } => {
	if (raw === null) return { readable: true, data: null };
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		return { readable: true, data: raw as Partial<StorageData> };
	}
	return { readable: false, data: null };
};

/**
 * The saved settings with every field present: the contents of data.json
 * (from any earlier version) plus defaults. Fields this version does not know
 * are kept, so a device on this version does not strip what a newer one saved.
 */
export const normalizeStorageData = (
	raw: Partial<StorageData> | null | undefined,
): StorageData => {
	const report = readStoredReport(raw?.lastSyncReport);
	const writtenAhead = readWrittenAhead(raw?.writtenAhead);
	const {
		lastSyncReport: _unread,
		writtenAhead: _unreadToo,
		...unknownAndKnown
	} = raw ?? {};
	return {
		...unknownAndKnown,
		accessToken: raw?.accessToken ?? "",
		folder: raw?.folder ?? "",
		kindleFolder: raw?.kindleFolder ?? "",
		summaryFolder: raw?.summaryFolder ?? "",
		bookmarkFolder: raw?.bookmarkFolder ?? "",
		template: raw?.template ?? "",
		kindleTemplate: raw?.kindleTemplate ?? "",
		summaryTemplate: raw?.summaryTemplate ?? "",
		bookmarkTemplate: raw?.bookmarkTemplate ?? "",
		summaryIncludeContent: raw?.summaryIncludeContent ?? false,
		lastUpdated: raw?.lastUpdated ?? "",
		kindleLastUpdated: raw?.kindleLastUpdated ?? "",
		summaryLastUpdated: raw?.summaryLastUpdated ?? "",
		bookmarkLastUpdated: raw?.bookmarkLastUpdated ?? "",
		updateFrequency: UPDATE_FREQUENCIES.includes(
			raw?.updateFrequency as UpdateFrequency,
		)
			? (raw?.updateFrequency as UpdateFrequency)
			: "1440",
		// Guard against a legacy array value from an earlier build.
		basesCreated: Array.isArray(raw?.basesCreated)
			? {}
			: (raw?.basesCreated ?? {}),
		createBasesViews: raw?.createBasesViews ?? true,
		...(report ? { lastSyncReport: report } : {}),
		...(writtenAhead ? { writtenAhead } : {}),
	};
};

const CURSOR_KEYS: CursorKey[] = [
	"lastUpdated",
	"kindleLastUpdated",
	"summaryLastUpdated",
	"bookmarkLastUpdated",
];

/** A stored `writtenAhead` with only well-formed entries, or undefined. */
const readWrittenAhead = (
	value: unknown,
): StorageData["writtenAhead"] | undefined => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	const out: NonNullable<StorageData["writtenAhead"]> = {};
	for (const key of CURSOR_KEYS) {
		const entries = (value as Record<string, unknown>)[key];
		if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
			continue;
		}
		const kept: Record<string, string> = {};
		for (const [url, at] of Object.entries(entries)) {
			if (typeof at === "string") kept[url] = at;
		}
		if (Object.keys(kept).length) out[key] = kept;
	}
	return Object.keys(out).length ? out : undefined;
};
