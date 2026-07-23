import { Plugin, addIcon } from "obsidian";
import glaspIcon from "src/assets/glasp.svg";
import {
	type BaseSpec,
	GLASP_BASES_FOLDER,
	ImportHighlights,
	bookmarkBase,
	bookmarkSource,
	kindleHighlightBase,
	kindleHighlightSource,
	summaryBase,
	summarySource,
	webHighlightBase,
	webHighlightSource,
} from "./core/import-highlights";
import { ObsidianApp, ObsidianPlugin } from "./obsidian-api";
import { SettingTab } from "./setting";
import type { StorageData } from "./types/storage";

export default class ObsidianGlaspPlugin extends Plugin {
	private settings: SettingTab;
	private autoUpdateInterval: number | null = null;
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;

	async onload() {
		const storageData = await this.getStorageData();
		this.obApp = new ObsidianApp(this.app);
		this.obPlugin = new ObsidianPlugin(this);

		this.settings = new SettingTab({
			obApp: this.obApp,
			obPlugin: this.obPlugin,
			glaspPlugin: this,
			storageData,
		});
		this.addSettingTab(this.settings);
		// Persist the (possibly migrated) settings once, awaited, before the first
		// import so its data.json write cannot race the import's cursor writes.
		await this.obPlugin.saveData(this.settings.value);
		this.addLeftBarIcon();
		this.addCommandToPalette();
		// Wait for the metadata cache to be populated before the first import, so
		// de-duplication (which reads note frontmatter) never runs against a cold
		// cache and mistakes existing notes for new ones (creating duplicates).
		this.app.workspace.onLayoutReady(() => {
			this.importHighlights();
		});
		this.registerAutoUpdate();

		this.updateFrequencyChangedListener();
	}

	onunload() {}

	private async registerAutoUpdate() {
		const updateFrequency = (await this.getStorageData()).updateFrequency;
		if (this.autoUpdateInterval) {
			window.clearInterval(this.autoUpdateInterval);
		}

		const interval = Number.parseInt(updateFrequency);
		this.autoUpdateInterval = this.registerInterval(
			window.setInterval(
				() => {
					this.importHighlights();
				},
				interval * 60 * 1000,
			),
		);
	}

	private updateFrequencyChangedListener() {
		this.obApp.listenEvent("glasp-plugin:update-frequency-changed", () => {
			this.registerAutoUpdate();
		});
	}

	private addLeftBarIcon() {
		addIcon("glasp", glaspIcon);
		this.addRibbonIcon("glasp", "Import Glasp highlights", () => {
			this.importHighlights();
		});
	}

	private addCommandToPalette() {
		this.addCommand({
			id: "import-highlights",
			name: "Import highlights",
			callback: () => {
				this.importHighlights();
			},
		});
	}

	private async importHighlights() {
		const storageData = await this.getStorageData();

		if (!storageData.accessToken) {
			return;
		}

		const importer = new ImportHighlights({
			obApp: this.obApp,
			obPlugin: this.obPlugin,
			storageData,
		});

		// Each source is gated by its own output folder, so users can enable web
		// highlights, Kindle highlights, summaries or bookmarks independently.
		if (storageData.folder) {
			await importer.run(
				webHighlightSource(
					storageData.accessToken,
					storageData.folder,
					storageData.template,
				),
			);
		}

		if (storageData.kindleFolder) {
			await importer.run(
				kindleHighlightSource(
					storageData.accessToken,
					storageData.kindleFolder,
					storageData.kindleTemplate,
				),
			);
		}

		if (storageData.summaryFolder) {
			await importer.run(
				summarySource(
					storageData.accessToken,
					storageData.summaryFolder,
					storageData.summaryTemplate,
					storageData.summaryIncludeContent,
				),
			);
		}

		if (storageData.bookmarkFolder) {
			await importer.run(
				bookmarkSource(
					storageData.accessToken,
					storageData.bookmarkFolder,
					storageData.bookmarkTemplate,
				),
			);
		}

		await this.ensureBases(storageData);
	}

	/**
	 * Create one `.base` database view per enabled source, all collected in the
	 * `Glasp Bases` folder (kept separate from the imported notes so the views
	 * are easy to find). A view is created once (and not resurrected after the
	 * user deletes it), but is rewritten if its source folder setting changed so
	 * its filter never points at a stale folder.
	 */
	private async ensureBases(storageData: StorageData) {
		const specs: BaseSpec[] = [];
		if (storageData.folder) {
			specs.push(webHighlightBase(storageData.folder));
		}
		if (storageData.kindleFolder) {
			specs.push(kindleHighlightBase(storageData.kindleFolder));
		}
		if (storageData.summaryFolder) {
			specs.push(summaryBase(storageData.summaryFolder));
		}
		if (storageData.bookmarkFolder) {
			specs.push(bookmarkBase(storageData.bookmarkFolder));
		}
		if (!specs.length) {
			return;
		}

		try {
			await this.obApp.ensureFolder(GLASP_BASES_FOLDER);
		} catch (_e) {
			// Can't create the folder; skip (non-fatal — notes still import).
			return;
		}

		const created: Record<string, string> = {
			...(storageData.basesCreated ?? {}),
		};
		let changed = false;
		for (const spec of specs) {
			const recordedFolder = created[spec.filename];
			if (recordedFolder === spec.folder) {
				continue; // already up to date
			}
			const path = `${GLASP_BASES_FOLDER}/${spec.filename}`;
			try {
				if (recordedFolder === undefined) {
					// First time: don't clobber a pre-existing (possibly user-edited) file.
					await this.obApp.createFileIfAbsent(path, spec.content);
				} else {
					// Folder setting changed: rewrite so the filter points at it.
					await this.obApp.writeFile(path, spec.content);
				}
				created[spec.filename] = spec.folder;
				changed = true;
			} catch (_e) {
				// Non-fatal: the notes still import without this database view.
			}
		}
		if (changed) {
			storageData.basesCreated = created;
			await this.obPlugin.saveData(storageData);
		}
	}

	async getStorageData() {
		return this.loadData() as Promise<StorageData>;
	}
}
