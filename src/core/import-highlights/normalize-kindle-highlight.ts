import type {
	KindleBook,
	KindleHighlight,
} from "src/glasp-api/kindle-highlight/type";

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
		url: book.url,
		glasp_url: book.glasp_url,
		author: book.author,
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
