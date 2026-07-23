import type { KindleBook } from "src/glasp-api/kindle-highlight/type";
import { describe, expect, test } from "vitest";
import { normalizeKindleHighlight } from "./normalize-kindle-highlight";

const BASE_BOOK: KindleBook = {
	id: "book123",
	title: "Sapiens: A Brief History of Humankind",
	author: "Yuval Noah Harari",
	thumbnail_url: "https://m.media-amazon.com/images/I/example.jpg",
	url: "https://www.amazon.com/dp/0062316095",
	glasp_url: "https://glasp.co/user/kindle/book123",
	domain: "amazon.com",
	category: "book",
	document_note: "",
	summary: "",
	tags: ["history", "anthropology"],
	is_favorite: false,
	created_at: "2024-01-06T12:00:00Z",
	updated_at: "2024-01-06T12:00:00Z",
	highlights: [
		{
			id: "highlight123",
			text: "We did not domesticate wheat. It domesticated us.",
			note: "A great reframing of agricultural revolution.",
			color: "yellow",
			highlighted_at: "2024-01-06T12:00:00Z",
			created_at: "2024-01-06T12:00:00Z",
			updated_at: "2024-01-06T12:00:00Z",
			url: "https://www.amazon.com/dp/0062316095",
			location: 1247,
			location_type: "location",
			highlight_url: "",
		},
	],
};

describe("normalizeKindleHighlight", () => {
	test("YAML-escapes author, url, glasp_url and keeps a UTC YYYY-MM-DD date", () => {
		const result = normalizeKindleHighlight(BASE_BOOK);
		expect(result.author).toBe('"Yuval Noah Harari"');
		expect(result.url).toBe('"https://www.amazon.com/dp/0062316095"');
		expect(result.glasp_url).toBe('"https://glasp.co/user/kindle/book123"');
		expect(result.updated_at).toBe("2024-01-06");
	});

	test("an author with a trailing colon cannot corrupt the frontmatter", () => {
		// Amazon exports this placeholder; the trailing ':' broke YAML parsing
		// (and thus de-duplication) when emitted raw.
		const result = normalizeKindleHighlight({
			...BASE_BOOK,
			author: "Your Kindle Notes For:",
		});
		expect(result.author).toBe('"Your Kindle Notes For:"');
		expect(result.author).not.toContain("\n");
	});

	test("normalizes tags by trimming and replacing whitespace with hyphens", () => {
		const result = normalizeKindleHighlight({
			...BASE_BOOK,
			tags: [" world history ", "ancient anthropology"],
		});
		expect(result.tags).toEqual(["world-history", "ancient-anthropology"]);
	});

	test("renders highlight text as a quote with its note", () => {
		const result = normalizeKindleHighlight(BASE_BOOK);
		expect(result.content).toContain(
			"> We did not domesticate wheat. It domesticated us.",
		);
		expect(result.content).toContain(
			"- A great reframing of agricultural revolution.",
		);
	});

	test("includes 'Thoughts & Comments' only when document_note is present", () => {
		expect(normalizeKindleHighlight(BASE_BOOK).content).not.toContain(
			"#### Thoughts & Comments",
		);
		expect(
			normalizeKindleHighlight({
				...BASE_BOOK,
				document_note: "my note",
			}).content,
		).toContain("#### Thoughts & Comments");
	});
});
