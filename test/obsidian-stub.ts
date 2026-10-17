// Stand-in for the "obsidian" module in unit tests. The real package ships
// only type declarations; Obsidian provides the module at runtime.
export class Notice {
	constructor(
		public message: string,
		public duration?: number,
	) {
		shownNotices.push(message);
	}
}

export const requestUrl = async (): Promise<never> => {
	throw new Error("requestUrl is not available in unit tests");
};

/** Enough of YAML for the tests' frontmatter: `Key: value` lines, JSON-quoted values decoded. */
export const parseYaml = (text: string): Record<string, unknown> => {
	const out: Record<string, unknown> = {};
	for (const line of text.split("\n")) {
		const at = line.indexOf(": ");
		if (at < 0) continue;
		const raw = line.slice(at + 2);
		try {
			out[line.slice(0, at)] = raw.startsWith('"') ? JSON.parse(raw) : raw;
		} catch {
			out[line.slice(0, at)] = raw;
		}
	}
	return out;
};

/** Notices shown, for tests to read. */
export const shownNotices: string[] = [];

type Manifest = { id: string; dir?: string; version?: string };

/** The parts of Obsidian's Plugin the plugin uses; data.json lives in memory. */
export class Plugin {
	app: unknown;
	manifest: Manifest;
	/** data.json's content as Obsidian's loadData returns it (undefined = unreadable). */
	stored: unknown = null;
	saves: unknown[] = [];
	intervals: number[] = [];
	constructor(app: unknown, manifest: Manifest) {
		this.app = app;
		this.manifest = manifest;
	}
	async loadData(): Promise<unknown> {
		return this.stored === undefined
			? undefined
			: JSON.parse(JSON.stringify(this.stored));
	}
	async saveData(data: unknown): Promise<void> {
		this.saves.push(JSON.parse(JSON.stringify(data)));
		this.stored = JSON.parse(JSON.stringify(data));
	}
	addSettingTab(_tab: unknown): void {}
	addRibbonIcon(): void {}
	addCommand(): void {}
	registerInterval(id: number): number {
		this.intervals.push(id);
		return id;
	}
}

export class PluginSettingTab {
	app: unknown;
	plugin: unknown;
	containerEl = { empty() {} };
	constructor(app: unknown, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class Setting {}

export const addIcon = (): void => {};
