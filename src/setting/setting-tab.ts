import { PluginSettingTab, Setting } from "obsidian";
import type ObsidianGlaspPlugin from "../main";
import type { ObsidianApp, ObsidianPlugin } from "../obsidian-api";
import type { StorageData, UpdateFrequency } from "../types/storage";

type Constructor = {
	obApp: ObsidianApp;
	obPlugin: ObsidianPlugin;
	glaspPlugin: ObsidianGlaspPlugin;
	storageData: Partial<StorageData>;
};

export class SettingTab extends PluginSettingTab {
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;
	value: StorageData;

	constructor({ obApp, obPlugin, glaspPlugin, storageData }: Constructor) {
		super(glaspPlugin.app, glaspPlugin);

		this.obPlugin = obPlugin;
		this.obApp = obApp;
		this.value = {
			accessToken: storageData?.accessToken ?? "",
			folder: storageData?.folder ?? "",
			lastUpdated: storageData?.lastUpdated ?? "",
			updateFrequency: storageData?.updateFrequency ?? "1440",
		};
		this.obPlugin.saveData(this.value);
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		this.displayAccessToken(containerEl);
		this.displaySelectFiles(containerEl);
		this.displaySelectRefreshTime(containerEl);
	}

	private displayAccessToken(containerEl: HTMLElement): void {
		const ACCESS_TOKEN_SETTING_URL = "https://glasp.co/settings/access_token";

		const descriptionDocumentFragment = document.createDocumentFragment();
		const baseFragment = descriptionDocumentFragment.createEl("span", {
			text: "Find your access token from ",
		});
		const linkFragment = descriptionDocumentFragment.createEl("a", {
			href: ACCESS_TOKEN_SETTING_URL,
			text: "here",
			title: ACCESS_TOKEN_SETTING_URL,
		});
		descriptionDocumentFragment.appendChild(baseFragment);
		descriptionDocumentFragment.appendChild(linkFragment);

		new Setting(containerEl)
			.setName("Access token")
			.setDesc("Set access token")
			.setDesc(descriptionDocumentFragment)
			.addText((text) => {
				text
					.setPlaceholder("Access token")
					.setValue(this.value.accessToken)
					.onChange(async (value) => {
						this.value.accessToken = value;
						await this.obPlugin.saveData(this.value);
					});
			});
		return;
	}

	private displaySelectFiles(containerEl: HTMLElement): void {
		const options = this.obApp.getAllFolders().reduce(
			(acc, current) => {
				acc[current.path] = current.path;
				return acc;
			},
			{} as Record<string, string>,
		);

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Select the file to which Glasp highlights will be exported")
			.addDropdown((value) => {
				value
					.addOptions(options)
					.setValue(this.value.folder)
					.onChange(async (value) => {
						this.value.folder = value;
						await this.obPlugin.saveData(this.value);
						this.display();
					});
			});
	}

	private displaySelectRefreshTime(containerEl: HTMLElement): void {
		const OPTIONS: Record<UpdateFrequency, string> = {
			"60": "Every hour",
			"1440": "Every day",
			"10080": "Once a week",
		};

		new Setting(containerEl)
			.setName("Update frequency")
			.setDesc("Select the update frequency of highlights")
			.addDropdown((value) => {
				value
					.addOptions(OPTIONS)
					.setValue(this.value.updateFrequency)
					.onChange(async (value) => {
						this.value.updateFrequency = value as UpdateFrequency;
						await this.obPlugin.saveData(this.value);
						this.obApp.triggerEvent("glasp-plugin:update-frequency-changed");
						this.display();
					});
			});
	}
}
