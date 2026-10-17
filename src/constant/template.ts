/** One highlight, for `{{#each highlights}}` in a custom template. */
export type HighlightTemplateItem = {
	text: string;
	/** Same as `text`. */
	highlight: string;
	note: string;
	color: string;
	/** "1" pink, "2" yellow, "3" green, "4" blue. */
	highlightStyle: string;
	highlighted_at: string;
};

export type HighlightTemplate = {
	url: string;
	glasp_url: string;
	thumbnail_url: string;
	/** The raw tag list; `{{tags}}` renders it comma-separated. */
	tags: string[];
	/** The tags for `Tags: [{{tags_yaml}}]`, quoted where YAML needs it. */
	tags_yaml: string;
	updated_at: string;
	content: string;
	highlights: (HighlightTemplateItem & {
		yt_playback_position: number | null;
	})[];
};

export const HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags_yaml}}]
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
	tags_yaml: string;
	updated_at: string;
	content: string;
	highlights: (HighlightTemplateItem & {
		location: number | null;
		location_type: string;
	})[];
};

export const KINDLE_HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Author: {{author}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags_yaml}}]
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
