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

	private getApp(): App {
		return this.app;
	}

	private getVault(): Vault {
		return this.getApp().vault;
	}
}
