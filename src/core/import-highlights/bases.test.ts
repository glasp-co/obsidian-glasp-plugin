import { describe, expect, test } from "vitest";
import {
	GLASP_BASES_FOLDER,
	bookmarkBase,
	kindleHighlightBase,
	resolveBasesFolder,
	retargetBase,
	summaryBase,
	webHighlightBase,
} from "./bases";

const ALL = [webHighlightBase, kindleHighlightBase, summaryBase, bookmarkBase];

describe("base builders", () => {
	test("all bases collect into the 'Glasp Bases' folder", () => {
		expect(GLASP_BASES_FOLDER).toBe("Glasp Bases");
	});

	test("each source has a distinct .base filename and records its folder", () => {
		const specs = ALL.map((b) => b("Notes"));
		expect(new Set(specs.map((s) => s.filename)).size).toBe(4);
		for (const s of specs) {
			expect(s.folder).toBe("Notes");
		}
	});

	test("filter scopes to the source's own note folder (not the base folder)", () => {
		const base = bookmarkBase("Glasp Bookmarks");
		expect(base.content).toContain('file.inFolder("Glasp Bookmarks")');
		expect(base.content).toContain("- 'file.ext == \"md\"'");
	});

	test("every source gets a table and a cards view with a thumbnail cover", () => {
		for (const build of ALL) {
			const { content } = build("A");
			expect(content).toContain("type: table");
			expect(content).toContain("type: cards");
			expect(content).toContain("image: note.Thumbnail");
		}
	});

	test("JSON-escapes a folder name containing a double quote", () => {
		expect(bookmarkBase('Book"marks').content).toContain(
			'file.inFolder("Book\\"marks")',
		);
	});

	test("a folder name with a space+hash cannot start a YAML comment (single-quoted filter)", () => {
		const content = bookmarkBase("Read #2").content;
		// The whole expression is a single-quoted YAML scalar, so ` #` stays inside
		// the value instead of truncating it as a comment.
		expect(content).toContain(`- 'file.inFolder("Read #2")'`);
	});
});

describe("resolveBasesFolder", () => {
	test("not set, empty or not text: the default 'Glasp Bases'", () => {
		for (const value of [undefined, null, "", "   ", "/", 42, {}, []]) {
			expect(resolveBasesFolder(value)).toBe(GLASP_BASES_FOLDER);
		}
	});

	test("a chosen folder is used as a vault path", () => {
		expect(resolveBasesFolder("Clippings/Views")).toBe("Clippings/Views");
		expect(resolveBasesFolder("/Clippings//Views/")).toBe("Clippings/Views");
		// As Obsidian's normalizePath: composed accents, plain spaces.
		expect(resolveBasesFolder("Cafe\u0301\u00a0Notes")).toBe("Caf\u00e9 Notes");
		// A folder name may start or end with a space; only blank means unset.
		expect(resolveBasesFolder(" Archive")).toBe(" Archive");
	});
});

/**
 * Enough of YAML for these tests: each line, with a list item's scalar
 * (plain, single- or double-quoted) read as its string. The real check uses
 * Obsidian's parseYaml.
 */
const readLines = (text: string): unknown =>
	text.split("\n").map((line) => {
		const item = /^\s*-\s+(.*?)\r?$/.exec(line);
		if (!item) return line;
		const scalar = item[1];
		if (scalar.startsWith('"')) return JSON.parse(scalar);
		if (scalar.startsWith("'")) return scalar.slice(1, -1).replace(/''/g, "'");
		return scalar;
	});

describe("retargetBase", () => {
	test("the plugin's own view: only the folder filter changes", () => {
		const out = retargetBase(
			summaryBase("Glasp").content,
			"Glasp",
			"Summaries",
			readLines,
		);
		expect(out).toBe(summaryBase("Summaries").content);
	});

	test("a view Obsidian saved again (plain scalars, other settings kept)", () => {
		const saved = `filters:
  and:
    - file.inFolder("Glasp")
    - file.ext == "md"
views:
  - type: table
    name: Table
    order:
      - file.name
    columnSize:
      file.name: 320
`;
		expect(retargetBase(saved, "Glasp", "Summaries", readLines)).toBe(
			saved.replace(
				'    - file.inFolder("Glasp")',
				"    - 'file.inFolder(\"Summaries\")'",
			),
		);
	});

	test("double-quoted and single-quoted forms of the filter are found", () => {
		const folder = 'It\'s: "x" #y';
		const expr = `file.inFolder(${JSON.stringify(folder)})`;
		const doubled = `filters:\n  and:\n    - ${JSON.stringify(expr)}\n`;
		const single = `filters:\n  and:\n    - '${expr.replace(/'/g, "''")}'\n`;
		for (const content of [doubled, single]) {
			expect(retargetBase(content, folder, "New", readLines)).toBe(
				"filters:\n  and:\n    - 'file.inFolder(\"New\")'\n",
			);
		}
	});

	test("a new folder name is written so YAML reads it back exactly", () => {
		const out = retargetBase(
			summaryBase("Glasp").content,
			"Glasp",
			"It's: #1",
			readLines,
		);
		expect(out).toBe(summaryBase("It's: #1").content);
	});

	test("no filter for the old folder, or more than one: null (left as it is)", () => {
		expect(retargetBase("MY OWN VIEW", "Glasp", "New", readLines)).toBeNull();
		expect(
			retargetBase(
				'filters:\n  or:\n    - file.inFolder("Glasp")\n    - file.inFolder("Glasp")\n',
				"Glasp",
				"New",
				readLines,
			),
		).toBeNull();
		// The old folder only as part of a longer expression: not touched.
		expect(
			retargetBase(
				'filters:\n  and:\n    - file.inFolder("Glasp") || file.inFolder("B")\n',
				"Glasp",
				"New",
				readLines,
			),
		).toBeNull();
	});

	test("an edit the parser does not read back as that one change is not made", () => {
		const content = summaryBase("Glasp").content;
		expect(
			retargetBase(content, "Glasp", "New", () => {
				throw new Error("unexpected token");
			}),
		).toBeNull();
		let call = 0;
		// Read back differently from what was meant (as YAML does when the line
		// was part of a longer text, not a list item of its own).
		const otherwise = (text: string) =>
			call++ === 0 ? readLines(text) : { notes: text };
		expect(retargetBase(content, "Glasp", "New", otherwise)).toBeNull();
	});
});
