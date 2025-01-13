import type { Highlight, UserHighlight } from "src/glasp-api/highlight/type";

export const normalizeHighlight = (userHighlight: UserHighlight) => {
	let content = "";
	if (userHighlight.document_note) {
		content += "#### Thoughts & Comments\n";
		content += `
${userHighlight.document_note}

`;
	}

	content += "#### Highlights & Notes\n";
	// biome-ignore lint/complexity/noForEach:
	userHighlight.highlights.forEach((highlight) => {
		const text = modifyHighlightText(highlight);
		content += `
${text}
`;
	});
};

const modifyHighlightText = (highlight: Highlight) => {
	let text = `> ${highlight.text}`;
	if (text.includes("\n")) {
		text = text.replace(/\n/g, "");
	}

	if (highlight.note) {
		text += `
---
  **note:**
  ${highlight.note}
`;
	}
	return text;
};
