import {
	type App,
	type CachedMetadata,
	type TFile,
	type TFolder,
	type Vault,
	parseYaml,
} from "obsidian";
import { pathKey } from "src/core/import-highlights/note-paths";
import { renderTemplate } from "src/core/import-highlights/template-engine";

const sha256 = async (text: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
};

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

	/**
	 * A note's frontmatter read from the file itself, for a note Obsidian has
	 * no frontmatter for (not indexed yet, or not parseable). When the YAML
	 * cannot be parsed, the plugin's own one-line `URL:` and `Glasp:` keys are
	 * still read, so the note is matched instead of duplicated. Null when the
	 * file has no frontmatter.
	 */
	async readFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
		let block: string;
		try {
			const text = await this.getVault().cachedRead(file);
			const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
			if (!match) return null;
			block = match[1];
		} catch (_e) {
			return null;
		}
		try {
			const parsed: unknown = parseYaml(block);
			if (parsed && typeof parsed === "object") {
				return parsed as Record<string, unknown>;
			}
		} catch (_e) {
			// Fall through to the line-by-line read.
		}
		const keys: Record<string, unknown> = {};
		for (const line of block.split(/\r?\n/)) {
			const match = /^(URL|Glasp): (.*)$/.exec(line);
			if (!match) continue;
			const raw = match[2].trim();
			try {
				keys[match[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
			} catch (_e) {
				keys[match[1]] = raw;
			}
		}
		return Object.keys(keys).length ? keys : null;
	}

	exists(path: string): boolean {
		return this.getVault().getAbstractFileByPath(path) !== null;
	}

	/** True when `path` is an existing folder (not a file, not missing). */
	isFolder(path: string): boolean {
		return !!path && this.getVault().getFolderByPath(path) !== null;
	}

	/**
	 * The existing folder `path` names, matched exactly or else ignoring letter
	 * case and accent encoding (a name synced from another device can differ
	 * that way), or null when there is none.
	 */
	resolveFolder(path: string): string | null {
		if (this.isFolder(path)) {
			return path;
		}
		const key = pathKey(path);
		const match = this.getAllFolders().find(
			(folder) => pathKey(folder.path) === key,
		);
		return match ? match.path : null;
	}

	/**
	 * A predicate answering whether a new note may not use a path: an exact
	 * match in the vault now, or a match by `pathKey` (letter case, accent
	 * composition) with any file or folder that existed when it was made.
	 */
	pathTakenChecker(): (path: string) => boolean {
		const vault = this.getVault();
		const known = new Set<string>();
		for (const file of vault.getAllLoadedFiles()) {
			known.add(pathKey(file.path));
		}
		return (path) =>
			known.has(pathKey(path)) || vault.getAbstractFileByPath(path) !== null;
	}

	render(template: string, data: unknown): string {
		return renderTemplate(template, data);
	}

	/** Create a note at exactly `path` (rejects if it exists). */
	async createFileAt(path: string, content: string): Promise<TFile> {
		return this.getVault().create(path, content);
	}

	/**
	 * Write `content` to an existing note unless it already holds exactly these
	 * bytes, so a sync that fetches an unchanged item again leaves the note (and
	 * its modification time) alone. Resolves true when the note was written.
	 * If the note cannot be read, it is written as in 0.3.0. When it is written,
	 * the source, path and SHA-256 of the old and new content (never the text)
	 * go to the developer console, to tell unstable rendering from real changes.
	 */
	async updateFile(
		file: TFile,
		content: string,
		source: string,
	): Promise<boolean> {
		const vault = this.getVault();
		let current: string | undefined;
		try {
			current = await vault.read(file);
		} catch (_e) {
			current = undefined;
			// Do not bring back a note deleted while the sync ran.
			if (!this.exists(file.path)) {
				throw new Error("The note was deleted during the sync.");
			}
		}
		if (current === content) {
			return false;
		}
		await vault.modify(file, content);
		if (current !== undefined) {
			try {
				const [before, after] = await Promise.all([
					sha256(current),
					sha256(content),
				]);
				console.debug(
					`Glasp: rewrote a ${source} note`,
					file.path,
					before,
					after,
				);
			} catch (_e) {
				// Diagnostics only; never fails the write.
			}
		}
		return true;
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

	private getApp(): App {
		return this.app;
	}

	private getVault(): Vault {
		return this.getApp().vault;
	}
}
