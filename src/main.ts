import { Plugin, type TFile, addIcon, parseYaml } from "obsidian";
import glaspIcon from "src/assets/glasp.svg";
import { CoalescingRunner } from "./core/coalescing-runner";
import { basesCommitPatch, cursorCommitPatch } from "./core/commit-rules";
import {
	type BaseSpec,
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
import {
	type BasesSetting,
	syncBases,
} from "./core/import-highlights/bases-sync";
import type {
	LastUpdatedKey,
	SourceResult,
} from "./core/import-highlights/import-highlights";
import {
	type SyncReport,
	buildSyncReport,
} from "./core/import-highlights/sync-report";
import { useYamlParser } from "./core/import-highlights/yaml-tags";
import { StateStore } from "./core/state-store";
import {
	normalizeStorageData,
	readStorageFile,
	sameData,
} from "./core/storage-data";
import { ObsidianApp, ObsidianNotice } from "./obsidian-api";
import { SettingTab } from "./setting";
import type { StorageData, UpdateFrequency } from "./types/storage";

export default class ObsidianGlaspPlugin extends Plugin {
	private settings: SettingTab;
	private autoUpdateInterval: number | null = null;
	private obApp: ObsidianApp;
	/** The saved state; every write goes through `store.update`. */
	store: StateStore<StorageData>;
	/** The last sync's report, also when it could not be saved. */
	lastSyncReport: SyncReport | null = null;
	lastSyncReportSaved = true;
	/**
	 * Set when Obsidian unloads this instance (disable, update, quit). An
	 * update reloads the plugin in the same session, so an import still
	 * running in the old instance must stop fetching and writing, and must not
	 * save its state over the new instance's.
	 */
	private unloaded = false;
	private generations: Record<LastUpdatedKey, number> = {
		lastUpdated: 0,
		kindleLastUpdated: 0,
		summaryLastUpdated: 0,
		bookmarkLastUpdated: 0,
	};
	private basesRevision = 0;
	/**
	 * "Create Bases views" as the user last set it. Set at once on a change, so
	 * an import that starts while the change is still being saved sees it.
	 */
	private basesEnabled = true;
	/** Notes this instance created, per source, by URL (see ImportHighlights). */
	private sessionNotes = new Map<LastUpdatedKey, Map<string, TFile>>();
	/** The next pass creates notes for every item that has none. */
	private backfillRequested = false;
	private backfillRunning = false;
	private runner = new CoalescingRunner(
		() => this.importPass(),
		(error) => console.error("Glasp: import failed", error),
	);

	async onload() {
		// Tags stay bare exactly when Obsidian's own parser reads them back.
		useYamlParser(parseYaml);
		const raw = await this.loadData();
		const file = readStorageFile(raw);
		this.store = new StateStore(normalizeStorageData(file.data), (state) =>
			this.unloaded
				? Promise.reject(new Error("The plugin was unloaded."))
				: this.saveData(state),
		);
		this.lastSyncReport = this.store.get().lastSyncReport ?? null;
		this.basesEnabled = this.store.get().createBasesViews;
		this.obApp = new ObsidianApp(this.app);

		this.settings = new SettingTab({ obApp: this.obApp, glaspPlugin: this });
		this.addSettingTab(this.settings);
		if (!file.readable) {
			// Defaults are in use (no token, so nothing is imported) and the file is
			// left as it is, so the user can repair it.
			console.warn("Glasp: data.json could not be read; it was not changed");
			new ObsidianNotice(
				`The plugin's settings file (${this.manifest.dir ?? ".obsidian/plugins/glasp"}/data.json) could not be read, so nothing is imported. Fix the file (for example a conflict left by a sync tool) and reload the plugin. Until then, do not change Glasp settings: saving one replaces the file with defaults, including an empty access token and the default templates.`,
				0,
			);
		} else if (!sameData(this.store.get(), raw)) {
			// Save once only when the file needed migrating (an older version, or
			// a new field), so a device starting with an old copy does not stamp
			// it as new and push it to other devices.
			try {
				await this.store.update({});
			} catch (e) {
				console.warn("Glasp: could not save the settings", e);
			}
		}
		this.addLeftBarIcon();
		this.addCommandToPalette();
		// Wait for the layout before the first import; notes whose frontmatter
		// Obsidian has not indexed yet are read directly by the importer.
		this.app.workspace.onLayoutReady(() => {
			void this.importHighlights();
		});
		this.registerAutoUpdate();
	}

	onunload() {
		this.unloaded = true;
	}

	/**
	 * data.json was changed outside this app (e.g. by a sync service). Read in
	 * the write queue, so no write is lost in between; a file that cannot be
	 * read (half-written, or a merge conflict), is gone, or holds what we
	 * already have leaves the state as it is.
	 */
	async onExternalSettingsChange() {
		if (!this.store || this.unloaded) {
			return;
		}
		await this.store.replace(async (current) => {
			const file = readStorageFile(await this.loadData());
			if (!file.readable || !file.data) {
				return current;
			}
			const fresh = normalizeStorageData(file.data);
			return sameData(fresh, current) ? current : fresh;
		});
		const state = this.store.get();
		if (state.createBasesViews !== this.basesEnabled) {
			this.basesRevision++;
			this.basesEnabled = state.createBasesViews;
		}
		this.lastSyncReport = state.lastSyncReport ?? this.lastSyncReport;
	}

	/** Save a settings change; says so if it could not be saved. */
	async updateSettings(patch: Partial<StorageData>): Promise<void> {
		try {
			await this.store.update(patch);
		} catch (e) {
			if (this.unloaded) return;
			console.warn("Glasp: could not save the settings", e);
			new ObsidianNotice("Could not save the settings; please try again.");
		}
	}

	/**
	 * Turning on "Include full page content" resets the summary cursor so every
	 * summary is fetched again with its content. Bumping the generation at the
	 * same moment stops an import that is running from committing its cursor
	 * over the reset (the commit also checks the cursor is still what it read,
	 * which covers an import that starts while the reset is being saved).
	 */
	async setSummaryIncludeContent(value: boolean): Promise<void> {
		if (value) {
			this.generations.summaryLastUpdated++;
			await this.updateSettings({
				summaryIncludeContent: true,
				summaryLastUpdated: "",
			});
		} else {
			await this.updateSettings({ summaryIncludeContent: false });
		}
	}

	/** Any change bumps the revision at once, so a running import starts no Bases write. */
	async setCreateBasesViews(value: boolean): Promise<void> {
		this.basesRevision++;
		this.basesEnabled = value;
		await this.updateSettings({ createBasesViews: value });
		// What was saved (unchanged if the save failed).
		this.basesEnabled = this.store.get().createBasesViews;
	}

	async setUpdateFrequency(value: UpdateFrequency): Promise<void> {
		await this.updateSettings({ updateFrequency: value });
		this.registerAutoUpdate();
	}

	private registerAutoUpdate() {
		if (this.unloaded) {
			return;
		}
		if (this.autoUpdateInterval) {
			window.clearInterval(this.autoUpdateInterval);
		}
		const minutes = Number.parseInt(this.store.get().updateFrequency, 10);
		this.autoUpdateInterval = this.registerInterval(
			window.setInterval(
				() => {
					void this.importHighlights();
				},
				minutes * 60 * 1000,
			),
		);
	}

	private addLeftBarIcon() {
		addIcon("glasp", glaspIcon);
		this.addRibbonIcon("glasp", "Import Glasp highlights", () => {
			void this.importHighlights(true);
		});
	}

	private addCommandToPalette() {
		this.addCommand({
			id: "import-highlights",
			name: "Import highlights",
			callback: () => {
				void this.importHighlights(true);
			},
		});
	}

	/** Every trigger goes through here; at most one import runs at a time. */
	importHighlights(manual = false): Promise<void> {
		if (this.unloaded) {
			return Promise.resolve();
		}
		if (!this.app.workspace.layoutReady) {
			// The vault's folders and notes are not all loaded yet. Waited for
			// once: Obsidian also clears layoutReady while it switches workspaces,
			// and then calls back at once.
			return new Promise((resolve) => {
				this.app.workspace.onLayoutReady(() => {
					void this.startImport(manual).then(resolve);
				});
			});
		}
		return this.startImport(manual);
	}

	private startImport(manual: boolean): Promise<void> {
		if (this.unloaded) {
			return Promise.resolve();
		}
		if (manual && this.runner.busy) {
			new ObsidianNotice(
				"A sync is already running; another one will follow when it finishes.",
			);
		}
		return this.runner.trigger();
	}

	/**
	 * Fetch every item once and create a note for each one that has none (for
	 * example items an earlier version could not save). Existing notes and the
	 * sync position are left as they are.
	 */
	createMissingNotes(): Promise<void> {
		if (!this.store.get().accessToken) {
			new ObsidianNotice("Add your access token first.");
			return Promise.resolve();
		}
		if (this.backfillRequested || this.backfillRunning) {
			// A second full fetch would only spend the API's daily allowance.
			new ObsidianNotice("Create missing notes is already running.");
			return Promise.resolve();
		}
		this.backfillRequested = true;
		return this.importHighlights(true);
	}

	private notesCreatedFor(key: LastUpdatedKey): Map<string, TFile> {
		let notes = this.sessionNotes.get(key);
		if (!notes) {
			notes = new Map();
			this.sessionNotes.set(key, notes);
		}
		return notes;
	}

	private async importPass() {
		const atStart = this.store.get();
		if (this.unloaded || !atStart.accessToken) {
			return;
		}
		const backfill = this.backfillRequested;
		this.backfillRequested = false;
		this.backfillRunning = backfill;
		try {
			await this.importSources(atStart, backfill);
		} finally {
			this.backfillRunning = false;
		}
	}

	private async importSources(
		atStart: Readonly<StorageData>,
		backfill: boolean,
	) {
		const basesAtStart: BasesSetting = {
			enabled: this.basesEnabled,
			revision: this.basesRevision,
		};

		const importer = new ImportHighlights({
			obApp: this.obApp,
			notify: (message) => {
				if (!this.unloaded) new ObsidianNotice(message);
			},
			isCancelled: () => this.unloaded,
			sessionNotes: (key) => this.notesCreatedFor(key),
			cursors: {
				read: (key) => ({
					value: this.store.get()[key],
					generation: this.generations[key],
				}),
				// Evaluated inside the state writer, when the write runs.
				commit: (key, value, read) =>
					this.store.update((state) =>
						cursorCommitPatch(state, key, value, read, this.generations[key]),
					),
			},
		});

		// Each source is gated by its own output folder, so users can enable web
		// highlights, Kindle highlights, summaries or bookmarks independently.
		// Each source reads the settings as they are when it starts.
		const results: SourceResult[] = [];
		const live = () => this.store.get();
		if (live().folder && !this.unloaded) {
			const s = live();
			results.push(
				await importer.run(
					webHighlightSource(s.accessToken, s.folder, s.template),
					{ backfill },
				),
			);
		}
		if (live().kindleFolder && !this.unloaded) {
			const s = live();
			results.push(
				await importer.run(
					kindleHighlightSource(
						s.accessToken,
						s.kindleFolder,
						s.kindleTemplate,
					),
					{ backfill },
				),
			);
		}
		if (live().summaryFolder && !this.unloaded) {
			const s = live();
			results.push(
				await importer.run(
					summarySource(
						s.accessToken,
						s.summaryFolder,
						s.summaryTemplate,
						s.summaryIncludeContent,
						{ isCancelled: () => this.unloaded },
					),
					{ backfill, unmarkedFolders: [s.folder, s.kindleFolder] },
				),
			);
		}
		if (live().bookmarkFolder && !this.unloaded) {
			const s = live();
			results.push(
				await importer.run(
					bookmarkSource(s.accessToken, s.bookmarkFolder, s.bookmarkTemplate),
					{ backfill, unmarkedFolders: [s.folder, s.kindleFolder] },
				),
			);
		}
		if (this.unloaded) {
			return;
		}

		try {
			await this.ensureBases(atStart, basesAtStart);
		} catch (e) {
			console.warn("Glasp: could not record the Bases views", e);
		}
		await this.saveReport(results);
	}

	private async ensureBases(storageData: StorageData, captured: BasesSetting) {
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

		const liveSetting = (): BasesSetting => ({
			enabled: this.basesEnabled && !this.unloaded,
			revision: this.basesRevision,
		});
		await syncBases(specs, captured, {
			ensureFolder: (path) => this.obApp.ensureFolder(path),
			createFileIfAbsent: (path, content) =>
				this.obApp.createFileIfAbsent(path, content),
			writeFile: (path, content) => this.obApp.writeFile(path, content),
			recorded: () => this.store.get().basesCreated ?? {},
			live: liveSetting,
			commit: (records, at) =>
				this.store.update((state) =>
					basesCommitPatch(state, records, at, liveSetting()),
				),
		});
	}

	/** Keep the report in memory, save it, and say what failed. */
	private async saveReport(results: SourceResult[]) {
		const failures = results.flatMap((r) => r.failures);
		const report = buildSyncReport({
			finishedAt: new Date().toISOString(),
			sources: results.map(({ failures: _f, ...counts }) => counts),
			failures,
		});
		this.lastSyncReport = report;
		for (const failure of failures) {
			console.warn("Glasp: sync failure", failure);
		}
		// Saved only when there is something to report or an old report to
		// clear, so a sync with nothing to say writes nothing.
		const saved = this.store.get().lastSyncReport;
		if (failures.length || !saved || saved.totalFailures > 0) {
			try {
				await this.store.update({ lastSyncReport: report });
				this.lastSyncReportSaved = true;
			} catch (e) {
				this.lastSyncReportSaved = false;
				console.warn("Glasp: could not save the sync report", e);
			}
		}
		if (failures.length && !this.unloaded) {
			const where = "Settings → Glasp → Last sync errors";
			new ObsidianNotice(
				this.lastSyncReportSaved
					? `${failures.length} problem(s) in this sync. See ${where}.`
					: `${failures.length} problem(s) in this sync. See ${where} (the list could not be saved, so it is kept only until Obsidian restarts).`,
				10000,
			);
		}
	}
}
