export type HighlightTemplate = {
	url: string;
	glasp_url: string;
	tags: string[];
	updated_at: string;
	content: string;
};

export const HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
`;

export type KindleHighlightTemplate = {
	url: string;
	glasp_url: string;
	author: string;
	tags: string[];
	updated_at: string;
	content: string;
};

export const KINDLE_HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Author: {{author}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
`;
