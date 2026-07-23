import type { Summary } from "src/glasp-api/summary/type";
import { describe, expect, test } from "vitest";
import { normalizeSummary } from "./normalize-summary";

const BASE_SUMMARY: Summary = {
	id: "abc123",
	url: "https://glasp.co/",
	domain: "glasp.co",
	title: "Glasp",
	thumbnail_url: "https://glasp.co/thumb.jpg",
	summary: "## Heading\n\nThis is the summary body.",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-02-01T00:00:00.000Z",
};

describe("normalizeSummary", () => {
	test("frontmatter string fields are YAML-quoted", () => {
		const result = normalizeSummary(BASE_SUMMARY);
		expect(result.url).toBe('"https://glasp.co/"');
		expect(result.title).toBe('"Glasp"');
		expect(result.domain).toBe('"glasp.co"');
	});

	test("summary body is passed through as raw Markdown", () => {
		const result = normalizeSummary(BASE_SUMMARY);
		expect(result.summary).toBe("## Heading\n\nThis is the summary body.");
	});

	test("a missing summary body becomes an empty string", () => {
		const result = normalizeSummary({
			...BASE_SUMMARY,
			summary: undefined as unknown as string,
		});
		expect(result.summary).toBe("");
	});

	test("ISO timestamps are passed through raw", () => {
		const result = normalizeSummary(BASE_SUMMARY);
		expect(result.created_at).toBe("2026-01-01T00:00:00.000Z");
		expect(result.updated_at).toBe("2026-02-01T00:00:00.000Z");
	});

	test("content is empty when the full body was not fetched", () => {
		expect(normalizeSummary(BASE_SUMMARY).content).toBe("");
	});

	test("content is appended as a '## Content' section when present", () => {
		const result = normalizeSummary({
			...BASE_SUMMARY,
			content: "Full article body.",
		});
		expect(result.content).toBe("\n## Content\n\nFull article body.\n");
	});
});
