import { Plugin, addIcon } from "obsidian";
import glaspIcon from "src/assets/glasp.svg";
import { ImportHighlights } from "./core/import-highlights";
import { ObsidianApp, ObsidianPlugin } from "./obsidian-api";
import { SettingTab } from "./setting";
import type { StorageData } from "./types/storage";

export default class ObsidianGlaspPlugin extends Plugin {
	private settings: SettingTab;
	private autoUpdateInterval: number | null = null;
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;

	async onload() {
		const storageData = await this.getStorageData();
		this.obApp = new ObsidianApp(this.app);
		this.obPlugin = new ObsidianPlugin(this);

		this.settings = new SettingTab({
			obApp: this.obApp,
			obPlugin: this.obPlugin,
			glaspPlugin: this,
			storageData,
		});
		this.addSettingTab(this.settings);
		this.addLeftBarIcon();
		this.addCommandToPalette();
		this.importHighlights();
		this.registerAutoUpdate();

		this.updateFrequencyChangedListener();
	}

	onunload() {}

	private async registerAutoUpdate() {
		const updateFrequency = (await this.getStorageData()).updateFrequency;
		if (this.autoUpdateInterval) {
			window.clearInterval(this.autoUpdateInterval);
		}

		const interval = Number.parseInt(updateFrequency);
		this.autoUpdateInterval = this.registerInterval(
			window.setInterval(
				() => {
					this.importHighlights();
				},
				interval * 60 * 1000,
			),
		);
	}

	private updateFrequencyChangedListener() {
		this.obApp.listenEvent("glasp-plugin:update-frequency-changed", () => {
			this.registerAutoUpdate();
		});
	}

	private addLeftBarIcon() {
		addIcon("glasp", glaspIcon);
		this.addRibbonIcon("glasp", "Import Glasp Highlights", () => {
			this.importHighlights();
		});
	}

	private addCommandToPalette() {
		this.addCommand({
			id: "import-highlights",
			name: "Import Highlights",
			callback: () => {
				this.importHighlights();
			},
		});
	}

	private async importHighlights() {
		const storageData = await this.getStorageData();

		if (
			!storageData.accessToken ||
			!storageData.folder ||
			!storageData.updateFrequency
		) {
			return;
		}

		const controller = new ImportHighlights({
			obApp: this.obApp,
			obPlugin: this.obPlugin,
			storageData,
		});
		await controller.run({
			accessToken: this.settings.value.accessToken,
			folder: this.settings.value.folder,
		});
	}

	async getStorageData() {
		return this.loadData() as Promise<StorageData>;
	}
}
