import { HIGHLIGHT_TEMPLATE } from "src/constant/template";
import { APIError } from "src/glasp-api/error";
import type { UserHighlight } from "src/glasp-api/highlight/type";
import { RequestPacer } from "src/glasp-api/request-pacer";
import { ContentSkippedError } from "src/glasp-api/summary/glasp-summary-api";
import { ObsidianApp } from "src/obsidian-api/obsidian-app";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FakeVault } from "../../../test/fake-vault";
import {
	type CursorStore,
	type HighlightImportSource,
	ImportHighlights,
	type LastUpdatedKey,
} from "./import-highlights";
import { normalizeHighlight } from "./normalize-highlight";
import { renderTemplate } from "./template-engine";

const FOLDER = "Glasp";

const item = (
	n: number,
	extra: Partial<UserHighlight> = {},
): UserHighlight => ({
	id: `id${n}`,
	title: `Page ${n}`,
	thumbnail_url: "",
	url: `https://example.com/${n}`,
	glasp_url: `https://glasp.co/u/p/${n}`,
	domain: "example.com",
	category: "article",
	document_note: null,
	summary: "",
	tags: ["reading"],
	is_favorite: false,
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-24T10:00:00.000Z",
	highlights: [
		{
			id: `h${n}`,
			text: `Text ${n}`,
			note: "",
			color: "yellow",
			highlighted_at: "2026-09-20T10:00:00.000Z",
			created_at: "2026-09-20T10:00:00.000Z",
			updated_at: "2026-09-20T10:00:00.000Z",
			url: `https://example.com/${n}`,
			yt_playback_position: null,
		},
	],
	...extra,
});

const rendered = (h: UserHighlight) =>
	renderTemplate(HIGHLIGHT_TEMPLATE, normalizeHighlight(h));

/** The web template, stamped the way the summaries template stamps its notes. */
const SUMMARY_LIKE_TEMPLATE = HIGHLIGHT_TEMPLATE.replace(
	"---\n",
	"---\nGlasp: summary\n",
);

const cursors = (initial: Partial<Record<LastUpdatedKey, string>> = {}) => {
	const state: Record<string, string> = { ...initial };
	const generations: Record<string, number> = {};
	const written: Record<string, Record<string, string>> = {};
	const store: CursorStore = {
		read: (key) => ({
			value: state[key] ?? "",
			generation: generations[key] ?? 0,
			written: written[key] ?? {},
		}),
		// As the plugin does it: only if neither the generation nor the cursor
		// changed since the run read them.
		commit: async (key, value, read, ahead) => {
			if ((generations[key] ?? 0) !== read.generation) return false;
			if ((state[key] ?? "") !== read.value) return false;
			state[key] = value;
			written[key] = ahead;
			return true;
		},
	};
	return { store, state, generations, written };
};

/** A server that filters on `updated_at` like Glasp's. */
const serving = (all: UserHighlight[]) => ({
	fetchPage: async ({ updatedAfter }: { updatedAfter?: string }) => ({
		results: all
			.filter(
				(h) =>
					!updatedAfter || Date.parse(h.updated_at) > Date.parse(updatedAfter),
			)
			.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
		nextPageCursor: null,
	}),
});

const source = (
	items: UserHighlight[],
	extra: Partial<HighlightImportSource<UserHighlight>> = {},
) => {
	const fetchPage = vi.fn(async () => ({
		results: items,
		nextPageCursor: null,
	}));
	const src: HighlightImportSource<UserHighlight> = {
		label: "web highlights",
		folder: FOLDER,
		template: HIGHLIGHT_TEMPLATE,
		lastUpdatedKey: "lastUpdated",
		fetchPage,
		normalize: normalizeHighlight,
		...extra,
	};
	return { src, fetchPage };
};

const importer = (vault: FakeVault, store: CursorStore) =>
	new ImportHighlights({
		pageIntervalMs: 0,
		obApp: new ObsidianApp(vault.app()),
		cursors: store,
		notify: () => {},
	});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("ImportHighlights.run", () => {
	test("an item fetched again unchanged is not written, so its mtime stays", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		const before = vault.mtime(`${FOLDER}/Page 1.md`);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });

		const result = await importer(vault, c.store).run(source([item(1)]).src);

		expect(vault.modified).toEqual([]);
		expect(vault.mtime(`${FOLDER}/Page 1.md`)).toBe(before);
		expect(result).toMatchObject({
			fetched: 1,
			unchanged: 1,
			updated: 0,
			failed: 0,
		});
		expect(c.state.lastUpdated).not.toBe("2026-09-23T00:00:00.000Z");
	});

	test("a changed item is written", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		const changed = item(1, { document_note: "New thought" });

		const result = await importer(vault, cursors().store).run(
			source([changed]).src,
		);

		expect(vault.modified).toEqual([`${FOLDER}/Page 1.md`]);
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(
			rendered(changed),
		);
		expect(result).toMatchObject({ updated: 1, unchanged: 0 });
	});

	test("if the note cannot be read, it is written as in 0.3.0", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		vault.failRead = true;
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

		const result = await importer(vault, cursors().store).run(
			source([item(1)]).src,
		);

		expect(vault.modified).toEqual([`${FOLDER}/Page 1.md`]);
		expect(result).toMatchObject({ updated: 1, failed: 0 });
		expect(debug).not.toHaveBeenCalled();
	});

	test("a rewrite logs path and hashes only, and a hashing failure does not fail it", async () => {
		const vault = new FakeVault([FOLDER]);
		// Same note (same URL), older body.
		const older = rendered(item(1)).replace("Text 1", "Older body");
		vault.seed(`${FOLDER}/Page 1.md`, older);
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

		await importer(vault, cursors().store).run(source([item(1)]).src);
		expect(vault.modified).toEqual([`${FOLDER}/Page 1.md`]);
		expect(debug).toHaveBeenCalledTimes(1);
		const logged = debug.mock.calls[0].join(" ");
		expect(logged).toContain(`${FOLDER}/Page 1.md`);
		expect(logged).not.toContain("Older body");
		expect(logged).not.toContain("Text 1");
		expect(logged).toMatch(/[0-9a-f]{64} [0-9a-f]{64}$/);

		vault.seed(`${FOLDER}/Page 1.md`, older);
		vi.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error("no crypto"));
		const c = cursors();
		const result = await importer(vault, c.store).run(source([item(1)]).src);
		expect(result).toMatchObject({ updated: 1, failed: 0 });
		expect(c.state.lastUpdated).toBeTruthy();
	});

	test("two items whose titles clean up to the same name are both created", async () => {
		const vault = new FakeVault([FOLDER]);
		const items = [
			item(1, { title: "What?" }),
			item(2, { title: "What" }),
			item(3, { title: "WHAT" }),
		];

		const result = await importer(vault, cursors().store).run(
			source(items).src,
		);

		expect(result).toMatchObject({ created: 3, failed: 0 });
		expect([...vault.files.keys()].sort()).toEqual([
			`${FOLDER}/WHAT (3).md`,
			`${FOLDER}/What (2).md`,
			`${FOLDER}/What.md`,
		]);
	});

	test("a new note never takes the name of an existing note that differs only in case", async () => {
		// Another page's note, named before this item existed.
		const vault = new FakeVault([FOLDER]);
		vault.seed(
			`${FOLDER}/Some Title.md`,
			rendered(item(9, { title: "Some Title" })),
		);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });

		const result = await importer(vault, c.store).run(
			source([item(1, { title: "Some title" })]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		// Chosen right the first time, not found by a failed create.
		expect(vault.created).toEqual([`${FOLDER}/Some title (2).md`]);
		expect(c.state.lastUpdated).not.toBe("2026-09-23T00:00:00.000Z");
	});

	test("composed and decomposed accents count as the same name", async () => {
		const vault = new FakeVault([FOLDER]);
		const decomposed = `Cafe${String.fromCharCode(0x301)}`;
		const composed = `Caf${String.fromCharCode(0xe9)}`;
		vault.seed(`${FOLDER}/${decomposed}.md`, rendered(item(9)));

		const result = await importer(vault, cursors().store).run(
			source([item(1, { title: composed })]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(vault.created).toEqual([`${FOLDER}/${composed} (2).md`]);
	});

	test("a create that finds its path taken moves to the next free name", async () => {
		const vault = new FakeVault([FOLDER]);
		let first = true;
		vault.failCreate = (path) => {
			if (first && path === `${FOLDER}/Page 1.md`) {
				first = false;
				return new Error("File already exists.");
			}
			return undefined;
		};

		const result = await importer(vault, cursors().store).run(
			source([item(1)]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(vault.files.has(`${FOLDER}/Page 1 (2).md`)).toBe(true);
	});

	test("a name the file system finds too long is retried once with a shorter one", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.failCreate = (path) =>
			new TextEncoder().encode(path).length > 80
				? new Error("ENAMETOOLONG: name too long")
				: undefined;
		const long = item(1, { title: "長".repeat(50) });

		const result = await importer(vault, cursors().store).run(
			source([long]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(vault.files.has(`${FOLDER}/${"長".repeat(20)}.md`)).toBe(true);
	});

	test("a missing output folder with items to write: not created, cursor kept, one source failure", async () => {
		const vault = new FakeVault([]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });

		const result = await importer(vault, c.store).run(source([item(1)]).src);

		expect(vault.folders.has(FOLDER)).toBe(false);
		expect(vault.created).toEqual([]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
		expect(result.failures).toEqual([
			{
				source: "web highlights",
				stage: "folder",
				message: expect.any(String),
			},
		]);
	});

	test("a missing output folder with nothing to write is not reported", async () => {
		const vault = new FakeVault([]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });

		const result = await importer(vault, c.store).run(source([]).src);

		expect(result.failures).toEqual([]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
	});

	test("a folder saved with a different letter case is found", async () => {
		const vault = new FakeVault(["Glasp Import"]);
		const result = await importer(vault, cursors().store).run(
			source([item(1)], { folder: "glasp import" }).src,
		);
		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(vault.files.has("Glasp Import/Page 1.md")).toBe(true);
	});

	test("a note whose frontmatter cannot be parsed is matched by its URL line and repaired", async () => {
		const vault = new FakeVault([FOLDER]);
		// As 0.3.0 wrote it for a tag with a comma: invalid YAML, so Obsidian
		// indexes no frontmatter.
		vault.seed(
			`${FOLDER}/Page 1.md`,
			`---\nURL: "https://example.com/1"\nTags: [a,b]]\n---\nold\n`,
		);
		const obApp = new ObsidianApp(vault.app());
		vi.spyOn(obApp, "getFileMetadataCache").mockReturnValue({});
		const real = await import("obsidian");
		vi.spyOn(real, "parseYaml").mockImplementation(() => {
			throw new Error("bad YAML");
		});
		const run = new ImportHighlights({
			pageIntervalMs: 0,
			obApp,
			cursors: cursors().store,
			notify: () => {},
		});

		const result = await run.run(source([item(1)]).src);

		expect(result).toMatchObject({ created: 0, updated: 1 });
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(
			rendered(item(1)),
		);
	});

	test("create missing notes: only items without a note, existing notes and the cursor untouched", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, "edited by the user");
		const c = cursors({ lastUpdated: "2026-10-01T00:00:00.000Z" });
		let asked: string | undefined;
		const { src } = source([], {
			fetchPage: async ({ updatedAfter }) => {
				asked = updatedAfter;
				return {
					results: [
						item(1),
						item(2, { updated_at: "2025-01-01T00:00:00.000Z" }),
					],
					nextPageCursor: null,
				};
			},
		});
		// Page 1's note exists (matched by URL via its frontmatter).
		vault.seed(
			`${FOLDER}/Page 1.md`,
			`---\nURL: "https://example.com/1"\n---\nedited by the user\n`,
		);

		const result = await importer(vault, c.store).run(src, { backfill: true });

		expect(asked).toBe("");
		expect(result).toMatchObject({ created: 1, unchanged: 1, updated: 0 });
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toContain(
			"edited by the user",
		);
		expect(vault.files.has(`${FOLDER}/Page 2.md`)).toBe(true);
		expect(c.state.lastUpdated).toBe("2026-10-01T00:00:00.000Z");
	});

	test("an empty fetch writes nothing, not even the cursor", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });

		const result = await importer(vault, c.store).run(source([]).src);

		expect(result.failures).toEqual([]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
	});

	test("a cursor in the future (a clock that ran ahead) is replaced", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2999-01-01T00:00:00.000Z" });

		await importer(vault, c.store).run(source([]).src);

		expect(Date.parse(c.state.lastUpdated)).toBeLessThan(Date.now());
	});

	test("a failing item keeps the cursor and says which item, where and why", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		const bad = item(2, { title: "Bad date", updated_at: "not a date" });

		const result = await importer(vault, c.store).run(
			source([item(1), bad]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 1 });
		expect(result.failures).toEqual([
			{
				source: "web highlights",
				stage: "normalize",
				message: expect.any(String),
				title: "Bad date",
				url: "https://example.com/2",
			},
		]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
	});

	test("a failed content fetch leaves the note untouched, reports the item and keeps the cursor", async () => {
		const vault = new FakeVault([FOLDER]);
		// The note as written with the full content (same URL).
		const full = `${rendered(item(1))}\n## Content\n\nThe full page.\n`;
		vault.seed(`${FOLDER}/Page 1.md`, full);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		const { src } = source([item(1)], {
			hydrate: async () => {
				throw new APIError({ status: 429 });
			},
		});

		const result = await importer(vault, c.store).run(src);

		expect(vault.modified).toEqual([]);
		expect(vault.created).toEqual([]);
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(full);
		expect(result.failures).toMatchObject([
			{
				stage: "hydrate",
				url: "https://example.com/1",
				message: expect.stringContaining("429"),
			},
		]);
		// Moves only up to just before the failed item, so it comes back next time.
		expect(c.state.lastUpdated).toBe("2026-09-24T09:59:59.999Z");
	});

	test("a cursor reset during the import is not overwritten by the import", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		const { src } = source([item(1)], {
			fetchPage: async () => {
				// The user turns on a setting that resets this cursor mid-run.
				c.generations.lastUpdated = 1;
				c.state.lastUpdated = "";
				return { results: [item(1)], nextPageCursor: null };
			},
		});

		const result = await importer(vault, c.store).run(src);

		expect(result.failures).toEqual([]);
		expect(c.state.lastUpdated).toBe("");
	});

	test("an invalid token is reported and keeps the cursor", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		const { src } = source([], {
			fetchPage: async () => {
				throw new APIError({ status: 401 });
			},
		});

		const result = await importer(vault, c.store).run(src);

		expect(result.failures).toMatchObject([{ stage: "fetch" }]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
	});

	test("upgrading a vault of well-formed 0.3.0 notes renames nothing and duplicates nothing", async () => {
		const vault = new FakeVault([FOLDER]);
		const items = [item(1), item(2, { title: "Odd ? name" }), item(3)];
		// As 0.3.0 named and rendered them.
		const legacyTemplate = HIGHLIGHT_TEMPLATE.replace(
			"{{tags_yaml}}",
			"{{tags}}",
		);
		vault.seed(
			`${FOLDER}/Page 1.md`,
			renderTemplate(legacyTemplate, normalizeHighlight(items[0])),
		);
		vault.seed(
			`${FOLDER}/Odd ? name.md`,
			renderTemplate(legacyTemplate, normalizeHighlight(items[1])),
		);
		vault.seed(
			`${FOLDER}/Page 3.md`,
			renderTemplate(legacyTemplate, normalizeHighlight(items[2])),
		);
		const paths = [...vault.files.keys()].sort();

		const result = await importer(vault, cursors().store).run(
			source(items).src,
		);

		expect(result).toMatchObject({ created: 0, unchanged: 3, failed: 0 });
		expect([...vault.files.keys()].sort()).toEqual(paths);
		expect(vault.created).toEqual([]);
		expect(vault.modified).toEqual([]);
	});
	test("a malformed item fails alone; the rest of the batch is still written", async () => {
		const vault = new FakeVault([FOLDER]);
		const odd = item(2, { title: 2024 as unknown as string });

		const result = await importer(vault, cursors().store).run(
			source([item(1), odd, item(3)]).src,
		);

		expect(result).toMatchObject({ created: 3, failed: 0 });
		expect(vault.files.has(`${FOLDER}/2024.md`)).toBe(true);
	});

	test("an error the per-item guards do not catch fails the source, not the sync", async () => {
		const vault = new FakeVault([FOLDER]);
		const obApp = new ObsidianApp(vault.app());
		vi.spyOn(obApp, "pathTakenChecker").mockImplementation(() => {
			throw new Error("vault index unavailable");
		});
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		const run = new ImportHighlights({
			pageIntervalMs: 0,
			obApp,
			cursors: c.store,
			notify: () => {},
		});

		const result = await run.run(source([item(1)]).src);

		expect(result.failures).toMatchObject([
			{ stage: "unexpected", message: "vault index unavailable" },
		]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
	});

	test("the cursor saved is never later than when the fetch started", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		let fetchedAt = "";
		const { src } = source([item(1)], {
			fetchPage: async () => {
				fetchedAt = new Date().toISOString();
				await new Promise((resolve) => setTimeout(resolve, 20));
				return { results: [item(1)], nextPageCursor: null };
			},
		});

		await importer(vault, c.store).run(src);

		expect(c.state.lastUpdated <= fetchedAt).toBe(true);
	});

	test("a new item whose content fetch fails still gets its note, and is retried", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		const { src } = source([item(1)], {
			hydrate: async () => {
				throw new APIError({ status: 500 });
			},
		});

		const result = await importer(vault, c.store).run(src);

		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(
			rendered(item(1)),
		);
		expect(result).toMatchObject({ created: 1, failed: 1 });
		expect(result.failures).toMatchObject([{ stage: "hydrate" }]);
		expect(c.state.lastUpdated).toBe("2026-09-24T09:59:59.999Z");
	});

	test("after a name-too-long retry, a taken short name moves to the next short name", async () => {
		const vault = new FakeVault([FOLDER]);
		const shortName = "長".repeat(20);
		vault.seed(`${FOLDER}/${shortName}.md`, rendered(item(9)));
		vault.failCreate = (path) =>
			new TextEncoder().encode(path).length > 80
				? new Error("ENAMETOOLONG: name too long")
				: undefined;
		// The vault index does not show the short note (e.g. created by a sync
		// tool a moment ago), so only create can find it.
		const obApp = new ObsidianApp(vault.app());
		vi.spyOn(obApp, "pathTakenChecker").mockImplementation(() => () => false);
		const run = new ImportHighlights({
			pageIntervalMs: 0,
			obApp,
			cursors: cursors().store,
			notify: () => {},
		});

		const result = await run.run(
			source([item(1, { title: "長".repeat(50) })]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(vault.files.has(`${FOLDER}/${shortName} (2).md`)).toBe(true);
	});

	test("every page request waits its turn with the pacer", async () => {
		const vault = new FakeVault([FOLDER]);
		const turn = vi.spyOn(RequestPacer.prototype, "turn");
		const page = Array.from({ length: 50 }, (_, i) => item(i + 10));
		let calls = 0;
		await importer(vault, cursors().store).run(
			source([], {
				fetchPage: async () => {
					calls++;
					return calls < 3
						? { results: page, nextPageCursor: `c${calls}` }
						: { results: [], nextPageCursor: null };
				},
			}).src,
		);
		expect(calls).toBe(3);
		expect(turn).toHaveBeenCalledTimes(3);
	});

	test("with no failure, the cursor is just before the newest item, or the margin before the device's clock when that is earlier", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		await importer(vault, c.store).run(
			source([
				item(1, { updated_at: "2026-09-24T10:00:00.000Z" }),
				item(2, { updated_at: "2026-09-25T08:00:00.000Z" }),
			]).src,
		);
		expect(c.state.lastUpdated).toBe("2026-09-25T07:59:59.999Z");

		const d = cursors();
		const ahead = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		const before = Date.now();
		await importer(vault, d.store).run(
			source([item(3, { updated_at: ahead })]).src,
		);
		const margin = 10 * 60 * 1000;
		expect(Date.parse(d.state.lastUpdated)).toBeGreaterThanOrEqual(
			before - margin,
		);
		expect(Date.parse(d.state.lastUpdated)).toBeLessThanOrEqual(
			Date.now() - margin,
		);
	});

	test("a note edited after a sync is left alone by the next one when nothing changed on Glasp", async () => {
		// Changed on Glasp two minutes before the first sync.
		const all = [
			item(1, {
				updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
			}),
		];
		const fetchPage = async ({ updatedAfter }: { updatedAfter?: string }) => ({
			results: all.filter(
				(h) =>
					!updatedAfter || Date.parse(h.updated_at) > Date.parse(updatedAfter),
			),
			nextPageCursor: null,
		});
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);
		const note = vault.files.get(`${FOLDER}/Page 1.md`);
		if (!note) throw new Error("no note");
		note.content += "\n## My thoughts\n";

		const second = await importer(vault, c.store).run(src);

		// Fetched again (the cursor keeps a margin), and left alone.
		expect(second).toMatchObject({ fetched: 1, updated: 0, unchanged: 1 });
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toContain(
			"My thoughts",
		);
	});

	test("items are written oldest first, and the cursor stops just before the oldest failure", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-01T00:00:00.000Z" });
		const at = (d: string) => `2026-09-${d}T10:00:00.000Z`;
		const order: string[] = [];
		const items = [
			item(3, { updated_at: at("13") }),
			item(1, { updated_at: at("11") }),
			item(2, { updated_at: at("12"), document_note: "fails" }),
		];
		const { src } = source(items, {
			normalize: (h) => {
				order.push(h.id);
				if (h.document_note === "fails") throw new Error("boom");
				return normalizeHighlight(h);
			},
		});

		const result = await importer(vault, c.store).run(src);

		expect(order).toEqual(["id1", "id2", "id3"]);
		expect(result).toMatchObject({ created: 2, failed: 1 });
		expect(c.state.lastUpdated).toBe("2026-09-12T09:59:59.999Z");
	});

	test("a daily request limit is worked through over several runs instead of looping", async () => {
		// A server that filters by updated_at like Glasp's, and a content
		// endpoint that serves 5 requests a "day".
		const all = Array.from({ length: 8 }, (_, i) =>
			item(i + 1, { updated_at: `2026-09-0${i + 1}T10:00:00.000Z` }),
		);
		const fetchPage = async ({ updatedAfter }: { updatedAfter?: string }) => {
			const after = updatedAfter
				? Date.parse(updatedAfter)
				: Number.NEGATIVE_INFINITY;
			const results = all
				.filter((h) => Date.parse(h.updated_at) > after)
				.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
			return { results, nextPageCursor: null };
		};
		let budget = 5;
		const withContent = new Set<string>();
		const { src } = source([], {
			fetchPage,
			hydrate: async (h) => {
				if (budget <= 0) throw new APIError({ status: 429 });
				budget--;
				withContent.add(h.id);
				return { ...h, summary: `body of ${h.id}` };
			},
		});
		const vault = new FakeVault([FOLDER]);
		const c = cursors();

		const day1 = await importer(vault, c.store).run(src);
		expect(day1).toMatchObject({ created: 8, failed: 3 });
		expect([...withContent].sort()).toEqual([
			"id1",
			"id2",
			"id3",
			"id4",
			"id5",
		]);
		expect(c.state.lastUpdated).toBe("2026-09-06T09:59:59.999Z");

		budget = 5; // the next day
		const day2 = await importer(vault, c.store).run(src);
		expect(day2).toMatchObject({ fetched: 3, updated: 3, failed: 0 });
		expect(withContent.size).toBe(8);
		expect(c.state.lastUpdated).toBe("2026-09-08T09:59:59.999Z");
	});

	test("a short page does not end the fetch while the server gives a next page", async () => {
		const vault = new FakeVault([FOLDER]);
		const pages = [
			{ results: [item(1), item(2)], nextPageCursor: "p1" },
			{ results: [item(3)], nextPageCursor: "p2" },
			{ results: [], nextPageCursor: null },
		];
		let calls = 0;
		const { src } = source([], { fetchPage: async () => pages[calls++] });

		const result = await importer(vault, cursors().store).run(src);

		expect(calls).toBe(3);
		expect(result).toMatchObject({ fetched: 3, created: 3 });
	});

	test("web highlights never take over a summary note in the same folder", async () => {
		const vault = new FakeVault([FOLDER]);
		const summaryNote = `---\nGlasp: summary\nURL: "https://example.com/1"\n---\nsummary text\n`;
		vault.seed(`${FOLDER}/Page 1.md`, summaryNote);

		const result = await importer(vault, cursors().store).run(
			source([item(1)]).src,
		);

		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(summaryNote);
		expect(result).toMatchObject({ created: 1, updated: 0 });
		expect(vault.files.has(`${FOLDER}/Page 1 (2).md`)).toBe(true);
	});

	test("a note Obsidian has not indexed yet is found by reading it, not duplicated", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		vault.notIndexed.add(`${FOLDER}/Page 1.md`);

		const result = await importer(vault, cursors().store).run(
			source([item(1)]).src,
		);

		expect(result).toMatchObject({ created: 0, unchanged: 1 });
		expect(vault.created).toEqual([]);
	});

	test("a note created earlier in the session is found before Obsidian indexes it", async () => {
		const vault = new FakeVault([FOLDER]);
		const obApp = new ObsidianApp(vault.app());
		const session = new Map();
		const run = () =>
			new ImportHighlights({
				pageIntervalMs: 0,
				obApp,
				cursors: cursors().store,
				notify: () => {},
				sessionNotes: () => session,
			});
		await run().run(source([item(1)]).src);
		// Obsidian has not indexed it yet, and reading it fails (e.g. still locked).
		vault.notIndexed.add(`${FOLDER}/Page 1.md`);
		vi.spyOn(obApp, "readFrontmatter").mockResolvedValue(null);

		const second = await run().run(
			source([item(1, { document_note: "edited" })]).src,
		);

		expect(second).toMatchObject({ created: 0, updated: 1 });
		expect([...vault.files.keys()]).toEqual([`${FOLDER}/Page 1.md`]);
	});

	test("once the plugin is unloaded, nothing more is written or saved", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-23T00:00:00.000Z" });
		let unloaded = false;
		const run = new ImportHighlights({
			pageIntervalMs: 0,
			obApp: new ObsidianApp(vault.app()),
			cursors: c.store,
			notify: () => {},
			isCancelled: () => unloaded,
		});
		const { src } = source([], {
			fetchPage: async () => {
				unloaded = true; // unloaded while the request was in flight
				return { results: [item(1), item(2)], nextPageCursor: null };
			},
		});

		await run.run(src);

		expect(vault.created).toEqual([]);
		expect(c.state.lastUpdated).toBe("2026-09-23T00:00:00.000Z");
	});

	test("the vault root is refused as the output folder; a trailing slash is fine", async () => {
		const vault = new FakeVault([FOLDER]);
		const root = await importer(vault, cursors().store).run(
			source([item(1)], { folder: "/" }).src,
		);
		expect(root.failures).toMatchObject([{ stage: "folder" }]);

		const slash = await importer(vault, cursors().store).run(
			source([item(1)], { folder: `${FOLDER}/` }).src,
		);
		expect(slash).toMatchObject({ created: 1, failed: 0 });
		expect(vault.files.has(`${FOLDER}/Page 1.md`)).toBe(true);
	});

	test("a note deleted while the sync ran is not brought back", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		const obApp = new ObsidianApp(vault.app());
		const read = vault.app().vault.read;
		vi.spyOn(vault.app().vault, "read");
		const realApp = vault.app();
		// Delete it between indexing and writing.
		const spy = vi.spyOn(obApp, "updateFile");
		spy.mockImplementationOnce(async (file, content, label) => {
			vault.files.delete(file.path);
			return ObsidianApp.prototype.updateFile.call(obApp, file, content, label);
		});
		void read;
		void realApp;
		const run = new ImportHighlights({
			pageIntervalMs: 0,
			obApp,
			cursors: cursors().store,
			notify: () => {},
		});

		const result = await run.run(
			source([item(1, { document_note: "new" })]).src,
		);

		expect(result.failures).toMatchObject([
			{ stage: "update", message: "The note was deleted during the sync." },
		]);
		expect(vault.files.has(`${FOLDER}/Page 1.md`)).toBe(false);
	});

	test("content skipped for the request limit is reported once, not once per item", async () => {
		const vault = new FakeVault([FOLDER]);
		const { src } = source(
			Array.from({ length: 5 }, (_, i) => item(i + 1)),
			{
				hydrate: async () => {
					throw new ContentSkippedError();
				},
			},
		);

		const result = await importer(vault, cursors().store).run(src);

		expect(result.failed).toBe(5);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0]).toMatchObject({ stage: "hydrate" });
		expect(result.failures[0].message).toMatch(/5 summaries/);
	});

	test("a date Glasp sent that cannot be read is reported in plain words", async () => {
		const vault = new FakeVault([FOLDER]);
		const result = await importer(vault, cursors().store).run(
			source([item(1, { updated_at: "not a date" })]).src,
		);
		expect(result.failures[0].message).toMatch(
			/date from Glasp could not be read/,
		);
		// The same error as Safari words it (Obsidian for iOS).
		const ios = await importer(vault, cursors().store).run(
			source([item(2)], {
				normalize: () => {
					throw new RangeError("Invalid Date");
				},
			}).src,
		);
		expect(ios.failures[0].message).toMatch(
			/date from Glasp could not be read/,
		);
	});

	test("a user's own `Glasp:` key in a web template does not hide the notes", async () => {
		const vault = new FakeVault([FOLDER]);
		const template = HIGHLIGHT_TEMPLATE.replace(
			"---\nURL:",
			"---\nGlasp: web\nURL:",
		);
		const data = normalizeHighlight(item(1));
		vault.seed(`${FOLDER}/Page 1.md`, renderTemplate(template, data));

		const result = await importer(vault, cursors().store).run(
			source([item(1)], { template }).src,
		);

		expect(result).toMatchObject({ created: 0, unchanged: 1 });
		expect(vault.created).toEqual([]);
	});

	test("with the folder missing, only one page is fetched to decide", async () => {
		const vault = new FakeVault([]);
		let calls = 0;
		const { src } = source([], {
			fetchPage: async () => {
				calls++;
				return { results: [item(calls)], nextPageCursor: `c${calls}` };
			},
		});

		const result = await importer(vault, cursors().store).run(src);

		expect(calls).toBe(1);
		expect(result.failures).toMatchObject([{ stage: "folder" }]);
	});

	test("create missing notes does not copy a summary note whose template lacks the marker", async () => {
		const vault = new FakeVault([FOLDER]);
		// A custom summaries template without "Glasp: summary".
		vault.seed(
			`${FOLDER}/Page 1.md`,
			`---\nURL: "https://example.com/1"\n---\nmy summary\n`,
		);
		const { src } = source([item(1)], { sourceType: "summary" });

		const result = await importer(vault, cursors().store).run(src, {
			backfill: true,
		});

		expect(result).toMatchObject({ created: 0, unchanged: 1 });
		expect(vault.created).toEqual([]);
	});

	test("create missing notes creates nothing for an item whose content fetch fails", async () => {
		const vault = new FakeVault([FOLDER]);
		const { src } = source([item(1)], {
			hydrate: async () => {
				throw new ContentSkippedError();
			},
		});

		const result = await importer(vault, cursors().store).run(src, {
			backfill: true,
		});

		expect(vault.created).toEqual([]);
		expect(result.failures[0].message).toMatch(
			/Run Create missing notes again/,
		);
	});

	test("a create that returns no file does not break the next run", async () => {
		const vault = new FakeVault([FOLDER]);
		const obApp = new ObsidianApp(vault.app());
		vi.spyOn(obApp, "createFileAt").mockResolvedValueOnce(null as never);
		const session = new Map();
		const run = () =>
			new ImportHighlights({
				pageIntervalMs: 0,
				obApp,
				cursors: cursors().store,
				notify: () => {},
				sessionNotes: () => session,
			});
		await run().run(source([item(1)]).src);
		const second = await run().run(source([item(2)]).src);
		expect(second.failures).toEqual([]);
		expect(second.created).toBe(1);
	});

	test("a tag that is not a string does not fail the item", async () => {
		const vault = new FakeVault([FOLDER]);
		const odd = item(1, { tags: ["ok", 7 as unknown as string] });
		const result = await importer(vault, cursors().store).run(
			source([odd]).src,
		);
		expect(result).toMatchObject({ created: 1, failed: 0 });
	});

	test("the cursor never moves back", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-30T00:00:00.000Z" });
		// A server that answers with an item older than the cursor.
		const result = await importer(vault, c.store).run(
			source([item(1, { updated_at: "2026-09-24T10:00:00.000Z" })]).src,
		);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(c.state.lastUpdated).toBe("2026-09-30T00:00:00.000Z");
	});

	test("create missing notes gives a page its web note beside its summary note", async () => {
		const vault = new FakeVault([FOLDER]);
		const summaryNote = `---\nGlasp: summary\nURL: "https://example.com/1"\n---\nsummary text\n`;
		vault.seed(`${FOLDER}/Page 1.md`, summaryNote);

		const result = await importer(vault, cursors().store).run(
			source([item(1)]).src,
			{ backfill: true },
		);

		expect(result).toMatchObject({ created: 1, unchanged: 0 });
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(summaryNote);
		expect(vault.files.has(`${FOLDER}/Page 1 (2).md`)).toBe(true);
	});

	test("create missing notes does not copy a note moved out of the output folder", async () => {
		const vault = new FakeVault([FOLDER, "Archive"]);
		vault.seed("Archive/Page 1.md", rendered(item(1)));

		const result = await importer(vault, cursors().store).run(
			source([item(1), item(2)]).src,
			{ backfill: true },
		);

		expect(result).toMatchObject({ created: 1, unchanged: 1 });
		expect(vault.created).toEqual([`${FOLDER}/Page 2.md`]);
	});

	test("create missing notes finds a summary's note elsewhere by its marker, not by a web note", async () => {
		const vault = new FakeVault([FOLDER, "Archive"]);
		vault.seed(
			"Archive/Summary 1.md",
			`---\nGlasp: summary\nURL: "https://example.com/1"\n---\nsummary\n`,
		);
		vault.seed("Archive/Page 2.md", rendered(item(2)));
		const { src } = source([item(1), item(2)], { sourceType: "summary" });

		const result = await importer(vault, cursors().store).run(src, {
			backfill: true,
		});

		expect(result).toMatchObject({ created: 1, unchanged: 1 });
		expect(vault.created).toEqual([`${FOLDER}/Page 2.md`]);
	});

	test("create missing notes gives a summary its note in a folder shared with web highlights", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		const { src } = source([item(1)], {
			sourceType: "summary",
			template: SUMMARY_LIKE_TEMPLATE,
		});

		const result = await importer(vault, cursors().store).run(src, {
			backfill: true,
			unmarkedFolders: [FOLDER, ""],
		});

		expect(result).toMatchObject({ created: 1, unchanged: 0 });
		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toBe(
			rendered(item(1)),
		);
	});

	test("create missing notes gives a summary its note when web highlights are in a folder below", async () => {
		const vault = new FakeVault([FOLDER, `${FOLDER}/Web`]);
		vault.seed(`${FOLDER}/Web/Page 1.md`, rendered(item(1)));
		const { src } = source([item(1)], {
			sourceType: "summary",
			template: SUMMARY_LIKE_TEMPLATE,
		});

		const result = await importer(vault, cursors().store).run(src, {
			backfill: true,
			unmarkedFolders: [`${FOLDER}/Web/`],
		});

		expect(result).toMatchObject({ created: 1, unchanged: 0 });
	});

	test("a note this session created, then deleted and replaced by the user, is not written over", async () => {
		const vault = new FakeVault([FOLDER]);
		const session = new Map();
		const run = () =>
			new ImportHighlights({
				pageIntervalMs: 0,
				obApp: new ObsidianApp(vault.app()),
				cursors: cursors().store,
				notify: () => {},
				sessionNotes: () => session,
			});
		await run().run(source([item(1)]).src);
		const path = `${FOLDER}/Page 1.md`;
		vault.files.delete(path);
		vault.seed(path, "my own essay\n");

		await run().run(source([item(1, { document_note: "a new note" })]).src);

		expect(vault.files.get(path)?.content).toBe("my own essay\n");
		expect(vault.files.has(`${FOLDER}/Page 1 (2).md`)).toBe(true);
	});

	test("a note replaced by another one during the sync is left alone", async () => {
		const vault = new FakeVault([FOLDER]);
		const path = `${FOLDER}/Page 1.md`;
		vault.seed(path, rendered(item(1)));
		const { src } = source([item(1, { document_note: "a new note" })], {
			hydrate: async (h) => {
				// While the sync runs, the user deletes the note and writes their own.
				vault.files.delete(path);
				vault.seed(path, "someone else's note\n");
				return h;
			},
		});

		const result = await importer(vault, cursors().store).run(src);

		expect(vault.files.get(path)?.content).toBe("someone else's note\n");
		expect(result.failures[0]).toMatchObject({
			stage: "update",
			message: expect.stringMatching(/took this note's place/),
		});
	});

	test("a note for the same item that appears while it is created is not copied under another name", async () => {
		const vault = new FakeVault([FOLDER]);
		const obApp = new ObsidianApp(vault.app());
		const create = obApp.createFileAt.bind(obApp);
		vi.spyOn(obApp, "createFileAt").mockImplementationOnce(
			async (path, content) => {
				// Another device's copy of the same note arrives first.
				vault.seed(path, content);
				return create(path, content);
			},
		);
		const c = cursors({ lastUpdated: "2026-09-01T00:00:00.000Z" });

		const result = await new ImportHighlights({
			pageIntervalMs: 0,
			obApp,
			cursors: c.store,
			notify: () => {},
		}).run(source([item(1)]).src);

		expect([...vault.files.keys()]).toEqual([`${FOLDER}/Page 1.md`]);
		expect(result).toMatchObject({ created: 0, failed: 1 });
		expect(c.state.lastUpdated).toBe("2026-09-24T09:59:59.999Z");
	});

	test("another page's note that appears while a note is created still moves it to the next name", async () => {
		const vault = new FakeVault([FOLDER]);
		const obApp = new ObsidianApp(vault.app());
		const create = obApp.createFileAt.bind(obApp);
		vi.spyOn(obApp, "createFileAt").mockImplementationOnce(
			async (path, content) => {
				vault.seed(path, rendered(item(7, { title: "Page 1" })));
				return create(path, content);
			},
		);

		const result = await new ImportHighlights({
			pageIntervalMs: 0,
			obApp,
			cursors: cursors().store,
			notify: () => {},
		}).run(source([item(1)]).src);

		expect(result).toMatchObject({ created: 1, failed: 0 });
		expect(vault.files.has(`${FOLDER}/Page 1 (2).md`)).toBe(true);
	});

	test("create missing notes creates nothing its template would not let it find again", async () => {
		const vault = new FakeVault([FOLDER]);
		const { src } = source([item(1)], {
			template: "---\nSource: {{url}}\n---\n{{content}}\n",
		});

		const result = await importer(vault, cursors().store).run(src, {
			backfill: true,
		});

		expect(vault.created).toEqual([]);
		expect(result.failures[0].message).toMatch(/does not write the item's URL/);
		// A normal sync still creates it, as before.
		const normal = await importer(vault, cursors().store).run(src);
		expect(normal.created).toBe(1);
	});

	test("in a folder shared with web highlights, a summaries template without its Glasp line never makes Create missing notes copy notes", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 2.md`, rendered(item(2)));
		// The web template stands in for a custom summaries template with no `Glasp:` line.
		const { src } = source([item(1), item(2)], { sourceType: "summary" });
		const run = () =>
			importer(vault, cursors().store).run(src, {
				backfill: true,
				unmarkedFolders: [FOLDER],
			});

		expect(await run()).toMatchObject({ created: 1, unchanged: 1 });
		expect(await run()).toMatchObject({ created: 0, unchanged: 2 });
	});

	test("create missing notes reads a moved note whose frontmatter Obsidian could not parse", async () => {
		const vault = new FakeVault([FOLDER, "Archive"]);
		vault.seed("Archive/Page 1.md", rendered(item(1)));
		vault.unparsable.add("Archive/Page 1.md");

		const result = await importer(vault, cursors().store).run(
			source([item(1)]).src,
			{ backfill: true },
		);

		expect(result).toMatchObject({ created: 0, unchanged: 1 });
	});

	test("create missing notes leaves the cursor even when it fetches something newer", async () => {
		const vault = new FakeVault([FOLDER]);
		vault.seed(`${FOLDER}/Page 1.md`, rendered(item(1)));
		const c = cursors({ lastUpdated: "2026-09-20T00:00:00.000Z" });
		// Changed on Glasp after the cursor; the next normal sync updates its note.
		const changed = item(1, { document_note: "changed since the last sync" });

		const result = await importer(vault, c.store).run(source([changed]).src, {
			backfill: true,
		});

		expect(result).toMatchObject({ created: 0, unchanged: 1 });
		expect(c.state.lastUpdated).toBe("2026-09-20T00:00:00.000Z");
	});

	test("a page whose request fails on the way is asked for again", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const fetchPage = vi
			.fn()
			.mockRejectedValueOnce(new APIError({ status: 0, message: "offline" }))
			.mockResolvedValueOnce({ results: [item(1)], nextPageCursor: null });
		const { src } = source([], { fetchPage });

		const result = await importer(vault, c.store).run(src);

		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ created: 1, failures: [] });
	});

	test("a page refused for the API's request limit is not asked for again", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-01T00:00:00.000Z" });
		const fetchPage = vi.fn().mockRejectedValue(new APIError({ status: 429 }));
		const { src } = source([], { fetchPage });

		const result = await importer(vault, c.store).run(src);

		expect(fetchPage).toHaveBeenCalledTimes(1);
		expect(result.failures[0]).toMatchObject({ stage: "fetch" });
		expect(c.state.lastUpdated).toBe("2026-09-01T00:00:00.000Z");
	});

	test("a page that fails three times fails the fetch and keeps the cursor", async () => {
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-01T00:00:00.000Z" });
		const fetchPage = vi.fn().mockRejectedValue(new APIError({ status: 503 }));
		const { src } = source([], { fetchPage });

		const result = await importer(vault, c.store).run(src);

		expect(fetchPage).toHaveBeenCalledTimes(3);
		expect(result.failures[0]).toMatchObject({ stage: "fetch" });
		expect(c.state.lastUpdated).toBe("2026-09-01T00:00:00.000Z");
		expect(vault.created).toEqual([]);
	});

	test("an item the next sync fetches again unchanged is left alone, even if its note was deleted or moved", async () => {
		const at = new Date(Date.now() - 60 * 1000).toISOString();
		const { fetchPage } = serving([
			item(1, { updated_at: at }),
			item(2, { updated_at: at }),
		]);
		const vault = new FakeVault([FOLDER, "Archive"]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);
		// Within the margin, so the next sync fetches both again.
		expect(Date.parse(c.state.lastUpdated)).toBeLessThan(Date.parse(at));
		vault.files.delete(`${FOLDER}/Page 1.md`);
		const moved = vault.files.get(`${FOLDER}/Page 2.md`);
		if (!moved) throw new Error("no note");
		vault.files.delete(`${FOLDER}/Page 2.md`);
		vault.seed("Archive/Page 2.md", moved.content);

		const second = await importer(vault, c.store).run(src);

		expect(second).toMatchObject({ fetched: 2, created: 0, unchanged: 2 });
		expect(vault.files.has(`${FOLDER}/Page 1.md`)).toBe(false);
		expect(vault.files.has(`${FOLDER}/Page 2.md`)).toBe(false);
	});

	test("an item that changes again is written again", async () => {
		const all = [
			item(1, { updated_at: new Date(Date.now() - 60 * 1000).toISOString() }),
		];
		const { fetchPage } = serving(all);
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);
		all[0] = item(1, {
			updated_at: new Date(Date.now() - 1000).toISOString(),
			document_note: "changed on Glasp",
		});

		const second = await importer(vault, c.store).run(src);

		expect(second).toMatchObject({ updated: 1 });
	});

	test("create missing notes does not go by what the last sync remembered", async () => {
		const { fetchPage } = serving([
			item(1, { updated_at: new Date(Date.now() - 60 * 1000).toISOString() }),
		]);
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);
		vault.files.delete(`${FOLDER}/Page 1.md`);

		const result = await importer(vault, c.store).run(src, { backfill: true });

		expect(result.created).toBe(1);
	});

	test("what was written is remembered even when a failure holds the cursor", async () => {
		const at = "2026-09-24T10:00:00.000Z";
		const { fetchPage } = serving([
			item(1, { updated_at: at }),
			item(2, { updated_at: "2026-09-23T10:00:00.000Z" }),
		]);
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-01T00:00:00.000Z" });
		const { src } = source([], {
			fetchPage,
			normalize: (h) => {
				if (h.id === "id2") throw new Error("not readable");
				return normalizeHighlight(h);
			},
		});
		await importer(vault, c.store).run(src);
		expect(c.state.lastUpdated).toBe("2026-09-23T09:59:59.999Z");
		expect(Object.keys(c.written.lastUpdated)).toEqual([
			"https://example.com/1",
		]);
		expect(c.written.lastUpdated["https://example.com/1"]).toMatch(
			new RegExp(`^${at}#`),
		);
		const note = vault.files.get(`${FOLDER}/Page 1.md`);
		if (!note) throw new Error("no note");
		note.content += "\n## Mine\n";

		await importer(vault, c.store).run(src);

		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toContain(
			"## Mine",
		);
	});

	test("what was remembered is let go once the cursor passes it", async () => {
		const all = [item(1, { updated_at: "2026-09-24T10:00:00.000Z" })];
		const { fetchPage } = serving(all);
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);
		expect(Object.keys(c.written.lastUpdated)).toEqual([
			"https://example.com/1",
		]);
		all.push(item(2, { updated_at: "2026-09-24T11:00:00.000Z" }));

		await importer(vault, c.store).run(src);

		expect(c.state.lastUpdated).toBe("2026-09-24T10:59:59.999Z");
		expect(Object.keys(c.written.lastUpdated)).toEqual([
			"https://example.com/2",
		]);
	});

	test("what was written is remembered when an item with an unreadable date keeps the cursor still", async () => {
		const { fetchPage } = serving([
			item(1, { updated_at: "2026-09-24T10:00:00.000Z" }),
		]);
		const broken = item(2, { updated_at: "not a date" });
		const vault = new FakeVault([FOLDER]);
		const c = cursors({ lastUpdated: "2026-09-01T00:00:00.000Z" });
		const { src } = source([], {
			fetchPage: async (args) => {
				const page = await fetchPage(args);
				return { ...page, results: [...page.results, broken] };
			},
		});
		await importer(vault, c.store).run(src);
		expect(c.state.lastUpdated).toBe("2026-09-01T00:00:00.000Z");
		const note = vault.files.get(`${FOLDER}/Page 1.md`);
		if (!note) throw new Error("no note");
		note.content += "\n## Mine\n";

		await importer(vault, c.store).run(src);

		expect(vault.files.get(`${FOLDER}/Page 1.md`)?.content).toContain(
			"## Mine",
		);
	});

	test("a large batch of changes made long ago is not fetched again on every sync", async () => {
		// 300 items stamped within one minute, three hours ago.
		const base = Date.now() - 3 * 60 * 60 * 1000;
		const all = Array.from({ length: 300 }, (_, i) =>
			item(i + 1, { updated_at: new Date(base + i * 200).toISOString() }),
		);
		const { fetchPage } = serving(all);
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);

		const second = await importer(vault, c.store).run(src);

		expect(second.fetched).toBeLessThanOrEqual(1);
	});

	test("an item whose content changed without a new update time is written again", async () => {
		// A Kindle book is stamped with the day of its latest annotation, so a
		// highlight added the same day keeps the time.
		const at = new Date(Date.now() - 60 * 1000).toISOString();
		const all = [item(1, { updated_at: at })];
		const { fetchPage } = serving(all);
		const vault = new FakeVault([FOLDER]);
		const c = cursors();
		const { src } = source([], { fetchPage });
		await importer(vault, c.store).run(src);
		all[0] = item(1, {
			updated_at: at,
			document_note: "a highlight added the same day",
		});

		const second = await importer(vault, c.store).run(src);

		expect(second).toMatchObject({ updated: 1 });
	});

	test("once the plugin is unloaded, a failed page is not asked for again", async () => {
		const vault = new FakeVault([FOLDER]);
		let unloaded = false;
		const fetchPage = vi.fn().mockImplementation(async () => {
			// The plugin is disabled while the importer waits to ask again.
			setTimeout(() => {
				unloaded = true;
			}, 5);
			throw new APIError({ status: 0, message: "offline" });
		});
		const { src } = source([], { fetchPage });

		await new ImportHighlights({
			pageIntervalMs: 10,
			obApp: new ObsidianApp(vault.app()),
			cursors: cursors().store,
			notify: () => {},
			isCancelled: () => unloaded,
		}).run(src);

		expect(fetchPage).toHaveBeenCalledTimes(1);
	});
});
