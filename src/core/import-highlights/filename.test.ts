import { describe, expect, test } from "vitest";
import {
	NOTE_NAME_MAX_BYTES,
	escapeFilename,
	truncateUtf8,
	utf8Length,
} from "./filename";

describe("escapeFilename", () => {
	test("keeps an ordinary title unchanged", () => {
		expect(escapeFilename("How to read more")).toBe("How to read more");
	});

	test("decomposed accents come out composed", () => {
		const acute = String.fromCharCode(0x301);
		const composed = String.fromCharCode(0xe9);
		expect(escapeFilename(`Cafe${acute}`)).toBe(`Caf${composed}`);
	});

	test("removes characters some platform rejects", () => {
		expect(escapeFilename("What is this?")).toBe("What is this");
		expect(escapeFilename('a*b?c<d>e"f|g:h\\i/j#k^l[m]n')).toBe(
			"abcdefghijklmn",
		);
	});

	test("prefixes Windows device names, with or without an extension", () => {
		expect(escapeFilename("CON")).toBe("_CON");
		expect(escapeFilename("con.txt")).toBe("_con.txt");
		expect(escapeFilename("Lpt9")).toBe("_Lpt9");
		expect(escapeFilename("nul .md")).toBe("_nul .md");
		expect(escapeFilename("COM0")).toBe("_COM0");
		expect(escapeFilename(`LPT${String.fromCharCode(0xb9)}`)).toBe(
			`_LPT${String.fromCharCode(0xb9)}`,
		);
		// Not device names.
		expect(escapeFilename("COM10")).toBe("COM10");
		expect(escapeFilename("Console")).toBe("Console");
	});

	test("strips trailing dots and spaces, also after truncation", () => {
		expect(escapeFilename("Wait...")).toBe("Wait");
		const title = `${"a".repeat(NOTE_NAME_MAX_BYTES - 1)}. tail`;
		const name = escapeFilename(title);
		expect(name).toBe("a".repeat(NOTE_NAME_MAX_BYTES - 1));
		expect(name.endsWith(".")).toBe(false);
	});

	test("caps long CJK and emoji titles at the byte budget on a code-point boundary", () => {
		const cjk = escapeFilename("読書".repeat(100));
		expect(utf8Length(cjk)).toBeLessThanOrEqual(NOTE_NAME_MAX_BYTES);
		expect(cjk).toBe("読書".repeat(20)); // 40 chars × 3 bytes = 120

		const emoji = escapeFilename("😀".repeat(100));
		expect(utf8Length(emoji)).toBeLessThanOrEqual(NOTE_NAME_MAX_BYTES);
		expect(emoji).toBe("😀".repeat(30)); // 30 × 4 bytes = 120
		// No half of a surrogate pair is left behind.
		expect(emoji.length % 2).toBe(0);
	});

	test("never longer than 0.3.0's 120-character cut for ASCII titles", () => {
		const title = "x".repeat(300);
		expect(escapeFilename(title)).toBe("x".repeat(120));
	});

	test("drops lone surrogates and turns control characters into spaces", () => {
		expect(escapeFilename("a\ud800b")).toBe("ab");
		expect(escapeFilename(`a${String.fromCharCode(9)}b`)).toBe("a b");
	});

	test("never starts with a dot, even after other characters are removed", () => {
		expect(escapeFilename("... | .NET 8 released")).toBe("NET 8 released");
		expect(escapeFilename(". .gitignore explained")).toBe(
			"gitignore explained",
		);
	});

	test("a title that is not a string does not throw", () => {
		expect(escapeFilename(2024 as unknown as string)).toBe("2024");
		expect(escapeFilename(undefined as unknown as string)).toBe("Untitled");
	});

	test("an empty or dot-only title becomes Untitled", () => {
		expect(escapeFilename("")).toBe("Untitled");
		expect(escapeFilename("...")).toBe("Untitled");
		expect(escapeFilename("???")).toBe("Untitled");
	});

	test("a shorter budget for the name-too-long retry", () => {
		expect(utf8Length(escapeFilename("読".repeat(100), 60))).toBe(60);
	});
});

describe("truncateUtf8", () => {
	test("cuts on code points", () => {
		expect(truncateUtf8("aé😀", 3)).toBe("aé");
		expect(truncateUtf8("aé😀", 7)).toBe("aé😀");
	});
});
