import type { StorageData } from "src/types/storage";
import type ObsidianGlaspPlugin from "../main";

type P = ObsidianGlaspPlugin;

export class ObsidianPlugin {
	private plugin: P;

	constructor(plugin: P) {
		this.plugin = plugin;
	}

	async saveData(data: StorageData) {
		await this.plugin.saveData(data);
	}
}
