export type SummariesResponse = {
	count: number;
	nextPageCursor: string | null;
	results: Summary[];
};

export type Summary = {
	id: string;
	url: string;
	domain: string;
	title: string;
	thumbnail_url: string;
	summary: string;
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	/**
	 * Full page/PDF Markdown body. Not returned by the export endpoint; attached
	 * on demand (opt-in) via the detail endpoint. null when the summary has no
	 * stored body (e.g. YouTube / pre-feature docs).
	 */
	content?: string | null;
};

export type SummaryDetail = Summary & {
	content: string | null;
	content_format: string | null;
	content_truncated: boolean;
};
