import {
	Plugin,
	type TAbstractFile,
	type TFile,
	TFolder,
	addIcon,
	normalizePath,
	parseYaml,
} from "obsidian";
import glaspIcon from "src/assets/glasp.svg";
import { CoalescingRunner } from "./core/coalescing-runner";
import { basesCommitPatch, cursorCommitPatch } from "./core/commit-rules";
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
import {
	BASE_FILENAMES,
	resolveBasesFolder,
} from "./core/import-highlights/bases";
import {
	type BasesRun,
	type BasesSetting,
	moveBasesViews,
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
import { type StatePatch, StateStore } from "./core/state-store";
import {
	normalizeStorageData,
	readStorageFile,
	sameData,
} from "./core/storage-data";
import { ObsidianApp, ObsidianNotice } from "./obsidian-api";
import { SettingTab } from "./setting";
import type { StorageData, UpdateFrequency } from "./types/storage";

/** How long the first import waits when the plugin is loaded into a running Obsidian. */
const FIRST_IMPORT_DELAY_MS = 5 * 60 * 1000;

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
	/** "Bases folder" as the user last set it, set at once like `basesEnabled`. */
	private basesFolder = GLASP_BASES_FOLDER;
	/**
	 * The settings in memory are what data.json holds: read from it, or saved
	 * to it since. Until then (data.json unreadable, or not arrived from a sync
	 * service yet, or unreadable since) the plugin changes no setting on its own
	 * (following a moved folder, taking one over): saving would replace the
	 * file with what is in memory, the defaults included.
	 */
	private settingsFromFile = false;
	/**
	 * Everything that writes or moves Bases views (an import's Bases step, a
	 * Bases folder change, following the folder when it is moved), one after
	 * another, so a move never runs while a view is being written.
	 */
	private basesQueue: Promise<void> = Promise.resolve();
	/** Notes this instance created, per source, by URL (see ImportHighlights). */
	private sessionNotes = new Map<LastUpdatedKey, Map<string, TFile>>();
	/** The next pass creates notes for every item that has none. */
	private backfillRequested = false;
	private backfillRunning = false;
	private runner = new CoalescingRunner(
		() => this.importPass(),
		(error) => console.error("Glasp: import failed", error),
	);

	/** Where this plugin's data.json is (the vault's config folder can be renamed). */
	private settingsFilePath(): string {
		return normalizePath(
			`${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/data.json`,
		);
	}

	/**
	 * `loadData()`, except that a data.json that does not exist is reported as
	 * none: Obsidian for iOS before 1.13 reports a missing file as unreadable
	 * (undefined) when the device's language is not English.
	 */
	private async loadSettingsFile(): Promise<unknown> {
		const raw = await this.loadData();
		if (raw !== undefined) {
			return raw;
		}
		try {
			return (await this.app.vault.adapter.exists(this.settingsFilePath()))
				? undefined
				: null;
		} catch {
			// Cannot tell: treat it as unreadable, so it is not overwritten.
			return undefined;
		}
	}

	async onload() {
		// Tags stay bare exactly when Obsidian's own parser reads them back.
		useYamlParser(parseYaml);
		const raw = await this.loadSettingsFile();
		const file = readStorageFile(raw);
		this.settingsFromFile = file.readable && file.data !== null;
		this.store = new StateStore(normalizeStorageData(file.data), (state) =>
			this.unloaded
				? Promise.reject(new Error("The plugin was unloaded."))
				: this.saveData(state),
		);
		this.lastSyncReport = this.store.get().lastSyncReport ?? null;
		this.basesEnabled = this.store.get().createBasesViews;
		this.basesFolder = resolveBasesFolder(this.store.get().basesFolder);
		this.obApp = new ObsidianApp(this.app);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) =>
				this.onVaultRename(file, oldPath),
			),
		);

		this.settings = new SettingTab({ obApp: this.obApp, glaspPlugin: this });
		this.addSettingTab(this.settings);
		if (!file.readable) {
			// Defaults are in use (no token, so nothing is imported) and the file is
			// left as it is, so the user can repair it.
			console.warn("Glasp: data.json could not be read; it was not changed");
			new ObsidianNotice(
				`The plugin's settings file (${this.settingsFilePath()}) could not be read, so nothing is imported. Fix the file (for example a conflict left by a sync tool) and reload the plugin. Until then, do not change Glasp settings: saving one replaces the file with defaults, including an empty access token and the default templates.`,
				0,
			);
		} else if (raw !== null && !sameData(this.store.get(), raw)) {
			// Save once only when the file needed migrating (an older version, or
			// a new field), so a device starting with an old copy does not stamp
			// it as new and push it to other devices. A file that is not there yet
			// is not written: on a device whose copy has not arrived from a sync
			// service, the defaults would replace every device's settings.
			try {
				await this.store.update({});
			} catch (e) {
				console.warn("Glasp: could not save the settings", e);
			}
		}
		this.addLeftBarIcon();
		this.addCommandToPalette();
		if (this.app.workspace.layoutReady) {
			// Loaded into a running Obsidian (enabled, or updated in place): an
			// older version updated in place keeps importing until its run ends,
			// and two imports at once copy notes, so the first one waits.
			const timer = window.setTimeout(() => {
				void this.importHighlights();
			}, FIRST_IMPORT_DELAY_MS);
			this.register(() => window.clearTimeout(timer));
		} else {
			// Started with Obsidian: the first import waits for the layout; notes
			// whose frontmatter Obsidian has not indexed yet are read directly.
			this.app.workspace.onLayoutReady(() => {
				void this.importHighlights();
			});
		}
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
		const frequencyBefore = this.store.get().updateFrequency;
		await this.store.replace(async (current) => {
			const file = readStorageFile(await this.loadData());
			if (!file.readable || !file.data) {
				this.settingsFromFile = false;
				return current;
			}
			this.settingsFromFile = true;
			const fresh = normalizeStorageData(file.data);
			if (!("createBasesViews" in file.data)) {
				// Written by a device on 0.3.0, which drops this setting.
				fresh.createBasesViews = current.createBasesViews;
			}
			if (!("basesFolder" in file.data) && current.basesFolder !== undefined) {
				// Written by a device on 0.3.0, which drops this setting too.
				fresh.basesFolder = current.basesFolder;
			}
			return sameData(fresh, current) ? current : fresh;
		});
		const state = this.store.get();
		if (state.updateFrequency !== frequencyBefore) {
			this.registerAutoUpdate();
		}
		if (state.createBasesViews !== this.basesEnabled) {
			this.basesRevision++;
			this.basesEnabled = state.createBasesViews;
		}
		// The device that chose it moved the views; the sync service brings them.
		const basesFolder = resolveBasesFolder(state.basesFolder);
		if (basesFolder !== this.basesFolder) {
			this.basesRevision++;
			this.basesFolder = basesFolder;
		}
		this.lastSyncReport = state.lastSyncReport ?? this.lastSyncReport;
	}

	/** Save a settings change; says so if it could not be saved. */
	async updateSettings(patch: StatePatch<StorageData>): Promise<void> {
		try {
			await this.store.update(patch);
			this.settingsFromFile = true;
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
			await this.updateSettings((state) => {
				// Every summary is to be written again, with its content.
				const { summaryLastUpdated: _reset, ...others } =
					state.writtenAhead ?? {};
				const { summaryLastUpdated: _resetToo, ...othersShown } =
					state.shownAhead ?? {};
				return {
					summaryIncludeContent: true,
					summaryLastUpdated: "",
					writtenAhead: Object.keys(others).length ? others : undefined,
					shownAhead: Object.keys(othersShown).length ? othersShown : undefined,
				};
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

	/** Run `task` after every Bases write or move asked for before it. */
	private withBasesQueue(task: () => Promise<void>): Promise<void> {
		const run = this.basesQueue.then(task, task);
		this.basesQueue = run.catch(() => {});
		return run;
	}

	/**
	 * Choose the "Bases folder". The change waits for any Bases write in flight
	 * (see basesQueue) and starts from the folder last saved, so choosing
	 * several in a row leaves every view in the last one; saving it bumps the
	 * revision, so an import that started before writes nothing. Once saved,
	 * and while "Create Bases views" is on, the plugin's views in the old folder
	 * are moved to the new one (when off, existing views are left alone, as that
	 * setting says; the settings tab offers the choice only while it is on).
	 */
	setBasesFolder(value: string): Promise<void> {
		return this.withBasesQueue(() => this.changeBasesFolder(value));
	}

	private async changeBasesFolder(value: string): Promise<void> {
		if (this.unloaded) {
			return;
		}
		const saved = resolveBasesFolder(this.store.get().basesFolder);
		const from = this.obApp.resolveFolder(saved) ?? saved;
		const to = resolveBasesFolder(value);
		if (to === from) {
			return;
		}
		if (!(await this.saveBasesFolder(to))) {
			return;
		}
		if (!this.basesEnabled || this.unloaded) {
			return;
		}
		const left = await this.moveViews(from, to, "user");
		if (left.length && !this.unloaded) {
			new ObsidianNotice(
				`Could not move ${left.join(", ")} to "${to}" (a file with the same name is there, or the move failed). ${left.length === 1 ? "It is" : "They are"} still in "${from}".`,
			);
		}
	}

	/**
	 * Save `folder` as the Bases folder. The revision is bumped, so an import
	 * that started before records nothing for the old folder; if the save fails
	 * the folder that is saved stays in use. True when saved.
	 */
	private async saveBasesFolder(folder: string): Promise<boolean> {
		this.basesRevision++;
		this.basesFolder = folder;
		await this.updateSettings({ basesFolder: folder });
		// What is saved: the save may have failed, or a change from another
		// device may have arrived meanwhile.
		const saved = resolveBasesFolder(this.store.get().basesFolder);
		if (saved !== this.basesFolder) {
			this.basesRevision++;
			this.basesFolder = saved;
		}
		return saved === folder;
	}

	/**
	 * Move the plugin's views from `from` to `to`, never over a file. Every view
	 * name is tried, not only the recorded ones: a view an import wrote just
	 * before a change was not recorded, and the next sync records it where it
	 * now is without writing it again. A move the user asked for updates links
	 * as Obsidian does (and may ask about them); one the plugin makes on its own
	 * during a sync never asks. Returns the views left where they were.
	 */
	private async moveViews(
		from: string,
		to: string,
		mover: "user" | "sync",
	): Promise<string[]> {
		const state = this.store.get();
		const filenames = [
			...new Set([...BASE_FILENAMES, ...Object.keys(state.basesCreated ?? {})]),
		];
		const mayRemove = this.mayRemoveBasesFolder(from, state);
		const { left } = await moveBasesViews(filenames, from, to, {
			isFile: (path) => this.obApp.isFile(path),
			exists: (path) => this.obApp.exists(path),
			ensureFolder: (path) => this.obApp.ensureFolder(path),
			move: (source, target) =>
				mover === "user"
					? this.obApp.moveFile(source, target)
					: this.obApp.moveFileQuietly(source, target),
			isEmptyFolder: (path) => this.obApp.isEmptyFolder(path),
			trashFolder: async (path) => {
				if (mayRemove) {
					await this.obApp.trashEmptyFolder(path);
				}
			},
		});
		return left;
	}

	/**
	 * Only the plugin's own default folder is ever removed, and not when a
	 * source's notes go there or below it.
	 */
	private mayRemoveBasesFolder(
		folder: string,
		state: Readonly<StorageData>,
	): boolean {
		const outputs = [
			state.folder,
			state.kindleFolder,
			state.summaryFolder,
			state.bookmarkFolder,
		].filter(Boolean);
		return (
			folder === GLASP_BASES_FOLDER &&
			!outputs.some((out) => out === folder || out.startsWith(`${folder}/`))
		);
	}

	/**
	 * The user moved or renamed a folder in Obsidian. When it is the Bases
	 * folder or a folder above it, the setting follows it (the views moved with
	 * it), so the plugin does not create the folder again where it was. Checked
	 * in turn against what is saved then, so two renames in a row end at the
	 * last name. A move into a hidden folder is not followed. Before saving, a
	 * change to data.json that Obsidian has not passed on yet is taken in, so
	 * the save does not undo it; nothing is saved while data.json cannot be
	 * read or has not arrived (saving then would replace every setting with the
	 * defaults, see onload).
	 */
	private onVaultRename(file: TAbstractFile, oldPath: string): void {
		if (!(file instanceof TFolder) || this.unloaded) {
			return;
		}
		const newPath = file.path;
		const followed = (): string | null => {
			const saved = resolveBasesFolder(this.store.get().basesFolder);
			if (saved !== oldPath && !saved.startsWith(`${oldPath}/`)) {
				return null;
			}
			const next = newPath + saved.slice(oldPath.length);
			return next === saved ||
				next.split("/").some((part) => part.startsWith("."))
				? null
				: next;
		};
		void this.withBasesQueue(async () => {
			if (this.unloaded || followed() === null) {
				return;
			}
			await this.onExternalSettingsChange();
			const next = followed();
			if (this.unloaded || !this.settingsFromFile || next === null) {
				return;
			}
			await this.saveBasesFolder(next);
		});
	}

	/**
	 * For a vault that never chose a Bases folder: when every recorded view is
	 * found, once each, all in one folder other than Glasp Bases (the user moved
	 * that folder before this setting existed), that folder is the one to use.
	 * A view still in Glasp Bases makes two folders, so nothing is taken over.
	 */
	private findMovedBasesFolder(state: Readonly<StorageData>): string | null {
		if (state.basesFolder !== undefined) {
			return null;
		}
		const recorded = Object.keys(state.basesCreated ?? {});
		// The usual case, answered without reading the whole vault: the views
		// are still in Glasp Bases (which would make two folders anyway).
		if (
			!recorded.length ||
			recorded.some((name) =>
				this.obApp.isFile(`${GLASP_BASES_FOLDER}/${name}`),
			)
		) {
			return null;
		}
		const wanted = new Set(recorded);
		const found = new Map<string, string[]>();
		for (const file of this.obApp.getAllFiles()) {
			const at = file.path.lastIndexOf("/");
			const name = file.path.slice(at + 1);
			if (wanted.has(name)) {
				found.set(name, [
					...(found.get(name) ?? []),
					file.path.slice(0, Math.max(at, 0)),
				]);
			}
		}
		// Every recorded view, so one copy left somewhere is not taken for a move.
		if (found.size !== recorded.length) {
			return null;
		}
		const parents = new Set<string>();
		for (const folders of found.values()) {
			if (folders.length > 1) {
				return null;
			}
			parents.add(folders[0]);
		}
		if (parents.size !== 1) {
			return null;
		}
		const [folder] = parents;
		// Not the top of the vault, which cannot be the Bases folder.
		return folder && folder !== GLASP_BASES_FOLDER ? folder : null;
	}

	/** The "Bases folder" in use: the saved one, or `Glasp Bases`. */
	currentBasesFolder(): string {
		return this.basesFolder;
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
			// A second full fetch would only spend requests.
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
			// A Create missing notes asked for before the token was removed is
			// dropped, not left to make some later sync a full one.
			this.backfillRequested = false;
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
		const basesAtStart: BasesRun = {
			enabled: this.basesEnabled,
			revision: this.basesRevision,
			folder: this.basesFolder,
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
					written: this.store.get().writtenAhead?.[key] ?? {},
					shown: this.store.get().shownAhead?.[key] ?? {},
				}),
				// Evaluated inside the state writer, when the write runs.
				commit: (key, value, read, written, shown) =>
					this.store.update((state) =>
						cursorCommitPatch(
							state,
							key,
							value,
							read,
							this.generations[key],
							written,
							shown,
						),
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

	private async ensureBases(storageData: StorageData, captured: BasesRun) {
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
		const unchanged = () => {
			const live = liveSetting();
			return (
				captured.enabled && live.enabled && live.revision === captured.revision
			);
		};
		await this.withBasesQueue(async () => {
			if (!unchanged()) {
				return;
			}
			let run = captured;
			let moved = this.settingsFromFile
				? this.findMovedBasesFolder(this.store.get())
				: null;
			if (moved) {
				// As when following a folder: a change to data.json Obsidian has
				// not passed on yet is taken in first, so the save does not undo it.
				await this.onExternalSettingsChange();
				if (!unchanged() || !this.settingsFromFile) {
					return;
				}
				moved = this.findMovedBasesFolder(this.store.get());
			}
			if (moved) {
				if (!(await this.saveBasesFolder(moved))) {
					return;
				}
				// Saving bumped the revision; this run is the one that made it.
				run = { ...captured, folder: moved, revision: this.basesRevision };
			}
			// The folder as it exists, when only letter case or accent encoding
			// differ (a name synced from another device can), so it is not
			// created a second time.
			run = {
				...run,
				folder: this.obApp.resolveFolder(run.folder) ?? run.folder,
			};
			if (run.folder !== GLASP_BASES_FOLDER) {
				// Views left in Glasp Bases (a move cut short, or a device on an
				// earlier version wrote there) go where the user wants them.
				// One whose name is taken there stays (said nowhere: it would be
				// said again at every sync).
				await this.moveViews(GLASP_BASES_FOLDER, run.folder, "sync");
			}
			await this.syncBasesViews(specs, run, liveSetting);
		});
	}

	private async syncBasesViews(
		specs: BaseSpec[],
		captured: BasesRun,
		liveSetting: () => BasesSetting,
	) {
		await syncBases(specs, captured, {
			ensureFolder: (path) => this.obApp.ensureFolder(path),
			createFileIfAbsent: (path, content) =>
				this.obApp.createFileIfAbsent(path, content),
			writeFile: (path, content) => this.obApp.writeFile(path, content),
			readFile: (path) => this.obApp.readFileAt(path),
			parseYaml: (text) => parseYaml(text),
			leftAsIs: (path, previous, next) => {
				if (!this.unloaded) {
					new ObsidianNotice(
						`"${path}" was not updated: it has no filter for "${previous}" to change (it was edited, or is not a Glasp view), so it does not list the notes in "${next}".`,
					);
				}
			},
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
