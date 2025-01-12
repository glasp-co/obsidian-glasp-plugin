import { Notice, Plugin, addIcon } from "obsidian";
import glaspIcon from "src/assets/glasp.svg";
import { WriteHighlightController } from "./controller";
import { ObsidianApp } from "./obsidian-api";
import { SettingTab } from "./setting";

export default class ObsidianGlaspPlugin extends Plugin {
	private settings: SettingTab;

	async onload() {
		const data = await this.loadData();
		this.settings = new SettingTab(this, data);
		this.addSettingTab(this.settings);
		this.addLeftBarIcon();
		this.writeHighlights();
	}

	onunload() {}

	private async writeHighlights() {
		new Notice("Updating Highlights from Glasp");
		const obApp = new ObsidianApp(this.app);
		const controller = new WriteHighlightController(obApp);
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
}
