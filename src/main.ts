import { Plugin } from "obsidian";
import { SettingTab } from "./setting";

export default class ObsidianGlaspPlugin extends Plugin {
	async onload() {
		const data = await this.loadData();
		this.addSettingTab(new SettingTab(this, data));
	}

	onunload() {}
}
