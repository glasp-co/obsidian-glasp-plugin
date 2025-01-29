import { moment } from "obsidian";
import type { Highlight, UserHighlight } from "src/glasp-api/highlight/type";

export const normalizeHighlight = (userHighlight: UserHighlight) => {
	let content = "";
	if (userHighlight.summary) {
		content += "#### Summary\n";
		content += `${userHighlight.summary}\n\n`;
	}

	if (userHighlight.document_note) {
		content += "#### Thoughts & Comments\n";
		content += `${userHighlight.document_note}\n\n`;
	}

	content += "#### Highlights & Notes\n\n";
	// biome-ignore lint/complexity/noForEach:
	userHighlight.highlights.forEach((highlight) => {
		const text = modifyHighlightText(highlight);
		content += `${text}\n\n`;
	});

	return {
		url: userHighlight.url,
		glasp_url: userHighlight.glasp_url,
		tags: userHighlight.tags.map((tag) => tag.trim().replace(/\s+/g, "-")),
		updated_at: moment(userHighlight.updated_at).format("YYYY-MM-DD"),
		content,
	};
};

const modifyHighlightText = (highlight: Highlight) => {
	let text = `> ${highlight.text}`;
	if (text.includes("\n")) {
		text = text.replace(/\n/g, "");
	}

	if (highlight.note) {
		text += `\n- ${highlight.note}`;
	}
	return text;
};
