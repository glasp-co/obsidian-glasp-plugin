export type BookmarksResponse = {
	count: number;
	nextPageCursor: string | null;
	results: Bookmark[];
};

export type Bookmark = {
	id: string;
	url: string;
	title: string;
	domain: string;
	description: string;
	thumbnail_url: string;
	category: string;
	created_at: string; // ISO date string
	updated_at: string; // ISO date string
};
