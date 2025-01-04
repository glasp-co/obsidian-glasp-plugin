import { PluginSettingTab, Setting } from "obsidian";
import type ObsidianGlaspPlugin from "../main";
import { ObsidianApp, ObsidianPlugin } from "../obsidian-api";
import type { SettingData } from "./setting";

export class SettingTab extends PluginSettingTab {
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;
	value: SettingData;

	constructor(plugin: ObsidianGlaspPlugin, data: Partial<SettingData>) {
		super(plugin.app, plugin);

		this.obPlugin = new ObsidianPlugin(plugin);
		this.obApp = new ObsidianApp(plugin.app);
		this.value = {
			accessToken: data.accessToken ?? "",
			folder: data.folder ?? "",
		};
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		this.displayTitle(containerEl);
		this.displayAccessToken(containerEl);
		this.displaySelectFiles(containerEl);
	}

	private displayTitle(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Obsidian Glasp Plugin" });
		return;
	}

	private displayAccessToken(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Access Token")
			.setDesc("Set Access Token")
			.addText((text) => {
				text
					.setPlaceholder("Access Token")
					.setValue(this.value.accessToken)
					// TODO: add validation
					.onChange(async (value) => {
						this.value.accessToken = value;
						await this.obPlugin.saveData(this.value);
					});
			});
		return;
	}

	private displaySelectFiles(containerEl: HTMLElement): void {
		const folderOptions = this.obApp.getAllFolders().reduce(
			(acc, current) => {
				acc[current.path] = current.path;
				return acc;
			},
			{} as Record<string, string>,
		);

		new Setting(containerEl)
			.setName("Output Folder")
			.setDesc("Select the file to which Glasp Highlights will be exported")
			.addDropdown((value) => {
				value
					.addOptions(folderOptions)
					.setValue(this.value.folder)
					.onChange(async (value) => {
						this.value.folder = value;
						await this.obPlugin.saveData(this.value);
						this.display();
					});
			});
	}
}
