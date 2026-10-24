import type { SyncReport } from "src/core/import-highlights/sync-report";

export type StorageData = {
	accessToken: string;
	folder: string;
	kindleFolder: string;
	summaryFolder: string;
	bookmarkFolder: string;
	/** Custom Handlebars template for web highlights. Empty = use the default. */
	template: string;
	/** Custom Handlebars template for Kindle highlights. Empty = use the default. */
	kindleTemplate: string;
	/** Custom Handlebars template for summaries. Empty = use the default. */
	summaryTemplate: string;
	/** Custom Handlebars template for bookmarks. Empty = use the default. */
	bookmarkTemplate: string;
	/**
	 * When true, each summary note also fetches and embeds the full page/PDF
	 * Markdown body (one extra API request per summary). Off by default to keep
	 * syncs fast and notes small.
	 */
	summaryIncludeContent: boolean;
	updateFrequency: UpdateFrequency;
	lastUpdated: string;
	kindleLastUpdated: string;
	summaryLastUpdated: string;
	bookmarkLastUpdated: string;
	/**
	 * Map of generated `.base` filename → the source note-folder its filter was
	 * built for. Prevents recreating a view the user deleted, and lets the plugin
	 * rewrite a view when its source folder setting later changes.
	 */
	basesCreated?: Record<string, string>;
	/**
	 * "Create Bases views". Off = no Bases folder and no `.base` file is
	 * created or rewritten. Missing (every 0.3.0 vault) means on.
	 */
	createBasesViews: boolean;
	/**
	 * "Bases folder": where the `.base` views go. Missing (every vault before
	 * this setting, and the default) means `Glasp Bases` at the top of the
	 * vault; read it with `resolveBasesFolder`. Not given a default in
	 * data.json, so a data.json from 0.4.x is not rewritten for it.
	 */
	basesFolder?: string;
	/** What failed in the last sync; never read to decide what to import. */
	lastSyncReport?: SyncReport;
	/**
	 * Per source, the items this device has already written that are newer
	 * than its cursor (URL → `updated_at` and a hash of the item). The cursor
	 * keeps a safety margin,
	 * so the next sync fetches these again; one that comes back unchanged is
	 * left alone, whatever happened to its note since.
	 */
	writtenAhead?: Partial<Record<CursorKey, Record<string, string>>>;
	/**
	 * For those items, what their notes are made from (URL → the
	 * `writtenAhead` version it was taken with and a hash of the item
	 * normalized for its template). An item that comes back with only values
	 * its note does not show changed is left alone too. Kept apart from
	 * `writtenAhead`, which a device still on 0.4.1 matches exactly.
	 */
	shownAhead?: Partial<Record<CursorKey, Record<string, string>>>;
};

/** The four sources' cursor fields. */
export type CursorKey =
	| "lastUpdated"
	| "kindleLastUpdated"
	| "summaryLastUpdated"
	| "bookmarkLastUpdated";

/**
 * 60 : 1h
 * 1440 : 1day
 * 10080 : 1week
 */
export type UpdateFrequency = "60" | "1440" | "10080";
