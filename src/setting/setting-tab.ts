import { PluginSettingTab, Setting } from "obsidian";
import {
	BOOKMARK_TEMPLATE,
	HIGHLIGHT_TEMPLATE,
	KINDLE_HIGHLIGHT_TEMPLATE,
	SUMMARY_TEMPLATE,
} from "../constant/template";
import type ObsidianGlaspPlugin from "../main";
import {
	type ObsidianApp,
	ObsidianNotice,
	type ObsidianPlugin,
} from "../obsidian-api";
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
			kindleFolder: storageData?.kindleFolder ?? "",
			summaryFolder: storageData?.summaryFolder ?? "",
			bookmarkFolder: storageData?.bookmarkFolder ?? "",
			template: storageData?.template ?? "",
			kindleTemplate: storageData?.kindleTemplate ?? "",
			summaryTemplate: storageData?.summaryTemplate ?? "",
			bookmarkTemplate: storageData?.bookmarkTemplate ?? "",
			summaryIncludeContent: storageData?.summaryIncludeContent ?? false,
			lastUpdated: storageData?.lastUpdated ?? "",
			kindleLastUpdated: storageData?.kindleLastUpdated ?? "",
			summaryLastUpdated: storageData?.summaryLastUpdated ?? "",
			bookmarkLastUpdated: storageData?.bookmarkLastUpdated ?? "",
			updateFrequency: storageData?.updateFrequency ?? "1440",
			// Guard against a legacy array value from an earlier build.
			basesCreated: Array.isArray(storageData?.basesCreated)
				? {}
				: (storageData?.basesCreated ?? {}),
		};
		// Persisting is done (awaited) by the plugin's onload, not here, so this
		// write cannot race the first import's cursor writes.
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		this.displayAccessToken(containerEl);
		this.displaySelectFiles(containerEl);
		this.displaySelectKindleFiles(containerEl);
		this.displaySelectSummaryFiles(containerEl);
		this.displaySummaryIncludeContent(containerEl);
		this.displaySelectBookmarkFiles(containerEl);
		this.displaySelectRefreshTime(containerEl);
		this.displayAdvancedSettings(containerEl);
	}

	private displayAdvancedSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Advanced").setHeading();
		this.displayTemplate(containerEl);
		this.displayKindleTemplate(containerEl);
		this.displaySummaryTemplate(containerEl);
		this.displayBookmarkTemplate(containerEl);
	}

	private displayAccessToken(containerEl: HTMLElement): void {
		const ACCESS_TOKEN_SETTING_URL = "https://glasp.co/settings/access_token";

		const description = createFragment((fragment) => {
			fragment.createSpan({ text: "Open this page to generate your token: " });
			fragment.createEl("a", {
				href: ACCESS_TOKEN_SETTING_URL,
				text: ACCESS_TOKEN_SETTING_URL,
			});
			fragment.createEl("br");
			fragment.createEl("small", {
				text: "Tip: if it opens inside Obsidian, click “Copy link” and paste it into your default browser (Chrome, Safari, etc.) to sign in.",
			});
		});

		new Setting(containerEl)
			.setName("Get your access token")
			.setDesc(description)
			.addButton((button) => {
				button
					.setButtonText("Copy link")
					.setTooltip("Copy the access token page URL")
					.onClick(async () => {
						await navigator.clipboard.writeText(ACCESS_TOKEN_SETTING_URL);
						new ObsidianNotice("Copied access token URL to clipboard");
					});
			});

		new Setting(containerEl)
			.setName("Access token")
			.setDesc("Paste the token you copied from the page above.")
			.addText((text) => {
				text
					.setPlaceholder("Access token")
					.setValue(this.value.accessToken)
					.onChange(async (value) => {
						this.value.accessToken = value;
						await this.obPlugin.saveData(this.value);
					});
			});
	}

	private getFolderOptions(): Record<string, string> {
		const options: Record<string, string> = { "": "— Not set —" };
		for (const folder of this.obApp.getAllFolders()) {
			options[folder.path] = folder.path;
		}
		return options;
	}

	private displaySelectFiles(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Web highlights output folder")
			.setDesc("Folder where your Glasp web highlights will be saved")
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(this.getFolderOptions())
					.setValue(this.value.folder)
					.onChange(async (value) => {
						this.value.folder = value;
						await this.obPlugin.saveData(this.value);
						this.display();
					});
			});
	}

	private displaySelectKindleFiles(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Kindle highlights output folder")
			.setDesc(
				"Folder where your Kindle highlights will be saved. Leave unset to skip Kindle import.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(this.getFolderOptions())
					.setValue(this.value.kindleFolder)
					.onChange(async (value) => {
						this.value.kindleFolder = value;
						await this.obPlugin.saveData(this.value);
						this.display();
					});
			});
	}

	private displaySelectSummaryFiles(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Summaries output folder")
			.setDesc(
				"Folder where your Glasp summaries will be saved. Leave unset to skip summary import.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(this.getFolderOptions())
					.setValue(this.value.summaryFolder)
					.onChange(async (value) => {
						this.value.summaryFolder = value;
						await this.obPlugin.saveData(this.value);
						this.display();
					});
			});
	}

	private displaySummaryIncludeContent(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Include full page content in summaries")
			.setDesc(
				"Also embed the full article/PDF text in each summary note. Slower (one extra request per summary) and makes notes larger.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.value.summaryIncludeContent)
					.onChange(async (value) => {
						this.value.summaryIncludeContent = value;
						if (value) {
							// Reset the cursor so already-imported summaries are re-synced
							// and their full content is back-filled on the next import.
							this.value.summaryLastUpdated = "";
						}
						await this.obPlugin.saveData(this.value);
					});
			});
	}

	private displaySelectBookmarkFiles(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Bookmarks output folder")
			.setDesc(
				"Folder where your Glasp bookmarks will be saved. Leave unset to skip bookmark import.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(this.getFolderOptions())
					.setValue(this.value.bookmarkFolder)
					.onChange(async (value) => {
						this.value.bookmarkFolder = value;
						await this.obPlugin.saveData(this.value);
						this.display();
					});
			});
	}

	private displayTemplateSetting(
		containerEl: HTMLElement,
		{
			name,
			variables,
			defaultTemplate,
			value,
			onChange,
		}: {
			name: string;
			variables: string;
			defaultTemplate: string;
			value: string;
			onChange: (value: string) => Promise<void>;
		},
	): void {
		const description = createFragment((fragment) => {
			fragment.createSpan({
				text: "Customize the note layout. Leave empty to use the default template.",
			});
			fragment.createEl("br");
			fragment.createEl("small", { text: `Available variables: ${variables}` });
		});

		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addTextArea((textarea) => {
				textarea
					.setPlaceholder(defaultTemplate)
					.setValue(value)
					.onChange(onChange);
				textarea.inputEl.rows = 10;
			});
	}

	private displayTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Web highlights template",
			variables:
				"{{url}}, {{glasp_url}}, {{thumbnail_url}}, {{tags}}, {{updated_at}}, {{content}}",
			defaultTemplate: HIGHLIGHT_TEMPLATE,
			value: this.value.template,
			onChange: async (value) => {
				this.value.template = value;
				await this.obPlugin.saveData(this.value);
			},
		});
	}

	private displayKindleTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Kindle highlights template",
			variables:
				"{{url}}, {{glasp_url}}, {{author}}, {{thumbnail_url}}, {{tags}}, {{updated_at}}, {{content}}",
			defaultTemplate: KINDLE_HIGHLIGHT_TEMPLATE,
			value: this.value.kindleTemplate,
			onChange: async (value) => {
				this.value.kindleTemplate = value;
				await this.obPlugin.saveData(this.value);
			},
		});
	}

	private displaySummaryTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Summaries template",
			variables:
				"{{url}}, {{title}}, {{domain}}, {{thumbnail_url}}, {{created_at}}, {{updated_at}}, {{summary}}",
			defaultTemplate: SUMMARY_TEMPLATE,
			value: this.value.summaryTemplate,
			onChange: async (value) => {
				this.value.summaryTemplate = value;
				await this.obPlugin.saveData(this.value);
			},
		});
	}

	private displayBookmarkTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Bookmarks template",
			variables:
				"{{url}}, {{title}}, {{domain}}, {{category}}, {{description}}, {{thumbnail_url}}, {{created_at}}, {{updated_at}}, {{title_text}}, {{url_text}}",
			defaultTemplate: BOOKMARK_TEMPLATE,
			value: this.value.bookmarkTemplate,
			onChange: async (value) => {
				this.value.bookmarkTemplate = value;
				await this.obPlugin.saveData(this.value);
			},
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
