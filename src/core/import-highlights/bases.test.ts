import { describe, expect, test } from "vitest";
import {
	GLASP_BASES_FOLDER,
	bookmarkBase,
	kindleHighlightBase,
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
