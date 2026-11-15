import type { UserHighlight } from "src/glasp-api/highlight/type";
import { describe, expect, test } from "vitest";
import {
	highlightTitleValues,
	normalizeHighlight,
} from "./normalize-highlight";
import { renderTemplate } from "./template-engine";

describe("normalizeHighlight", () => {
	describe("when Thoughts & Comments is not included", () => {
		const BASE_USER_HIGHLIGHT: UserHighlight = {
			id: "test",
			title: "test title",
			thumbnail_url: "https://glasp.co/images/ogps/glasp_ogp.jpeg",
			url: "https://glasp.co/",
			glasp_url: "https://glasp.co/",
			domain: "glasp.co",
			category: "article",
			document_note: "",
			summary: "",
			tags: [],
			is_favorite: false,
			created_at: "2024-05-28T06:43:59.370Z",
			updated_at: "2025-01-13T06:05:30.001Z",
			highlights: [
				{
					id: "test1",
					text: "Test1 Text",
					note: "note1",
					color: "pink",
					highlighted_at: "2024-05-28T06:43:59.370Z",
					created_at: "2024-05-28T06:43:59.370Z",
					updated_at: "2024-05-28T06:43:59.370Z",
					url: "https://glasp.co/",
					yt_playback_position: null,
				},
				{
					id: "test2",
					text: "Test1 Text2",
					note: "",
					color: "pink",
					highlighted_at: "2024-05-28T06:47:07.065Z",
					created_at: "2024-05-28T06:47:07.065Z",
					updated_at: "2024-05-28T06:47:07.065Z",
					url: "https://glasp.co/",
					yt_playback_position: null,
				},
			],
		};

		test("content doesn't include 'Thoughts & Comments' ", () => {
			const result = normalizeHighlight(BASE_USER_HIGHLIGHT);
			expect(result.content).not.toContain("#### Thoughts & Comments");
			expect(result.url).toBeTruthy();
			expect(result.glasp_url).toBeTruthy();
			expect(result.tags).toBeDefined();
			expect(result.updated_at).toBe("2025-01-13");
		});
	});

	describe("when Thoughts & Comments is included", () => {
		const BASE_USER_HIGHLIGHT: UserHighlight = {
			id: "test",
			title: "test title",
			thumbnail_url: "https://glasp.co/images/ogps/glasp_ogp.jpeg",
			url: "https://glasp.co/",
			glasp_url: "https://glasp.co/",
			domain: "glasp.co",
			category: "article",
			document_note: "test test",
			summary: "",
			tags: [],
			is_favorite: false,
			created_at: "2024-05-28T06:43:59.370Z",
			updated_at: "2025-01-13T06:05:30.001Z",
			highlights: [
				{
					id: "test1",
					text: "Test1 Text",
					note: "note1",
					color: "pink",
					highlighted_at: "2024-05-28T06:43:59.370Z",
					created_at: "2024-05-28T06:43:59.370Z",
					updated_at: "2024-05-28T06:43:59.370Z",
					url: "https://glasp.co/",
					yt_playback_position: null,
				},
				{
					id: "test2",
					text: "Test1 Text2",
					note: "",
					color: "pink",
					highlighted_at: "2024-05-28T06:47:07.065Z",
					created_at: "2024-05-28T06:47:07.065Z",
					updated_at: "2024-05-28T06:47:07.065Z",
					url: "https://glasp.co/",
					yt_playback_position: null,
				},
			],
		};

		test("content includes 'Thoughts & Comments' ", () => {
			const result = normalizeHighlight(BASE_USER_HIGHLIGHT);
			expect(result.content).toContain("#### Thoughts & Comments");
			expect(result.url).toBeTruthy();
			expect(result.glasp_url).toBeTruthy();
			expect(result.tags).toBeDefined();
			expect(result.updated_at).toBe("2025-01-13");
		});
	});

	test("highlight text is enclosed in quotation marks and included in the content", () => {
		const BASE_USER_HIGHLIGHT: UserHighlight = {
			id: "test",
			title: "test title",
			thumbnail_url: "https://glasp.co/images/ogps/glasp_ogp.jpeg",
			url: "https://glasp.co/",
			glasp_url: "https://glasp.co/",
			domain: "glasp.co",
			category: "article",
			document_note: "test test",
			summary: "",
			tags: [],
			is_favorite: false,
			created_at: "2024-05-28T06:43:59.370Z",
			updated_at: "2025-01-13T06:05:30.001Z",
			highlights: [
				{
					id: "test1",
					text: "Test1 Text",
					note: "note1",
					color: "pink",
					highlighted_at: "2024-05-28T06:43:59.370Z",
					created_at: "2024-05-28T06:43:59.370Z",
					updated_at: "2024-05-28T06:43:59.370Z",
					url: "https://glasp.co/",
					yt_playback_position: null,
				},
				{
					id: "test2",
					text: "Test1 Text2",
					note: "",
					color: "pink",
					highlighted_at: "2024-05-28T06:47:07.065Z",
					created_at: "2024-05-28T06:47:07.065Z",
					updated_at: "2024-05-28T06:47:07.065Z",
					url: "https://glasp.co/",
					yt_playback_position: null,
				},
			],
		};

		const result = normalizeHighlight(BASE_USER_HIGHLIGHT);
		expect(result.content).toContain(
			`> ${BASE_USER_HIGHLIGHT.highlights[0].text}`,
		);
		expect(result.content).toContain(
			`> ${BASE_USER_HIGHLIGHT.highlights[1].text}`,
		);
		expect(result.url).toBeTruthy();
		expect(result.glasp_url).toBeTruthy();
		expect(result.tags).toBeDefined();
		expect(result.updated_at).toBe("2025-01-13");
	});
});

describe("highlightTitleValues", () => {
	const page = (
		title: string,
		url = "https://example.com/a",
	): UserHighlight => ({
		id: "t",
		title,
		thumbnail_url: "",
		url,
		glasp_url: "https://glasp.co/u/p/a",
		domain: "example.com",
		category: "article",
		document_note: "",
		summary: "",
		tags: [],
		is_favorite: false,
		created_at: "2024-05-28T06:43:59.370Z",
		updated_at: "2025-01-13T06:05:30.001Z",
		highlights: [],
	});

	test("the title is not among the values that decide whether a note is written again", () => {
		expect(Object.keys(normalizeHighlight(page("A page")))).toEqual([
			"url",
			"glasp_url",
			"thumbnail_url",
			"tags",
			"tags_yaml",
			"updated_at",
			"content",
			"highlights",
		]);
	});

	test("{{title}} is quoted for frontmatter; {{title_text}} is unquoted on one line, without [ and ]", () => {
		const values = highlightTitleValues(page('C#: a "guide"\n[[draft]]'));
		expect(values.title).toBe('"C#: a \\"guide\\"\\n[[draft]]"');
		expect(values.title_text).toBe('C#: a "guide" draft');
	});

	test("{{title}} escapes a control character YAML does not allow", () => {
		const control = String.fromCharCode(0x7f);
		const escaped = `${String.fromCharCode(0x5c)}u007f`;
		expect(highlightTitleValues(page(`a${control}b`)).title).toBe(
			`"a${escaped}b"`,
		);
	});

	test("{{title_text}} is the page's URL, the same way, when it has no title", () => {
		expect(
			highlightTitleValues(page("", "https://example.com/?q=[[draft]]"))
				.title_text,
		).toBe("https://example.com/?q=draft");
	});

	test("they render as a frontmatter value and as a heading", () => {
		const h = page("Notes: part 1 #2");
		const note = renderTemplate(
			"---\nURL: {{url}}\nTitle: {{title}}\n---\n# {{title_text}}\n",
			{ ...highlightTitleValues(h), ...normalizeHighlight(h) },
		);
		expect(note).toBe(
			'---\nURL: "https://example.com/a"\nTitle: "Notes: part 1 #2"\n---\n# Notes: part 1 #2\n',
		);
	});
});
