import { Plugin } from "obsidian";
import { WriteHighlightController } from "./controller";
import { ObsidianApp } from "./obsidian-api";
import { SettingTab } from "./setting";

export default class ObsidianGlaspPlugin extends Plugin {
	private settings: SettingTab;

	async onload() {
		const data = await this.loadData();
		this.settings = new SettingTab(this, data);
		this.addSettingTab(this.settings);
		this.writeHighlights();
	}

	onunload() {}

	private async writeHighlights() {
		const obApp = new ObsidianApp(this.app);
		const controller = new WriteHighlightController(obApp);
		await controller.run({
			accessToken: this.settings.value.accessToken,
			folder: this.settings.value.folder,
		});
	}
}
