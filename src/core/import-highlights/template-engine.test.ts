import { readFileSync } from "node:fs";
import type { UserHighlight } from "src/glasp-api/highlight/type";
import type { KindleBook } from "src/glasp-api/kindle-highlight/type";
import { describe, expect, test } from "vitest";
import {
	HIGHLIGHT_TEMPLATE,
	KINDLE_HIGHLIGHT_TEMPLATE,
} from "../../constant/template";
import { normalizeHighlight } from "./normalize-highlight";
import { normalizeKindleHighlight } from "./normalize-kindle-highlight";
import { renderTemplate } from "./template-engine";

/** The 0.3.0 default templates, verbatim. */
const HIGHLIGHT_TEMPLATE_0_3_0 = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
`;

const KINDLE_HIGHLIGHT_TEMPLATE_0_3_0 = `---
URL: {{url}}
Glasp URL: {{glasp_url}}
Author: {{author}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
`;

const page = (tags: string[]): UserHighlight => ({
	id: "page",
	title: "A page",
	thumbnail_url: "https://example.com/t.png",
	url: "https://example.com/a",
	glasp_url: "https://glasp.co/u/p/1",
	domain: "example.com",
	category: "article",
	document_note: "My thoughts",
	summary: "",
	tags,
	is_favorite: false,
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-24T10:00:00.000Z",
	highlights: [
		{
			id: "h1",
			text: "First",
			note: "a note",
			color: "yellow",
			highlighted_at: "2026-09-20T10:00:00.000Z",
			created_at: "2026-09-20T10:00:00.000Z",
			updated_at: "2026-09-20T10:00:00.000Z",
			url: "https://example.com/a",
			yt_playback_position: null,
		},
		{
			id: "h2",
			text: "Second",
			note: "",
			color: "blue",
			highlighted_at: "2026-09-21T10:00:00.000Z",
			created_at: "2026-09-21T10:00:00.000Z",
			updated_at: "2026-09-21T10:00:00.000Z",
			url: "https://example.com/a",
			yt_playback_position: 42,
		},
	],
});

const book = (tags: string[]): KindleBook => ({
	id: "book",
	title: "A book",
	author: "Your Kindle Notes For:",
	thumbnail_url: "https://example.com/b.png",
	url: "https://www.amazon.com/dp/B000",
	glasp_url: "https://glasp.co/u/kindle/1",
	domain: "amazon.com",
	category: "book",
	document_note: null,
	summary: "",
	tags,
	is_favorite: false,
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-24T10:00:00.000Z",
	highlights: [
		{
			id: "k1",
			text: "Kindle text",
			note: "",
			color: "orange",
			highlighted_at: "2026-09-20T10:00:00.000Z",
			created_at: "2026-09-20T10:00:00.000Z",
			updated_at: "2026-09-20T10:00:00.000Z",
			url: "https://www.amazon.com/dp/B000",
			location: 120,
			location_type: "location",
			highlight_url: "kindle://book?action=open&asin=B000&location=120",
		},
	],
});

describe("default templates after the upgrade", () => {
	test("render byte-identical web notes for ordinary tags", () => {
		for (const tags of [[], ["reading"], ["a", "b", "読書", "c#"]]) {
			const data = normalizeHighlight(page(tags));
			expect(renderTemplate(HIGHLIGHT_TEMPLATE, data)).toBe(
				renderTemplate(HIGHLIGHT_TEMPLATE_0_3_0, data),
			);
		}
	});

	test("render byte-identical Kindle notes for ordinary tags", () => {
		const data = normalizeKindleHighlight(book(["novel", "2nd-read"]));
		expect(renderTemplate(KINDLE_HIGHLIGHT_TEMPLATE, data)).toBe(
			renderTemplate(KINDLE_HIGHLIGHT_TEMPLATE_0_3_0, data),
		);
	});

	test("quote a tag that would have broken the list", () => {
		const data = normalizeHighlight(page(["a,b", "ok"]));
		expect(renderTemplate(HIGHLIGHT_TEMPLATE_0_3_0, data)).toContain(
			"Tags: [a,b,ok]",
		);
		expect(renderTemplate(HIGHLIGHT_TEMPLATE, data)).toContain(
			'Tags: ["a,b",ok]',
		);
	});
});

describe("custom templates", () => {
	test("a template using the documented 0.3.0 variables renders as before", () => {
		const custom =
			"{{url}} | {{glasp_url}} | {{tags}} | {{updated_at}}\n{{content}}";
		const data = normalizeHighlight(page(["x", "y"]));
		expect(renderTemplate(custom, data)).toBe(
			`"https://example.com/a" | "https://glasp.co/u/p/1" | x,y | 2026-09-24\n${data.content}`,
		);
	});

	test("highlights can be styled by colour with eq", () => {
		const template =
			'{{#each highlights}}{{#if (eq highlightStyle "2")}}<mark class="y">{{{highlight}}}</mark>{{else if (eq highlightStyle "4")}}<mark class="b">{{{text}}}</mark>{{/if}}{{#if note}} ({{note}}){{/if}};{{/each}}';
		const data = normalizeHighlight(page([]));
		expect(renderTemplate(template, data)).toBe(
			'<mark class="y">First</mark> (a note);<mark class="b">Second</mark>;',
		);
	});

	test("eq is strict", () => {
		expect(
			renderTemplate('{{#if (eq n "1")}}yes{{else}}no{{/if}}', { n: 1 }),
		).toBe("no");
		expect(
			renderTemplate('{{#if (eq n "1")}}yes{{else}}no{{/if}}', { n: "1" }),
		).toBe("yes");
	});

	test("highlight fields", () => {
		const web = normalizeHighlight(page([]));
		expect(web.highlights).toEqual([
			{
				text: "First",
				highlight: "First",
				note: "a note",
				color: "yellow",
				highlightStyle: "2",
				highlighted_at: "2026-09-20T10:00:00.000Z",
				yt_playback_position: null,
			},
			{
				text: "Second",
				highlight: "Second",
				note: "",
				color: "blue",
				highlightStyle: "4",
				highlighted_at: "2026-09-21T10:00:00.000Z",
				yt_playback_position: 42,
			},
		]);
		const kindle = normalizeKindleHighlight(book([]));
		expect(kindle.highlights[0]).toMatchObject({
			color: "orange",
			highlightStyle: "5",
			location: 120,
			location_type: "location",
		});
	});

	test("a video position comes from the API's time_offset location", () => {
		// As the API sends them: no yt_playback_position field.
		const [first, second] = page([]).highlights.map(
			({ yt_playback_position: _y, ...rest }) => rest,
		);
		const data = normalizeHighlight({
			...page([]),
			highlights: [
				{ ...first, location: 83.5, location_type: "time_offset" },
				{ ...second, location: 12, location_type: "page" },
			],
		});
		expect(data.highlights.map((h) => h.yt_playback_position)).toEqual([
			83.5,
			null,
		]);
	});

	test("pink and green map to 1 and 3", () => {
		const data = normalizeHighlight({
			...page([]),
			highlights: page([]).highlights.map((h, i) => ({
				...h,
				color: i === 0 ? "pink" : "green",
			})),
		});
		expect(data.highlights.map((h) => h.highlightStyle)).toEqual(["1", "3"]);
	});
});

describe("the lines helper", () => {
	const each = (t: unknown) =>
		renderTemplate("{{#each (lines t)}}[{{this}}]{{/each}}", { t });

	test("splits at any line break, trims each line and leaves out the empty ones", () => {
		expect(each("  a \r\n\nb\rc\n \t\n")).toBe("[a][b][c]");
		expect(each("one line")).toBe("[one line]");
	});

	test("anything but a string, or only blank lines, gives no lines", () => {
		for (const t of [undefined, null, 5, ["a"], { a: 1 }, "", " \n "]) {
			expect(each(t)).toBe("");
		}
	});

	test("../ reaches the highlight's own fields", () => {
		const data = normalizeHighlight({
			...page([]),
			highlights: [{ ...page([]).highlights[1], text: "x\ny" }],
		});
		expect(
			renderTemplate(
				"{{#each highlights}}{{#each (lines highlight)}}<{{../highlightStyle}}{{this}}>{{/each}}{{/each}}",
				data,
			),
		).toBe("<4x><4y>");
	});

	test("the README's example writes each line of a highlight and its note on its own", () => {
		const template = [
			"{{#each highlights}}",
			"{{#each (lines highlight)}}",
			'=={{#if (eq ../highlightStyle "1")}}🔴{{else if (eq ../highlightStyle "2")}}🟡{{else if (eq ../highlightStyle "3")}}🟢{{else if (eq ../highlightStyle "4")}}🔵{{else if (eq ../highlightStyle "5")}}🟠{{/if}}{{{this}}}==',
			"{{/each}}",
			"{{#if (lines note)}}",
			"> [!Note]",
			"{{#each (lines note)}}",
			"> {{{this}}}",
			"{{/each}}",
			"{{/if}}",
			"",
			"{{/each}}",
			"",
		].join("\n");
		expect(readFileSync("README.md", "utf8")).toContain(
			`\`\`\`handlebars\n${template}\`\`\``,
		);
		const [first, second] = page([]).highlights;
		const data = normalizeHighlight({
			...page([]),
			highlights: [
				{
					...second,
					text: "A list:\n1) first point\n\n2) second point",
					note: "first\nsecond",
				},
				{ ...first, text: "Single", note: " \n " },
				{ ...first, text: " \n ", note: "" },
			],
		});
		expect(renderTemplate(template, data)).toBe(
			[
				"==🔵A list:==",
				"==🔵1) first point==",
				"==🔵2) second point==",
				"> [!Note]",
				"> first",
				"> second",
				"",
				"==🟡Single==",
				"",
				"",
				"",
			].join("\n"),
		);
	});
});
