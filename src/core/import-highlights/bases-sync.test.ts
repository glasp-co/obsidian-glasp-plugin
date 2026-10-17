import { describe, expect, test } from "vitest";
import {
	GLASP_BASES_FOLDER,
	bookmarkBase,
	summaryBase,
	webHighlightBase,
} from "./bases";
import { type BasesSetting, type BasesSyncDeps, syncBases } from "./bases-sync";

/** A vault holding only the Bases folder and files, plus the settings. */
const setup = (opts: {
	recorded?: Record<string, string>;
	files?: string[];
	setting?: BasesSetting;
}) => {
	const paths = new Set<string>(opts.files ?? []);
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
		writeFile: async (path) => {
			paths.add(path);
			writes.push(`write ${path}`);
		},
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
const on: BasesSetting = { enabled: true, revision: 0 };

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
		await syncBases(specs, { enabled: false, revision: 0 }, v.deps);
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
			files: [
				GLASP_BASES_FOLDER,
				`${GLASP_BASES_FOLDER}/Glasp Web Highlights.base`,
			],
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
