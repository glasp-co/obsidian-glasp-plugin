import { afterEach, describe, expect, test, vi } from "vitest";
import { FakeVault } from "../test/fake-vault";
import { shownNotices } from "../test/obsidian-stub";
import { summaryBase } from "./core/import-highlights";
import { GlaspAPIClient } from "./glasp-api/glasp-api-client";
import ObsidianGlaspPlugin from "./main";

type Stub = ObsidianGlaspPlugin & {
	stored: unknown;
	saves: unknown[];
};

const page = (n: number) => ({
	id: `id${n}`,
	title: `Page ${n}`,
	thumbnail_url: "",
	url: `https://example.com/${n}`,
	glasp_url: `https://glasp.co/u/p/${n}`,
	domain: "example.com",
	category: "article",
	document_note: null,
	summary: "",
	tags: [],
	is_favorite: false,
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-24T10:00:00.000Z",
	highlights: [],
});

const v040Data = {
	accessToken: "t",
	folder: "Glasp",
	kindleFolder: "",
	summaryFolder: "",
	bookmarkFolder: "",
	template: "",
	kindleTemplate: "",
	summaryTemplate: "",
	bookmarkTemplate: "",
	summaryIncludeContent: false,
	lastUpdated: "2026-09-23T00:00:00.000Z",
	kindleLastUpdated: "",
	summaryLastUpdated: "",
	bookmarkLastUpdated: "",
	updateFrequency: "1440",
	basesCreated: { "Glasp Web Highlights.base": "Glasp" },
	createBasesViews: true,
};

const makePlugin = (stored: unknown, vault = new FakeVault(["Glasp"])) => {
	const app = vault.app() as unknown as Record<string, unknown>;
	app.workspace = { layoutReady: true, onLayoutReady: () => {} };
	const plugin = new ObsidianGlaspPlugin(
		app as never,
		{ id: "glasp", dir: ".obsidian/plugins/glasp" } as never,
	) as Stub;
	plugin.stored = stored;
	return { plugin, vault };
};

// Obsidian runs in a window; its timers are recorded, not run.
const timers: { cb: () => void; ms: number }[] = [];
const intervals: number[] = [];
vi.stubGlobal("window", {
	setInterval: (_cb: () => void, ms: number) => {
		intervals.push(ms);
		return intervals.length;
	},
	clearInterval: () => {},
	setTimeout: (cb: () => void, ms: number) => {
		timers.push({ cb, ms });
		return timers.length;
	},
	clearTimeout: () => {},
});

afterEach(() => {
	vi.restoreAllMocks();
	shownNotices.length = 0;
	timers.length = 0;
	intervals.length = 0;
});

describe("plugin lifecycle", () => {
	test("a data.json already in this version's shape is not rewritten at load", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		expect(plugin.saves).toEqual([]);
	});

	test("a 0.3.0 data.json is saved once, with Create Bases views on", async () => {
		const { createBasesViews: _c, ...v030 } = v040Data;
		const { plugin } = makePlugin(v030);
		await plugin.onload();
		expect(plugin.saves).toHaveLength(1);
		expect(plugin.saves[0]).toMatchObject({ ...v030, createBasesViews: true });
	});

	test("an unreadable data.json is left alone and nothing is imported", async () => {
		const vault = new FakeVault(["Glasp"]);
		vault.seed(".obsidian/plugins/glasp/data.json", "<<<<<<< a sync conflict");
		const { plugin } = makePlugin(undefined, vault);
		const get = vi.spyOn(GlaspAPIClient.prototype, "get");
		await plugin.onload();
		await plugin.importHighlights();
		expect(plugin.saves).toEqual([]);
		expect(get).not.toHaveBeenCalled();
		expect(shownNotices.join("\n")).toMatch(/could not be read/);
	});

	test("without a plugin folder from Obsidian, an unreadable data.json is looked for in the vault's own config folder", async () => {
		const vault = new FakeVault(["Glasp"]);
		vault.seed(".config/plugins/glasp/data.json", "<<<<<<< a sync conflict");
		const app = vault.app() as unknown as Record<string, unknown>;
		(app.vault as { configDir: string }).configDir = ".config";
		app.workspace = { layoutReady: true, onLayoutReady: () => {} };
		const plugin = new ObsidianGlaspPlugin(
			app as never,
			{
				id: "glasp",
			} as never,
		) as Stub;
		plugin.stored = undefined;
		await plugin.onload();
		expect(plugin.saves).toEqual([]);
		expect(shownNotices.join("\n")).toMatch(
			/\(\.config\/plugins\/glasp\/data\.json\) could not be read/,
		);
	});

	test("a data.json that is not there yet counts as new even when Obsidian calls it unreadable", async () => {
		// Obsidian for iOS before 1.13 does that when the device's language is
		// not English.
		const { plugin } = makePlugin(undefined);
		await plugin.onload();
		expect(shownNotices.join("\n")).not.toMatch(/could not be read/);
		expect(plugin.saves).toEqual([]);
	});

	test("a data.json that is not there yet is not written at load", async () => {
		// On a device whose copy has not arrived from a sync service yet, the
		// defaults would otherwise replace every device's settings.
		const { plugin } = makePlugin(null);
		await plugin.onload();
		expect(plugin.saves).toEqual([]);
		expect(plugin.store.get().accessToken).toBe("");
	});

	test("loaded into a running Obsidian, the first import waits a few minutes", async () => {
		const { plugin } = makePlugin(v040Data);
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		await plugin.onload();
		expect(get).not.toHaveBeenCalled();
		const first = timers.find((t) => t.ms >= 60 * 1000);
		if (!first) throw new Error("no delayed first import");
		first.cb();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(get).toHaveBeenCalled();
	});

	test("started with Obsidian, the first import runs once the layout is ready", async () => {
		const { plugin } = makePlugin(v040Data);
		const workspace = (
			plugin.app as unknown as { workspace: Record<string, unknown> }
		).workspace;
		let ready!: () => void;
		workspace.layoutReady = false;
		workspace.onLayoutReady = (cb: () => void) => {
			ready = cb;
		};
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		await plugin.onload();
		expect(timers).toEqual([]);
		workspace.layoutReady = true;
		ready();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(get).toHaveBeenCalled();
	});

	test("a Create missing notes asked for before the token is removed is dropped", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		let release!: () => void;
		vi.spyOn(GlaspAPIClient.prototype, "get")
			.mockImplementationOnce(async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return { results: [], nextPageCursor: null } as never;
			})
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		void plugin.createMissingNotes(); // queued behind the running sync
		await plugin.updateSettings({ accessToken: "" });
		release();
		await running;
		await new Promise((resolve) => setTimeout(resolve, 0));
		await plugin.updateSettings({ accessToken: "t" });
		shownNotices.length = 0;
		await plugin.createMissingNotes();
		expect(shownNotices.join("\n")).not.toMatch(/already running/);
	});

	test("an update frequency changed on another device takes effect", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		expect(intervals.at(-1)).toBe(1440 * 60 * 1000);
		plugin.stored = { ...v040Data, updateFrequency: "60" };
		await plugin.onExternalSettingsChange();
		expect(intervals.at(-1)).toBe(60 * 60 * 1000);
	});

	test("a data.json written by a device on 0.3.0 keeps this device's Create Bases views", async () => {
		const { plugin } = makePlugin({ ...v040Data, createBasesViews: false });
		await plugin.onload();
		const { createBasesViews: _c, ...from030 } = v040Data;
		plugin.stored = { ...from030, folder: "Elsewhere" };
		await plugin.onExternalSettingsChange();
		expect(plugin.store.get()).toMatchObject({
			folder: "Elsewhere",
			createBasesViews: false,
		});
	});

	test("an unreadable external change keeps the settings", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		plugin.stored = undefined;
		await plugin.onExternalSettingsChange();
		expect(plugin.store.get()).toMatchObject({
			accessToken: "t",
			folder: "Glasp",
		});
	});

	test("after unload, an import in flight writes no note and saves nothing", async () => {
		const { plugin, vault } = makePlugin(v040Data);
		await plugin.onload();
		let release!: () => void;
		vi.spyOn(GlaspAPIClient.prototype, "get").mockImplementation(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return { results: [page(1)], nextPageCursor: null } as never;
		});
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		plugin.onunload(); // Obsidian disables the plugin (e.g. to update it)
		release();
		await running;
		expect(vault.created).toEqual([]);
		expect(plugin.saves).toEqual([]);
	});

	test("after unload, nothing can save over the next instance's data", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		plugin.onunload();
		await expect(plugin.store.update({ folder: "Elsewhere" })).rejects.toThrow(
			/unloaded/,
		);
		await plugin.updateSettings({ folder: "Elsewhere" });
		expect(plugin.saves).toEqual([]);
	});

	test("a manual sync while one runs says so", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		let release!: () => void;
		vi.spyOn(GlaspAPIClient.prototype, "get")
			.mockImplementationOnce(async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return { results: [], nextPageCursor: null } as never;
			})
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		void plugin.importHighlights(true);
		expect(shownNotices.join("\n")).toMatch(/already running/);
		release();
		await running;
	});

	test("a data.json with a field from a newer version is not rewritten at load", async () => {
		const { plugin } = makePlugin({ ...v040Data, futureSetting: "x" });
		await plugin.onload();
		expect(plugin.saves).toEqual([]);
	});

	test("a sync started before the layout is ready waits for it", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		const workspace = (
			plugin.app as unknown as { workspace: Record<string, unknown> }
		).workspace;
		let ready!: () => void;
		workspace.layoutReady = false;
		workspace.onLayoutReady = (cb: () => void) => {
			ready = cb;
		};
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(get).not.toHaveBeenCalled();
		workspace.layoutReady = true;
		ready();
		await running;
		expect(get).toHaveBeenCalled();
	});

	test("create missing notes needs a token, and runs one at a time", async () => {
		const { plugin: noToken } = makePlugin({ ...v040Data, accessToken: "" });
		await noToken.onload();
		await noToken.createMissingNotes();
		expect(shownNotices.join("\n")).toMatch(/access token first/);

		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		let release!: () => void;
		vi.spyOn(GlaspAPIClient.prototype, "get")
			.mockImplementationOnce(async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return { results: [], nextPageCursor: null } as never;
			})
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		const first = plugin.createMissingNotes();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await plugin.createMissingNotes();
		expect(shownNotices).toContain(
			"Glasp: Create missing notes is already running.",
		);
		expect(shownNotices.join("\n")).not.toMatch(/A sync is already running/);
		release();
		await first;
	});

	test("a sync with nothing to report writes nothing", async () => {
		const { plugin } = makePlugin({
			...v040Data,
			lastSyncReport: {
				schemaVersion: 1,
				finishedAt: "2026-10-16T00:00:00.000Z",
				sources: [],
				totalFailures: 0,
				failures: [],
				truncated: false,
			},
		});
		await plugin.onload();
		vi.spyOn(GlaspAPIClient.prototype, "get").mockResolvedValue({
			results: [],
			nextPageCursor: null,
		} as never);
		await plugin.importHighlights();
		expect(plugin.saves).toEqual([]);
	});

	test("the first sync saves its report, and a clean sync clears the last one's problems", async () => {
		vi.spyOn(GlaspAPIClient.prototype, "get").mockResolvedValue({
			results: [],
			nextPageCursor: null,
		} as never);
		const { plugin: fresh } = makePlugin(v040Data);
		await fresh.onload();
		await fresh.importHighlights();
		expect(fresh.saves).toHaveLength(1);
		expect(fresh.saves[0]).toMatchObject({
			lastSyncReport: { totalFailures: 0 },
		});

		const { plugin } = makePlugin({
			...v040Data,
			lastSyncReport: {
				schemaVersion: 1,
				finishedAt: "2026-10-16T00:00:00.000Z",
				sources: [],
				totalFailures: 1,
				failures: [{ source: "web highlights", stage: "create", message: "x" }],
				truncated: false,
			},
		});
		await plugin.onload();
		await plugin.importHighlights();
		expect(plugin.saves.at(-1)).toMatchObject({
			lastSyncReport: { totalFailures: 0, failures: [] },
		});
	});

	test("after unload, a manual sync says nothing", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		let release!: () => void;
		vi.spyOn(GlaspAPIClient.prototype, "get").mockImplementationOnce(
			async () => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return { results: [], nextPageCursor: null } as never;
			},
		);
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		plugin.onunload();
		await plugin.importHighlights(true);
		expect(shownNotices.join("\n")).not.toMatch(/already running/);
		release();
		await running;
	});

	test("after unload, no more full page content is requested", async () => {
		const { plugin } = makePlugin(
			{
				...v040Data,
				folder: "",
				summaryFolder: "Summaries",
				summaryIncludeContent: true,
			},
			new FakeVault(["Summaries"]),
		);
		await plugin.onload();
		const summary = (n: number) => ({
			id: `s${n}`,
			url: `https://example.com/${n}`,
			domain: "example.com",
			title: `Summary ${n}`,
			thumbnail_url: "",
			summary: "text",
			created_at: "2026-09-20T10:00:00.000Z",
			updated_at: "2026-09-24T10:00:00.000Z",
		});
		let contentRequests = 0;
		vi.spyOn(GlaspAPIClient.prototype, "get").mockImplementation(
			async (path) => {
				if (String(path).startsWith("/v1/summaries/get")) {
					contentRequests++;
					plugin.onunload(); // Obsidian disables the plugin mid-sync
					return { content: "body" } as never;
				}
				return {
					results: [summary(1), summary(2), summary(3)],
					nextPageCursor: null,
				} as never;
			},
		);
		await plugin.importHighlights();
		expect(contentRequests).toBe(1);
	});

	test("a sync while Obsidian switches workspaces runs once", async () => {
		const { plugin } = makePlugin(v040Data);
		await plugin.onload();
		const workspace = (
			plugin.app as unknown as { workspace: Record<string, unknown> }
		).workspace;
		// While it changes layout, layoutReady is false and onLayoutReady calls
		// back at once.
		workspace.layoutReady = false;
		workspace.onLayoutReady = (cb: () => void) => cb();
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockResolvedValue({ results: [], nextPageCursor: null } as never);
		await plugin.importHighlights();
		expect(get).toHaveBeenCalledTimes(1);
	});

	test.each([
		{
			kind: "summary",
			setting: { summaryFolder: "Glasp" },
			endpoint: "/v1/summaries/export",
			item: {
				id: "s1",
				url: "https://example.com/1",
				domain: "example.com",
				title: "Saved 1",
				thumbnail_url: "",
				summary: "text",
				created_at: "2026-09-20T10:00:00.000Z",
				updated_at: "2026-09-24T10:00:00.000Z",
			},
		},
		{
			kind: "bookmark",
			setting: { bookmarkFolder: "Glasp" },
			endpoint: "/v1/bookmarks/export",
			item: {
				id: "b1",
				url: "https://example.com/1",
				title: "Saved 1",
				domain: "example.com",
				description: "",
				thumbnail_url: "",
				category: "article",
				created_at: "2026-09-20T10:00:00.000Z",
				updated_at: "2026-09-24T10:00:00.000Z",
			},
		},
	])(
		"create missing notes gives a $kind its note in a folder shared with web highlights",
		async ({ setting, endpoint, item }) => {
			const vault = new FakeVault(["Glasp"]);
			vault.seed(
				"Glasp/Saved 1.md",
				`---\nURL: "https://example.com/1"\n---\nthe web note\n`,
			);
			const { plugin } = makePlugin({ ...v040Data, ...setting }, vault);
			await plugin.onload();
			vi.spyOn(GlaspAPIClient.prototype, "get").mockImplementation(
				async (path) =>
					({
						results: String(path).startsWith(endpoint) ? [item] : [],
						nextPageCursor: null,
					}) as never,
			);
			await plugin.createMissingNotes();
			expect(vault.created.filter((path) => path.endsWith(".md"))).toEqual([
				"Glasp/Saved 1 (2).md",
			]);
		},
	);

	test("turning on full page content forgets the summaries remembered as written", async () => {
		const { plugin } = makePlugin({
			...v040Data,
			writtenAhead: {
				summaryLastUpdated: { "https://s": "2026-10-01T00:00:00.000Z" },
				lastUpdated: { "https://w": "2026-10-01T00:00:00.000Z" },
			},
			shownAhead: {
				summaryLastUpdated: { "https://s": "2026-10-01T00:00:00.000Z x" },
				lastUpdated: { "https://w": "2026-10-01T00:00:00.000Z y" },
			},
		});
		await plugin.onload();
		await plugin.setSummaryIncludeContent(true);
		expect(plugin.store.get()).toMatchObject({
			summaryIncludeContent: true,
			summaryLastUpdated: "",
			writtenAhead: {
				lastUpdated: { "https://w": "2026-10-01T00:00:00.000Z" },
			},
			shownAhead: {
				lastUpdated: { "https://w": "2026-10-01T00:00:00.000Z y" },
			},
		});
		expect(plugin.store.get().writtenAhead?.summaryLastUpdated).toBeUndefined();
		expect(plugin.store.get().shownAhead?.summaryLastUpdated).toBeUndefined();
	});

	test("an unknown update frequency falls back to daily", async () => {
		const { plugin } = makePlugin({ ...v040Data, updateFrequency: "5" });
		await plugin.onload();
		expect(plugin.store.get().updateFrequency).toBe("1440");
	});
});

describe("Bases folder", () => {
	const emptyApi = () =>
		vi.spyOn(GlaspAPIClient.prototype, "get").mockResolvedValue({
			results: [],
			nextPageCursor: null,
		} as never);

	test("a data.json without a Bases folder uses 'Glasp Bases' and is not rewritten", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(vault.files.has("Glasp Bases/Glasp Summaries.base")).toBe(true);
		expect(plugin.store.get().basesFolder).toBeUndefined();
	});

	test("new views are created in the chosen folder, and nothing at the top of the vault", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Clippings"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp", basesFolder: "Clippings" },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(vault.files.has("Clippings/Glasp Summaries.base")).toBe(true);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("choosing another folder moves the plugin's views there and trashes the folder they left empty", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		await plugin.setBasesFolder("Clippings");
		expect(plugin.store.get().basesFolder).toBe("Clippings");
		expect(
			vault.files.get("Clippings/Glasp Web Highlights.base")?.content,
		).toBe("view");
		expect(vault.files.has("Glasp Bases/Glasp Web Highlights.base")).toBe(
			false,
		);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
		expect(vault.trashed).toEqual(["Glasp Bases"]);
	});

	test("with Create Bases views off, choosing a folder moves nothing", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{ ...v040Data, createBasesViews: false },
			vault,
		);
		await plugin.onload();
		await plugin.setBasesFolder("Clippings");
		expect(plugin.store.get().basesFolder).toBe("Clippings");
		expect(vault.files.has("Glasp Bases/Glasp Web Highlights.base")).toBe(true);
		expect(vault.trashed).toEqual([]);
	});

	test("a view already at the destination is not overwritten", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "old");
		vault.seed("Clippings/Glasp Web Highlights.base", "mine");
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		await plugin.setBasesFolder("Clippings");
		expect(
			vault.files.get("Clippings/Glasp Web Highlights.base")?.content,
		).toBe("mine");
		expect(vault.files.has("Glasp Bases/Glasp Web Highlights.base")).toBe(true);
		expect(vault.trashed).toEqual([]);
	});

	test("a data.json written by a device on 0.3.0 keeps this device's Bases folder", async () => {
		const { plugin } = makePlugin({ ...v040Data, basesFolder: "Clippings" });
		await plugin.onload();
		const { createBasesViews: _c, ...from030 } = v040Data;
		plugin.stored = { ...from030, folder: "Elsewhere" };
		await plugin.onExternalSettingsChange();
		expect(plugin.store.get()).toMatchObject({
			folder: "Elsewhere",
			basesFolder: "Clippings",
		});
	});

	test("a Bases folder chosen on another device is used by the next sync", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Clippings"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		plugin.stored = {
			...v040Data,
			summaryFolder: "Glasp",
			basesFolder: "Clippings",
		};
		await plugin.onExternalSettingsChange();
		await plugin.importHighlights();
		expect(vault.files.has("Clippings/Glasp Summaries.base")).toBe(true);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("a view written but not recorded (the folder was changed mid-sync) is moved too, and recorded by the next sync without a rewrite", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Summaries.base", "unrecorded");
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp", basesCreated: {} },
			vault,
		);
		await plugin.onload();
		await plugin.setBasesFolder("Clippings");
		expect(vault.files.get("Clippings/Glasp Summaries.base")?.content).toBe(
			"unrecorded",
		);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
		await plugin.importHighlights();
		expect(vault.modified).not.toContain("Clippings/Glasp Summaries.base");
		expect(plugin.store.get().basesCreated).toMatchObject({
			"Glasp Summaries.base": "Glasp",
		});
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("folders chosen one after another without waiting end with every view in the last one", async () => {
		const vault = new FakeVault([
			"Glasp",
			"Glasp Bases",
			"Archive",
			"Books",
			"Clippings",
		]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		await Promise.all([
			plugin.setBasesFolder("Archive"),
			plugin.setBasesFolder("Books"),
			plugin.setBasesFolder("Clippings"),
		]);
		expect(plugin.store.get().basesFolder).toBe("Clippings");
		expect(plugin.currentBasesFolder()).toBe("Clippings");
		expect([...vault.files.keys()].filter((p) => p.endsWith(".base"))).toEqual([
			"Clippings/Glasp Web Highlights.base",
		]);
		expect(vault.trashed).toEqual(["Glasp Bases"]);
	});

	test("a folder of the user's is never trashed, even when the move empties it", async () => {
		const vault = new FakeVault(["Glasp", "Bookmarks", "Views"]);
		vault.seed("Bookmarks/Glasp Bookmarks.base", "view");
		const { plugin } = makePlugin(
			{
				...v040Data,
				bookmarkFolder: "Bookmarks",
				basesFolder: "Bookmarks",
				basesCreated: { "Glasp Bookmarks.base": "Bookmarks" },
			},
			vault,
		);
		await plugin.onload();
		await plugin.setBasesFolder("Views");
		expect(vault.files.has("Views/Glasp Bookmarks.base")).toBe(true);
		expect(vault.folders.has("Bookmarks")).toBe(true);
		expect(vault.trashed).toEqual([]);
	});

	test("Glasp Bases is kept while the disk still holds a file Obsidian does not list", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		vault.diskOnly.add("Glasp Bases/.DS_Store");
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		await plugin.setBasesFolder("Clippings");
		expect(vault.files.has("Clippings/Glasp Web Highlights.base")).toBe(true);
		expect(vault.folders.has("Glasp Bases")).toBe(true);
		expect(vault.trashed).toEqual([]);
	});

	test("Glasp Bases is kept when it is also a source's output folder", async () => {
		const vault = new FakeVault(["Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{
				...v040Data,
				folder: "Glasp Bases",
				basesCreated: { "Glasp Web Highlights.base": "Glasp Bases" },
			},
			vault,
		);
		await plugin.onload();
		await plugin.setBasesFolder("Clippings");
		expect(vault.files.has("Clippings/Glasp Web Highlights.base")).toBe(true);
		expect(vault.folders.has("Glasp Bases")).toBe(true);
		expect(vault.trashed).toEqual([]);
	});

	const gatedApi = () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		vi.spyOn(GlaspAPIClient.prototype, "get").mockImplementation(async () => {
			await gate;
			return { results: [], nextPageCursor: null } as never;
		});
		return () => release();
	};

	test("an import running when the folder is chosen writes no view in the old folder", async () => {
		const release = gatedApi();
		const vault = new FakeVault(["Glasp", "Clippings"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await plugin.setBasesFolder("Clippings");
		release();
		await running;
		expect(vault.folders.has("Glasp Bases")).toBe(false);
		expect(
			[...vault.files.keys()].some((p) => p.startsWith("Glasp Bases/")),
		).toBe(false);
	});

	test("an import running when another device chooses the folder writes no view in the old folder", async () => {
		const release = gatedApi();
		const vault = new FakeVault(["Glasp", "Clippings"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		const running = plugin.importHighlights();
		await new Promise((resolve) => setTimeout(resolve, 0));
		plugin.stored = {
			...v040Data,
			summaryFolder: "Glasp",
			basesFolder: "Clippings",
		};
		await plugin.onExternalSettingsChange();
		release();
		await running;
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("a file of the user's own with a view's name, in the chosen folder, survives a later source folder change", async () => {
		emptyApi();
		const vault = new FakeVault([
			"Glasp",
			"Glasp Bases",
			"Dashboards",
			"Summaries",
		]);
		vault.seed(
			"Glasp Bases/Glasp Summaries.base",
			summaryBase("Glasp").content,
		);
		vault.seed("Dashboards/Glasp Summaries.base", "MY OWN VIEW");
		const { plugin } = makePlugin(
			{
				...v040Data,
				summaryFolder: "Glasp",
				basesCreated: {
					"Glasp Web Highlights.base": "Glasp",
					"Glasp Summaries.base": "Glasp",
				},
			},
			vault,
		);
		await plugin.onload();
		await plugin.setBasesFolder("Dashboards");
		expect(shownNotices.join("\n")).toMatch(
			/Glasp: Could not move Glasp Summaries\.base/,
		);
		expect(shownNotices.join("\n")).not.toMatch(/Glasp: Glasp:/);
		await plugin.updateSettings({ summaryFolder: "Summaries" });
		await plugin.importHighlights();
		expect(vault.files.get("Dashboards/Glasp Summaries.base")?.content).toBe(
			"MY OWN VIEW",
		);
	});

	test("an unchanged view in the chosen folder is rewritten on a source folder change", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Clippings", "Summaries"]);
		vault.seed("Clippings/Glasp Summaries.base", summaryBase("Glasp").content);
		const { plugin } = makePlugin(
			{
				...v040Data,
				summaryFolder: "Summaries",
				basesFolder: "Clippings",
				basesCreated: {
					"Glasp Web Highlights.base": "Glasp",
					"Glasp Summaries.base": "Glasp",
				},
			},
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(vault.files.get("Clippings/Glasp Summaries.base")?.content).toBe(
			summaryBase("Summaries").content,
		);
	});
});

describe("Bases folder: staying where the user put it", () => {
	const emptyApi = () =>
		vi.spyOn(GlaspAPIClient.prototype, "get").mockResolvedValue({
			results: [],
			nextPageCursor: null,
		} as never);
	const settle = async () => {
		for (let i = 0; i < 5; i++) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	};
	const basePaths = (vault: FakeVault) =>
		[...vault.files.keys()].filter((p) => p.endsWith(".base")).sort();

	test("a folder chosen while an import is writing a view: the view ends in the new folder, none is left behind", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Clippings"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp", basesCreated: {} },
			vault,
		);
		await plugin.onload();
		let choosing: Promise<void> | undefined;
		vault.beforeCreate = async (path) => {
			if (path === "Glasp Bases/Glasp Web Highlights.base" && !choosing) {
				choosing = plugin.setBasesFolder("Clippings");
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		};
		await plugin.importHighlights();
		await choosing;
		vault.beforeCreate = undefined;
		await plugin.importHighlights();
		expect(basePaths(vault)).toEqual([
			"Clippings/Glasp Summaries.base",
			"Clippings/Glasp Web Highlights.base",
		]);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("with another folder chosen, a sync moves views it finds in Glasp Bases there, without asking about links", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{ ...v040Data, basesFolder: "Clippings" },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(basePaths(vault)).toEqual(["Clippings/Glasp Web Highlights.base"]);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
		expect(vault.linkUpdatingMoves).toEqual([]);
		expect(vault.quietMoves).toEqual([
			"Glasp Bases/Glasp Web Highlights.base -> Clippings/Glasp Web Highlights.base",
		]);
	});

	test("with Create Bases views off, a sync leaves Glasp Bases alone", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{ ...v040Data, basesFolder: "Clippings", createBasesViews: false },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(basePaths(vault)).toEqual(["Glasp Bases/Glasp Web Highlights.base"]);
	});

	test("a view in Glasp Bases whose name is taken in the chosen folder stays, and so does Glasp Bases", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "old");
		vault.seed("Clippings/Glasp Web Highlights.base", "new");
		const { plugin } = makePlugin(
			{ ...v040Data, basesFolder: "Clippings" },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(
			vault.files.get("Clippings/Glasp Web Highlights.base")?.content,
		).toBe("new");
		expect(
			vault.files.get("Glasp Bases/Glasp Web Highlights.base")?.content,
		).toBe("old");
	});

	test("moving the Bases folder in Obsidian takes the setting with it", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		vault.moveFolder("Glasp Bases", "Clippings/Glasp Bases");
		await settle();
		expect(plugin.store.get().basesFolder).toBe("Clippings/Glasp Bases");
		await plugin.importHighlights();
		expect(basePaths(vault)).toEqual([
			"Clippings/Glasp Bases/Glasp Summaries.base",
			"Clippings/Glasp Bases/Glasp Web Highlights.base",
		]);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("renaming a folder above the Bases folder takes the setting with it", async () => {
		const vault = new FakeVault(["Glasp", "Notes", "Notes/Views"]);
		const { plugin } = makePlugin(
			{ ...v040Data, basesFolder: "Notes/Views" },
			vault,
		);
		await plugin.onload();
		vault.moveFolder("Notes", "Reading");
		await settle();
		expect(plugin.store.get().basesFolder).toBe("Reading/Views");
	});

	test("a move into a hidden folder, or of another folder, changes nothing", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Other"]);
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		vault.moveFolder("Other", "Elsewhere");
		vault.moveFolder("Glasp Bases", ".trash/Glasp Bases");
		await settle();
		expect(plugin.store.get().basesFolder).toBeUndefined();
		expect(plugin.saves).toEqual([]);
	});

	test("after an update, views the user had moved together into one folder make it the Bases folder", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Clippings", "Clippings/Views"]);
		vault.seed("Clippings/Views/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(plugin.store.get().basesFolder).toBe("Clippings/Views");
		expect(basePaths(vault)).toEqual([
			"Clippings/Views/Glasp Summaries.base",
			"Clippings/Views/Glasp Web Highlights.base",
		]);
		expect(vault.folders.has("Glasp Bases")).toBe(false);
	});

	test("no folder is taken over when the views are in different folders, or one is also in Glasp Bases, or a folder was chosen", async () => {
		emptyApi();
		const cases: [Record<string, unknown>, string[], string[]][] = [
			[
				{},
				["A", "B"],
				["A/Glasp Web Highlights.base", "B/Glasp Summaries.base"],
			],
			[
				{},
				["A", "Glasp Bases"],
				["A/Glasp Web Highlights.base", "Glasp Bases/Glasp Summaries.base"],
			],
			[
				{},
				["A", "B"],
				["A/Glasp Web Highlights.base", "B/Glasp Web Highlights.base"],
			],
			[
				{ basesFolder: "Chosen" },
				["A", "Chosen"],
				["A/Glasp Web Highlights.base"],
			],
			// Moved to the top of the vault, which cannot be the Bases folder.
			[{}, [], ["Glasp Web Highlights.base"]],
			// Never moved: the views are in Glasp Bases, and nothing is saved.
			[
				{},
				["Glasp Bases"],
				[
					"Glasp Bases/Glasp Web Highlights.base",
					"Glasp Bases/Glasp Summaries.base",
				],
			],
		];
		for (const [extra, folders, files] of cases) {
			const vault = new FakeVault(["Glasp", ...folders]);
			for (const f of files) vault.seed(f, "view");
			const { plugin } = makePlugin(
				{
					...v040Data,
					summaryFolder: "Glasp",
					basesCreated: {
						"Glasp Web Highlights.base": "Glasp",
						"Glasp Summaries.base": "Glasp",
					},
					...extra,
				},
				vault,
			);
			await plugin.onload();
			await plugin.importHighlights();
			expect(plugin.store.get().basesFolder).toBe(
				(extra.basesFolder as string | undefined) ?? undefined,
			);
		}
	});

	test("a folder chosen in the settings wins over a move of the old folder made right after", async () => {
		const vault = new FakeVault([
			"Glasp",
			"Glasp Bases",
			"Clippings",
			"Archive",
		]);
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		const choosing = plugin.setBasesFolder("Clippings");
		vault.moveFolder("Glasp Bases", "Archive/Glasp Bases");
		await choosing;
		await settle();
		expect(plugin.store.get().basesFolder).toBe("Clippings");
		expect(plugin.currentBasesFolder()).toBe("Clippings");
	});

	test("a folder moved while data.json cannot be read, or has not arrived yet, writes nothing", async () => {
		for (const stored of [undefined, null]) {
			const vault = new FakeVault(["Glasp", "Glasp Bases", "Notes"]);
			if (stored === undefined) {
				vault.seed(
					".obsidian/plugins/glasp/data.json",
					"<<<<<<< a sync conflict",
				);
			}
			const { plugin } = makePlugin(stored, vault);
			await plugin.onload();
			vault.moveFolder("Glasp Bases", "Notes/Glasp Bases");
			await settle();
			expect(plugin.saves).toEqual([]);
		}
	});

	test("renamed twice in a row, the setting ends at the last name", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases"]);
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		vault.moveFolder("Glasp Bases", "Views");
		vault.moveFolder("Views", "Glasp Views");
		await settle();
		expect(plugin.store.get().basesFolder).toBe("Glasp Views");
		expect(plugin.currentBasesFolder()).toBe("Glasp Views");
	});

	test("a change from another device arriving while a folder is saved: the folder in use is the one saved", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Clippings", "Other"]);
		vault.seed("Glasp Bases/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(v040Data, vault);
		await plugin.onload();
		const choosing = plugin.setBasesFolder("Clippings");
		// data.json arrives from another device a moment before this device's save.
		plugin.stored = { ...v040Data, basesFolder: "Other" };
		const external = plugin.onExternalSettingsChange();
		await Promise.all([choosing, external]);
		await settle();
		expect(plugin.currentBasesFolder()).toBe(
			plugin.store.get().basesFolder ?? "Glasp Bases",
		);
	});

	test("one view left in another folder, the rest deleted, does not make it the Bases folder", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Templates"]);
		vault.seed("Templates/Glasp Web Highlights.base", "a copy");
		const { plugin } = makePlugin(
			{
				...v040Data,
				summaryFolder: "Glasp",
				basesCreated: {
					"Glasp Web Highlights.base": "Glasp",
					"Glasp Summaries.base": "Glasp",
				},
			},
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(plugin.store.get().basesFolder).toBeUndefined();
	});

	test("a Bases folder saved with other letter case writes into the folder that exists", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Views"]);
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp", basesFolder: "views" },
			vault,
		);
		await plugin.onload();
		await plugin.importHighlights();
		expect(vault.files.has("Views/Glasp Summaries.base")).toBe(true);
		expect(vault.folders.has("views")).toBe(false);
	});

	test("data.json arriving from a sync service is not overwritten by a folder moved before the plugin has read it", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Notes"]);
		const { plugin } = makePlugin(null, vault);
		await plugin.onload();
		// The file arrives; Obsidian has not told the plugin yet.
		plugin.stored = { ...v040Data, accessToken: "REAL" };
		vault.moveFolder("Glasp Bases", "Views");
		await settle();
		expect(plugin.saves).toEqual([]);
		// Once read, a move of the Bases folder is followed and nothing else changes.
		await plugin.onExternalSettingsChange();
		vault.folders.add("Glasp Bases");
		vault.moveFolder("Glasp Bases", "Notes/Views");
		await settle();
		expect(plugin.saves.at(-1)).toMatchObject({
			accessToken: "REAL",
			basesFolder: "Notes/Views",
		});
	});

	test("while data.json cannot be read, a sync does not take over a folder", async () => {
		emptyApi();
		const vault = new FakeVault(["Glasp", "Clippings", "Clippings/Views"]);
		vault.seed("Clippings/Views/Glasp Web Highlights.base", "view");
		const { plugin } = makePlugin(
			{ ...v040Data, summaryFolder: "Glasp" },
			vault,
		);
		await plugin.onload();
		plugin.stored = undefined;
		vault.seed(".obsidian/plugins/glasp/data.json", "<<<<<<< a sync conflict");
		await plugin.onExternalSettingsChange();
		await plugin.importHighlights();
		expect(plugin.store.get().basesFolder).toBeUndefined();
		expect(
			plugin.saves.some((saved) => "basesFolder" in (saved as object)),
		).toBe(false);
	});

	test("on a new device, once the user has saved a setting, a moved Bases folder is followed", async () => {
		const vault = new FakeVault(["Glasp", "Glasp Bases", "Notes"]);
		const { plugin } = makePlugin(null, vault);
		await plugin.onload();
		await plugin.updateSettings({ accessToken: "NEW", folder: "Glasp" });
		vault.moveFolder("Glasp Bases", "Notes/Glasp Bases");
		await settle();
		expect(plugin.saves.at(-1)).toMatchObject({
			accessToken: "NEW",
			basesFolder: "Notes/Glasp Bases",
		});
	});
});
