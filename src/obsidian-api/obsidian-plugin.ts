import type ObsidianGlaspPlugin from "../main";
import type { SettingData } from "../setting";

type P = ObsidianGlaspPlugin;

export class ObsidianPlugin {
	private plugin: P;

	constructor(plugin: P) {
		this.plugin = plugin;
	}

	async saveData(data: SettingData) {
		await this.plugin.saveData(data);
	}
}
