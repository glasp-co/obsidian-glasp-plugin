export type KindleHighlightsResponse = {
	count: number;
	nextPageCursor: string | null;
	results: KindleBook[];
};

export type KindleBook = {
	id: string;
	title: string;
	author: string;
	thumbnail_url: string;
	url: string; // Amazon product URL
	glasp_url: string; // https://glasp.co/{uid}/kindle/{id}
	domain: string;
	category: "book"; // Always "book" for Kindle
	document_note: string | null;
	summary: string;
	tags: string[];
	is_favorite: boolean;
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	highlights: KindleHighlight[];
};

export type KindleHighlight = {
	id: string;
	text: string;
	note: string;
	color: "pink" | "yellow" | "blue" | "orange";
	highlighted_at: string; // ISO date string
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
	url: string;
	location: number | null; // Kindle location number
	location_type: "page" | "location" | "time_offset";
	highlight_url: string;
};
