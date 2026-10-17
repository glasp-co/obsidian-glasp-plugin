import type { App, TFile } from "obsidian";

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
	failCreate?: (path: string) => Error | undefined;
	failRead = false;
	/** Paths Obsidian has not indexed yet: getFileCache returns null for them. */
	notIndexed = new Set<string>();
	private clock = 0;
	private handles = new Map<string, TFile>();

	constructor(folders: string[] = []) {
		for (const f of folders) this.folders.add(f);
	}

	seed(path: string, content: string) {
		this.files.set(path, { path, content, mtime: ++this.clock });
	}

	mtime(path: string): number | undefined {
		return this.files.get(path)?.mtime;
	}

	private handle(path: string): TFile {
		let file = this.handles.get(path);
		if (!file) {
			file = { path } as TFile;
			this.handles.set(path, file);
		}
		return file;
	}

	app(): App {
		const vault = {
			getFiles: () => [...this.files.keys()].map((p) => this.handle(p)),
			getAllLoadedFiles: () => [
				...[...this.files.keys()].map((p) => this.handle(p)),
				...[...this.folders].map((p) => ({ path: p })),
			],
			getAbstractFileByPath: (path: string) =>
				this.files.has(path)
					? this.handle(path)
					: this.folders.has(path)
						? { path }
						: null,
			getFolderByPath: (path: string) =>
				this.folders.has(path) ? { path } : null,
			getAllFolders: () => [...this.folders].map((p) => ({ path: p })),
			create: async (path: string, content: string) => {
				this.created.push(path);
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
		};
		const metadataCache = {
			getFileCache: (file: TFile) => {
				const entry = this.files.get(file.path);
				if (!entry || this.notIndexed.has(file.path)) return null;
				const match = /^---\n([\s\S]*?)\n---/.exec(entry.content);
				if (!match) return {};
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
		return { vault, metadataCache, workspace: {} } as unknown as App;
	}
}
