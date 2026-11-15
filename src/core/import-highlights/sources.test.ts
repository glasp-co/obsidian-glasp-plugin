import type { UserHighlight } from "src/glasp-api/highlight/type";
import { describe, expect, test } from "vitest";
import {
	highlightTitleValues,
	normalizeHighlight,
} from "./normalize-highlight";
import { webHighlightSource } from "./sources";

const page: UserHighlight = {
	id: "t",
	title: "A page",
	thumbnail_url: "",
	url: "https://example.com/a",
	glasp_url: "https://glasp.co/u/p/a",
	domain: "example.com",
	category: "article",
	document_note: "",
	summary: "",
	tags: ["reading"],
	is_favorite: false,
	created_at: "2024-05-28T06:43:59.370Z",
	updated_at: "2025-01-13T06:05:30.001Z",
	highlights: [],
};

describe("webHighlightSource", () => {
	test("the values that decide whether a note is written again are those earlier versions used", () => {
		const { normalize } = webHighlightSource("token", "Glasp");
		expect(normalize(page)).not.toHaveProperty("title");
		expect(JSON.stringify(normalize(page))).toBe(
			JSON.stringify(normalizeHighlight(page)),
		);
	});

	test("its template can also show the title", () => {
		const { unhashed } = webHighlightSource(
			"token",
			"Glasp",
			"# {{title_text}}\n",
		);
		expect(unhashed?.(page)).toEqual(highlightTitleValues(page));
		expect(unhashed?.(page)).toEqual({
			title: '"A page"',
			title_text: "A page",
		});
	});
});
