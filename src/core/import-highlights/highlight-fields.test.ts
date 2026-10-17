import { describe, expect, test } from "vitest";
import { normalizeTags } from "./highlight-fields";

describe("normalizeTags", () => {
	test("a list keeps its tags, with spaces turned into hyphens", () => {
		expect(normalizeTags(["a b", "c", ""])).toEqual(["a-b", "c", ""]);
	});

	test("no tags is an empty list", () => {
		expect(normalizeTags(null)).toEqual([]);
		expect(normalizeTags(undefined)).toEqual([]);
	});

	test("a tag given as a string is one tag", () => {
		expect(normalizeTags(" my tag ")).toEqual(["my-tag"]);
		expect(normalizeTags("  ")).toEqual([]);
	});

	test("any other value is no tags", () => {
		expect(normalizeTags({ 0: "a" })).toEqual([]);
		expect(normalizeTags(3)).toEqual([]);
		expect(normalizeTags(true)).toEqual([]);
	});
});
