import { type App, TFile, TFolder } from "obsidian";

type Entry = { path: string; content: string; mtime: number };

/**
 * An in-memory stand-in for the parts of Obsidian's App the importer uses:
 * the vault (files, folders, create/read/modify) and the metadata cache
 * (frontmatter parsed from the file's text, `Key: value` per line, JSON-quoted
 * values decoded). `create` rejects a path that exists (ignoring letter case
 * and accent composition, as on macOS) or whose folder is missing, as
 * Obsidian does.
 */
export class FakeVault {
	files = new Map<string, Entry>();
	folders = new Set<string>();
	created: string[] = [];
	modified: string[] = [];
	/** Paths put in the trash through the file manager. */
	trashed: string[] = [];
	/** Files on disk that Obsidian does not list (dotfiles, files still syncing in). */
	diskOnly = new Set<string>();
	/** Moves made through the file manager (which may ask to update links). */
	linkUpdatingMoves: string[] = [];
	/** Moves made through the vault (no link update, no question). */
	quietMoves: string[] = [];
	/** Awaited by `create` before it writes, to hold a create in flight. */
	beforeCreate?: (path: string) => Promise<void>;
	private listeners = new Map<string, ((...args: unknown[]) => void)[]>();
	failCreate?: (path: string) => Error | undefined;
	failRead = false;
	/** Paths Obsidian has not indexed yet: getFileCache returns null for them. */
	notIndexed = new Set<string>();
	/**
	 * Paths whose frontmatter Obsidian could not parse. Obsidian 1.14 then
	 * indexes the note with a leading "yaml" section and no frontmatter.
	 */
	unparsable = new Set<string>();
	private clock = 0;
	/** One TFile per note, as Obsidian keeps: a note deleted and created again is another TFile. */
	private handles = new WeakMap<Entry, TFile>();

	constructor(folders: string[] = []) {
		for (const f of folders) this.folders.add(f);
	}

	seed(path: string, content: string) {
		this.files.set(path, { path, content, mtime: ++this.clock });
	}

	/**
	 * Move a folder and everything in it, as a move in Obsidian's file explorer
	 * does, and tell listeners as Obsidian 1.14 does: a rename event for the
	 * folder, then one for each folder and file in it.
	 */
	moveFolder(from: string, to: string) {
		const moved = (p: string) =>
			p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p;
		const inside = [...this.folders, ...this.files.keys()].filter((p) =>
			p.startsWith(`${from}/`),
		);
		for (const folder of [...this.folders]) {
			this.folders.delete(folder);
			this.folders.add(moved(folder));
		}
		for (const [path, entry] of [...this.files]) {
			if (moved(path) !== path) {
				this.files.delete(path);
				entry.path = moved(path);
				this.files.set(entry.path, entry);
				this.handle(entry.path).path = entry.path;
			}
		}
		this.emit("rename", this.folder(to), from);
		for (const old of inside) {
			const now = moved(old);
			this.emit(
				"rename",
				this.folders.has(now) ? this.folder(now) : this.handle(now),
				old,
			);
		}
	}

	private emit(name: string, ...args: unknown[]) {
		for (const listener of this.listeners.get(name) ?? []) listener(...args);
	}

	private moveEntry(from: string, to: string) {
		const entry = this.files.get(from);
		if (!entry) throw new Error("ENOENT");
		if (this.files.has(to) || this.folders.has(to)) {
			throw new Error("Destination file already exists!");
		}
		const folder = to.slice(0, to.lastIndexOf("/"));
		if (!this.folders.has(folder)) {
			throw new Error(`ENOENT: no such folder ${folder}`);
		}
		const handle = this.handle(from);
		this.files.delete(from);
		entry.path = to;
		this.files.set(to, entry);
		handle.path = to;
	}

	mtime(path: string): number | undefined {
		return this.files.get(path)?.mtime;
	}

	private handle(path: string): TFile {
		const entry = this.files.get(path);
		if (!entry) {
			return Object.assign(new TFile(), { path });
		}
		let file = this.handles.get(entry);
		if (!file) {
			file = Object.assign(new TFile(), { path });
			this.handles.set(entry, file);
		}
		return file;
	}

	/** A folder with its direct children, as Obsidian's TFolder has. */
	private folder(path: string): TFolder {
		const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));
		const children = [
			...[...this.files.keys()]
				.filter((p) => parentOf(p) === path)
				.map((p) => this.handle(p)),
			...[...this.folders]
				.filter((p) => p !== path && parentOf(p) === path)
				.map((p) => Object.assign(new TFolder(), { path: p })),
		];
		return Object.assign(new TFolder(), { path, children });
	}

	app(): App {
		const vault = {
			getFiles: () => [...this.files.keys()].map((p) => this.handle(p)),
			getAllLoadedFiles: () => [
				...[...this.files.keys()].map((p) => this.handle(p)),
				...[...this.folders].map((p) => this.folder(p)),
			],
			getAbstractFileByPath: (path: string) =>
				this.files.has(path)
					? this.handle(path)
					: this.folders.has(path)
						? this.folder(path)
						: null,
			getFolderByPath: (path: string) =>
				this.folders.has(path) ? this.folder(path) : null,
			getAllFolders: () => [...this.folders].map((p) => this.folder(p)),
			create: async (path: string, content: string) => {
				this.created.push(path);
				await this.beforeCreate?.(path);
				const injected = this.failCreate?.(path);
				if (injected) throw injected;
				const key = (p: string) => p.normalize("NFC").toLowerCase();
				if ([...this.files.keys()].some((p) => key(p) === key(path))) {
					throw new Error("File already exists.");
				}
				const folder = path.slice(0, path.lastIndexOf("/"));
				if (!this.folders.has(folder)) {
					throw new Error(`ENOENT: no such folder ${folder}`);
				}
				this.files.set(path, { path, content, mtime: ++this.clock });
				return this.handle(path);
			},
			cachedRead: async (file: TFile) => {
				const entry = this.files.get(file.path);
				if (!entry) throw new Error("ENOENT");
				return entry.content;
			},
			read: async (file: TFile) => {
				if (this.failRead) throw new Error("EIO: read failed");
				const entry = this.files.get(file.path);
				if (!entry) throw new Error("ENOENT");
				return entry.content;
			},
			modify: async (file: TFile, content: string) => {
				this.modified.push(file.path);
				const entry = this.files.get(file.path);
				if (!entry) throw new Error("ENOENT");
				entry.content = content;
				entry.mtime = ++this.clock;
			},
			createFolder: async (path: string) => {
				this.folders.add(path);
			},
			rename: async (file: TFile, newPath: string) => {
				this.quietMoves.push(`${file.path} -> ${newPath}`);
				this.moveEntry(file.path, newPath);
			},
			on: (name: string, listener: (...args: unknown[]) => void) => {
				const list = this.listeners.get(name) ?? [];
				list.push(listener);
				this.listeners.set(name, list);
				return { name, listener };
			},
			configDir: ".obsidian",
			// The disk, which ignores letter case and accent composition, as on
			// macOS, and holds files Obsidian has not listed yet.
			adapter: {
				read: async (path: string) => {
					const key = (p: string) => p.normalize("NFC").toLowerCase();
					const entry = [...this.files.values()].find(
						(e) => key(e.path) === key(path),
					);
					if (!entry) throw new Error("ENOENT");
					return entry.content;
				},
				exists: async (path: string) =>
					this.files.has(path) || this.folders.has(path),
				/** What the disk holds directly in a folder, listed or not. */
				list: async (path: string) => {
					const inIt = (p: string) =>
						p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/");
					return {
						files: [...this.files.keys(), ...this.diskOnly].filter(inIt),
						folders: [...this.folders].filter(inIt),
					};
				},
			},
		};
		const metadataCache = {
			getFileCache: (file: TFile) => {
				const entry = this.files.get(file.path);
				if (!entry || this.notIndexed.has(file.path)) return null;
				const match = /^---\n([\s\S]*?)\n---/.exec(entry.content);
				if (!match) return {};
				if (this.unparsable.has(file.path)) {
					return { sections: [{ type: "yaml" }, { type: "paragraph" }] };
				}
				const frontmatter: Record<string, unknown> = {};
				for (const line of match[1].split("\n")) {
					const at = line.indexOf(": ");
					if (at < 0) continue;
					const key = line.slice(0, at);
					const raw = line.slice(at + 2);
					try {
						frontmatter[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
					} catch {
						frontmatter[key] = raw;
					}
				}
				return { frontmatter };
			},
		};
		const fileManager = {
			renameFile: async (file: TFile, newPath: string) => {
				this.linkUpdatingMoves.push(`${file.path} -> ${newPath}`);
				this.moveEntry(file.path, newPath);
			},
			trashFile: async (file: TFile | TFolder) => {
				this.trashed.push(file.path);
				if (!this.folders.delete(file.path)) {
					this.files.delete(file.path);
				}
			},
		};
		return {
			vault,
			metadataCache,
			fileManager,
			workspace: {},
		} as unknown as App;
	}
}
