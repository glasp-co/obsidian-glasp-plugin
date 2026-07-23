import type { Bookmark } from "src/glasp-api/bookmark/type";
import { describe, expect, test } from "vitest";
import { normalizeBookmark } from "./normalize-bookmark";

const BASE_BOOKMARK: Bookmark = {
	id: "abc123",
	url: "https://glasp.co/",
	title: "Glasp",
	domain: "glasp.co",
	description: "Social web highlighter",
	thumbnail_url: "https://glasp.co/thumb.jpg",
	category: "article",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-02-01T00:00:00.000Z",
};

describe("normalizeBookmark", () => {
	test("frontmatter string fields are YAML-quoted", () => {
		const result = normalizeBookmark(BASE_BOOKMARK);
		expect(result.url).toBe('"https://glasp.co/"');
		expect(result.title).toBe('"Glasp"');
		expect(result.domain).toBe('"glasp.co"');
		expect(result.category).toBe('"article"');
	});

	test("ISO timestamps are passed through raw for Bases date inference", () => {
		const result = normalizeBookmark(BASE_BOOKMARK);
		expect(result.created_at).toBe("2026-01-01T00:00:00.000Z");
		expect(result.updated_at).toBe("2026-02-01T00:00:00.000Z");
	});

	test("a title with a colon or newline cannot break the frontmatter", () => {
		const result = normalizeBookmark({
			...BASE_BOOKMARK,
			title: "Breaking: news\nInjected: evil",
		});
		expect(result.title).not.toContain("\n");
		expect(result.title).toBe('"Breaking: news\\nInjected: evil"');
	});

	test("title_text strips brackets and falls back to url when empty", () => {
		expect(
			normalizeBookmark({ ...BASE_BOOKMARK, title: "[x]" }).title_text,
		).toBe("x");
		expect(normalizeBookmark({ ...BASE_BOOKMARK, title: "" }).title_text).toBe(
			"https://glasp.co/",
		);
	});
});
