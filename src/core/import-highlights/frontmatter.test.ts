import { describe, expect, test } from "vitest";
import { toInline, toIsoDate, toYaml } from "./frontmatter";

describe("toYaml", () => {
	test("wraps a plain string in double quotes", () => {
		expect(toYaml("hello")).toBe('"hello"');
	});

	test("escapes a value containing a colon (would otherwise break YAML)", () => {
		expect(toYaml("Title: subtitle")).toBe('"Title: subtitle"');
	});

	test("escapes embedded double quotes", () => {
		expect(toYaml('a "quoted" word')).toBe('"a \\"quoted\\" word"');
	});

	test("escapes newlines so extra properties cannot be injected", () => {
		const result = toYaml("line1\nInjected: evil");
		expect(result).not.toContain("\n");
		expect(result).toBe('"line1\\nInjected: evil"');
	});

	test("handles null/undefined as an empty quoted string", () => {
		expect(toYaml(null)).toBe('""');
		expect(toYaml(undefined)).toBe('""');
	});
});

describe("toInline", () => {
	test("strips square brackets that would break a Markdown link", () => {
		expect(toInline("a [b] c")).toBe("a b c");
	});

	test("collapses newlines to spaces", () => {
		expect(toInline("a\nb")).toBe("a b");
	});

	test("handles null/undefined", () => {
		expect(toInline(null)).toBe("");
		expect(toInline(undefined)).toBe("");
	});
});

describe("toIsoDate", () => {
	test("passes a valid ISO datetime through unquoted", () => {
		expect(toIsoDate("2026-01-01T00:00:00.000Z")).toBe(
			"2026-01-01T00:00:00.000Z",
		);
		expect(toIsoDate("2026-01-01T00:00:00+09:00")).toBe(
			"2026-01-01T00:00:00+09:00",
		);
	});

	test("drops a non-ISO or multi-line value that could break the YAML", () => {
		expect(toIsoDate("2020\nInjected: true")).toBe("");
		expect(toIsoDate("not a date")).toBe("");
		expect(toIsoDate("2026-01-01")).toBe("");
		expect(toIsoDate(null)).toBe("");
		expect(toIsoDate(undefined)).toBe("");
	});
});
