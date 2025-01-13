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
	}: { folder: string; filename: string; template: string; data: T }) {
		const templateDelegator = compile(template, { noEscape: true });
		const targetData = templateDelegator(data);

		const path = `${folder}/${filename}.md`;

		const result = await this.getVault().create(path, targetData);
		return result;
	}

	async updateFile<T>({
		file,
		template,
		data,
	}: { file: TFile; template: string; data: T }) {
		const templateDelegator = compile(template, { noEscape: true });
		const targetData = templateDelegator(data);

		const result = await this.getVault().modify(file, targetData);
		return result;
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
}
