export type HighlightsResponse = {
	count: number;
	nextPageCursor: string | null;
	results: UserHighlight[];
};

export type UserHighlight = {
	id: string;
	title: string;
	thumbnail_url: string;
	url: string;
	glasp_url: string;
	domain: string;
	category: "article" | "video" | "tweet" | "pdf" | "book";
	document_note: string | null;
	summary: string;
	tags: string[];
	is_favorite: boolean;
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	highlights: Highlight[];
};

export type Highlight = {
	id: string;
	text: string;
	note: string;
	color: "pink" | "yellow" | "blue" | "green";
	highlighted_at: string; // ISO date string
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	url: string;
	yt_playback_position: number | null; // YouTube timestamp in seconds
};
