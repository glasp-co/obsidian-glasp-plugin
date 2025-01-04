import { Plugin } from "obsidian";
import { WriteHighlightController } from "./controller";
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
		const controller = new WriteHighlightController();
		await controller.run({
			accessToken: this.settings.value.accessToken,
			folder: this.settings.value.folder,
		});
	}
}
