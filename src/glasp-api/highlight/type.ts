export type HighlightsResponse = {
	count: number;
	nextPageCursor: string | null;
	results: HighlightResponse[];
};

type HighlightResponse = {
	id: string;
	title: string;
	thumbnail_url: string; // URL
	url: string; // URL
	glasp_url: string; // URL
	domain: string;
	category: ContentCategory;
	document_note: string | null;
	summary: string;
	tags: string[];
	is_favorite: boolean;
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	highlights: HighlightItemResponse[];
};

type HighlightItemResponse = {
	id: string;
	text: string;
	note: string;
	color: string;
	highlighted_at: string; // ISO date string
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	url: string; // URL
	playback_position: number | null;
};

type ContentCategory = "article" | "video" | "tweet" | "pdf" | "book";
