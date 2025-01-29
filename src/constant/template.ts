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
