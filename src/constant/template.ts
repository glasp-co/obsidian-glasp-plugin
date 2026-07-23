export type HighlightTemplate = {
	url: string;
	glasp_url: string;
	thumbnail_url: string;
	tags: string[];
	updated_at: string;
	content: string;
};

export const HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
`;

export type KindleHighlightTemplate = {
	url: string;
	glasp_url: string;
	author: string;
	thumbnail_url: string;
	tags: string[];
	updated_at: string;
	content: string;
};

export const KINDLE_HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Author: {{author}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
`;

export type SummaryTemplate = {
	url: string;
	title: string;
	domain: string;
	thumbnail_url: string;
	created_at: string;
	updated_at: string;
	summary: string;
	/** Full-page "## Content" block, or "" when not fetched. */
	content: string;
};

export const SUMMARY_TEMPLATE = `---
Glasp: summary
URL: {{url}}
Title: {{title}}
Domain: {{domain}}
Thumbnail: {{thumbnail_url}}
Created: {{created_at}}
Updated: {{updated_at}}
---

## Summary

{{summary}}
{{content}}`;

export type BookmarkTemplate = {
	url: string;
	title: string;
	domain: string;
	category: string;
	description: string;
	thumbnail_url: string;
	created_at: string;
	updated_at: string;
	title_text: string;
	url_text: string;
};

export const BOOKMARK_TEMPLATE = `---
Glasp: bookmark
URL: {{url}}
Title: {{title}}
Domain: {{domain}}
Category: {{category}}
Description: {{description}}
Thumbnail: {{thumbnail_url}}
Created: {{created_at}}
Updated: {{updated_at}}
---

[{{title_text}}](<{{url_text}}>)
`;
