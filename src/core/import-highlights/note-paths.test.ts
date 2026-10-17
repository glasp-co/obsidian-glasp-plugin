import { describe, expect, test } from "vitest";
import { PathReserver } from "./note-paths";

describe("PathReserver", () => {
	test("two items with the same name get different paths", () => {
		const reserver = new PathReserver(() => false);
		expect(reserver.reserve("Glasp", "Title")).toBe("Glasp/Title.md");
		expect(reserver.reserve("Glasp", "Title")).toBe("Glasp/Title (2).md");
	});

	test("names that differ only by case do not share a path", () => {
		const reserver = new PathReserver(() => false);
		expect(reserver.reserve("Glasp", "Title")).toBe("Glasp/Title.md");
		expect(reserver.reserve("Glasp", "title")).toBe("Glasp/title (2).md");
	});

	test("skips paths that exist in the vault", () => {
		const existing = new Set(["glasp/title.md", "glasp/title (2).md"]);
		const reserver = new PathReserver((path) =>
			existing.has(path.toLowerCase()),
		);
		expect(reserver.reserve("Glasp", "Title")).toBe("Glasp/Title (3).md");
	});

	test("throws instead of returning a taken path when every name is taken", () => {
		const reserver = new PathReserver(() => true);
		expect(() => reserver.reserve("Glasp", "Title")).toThrow(
			/No free file name/,
		);
	});
});
