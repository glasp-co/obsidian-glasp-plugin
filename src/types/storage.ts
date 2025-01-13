export type StorageData = {
	accessToken: string;
	folder: string;
	updateFrequency: UpdateFrequency;
	lastUpdated: string;
};

/**
 * 60 : 1h
 * 1440 : 1day
 * 10080 : 1week
 */
export type UpdateFrequency = "60" | "1440" | "10080";
