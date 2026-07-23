import { compile } from "handlebars";
import type { App, CachedMetadata, TFile, TFolder, Vault } from "obsidian";

const LISTENER = "glasp-plugin:update-frequency-changed";

export class ObsidianApp {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	getAllFolders(): TFolder[] {
		const folders = this.getVault().getAllFolders();
		return folders;
	}

	getAllFiles(): TFile[] {
		return this.getVault().getFiles();
	}

	getFileMetadataCache(file: TFile): CachedMetadata | null {
		return this.app.metadataCache.getFileCache(file);
	}

	async createFile<T>({
		folder,
		filename,
		template,
		data,
	}: {
		folder: string;
		filename: string;
		template: string;
		data: T;
	}) {
		const templateDelegator = compile(template, { noEscape: true });
		const targetData = templateDelegator(data);

		const path = this.uniquePath(folder, this.escapeFilename(filename));

		const result = await this.getVault().create(path, targetData);
		return result;
	}

	/**
	 * Resolve a free `.md` path for a new note. If `<folder>/<name>.md` is
	 * taken by a different note (two items whose titles collapse to the same
	 * file name), append " (2)", " (3)", … so the second item is not lost to a
	 * "file already exists" error. Bounded so it always returns.
	 */
	private uniquePath(folder: string, name: string): string {
		const base = `${folder}/${name}`;
		let candidate = `${base}.md`;
		for (let n = 2; n <= 1000 && this.exists(candidate); n++) {
			candidate = `${base} (${n}).md`;
		}
		return candidate;
	}

	private exists(path: string): boolean {
		return this.getVault().getAbstractFileByPath(path) !== null;
	}

	async updateFile<T>({
		file,
		template,
		data,
	}: {
		file: TFile;
		template: string;
		data: T;
	}) {
		const templateDelegator = compile(template, { noEscape: true });
		const targetData = templateDelegator(data);

		const result = await this.getVault().modify(file, targetData);
		return result;
	}

	/** Create a folder if it does not already exist. */
	async ensureFolder(path: string): Promise<void> {
		if (!this.getVault().getAbstractFileByPath(path)) {
			await this.getVault().createFolder(path);
		}
	}

	/** Create the file, or overwrite it if it already exists. */
	async writeFile(path: string, content: string): Promise<void> {
		const existing = this.getVault().getAbstractFileByPath(path);
		if (existing) {
			await this.getVault().modify(existing as TFile, content);
		} else {
			await this.getVault().create(path, content);
		}
	}

	/**
	 * Create a file only if it does not already exist. Used for the generated
	 * `.base` views so a user's edits (or deletion) are never clobbered on the
	 * next sync. Returns true if a file was created.
	 */
	async createFileIfAbsent(path: string, content: string): Promise<boolean> {
		if (this.getVault().getAbstractFileByPath(path)) {
			return false;
		}
		await this.getVault().create(path, content);
		return true;
	}

	triggerEvent(name: typeof LISTENER) {
		this.app.workspace.trigger(name);
	}

	listenEvent<T>(name: typeof LISTENER, callback: () => T) {
		// @ts-ignore
		this.app.workspace.on(name, () => {
			callback();
		});
	}

	private getApp(): App {
		return this.app;
	}

	private getVault(): Vault {
		return this.getApp().vault;
	}

	private escapeFilename(filename: string): string {
		// Replace control characters (code point < 32, or DEL 127) with a space
		// instead of matching them with a regex literal, so no raw control byte
		// ever appears in this source file.
		const withoutControls = Array.from(filename ?? "", (ch) => {
			const code = ch.charCodeAt(0);
			return code < 32 || code === 127 ? " " : ch;
		}).join("");

		const cleaned = withoutControls
			// Path/YAML-unsafe characters (Obsidian also forbids these).
			.replace(/[[\]|:\\/#^"]/g, "")
			.replace(/\s+/g, " ")
			.trim()
			// A leading dot would create a hidden file (e.g. ".md").
			.replace(/^\.+/, "")
			.trim()
			// Cap length so a very long title (e.g. a URL used as a fallback)
			// cannot exceed the OS file-name limit.
			.slice(0, 120)
			.trim();

		// Never return an empty name (would otherwise yield "folder/.md").
		return cleaned || "Untitled";
	}
}
