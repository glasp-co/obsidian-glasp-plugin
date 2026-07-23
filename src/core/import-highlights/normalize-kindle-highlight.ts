import type {
	KindleBook,
	KindleHighlight,
} from "src/glasp-api/kindle-highlight/type";
import { toYaml } from "./frontmatter";

export const normalizeKindleHighlight = (book: KindleBook) => {
	let content = "";
	if (book.summary) {
		content += "#### Summary\n";
		content += `${book.summary}\n\n`;
	}

	if (book.document_note) {
		content += "#### Thoughts & Comments\n";
		content += `${book.document_note}\n\n`;
	}

	content += "#### Highlights & Notes\n\n";
	for (const highlight of book.highlights) {
		content += `${modifyKindleHighlightText(highlight)}\n\n`;
	}

	return {
		// YAML-escaped so a value like the Amazon placeholder author
		// "Your Kindle Notes For:" (trailing colon) cannot corrupt the
		// frontmatter — which would make Obsidian fail to parse URL and break
		// de-duplication, creating a duplicate note on every re-sync.
		url: toYaml(book.url),
		glasp_url: toYaml(book.glasp_url),
		author: toYaml(book.author),
		thumbnail_url: toYaml(book.thumbnail_url),
		tags: book.tags.map((tag) => tag.trim().replace(/\s+/g, "-")),
		updated_at: new Date(book.updated_at).toISOString().slice(0, 10),
		content,
	};
};

const modifyKindleHighlightText = (highlight: KindleHighlight) => {
	let text = `> ${highlight.text}`;
	if (text.includes("\n")) {
		text = text.replace(/\n/g, "");
	}

	if (highlight.note) {
		text += `\n- ${highlight.note}`;
	}
	return text;
};
