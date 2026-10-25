import { describe, expect, test } from "vitest";
import {
	GLASP_BASES_FOLDER,
	bookmarkBase,
	summaryBase,
	webHighlightBase,
} from "./bases";
import {
	type BasesMoveDeps,
	type BasesRun,
	type BasesSetting,
	type BasesSyncDeps,
	moveBasesViews,
	syncBases,
} from "./bases-sync";

/** A vault holding only the Bases folder and files, plus the settings. */
const setup = (opts: {
	recorded?: Record<string, string>;
	files?: string[];
	/** File contents; a file listed in `files` without one reads as "". */
	contents?: Record<string, string>;
	setting?: BasesSetting;
}) => {
	const paths = new Set<string>([
		...(opts.files ?? []),
		...Object.keys(opts.contents ?? {}),
	]);
	const contents = new Map(Object.entries(opts.contents ?? {}));
	const writes: string[] = [];
	let recorded = { ...(opts.recorded ?? {}) };
	let live: BasesSetting = opts.setting ?? { enabled: true, revision: 0 };
	const hooks: { beforeCreate?: () => void; beforeCommit?: () => void } = {};
	const deps: BasesSyncDeps = {
		ensureFolder: async (path) => {
			if (!paths.has(path)) {
				paths.add(path);
				writes.push(`mkdir ${path}`);
			}
		},
		createFileIfAbsent: async (path) => {
			hooks.beforeCreate?.();
			if (paths.has(path)) return false;
			paths.add(path);
			writes.push(`create ${path}`);
			return true;
		},
		writeFile: async (path, content) => {
			paths.add(path);
			contents.set(path, content);
			writes.push(`write ${path}`);
		},
		readFile: async (path) =>
			paths.has(path) ? (contents.get(path) ?? "") : null,
		leftAsIs: (path, folder) => {
			writes.push(`left ${path} (${folder})`);
		},
		// Enough of YAML for these one-line items: each line, a list item's
		// quoted scalar read as its string.
		parseYaml: (text) =>
			text.split("\n").map((line) => {
				const item = /^\s*-\s+'(.*)'$/.exec(line);
				return item ? item[1].replace(/''/g, "'") : line;
			}),
		recorded: () => recorded,
		live: () => live,
		commit: async (records, captured) => {
			hooks.beforeCommit?.();
			// As the plugin does it: inside the writer, only if still allowed.
			if (
				!(
					live.enabled &&
					captured.enabled &&
					live.revision === captured.revision
				)
			) {
				return false;
			}
			recorded = { ...recorded, ...records };
			return true;
		},
	};
	return {
		deps,
		paths,
		writes,
		hooks,
		recorded: () => recorded,
		turnOff: () => {
			live = { enabled: false, revision: live.revision + 1 };
		},
	};
};

const specs = [webHighlightBase("Glasp"), summaryBase("Summaries")];
const on: BasesRun = { enabled: true, revision: 0, folder: GLASP_BASES_FOLDER };

describe("syncBases", () => {
	test("first run creates the folder and every view, and records them", async () => {
		const v = setup({});
		await syncBases(specs, on, v.deps);
		expect(v.writes).toEqual([
			`mkdir ${GLASP_BASES_FOLDER}`,
			`create ${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`,
			`create ${GLASP_BASES_FOLDER}/Glasp Summaries.base`,
		]);
		expect(v.recorded()).toEqual({
			"Glasp Web Highlights.base": "Glasp",
			"Glasp Summaries.base": "Summaries",
		});
	});

	test("a deleted Glasp Bases folder is not recreated when every view is recorded", async () => {
		const v = setup({
			recorded: {
				"Glasp Web Highlights.base": "Glasp",
				"Glasp Summaries.base": "Summaries",
			},
		});
		await syncBases(specs, on, v.deps);
		expect(v.writes).toEqual([]);
		expect(v.paths.has(GLASP_BASES_FOLDER)).toBe(false);
	});

	test("with the setting off, nothing is created", async () => {
		const v = setup({ setting: { enabled: false, revision: 0 } });
		await syncBases(specs, { ...on, enabled: false }, v.deps);
		expect(v.writes).toEqual([]);
		expect(v.recorded()).toEqual({});
	});

	test("turned off before the run reaches the Bases: nothing is created", async () => {
		const v = setup({});
		v.turnOff();
		await syncBases(specs, on, v.deps);
		expect(v.writes).toEqual([]);
		expect(v.recorded()).toEqual({});
	});

	test("turned off during a pending write: no further write, no record", async () => {
		const v = setup({});
		let first = true;
		v.hooks.beforeCreate = () => {
			if (first) {
				first = false;
				v.turnOff(); // while the first create is in flight
			}
		};
		await syncBases(specs, on, v.deps);
		// The write already in flight finished; the second never started.
		expect(v.writes).toEqual([
			`mkdir ${GLASP_BASES_FOLDER}`,
			`create ${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`,
		]);
		expect(v.recorded()).toEqual({});
	});

	test("turned off just before the record is committed: no record", async () => {
		const v = setup({});
		v.hooks.beforeCommit = () => v.turnOff();
		await syncBases(specs, on, v.deps);
		expect(v.recorded()).toEqual({});
	});

	test("with the setting on, a source folder change rewrites that view as in 0.3.0", async () => {
		const v = setup({
			recorded: {
				"Glasp Web Highlights.base": "Old",
				"Glasp Summaries.base": "Summaries",
			},
			files: [GLASP_BASES_FOLDER],
			contents: {
				[`${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`]:
					webHighlightBase("Old").content,
			},
		});
		await syncBases(specs, on, v.deps);
		expect(v.writes).toEqual([
			`write ${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`,
		]);
		expect(v.recorded()["Glasp Web Highlights.base"]).toBe("Glasp");
	});

	test("a view the user deleted is not recreated (recorded, same folder)", async () => {
		const v = setup({
			recorded: { "Glasp Bookmarks.base": "Bookmarks" },
			files: [GLASP_BASES_FOLDER],
		});
		await syncBases([bookmarkBase("Bookmarks")], on, v.deps);
		expect(v.writes).toEqual([]);
	});
});

describe("syncBases with a chosen Bases folder", () => {
	test("views are created in the folder the run started with", async () => {
		const v = setup({});
		await syncBases(specs, { ...on, folder: "Clippings/Views" }, v.deps);
		expect(v.writes).toEqual([
			"mkdir Clippings/Views",
			"create Clippings/Views/Glasp Web Highlights.base",
			"create Clippings/Views/Glasp Summaries.base",
		]);
		expect(v.paths.has(GLASP_BASES_FOLDER)).toBe(false);
	});

	test("a source folder change rewrites the view in the chosen folder, not at the top of the vault", async () => {
		const v = setup({
			recorded: {
				"Glasp Web Highlights.base": "Old",
				"Glasp Summaries.base": "Summaries",
			},
			files: ["Clippings/Views"],
			contents: {
				"Clippings/Views/Glasp Web Highlights.base":
					webHighlightBase("Old").content,
			},
		});
		await syncBases(specs, { ...on, folder: "Clippings/Views" }, v.deps);
		expect(v.writes).toEqual([
			"write Clippings/Views/Glasp Web Highlights.base",
		]);
		expect(v.paths.has(GLASP_BASES_FOLDER)).toBe(false);
	});
});

describe("a source folder change never overwrites a file the plugin did not write", () => {
	test("a view the user changed keeps their changes; only its folder filter is updated", async () => {
		const path = `${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`;
		const v = setup({
			recorded: { "Glasp Web Highlights.base": "Old" },
			files: [GLASP_BASES_FOLDER],
			contents: { [path]: `${webHighlightBase("Old").content}# my column\n` },
		});
		await syncBases([webHighlightBase("Glasp")], on, v.deps);
		expect(v.writes).toEqual([`write ${path}`]);
		expect(v.recorded()["Glasp Web Highlights.base"]).toBe("Glasp");
	});

	test("a view whose folder filter the user changed is left as it is, said so, and recorded", async () => {
		const path = `${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`;
		const v = setup({
			recorded: { "Glasp Web Highlights.base": "Old" },
			files: [GLASP_BASES_FOLDER],
			contents: { [path]: 'filters:\n  and:\n    - file.inFolder("Mine")\n' },
		});
		await syncBases([webHighlightBase("Glasp")], on, v.deps);
		expect(v.writes).toEqual([`left ${path} (Old)`]);
		expect(v.recorded()["Glasp Web Highlights.base"]).toBe("Glasp");
	});

	test("a file of the user's own with the same name, in the chosen folder, is left as it is", async () => {
		const v = setup({
			recorded: { "Glasp Summaries.base": "Summaries" },
			files: ["Dashboards"],
			contents: { "Dashboards/Glasp Summaries.base": "MY OWN VIEW" },
		});
		await syncBases(
			[summaryBase("Elsewhere")],
			{ ...on, folder: "Dashboards" },
			v.deps,
		);
		expect(v.writes).toEqual([
			"left Dashboards/Glasp Summaries.base (Summaries)",
		]);
	});

	test("a recorded view that was deleted is written again on a source folder change", async () => {
		const v = setup({
			recorded: { "Glasp Summaries.base": "Summaries" },
			files: [GLASP_BASES_FOLDER],
		});
		await syncBases([summaryBase("Elsewhere")], on, v.deps);
		expect(v.writes).toEqual([
			`create ${GLASP_BASES_FOLDER}/Glasp Summaries.base`,
		]);
	});
});

/** A vault for moveBasesViews: paths of files and folders, and what was done. */
const moveSetup = (files: string[], folders: string[]) => {
	const fileSet = new Set(files);
	const folderSet = new Set(folders);
	const done: string[] = [];
	const failMove = new Set<string>();
	const deps: BasesMoveDeps = {
		isFile: (path) => fileSet.has(path),
		exists: (path) => fileSet.has(path) || folderSet.has(path),
		ensureFolder: async (path) => {
			if (!folderSet.has(path)) {
				folderSet.add(path);
				done.push(`mkdir ${path}`);
			}
		},
		move: async (from, to) => {
			if (failMove.has(from)) throw new Error("EBUSY");
			// As Obsidian: a move into a folder that is not there fails.
			if (!folderSet.has(to.slice(0, to.lastIndexOf("/")))) {
				throw new Error("ENOENT");
			}
			fileSet.delete(from);
			fileSet.add(to);
			done.push(`move ${from} -> ${to}`);
		},
		isEmptyFolder: (path) =>
			folderSet.has(path) &&
			![...fileSet, ...folderSet].some((p) => p.startsWith(`${path}/`)),
		trashFolder: async (path) => {
			folderSet.delete(path);
			done.push(`trash ${path}`);
		},
	};
	return { deps, done, fileSet, folderSet, failMove };
};

const WEB = "Glasp Web Highlights.base";
const SUM = "Glasp Summaries.base";

describe("moveBasesViews", () => {
	test("moves the recorded views and trashes the folder they left empty", async () => {
		const v = moveSetup(
			[`Glasp Bases/${WEB}`, `Glasp Bases/${SUM}`],
			["Glasp Bases", "Clippings"],
		);
		const result = await moveBasesViews(
			[WEB, SUM],
			"Glasp Bases",
			"Clippings",
			v.deps,
		);
		expect(v.done).toEqual([
			`move Glasp Bases/${WEB} -> Clippings/${WEB}`,
			`move Glasp Bases/${SUM} -> Clippings/${SUM}`,
			"trash Glasp Bases",
		]);
		expect(result).toEqual({ moved: [WEB, SUM], left: [] });
	});

	test("never overwrites a file at the destination, and keeps the old folder", async () => {
		const v = moveSetup(
			[`Glasp Bases/${WEB}`, `Glasp Bases/${SUM}`, `Clippings/${WEB}`],
			["Glasp Bases", "Clippings"],
		);
		const result = await moveBasesViews(
			[WEB, SUM],
			"Glasp Bases",
			"Clippings",
			v.deps,
		);
		expect(v.done).toEqual([`move Glasp Bases/${SUM} -> Clippings/${SUM}`]);
		expect(v.fileSet.has(`Glasp Bases/${WEB}`)).toBe(true);
		expect(result).toEqual({ moved: [SUM], left: [WEB] });
	});

	test("a view the user deleted or moved away is skipped", async () => {
		const v = moveSetup([`Glasp Bases/${SUM}`], ["Glasp Bases", "Clippings"]);
		await moveBasesViews([WEB, SUM], "Glasp Bases", "Clippings", v.deps);
		expect(v.done).toEqual([
			`move Glasp Bases/${SUM} -> Clippings/${SUM}`,
			"trash Glasp Bases",
		]);
	});

	test("a file the plugin did not record stays, and so does its folder", async () => {
		const v = moveSetup(
			[`Glasp Bases/${WEB}`, "Glasp Bases/My own.base"],
			["Glasp Bases", "Clippings"],
		);
		await moveBasesViews([WEB], "Glasp Bases", "Clippings", v.deps);
		expect(v.done).toEqual([`move Glasp Bases/${WEB} -> Clippings/${WEB}`]);
		expect(v.folderSet.has("Glasp Bases")).toBe(true);
	});

	test("when nothing is moved, an empty old folder is left alone", async () => {
		const v = moveSetup([], ["Glasp Bases", "Clippings"]);
		await moveBasesViews([WEB], "Glasp Bases", "Clippings", v.deps);
		expect(v.done).toEqual([]);
		expect(v.folderSet.has("Glasp Bases")).toBe(true);
	});

	test("a missing destination is created first", async () => {
		const v = moveSetup([`Glasp Bases/${WEB}`], ["Glasp Bases"]);
		await moveBasesViews([WEB], "Glasp Bases", "Notes/Views", v.deps);
		expect(v.done).toEqual([
			"mkdir Notes/Views",
			`move Glasp Bases/${WEB} -> Notes/Views/${WEB}`,
			"trash Glasp Bases",
		]);
	});

	test("into a folder inside the old one: the old folder is kept", async () => {
		const v = moveSetup([`Glasp Bases/${WEB}`], ["Glasp Bases"]);
		await moveBasesViews([WEB], "Glasp Bases", "Glasp Bases/Views", v.deps);
		expect(v.done).toEqual([
			"mkdir Glasp Bases/Views",
			`move Glasp Bases/${WEB} -> Glasp Bases/Views/${WEB}`,
		]);
		expect(v.folderSet.has("Glasp Bases")).toBe(true);
	});

	test("a move that fails leaves that view where it was and moves the rest", async () => {
		const v = moveSetup(
			[`Glasp Bases/${WEB}`, `Glasp Bases/${SUM}`],
			["Glasp Bases", "Clippings"],
		);
		v.failMove.add(`Glasp Bases/${WEB}`);
		const result = await moveBasesViews(
			[WEB, SUM],
			"Glasp Bases",
			"Clippings",
			v.deps,
		);
		expect(result).toEqual({ moved: [SUM], left: [WEB] });
		expect(v.folderSet.has("Glasp Bases")).toBe(true);
	});

	test("the destination renamed away mid-move is not created again; the rest stay", async () => {
		const v = moveSetup(
			[`Glasp Bases/${WEB}`, `Glasp Bases/${SUM}`],
			["Glasp Bases", "Clippings"],
		);
		const move = v.deps.move;
		v.deps.move = async (from, to) => {
			await move(from, to);
			// The user renames the destination while the first move waited.
			v.folderSet.delete("Clippings");
		};
		const result = await moveBasesViews(
			[WEB, SUM],
			"Glasp Bases",
			"Clippings",
			v.deps,
		);
		expect(result).toEqual({ moved: [WEB], left: [SUM] });
		expect(v.folderSet.has("Clippings")).toBe(false);
	});

	test("the same folder: nothing to do", async () => {
		const v = moveSetup([`Glasp Bases/${WEB}`], ["Glasp Bases"]);
		const result = await moveBasesViews(
			[WEB],
			"Glasp Bases",
			"Glasp Bases",
			v.deps,
		);
		expect(v.done).toEqual([]);
		expect(result).toEqual({ moved: [], left: [] });
	});
});
