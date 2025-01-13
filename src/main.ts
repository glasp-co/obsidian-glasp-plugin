import { Notice, Plugin, addIcon } from "obsidian";
import glaspIcon from "src/assets/glasp.svg";
import { WriteHighlightController } from "./controller";
import { ObsidianApp, ObsidianPlugin } from "./obsidian-api";
import { SettingTab } from "./setting";
import type { StorageData } from "./types/storage";

export default class ObsidianGlaspPlugin extends Plugin {
	private settings: SettingTab;

	async onload() {
		const storageData = await this.getStorageData();
		const obApp = new ObsidianApp(this.app);
		const obPlugin = new ObsidianPlugin(this);

		this.settings = new SettingTab({
			obApp,
			obPlugin,
			glaspPlugin: this,
			storageData,
		});
		this.addSettingTab(this.settings);
		this.addLeftBarIcon();
		this.writeHighlights();
	}

	onunload() {}

	private async writeHighlights() {
		new Notice("Updating Highlights from Glasp");
		const obApp = new ObsidianApp(this.app);
		const obPlugin = new ObsidianPlugin(this);
		const storageData = await this.getStorageData();

		const controller = new WriteHighlightController({
			obApp,
			obPlugin,
			storageData,
		});
		await controller.run({
			accessToken: this.settings.value.accessToken,
			folder: this.settings.value.folder,
		});
	}

	private addLeftBarIcon() {
		addIcon("glasp", glaspIcon);
		this.addRibbonIcon("glasp", "Glasp Highlights", () => {
			this.writeHighlights();
		});
	}

	async getStorageData() {
		return this.loadData() as Promise<StorageData>;
	}
}
