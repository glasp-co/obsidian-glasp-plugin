import { afterEach, describe, expect, test, vi } from "vitest";
import { FakeVault } from "../test/fake-vault";
import { shownNotices } from "../test/obsidian-stub";
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

// Obsidian runs in a window; the automatic sync's timer is not exercised here.
vi.stubGlobal("window", { setInterval: () => 1, clearInterval: () => {} });

afterEach(() => {
	vi.restoreAllMocks();
	shownNotices.length = 0;
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
		const { plugin } = makePlugin(undefined);
		const get = vi.spyOn(GlaspAPIClient.prototype, "get");
		await plugin.onload();
		await plugin.importHighlights();
		expect(plugin.saves).toEqual([]);
		expect(get).not.toHaveBeenCalled();
		expect(shownNotices.join("\n")).toMatch(/could not be read/);
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

	test("an unknown update frequency falls back to daily", async () => {
		const { plugin } = makePlugin({ ...v040Data, updateFrequency: "5" });
		await plugin.onload();
		expect(plugin.store.get().updateFrequency).toBe("1440");
	});
});
