export type StorageData = {
	accessToken: string;
	folder: string;
	kindleFolder: string;
	/** Custom Handlebars template for web highlights. Empty = use the default. */
	template: string;
	/** Custom Handlebars template for Kindle highlights. Empty = use the default. */
	kindleTemplate: string;
	updateFrequency: UpdateFrequency;
	lastUpdated: string;
	kindleLastUpdated: string;
};

/**
 * 60 : 1h
 * 1440 : 1day
 * 10080 : 1week
 */
export type UpdateFrequency = "60" | "1440" | "10080";
