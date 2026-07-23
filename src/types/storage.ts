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
};

/**
 * 60 : 1h
 * 1440 : 1day
 * 10080 : 1week
 */
export type UpdateFrequency = "60" | "1440" | "10080";
