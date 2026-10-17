import { describe, expect, test } from "vitest";
import {
	type YamlParse,
	isBareYamlTag,
	toYamlDoubleQuoted,
	toYamlFlowTags,
} from "./yaml-tags";

describe("toYamlFlowTags", () => {
	test("ordinary tags render exactly as {{tags}} did (no rewrite on upgrade)", () => {
		const tags = [
			"reading",
			"AI",
			"c#",
			"it's",
			"読書",
			"😀",
			"v1.2.3",
			"a-b_c",
		];
		expect(toYamlFlowTags(tags)).toBe(tags.toString());
		expect(toYamlFlowTags([])).toBe("");
	});

	test("quotes tags that would split, close the list or start a comment", () => {
		expect(toYamlFlowTags(["a,b"])).toBe('"a,b"');
		expect(toYamlFlowTags(["x]"])).toBe('"x]"');
		expect(toYamlFlowTags(["[x"])).toBe('"[x"');
		expect(toYamlFlowTags(["{x}"])).toBe('"{x}"');
		expect(toYamlFlowTags(["#tag"])).toBe('"#tag"');
		expect(toYamlFlowTags(['"quoted"'])).toBe('"\\"quoted\\""');
		expect(toYamlFlowTags(["'single'"])).toBe(`"'single'"`);
		expect(toYamlFlowTags(["key:value"])).toBe('"key:value"');
		expect(toYamlFlowTags(["ends:"])).toBe('"ends:"');
	});

	test("quotes tags YAML would read as something other than a string", () => {
		for (const tag of [
			"true",
			"False",
			"null",
			"~",
			"yes",
			"off",
			"123",
			"-7",
			"1.5",
			".5",
			"1e3",
			"0x1F",
			".inf",
			".NaN",
			"2026-10-16",
			"<<",
		]) {
			expect(toYamlFlowTags([tag])).toBe(JSON.stringify(tag));
		}
	});

	test("quotes tags starting with a YAML indicator", () => {
		for (const tag of [
			"&a",
			"*a",
			"!a",
			"|a",
			">a",
			"%a",
			"@a",
			"`a",
			"-",
			"?",
		]) {
			expect(isBareYamlTag(tag)).toBe(false);
		}
		expect(isBareYamlTag("-a")).toBe(true);
		expect(isBareYamlTag("?a")).toBe(true);
	});

	test("an empty tag is left out, as 0.3.0's [] showed it", () => {
		expect(toYamlFlowTags(["", "a"])).toBe("a");
		expect(toYamlFlowTags([""])).toBe("");
	});

	test("mixes bare and quoted tags in order", () => {
		expect(toYamlFlowTags(["a", "b,c", "d"])).toBe('a,"b,c",d');
	});
});

describe("toYamlDoubleQuoted", () => {
	test("escapes what JSON leaves raw but YAML does not allow", () => {
		const nel = String.fromCharCode(0x85);
		const lineSeparator = String.fromCharCode(0x2028);
		expect(toYamlDoubleQuoted(`a${nel}b${lineSeparator}c`)).toBe(
			'"a\\u0085b\\u2028c"',
		);
		expect(isBareYamlTag(`a${lineSeparator}b`)).toBe(false);
	});
});

describe("with Obsidian's parser", () => {
	/** A stand-in parser that reads "Tags: [x]" the way it is told to. */
	const parser =
		(reads: Record<string, unknown>): YamlParse =>
		(text) => {
			const inner = text.slice("Tags: [".length, -1);
			if (!(inner in reads)) throw new Error("unexpected");
			return { Tags: reads[inner] };
		};

	test("a tag the parser reads back exactly stays bare", () => {
		const parse = parser({
			"@toread": ["@toread"],
			"key:value": ["key:value"],
		});
		expect(toYamlFlowTags(["@toread", "key:value"], parse)).toBe(
			"@toread,key:value",
		);
	});

	test("a tag the parser reads as something else, or cannot read, is quoted", () => {
		const parse = parser({ E4: [Number.NaN], "a,b": ["a", "b"] });
		expect(toYamlFlowTags(["E4", "a,b", "*x"], parse)).toBe('"E4","a,b","*x"');
	});

	test("unprintable characters are quoted whatever the parser tolerates", () => {
		const lineSeparator = String.fromCharCode(0x2028);
		const tag = `a${lineSeparator}b`;
		const parse = parser({ [tag]: [tag] });
		expect(isBareYamlTag(tag, parse)).toBe(false);
	});
});
