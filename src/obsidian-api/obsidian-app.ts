import {
	type App,
	type CachedMetadata,
	TFile,
	TFolder,
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

/**
 * The frontmatter of a note's text. When the YAML cannot be parsed, the
 * plugin's own one-line `URL:` and `Glasp:` keys are still read, so the note is
 * matched instead of duplicated. Null when the text has no frontmatter.
 */
export const parseFrontmatterText = (
	text: string,
): Record<string, unknown> | null => {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	if (!match) return null;
	const block = match[1];
	try {
		const parsed: unknown = parseYaml(block);
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Fall through to the line-by-line read.
	}
	const keys: Record<string, unknown> = {};
	for (const line of block.split(/\r?\n/)) {
		const found = /^(URL|Glasp): (.*)$/.exec(line);
		if (!found) continue;
		const raw = found[2].trim();
		try {
			keys[found[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
		} catch {
			keys[found[1]] = raw;
		}
	}
	return Object.keys(keys).length ? keys : null;
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
	 * no frontmatter for (not indexed yet, or not parseable). Null when the file
	 * has no frontmatter or cannot be read.
	 */
	async readFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
		try {
			return parseFrontmatterText(await this.getVault().cachedRead(file));
		} catch {
			return null;
		}
	}

	/** The frontmatter of the file at `path` on disk, indexed by Obsidian or not. */
	async frontmatterAtPath(
		path: string,
	): Promise<Record<string, unknown> | null> {
		try {
			return parseFrontmatterText(await this.getVault().adapter.read(path));
		} catch {
			return null;
		}
	}

	/** The frontmatter of a note's text (see `parseFrontmatterText`). */
	frontmatterOf(text: string): Record<string, unknown> | null {
		return parseFrontmatterText(text);
	}

	/** True while `file` is still the note at its path (not deleted, not replaced). */
	isSameFile(file: TFile): boolean {
		return this.getVault().getAbstractFileByPath(file.path) === file;
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
		// Write only to the very note that was matched: since then it may have
		// been deleted, or deleted and replaced by another note at the same path.
		const stillThere = () => {
			const there = vault.getAbstractFileByPath(file.path);
			if (there !== file) {
				throw new Error(
					there
						? "Another note took this note's place during the sync; it was left alone."
						: "The note was deleted during the sync.",
				);
			}
		};
		stillThere();
		let current: string | undefined;
		try {
			current = await vault.read(file);
		} catch {
			current = undefined;
			// Do not bring back a note deleted while it was being read.
			stillThere();
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
			} catch {
				// Diagnostics only; never fails the write.
			}
		}
		return true;
	}

	/** A file (not a folder) is at this path. */
	isFile(path: string): boolean {
		return this.getVault().getAbstractFileByPath(path) instanceof TFile;
	}

	/** A folder with nothing in it is at this path. */
	isEmptyFolder(path: string): boolean {
		const folder = this.getVault().getAbstractFileByPath(path);
		return folder instanceof TFolder && folder.children.length === 0;
	}

	/** Move a file, updating links to it, as a move in Obsidian's file explorer does. */
	async moveFile(from: string, to: string): Promise<void> {
		const file = this.getVault().getAbstractFileByPath(from);
		if (!(file instanceof TFile)) {
			throw new Error(`"${from}" is not a file.`);
		}
		await this.getApp().fileManager.renameFile(file, to);
	}

	/**
	 * Move a file without updating links to it, so Obsidian never stops to ask
	 * (it asks when "Automatically update internal links" is off and a link
	 * to the file would lead elsewhere after the move, such as one written with
	 * its path). For moves the user did not start themselves.
	 */
	async moveFileQuietly(from: string, to: string): Promise<void> {
		const file = this.getVault().getAbstractFileByPath(from);
		if (!(file instanceof TFile)) {
			throw new Error(`"${from}" is not a file.`);
		}
		await this.getVault().rename(file, to);
	}

	/**
	 * Remove a folder that is empty, also on disk (Obsidian does not list
	 * dotfiles or files still arriving from a sync service), as the user's
	 * "Deleted files" setting says.
	 */
	async trashEmptyFolder(path: string): Promise<void> {
		const folder = this.getVault().getAbstractFileByPath(path);
		if (!(folder instanceof TFolder) || folder.children.length > 0) {
			return;
		}
		const onDisk = await this.getVault().adapter.list(path);
		if (onDisk.files.length || onDisk.folders.length) {
			return;
		}
		await this.getApp().fileManager.trashFile(folder);
	}

	/** A file's text, or null when there is no file at the path. */
	async readFileAt(path: string): Promise<string | null> {
		const file = this.getVault().getAbstractFileByPath(path);
		if (file === null) {
			return null;
		}
		if (!(file instanceof TFile)) {
			throw new Error(`"${path}" is a folder, not a file.`);
		}
		return this.getVault().read(file);
	}

	/** Create a folder if it does not already exist. */
	async ensureFolder(path: string): Promise<void> {
		if (!this.getVault().getAbstractFileByPath(path)) {
			await this.getVault().createFolder(path);
		}
	}

	/** Create the file, or overwrite it if it already exists (a folder there is an error). */
	async writeFile(path: string, content: string): Promise<void> {
		const existing = this.getVault().getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.getVault().modify(existing, content);
		} else if (existing) {
			throw new Error(`"${path}" is a folder, not a file.`);
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
