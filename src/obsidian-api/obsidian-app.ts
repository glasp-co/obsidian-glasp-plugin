import { compile } from "handlebars";
import type { App, TFolder, Vault } from "obsidian";

export class ObsidianApp {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	getAllFolders(): TFolder[] {
		const folders = this.getVault().getAllFolders();
		return folders;
	}

	async createFile<T>({
		folder,
		filename,
		template,
		data,
	}: { folder: string; filename: string; template: string; data: T }) {
		const templateDelegator = compile(template);
		const targetData = templateDelegator(data);

		const path = `${folder}/${filename}.md`;

		const result = await this.getVault().create(path, targetData);
		return result;
	}

	private getApp(): App {
		return this.app;
	}

	private getVault(): Vault {
		return this.getApp().vault;
	}
}
