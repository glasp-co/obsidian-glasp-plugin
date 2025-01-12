export type HighlightTemplate = {
	url: string;
	tags: string[];
	content: string;
};

export const HIGHLIGHT_TEMPLATE = `---
URL: {{url}}
Tag: [{{tags}}]
---
{{content}}
`;
