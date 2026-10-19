import { PluginSettingTab, Setting } from "obsidian";
import {
	BOOKMARK_TEMPLATE,
	HIGHLIGHT_TEMPLATE,
	KINDLE_HIGHLIGHT_TEMPLATE,
	SUMMARY_TEMPLATE,
} from "../constant/template";
import type {
	FailureStage,
	SyncFailure,
} from "../core/import-highlights/sync-report";
import type ObsidianGlaspPlugin from "../main";
import { type ObsidianApp, ObsidianNotice } from "../obsidian-api";
import type { StorageData, UpdateFrequency } from "../types/storage";

type Constructor = {
	obApp: ObsidianApp;
	glaspPlugin: ObsidianGlaspPlugin;
};

/** Plain words for each stage, as shown in Last sync errors. */
const STAGE_LABEL: Record<FailureStage, string> = {
	hydrate: "downloading the full page content",
	normalize: "reading the item from Glasp",
	render: "applying the template",
	create: "creating the note",
	update: "updating the note",
	folder: "the output folder",
	fetch: "fetching from Glasp",
	cursor: "saving the sync position",
	unexpected: "an unexpected error",
};

/** At most this many items are listed under one problem. */
const ITEMS_PER_PROBLEM = 20;

type TextKey =
	| "accessToken"
	| "template"
	| "kindleTemplate"
	| "summaryTemplate"
	| "bookmarkTemplate";

export class SettingTab extends PluginSettingTab {
	private obApp: ObsidianApp;
	private glaspPlugin: ObsidianGlaspPlugin;
	/**
	 * Text typed but not saved yet. Text fields save when they lose focus (and
	 * when the tab closes), not on every keystroke, so a save cannot make
	 * Obsidian redraw the tab while the user is typing.
	 */
	private pendingText: Partial<Pick<StorageData, TextKey>> = {};
	/** Saves of typed text, one after another: a click waits for the save its field's blur started. */
	private flushing: Promise<void> = Promise.resolve();

	constructor({ obApp, glaspPlugin }: Constructor) {
		super(glaspPlugin.app, glaspPlugin);
		this.obApp = obApp;
		this.glaspPlugin = glaspPlugin;
	}

	/**
	 * The plugin's current saved state. Read fresh every time, and every change
	 * saves only the fields it changes, so this tab can never write back the
	 * sync cursors it saw when it was opened.
	 */
	private get value(): Readonly<StorageData> {
		return this.glaspPlugin.store.get();
	}

	private save(patch: Partial<StorageData>): Promise<void> {
		return this.glaspPlugin.updateSettings(patch);
	}

	private flushText(): Promise<void> {
		const next = () => this.flushNow();
		this.flushing = this.flushing.then(next, next);
		return this.flushing;
	}

	private async flushNow(): Promise<void> {
		const pending = this.pendingText;
		this.pendingText = {};
		const changed: Partial<StorageData> = {};
		for (const [key, value] of Object.entries(pending) as [TextKey, string][]) {
			if (this.value[key] !== value) {
				changed[key] = value;
			}
		}
		if (Object.keys(changed).length) {
			await this.save(changed);
		}
	}

	hide(): void {
		void this.flushText();
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
		this.displayCreateBasesViews(containerEl);
		this.displaySelectRefreshTime(containerEl);
		this.displayCreateMissingNotes(containerEl);
		this.displayAdvancedSettings(containerEl);
		this.displayLastSyncErrors(containerEl);
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
					.setValue(this.pendingText.accessToken ?? this.value.accessToken)
					.onChange((value) => {
						this.pendingText.accessToken = value;
					});
				text.inputEl.addEventListener("change", () => {
					void this.flushText();
				});
			});
	}

	/** Existing folders, plus the saved one marked "(missing)" if it is gone. */
	private getFolderOptions(current: string): Record<string, string> {
		const options: Record<string, string> = { "": "— Not set —" };
		for (const folder of this.obApp.getAllFolders()) {
			options[folder.path] = folder.path;
		}
		if (current && !(current in options)) {
			options[current] = `${current} (missing)`;
		}
		return options;
	}

	private displayFolderSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		key: "folder" | "kindleFolder" | "summaryFolder" | "bookmarkFolder",
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(this.getFolderOptions(this.value[key]))
					.setValue(this.value[key])
					.onChange(async (value) => {
						await this.save({ [key]: value } as Partial<StorageData>);
						this.display();
					});
			});
	}

	private displaySelectFiles(containerEl: HTMLElement): void {
		this.displayFolderSetting(
			containerEl,
			"Web highlights output folder",
			"Folder where your Glasp web highlights will be saved",
			"folder",
		);
	}

	private displaySelectKindleFiles(containerEl: HTMLElement): void {
		this.displayFolderSetting(
			containerEl,
			"Kindle highlights output folder",
			"Folder where your Kindle highlights will be saved. Leave unset to skip Kindle import.",
			"kindleFolder",
		);
	}

	private displaySelectSummaryFiles(containerEl: HTMLElement): void {
		this.displayFolderSetting(
			containerEl,
			"Summaries output folder",
			"Folder where your Glasp summaries will be saved. Leave unset to skip summary import.",
			"summaryFolder",
		);
	}

	private displaySummaryIncludeContent(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Include full page content in summaries")
			.setDesc(
				"Also embed the full article/PDF text in each summary note. Slower (one extra request per summary) and makes notes larger. Turning it on fetches every summary again. With a very large library, Glasp's limit on these requests means the full text of every summary can take more than a day to arrive.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.value.summaryIncludeContent)
					.onChange(async (value) => {
						// Turning it on also re-syncs the summaries already imported, so
						// their full content is back-filled on the next import.
						await this.glaspPlugin.setSummaryIncludeContent(value);
					});
			});
	}

	private displaySelectBookmarkFiles(containerEl: HTMLElement): void {
		this.displayFolderSetting(
			containerEl,
			"Bookmarks output folder",
			"Folder where your Glasp bookmarks will be saved. Leave unset to skip bookmark import.",
			"bookmarkFolder",
		);
	}

	private displayCreateBasesViews(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Create Bases views")
			.setDesc(
				"Create a database view (.base file) for each source in a “Glasp Bases” folder. When off, the plugin creates no such folder or file and leaves existing ones alone.",
			)
			.addToggle((toggle) => {
				toggle.setValue(this.value.createBasesViews).onChange(async (value) => {
					await this.glaspPlugin.setCreateBasesViews(value);
				});
			});
	}

	private displayCreateMissingNotes(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Create missing notes")
			.setDesc(
				"Fetch all your items once and create a note for every item that has no note anywhere in your vault, for example items an earlier version could not save. Existing notes are not changed, wherever they are. Notes you deleted are created again.",
			)
			.addButton((button) => {
				button.setButtonText("Create missing notes").onClick(async () => {
					// A token pasted a moment ago is saved first.
					await this.flushText();
					await this.glaspPlugin.createMissingNotes();
					this.display();
				});
			});
	}

	private displayLastSyncErrors(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Last sync errors").setHeading();
		const report = this.glaspPlugin.lastSyncReport;
		if (!report) {
			containerEl.createEl("p", {
				text: "No sync has finished since this version was installed.",
				cls: "setting-item-description",
			});
			return;
		}

		const when = new Date(report.finishedAt).toLocaleString();
		const summary = containerEl.createEl("p", {
			cls: "setting-item-description",
		});
		summary.createSpan({
			text:
				report.totalFailures === 0
					? `Last sync finished ${when} with no errors.`
					: `Last sync finished ${when} with ${report.totalFailures} problem(s). Later syncs try failed items again (for Create missing notes, run it again); a source whose folder is missing is skipped until the folder exists again.`,
		});
		if (!this.glaspPlugin.lastSyncReportSaved) {
			summary.createEl("br");
			summary.createSpan({
				text: "This list could not be saved, so it is kept only until Obsidian restarts.",
			});
		}

		const counts = containerEl.createEl("ul", {
			cls: "setting-item-description",
		});
		for (const source of report.sources) {
			counts.createEl("li", {
				text: `${source.source}: ${source.fetched} fetched, ${source.created} created, ${source.updated} updated, ${source.unchanged} unchanged, ${source.failed} failed`,
			});
		}

		if (!report.failures.length) {
			return;
		}
		if (report.truncated) {
			containerEl.createEl("p", {
				text: `The list below holds ${report.failures.length} of the ${report.totalFailures} problems (some text may be shortened).`,
				cls: "setting-item-description",
			});
		}

		// One entry per distinct problem, with the items it affected.
		const groups = new Map<string, SyncFailure[]>();
		for (const failure of report.failures) {
			const key = `${failure.source}\n${failure.stage}\n${failure.message}`;
			const group = groups.get(key);
			if (group) {
				group.push(failure);
			} else {
				groups.set(key, [failure]);
			}
		}
		const details = containerEl.createEl("details");
		details.createEl("summary", {
			text: `Show the problems (${groups.size} kind${groups.size === 1 ? "" : "s"})`,
		});
		const list = details.createEl("ul");
		for (const rows of groups.values()) {
			const first = rows[0];
			const entry = list.createEl("li");
			entry.createEl("strong", {
				text: `${first.source}, ${STAGE_LABEL[first.stage] ?? first.stage}`,
			});
			entry.createSpan({
				text: ` — ${first.message}${rows.length > 1 ? ` (${rows.length} items)` : ""}`,
			});
			const withItems = rows.filter((row) => row.title || row.url);
			if (!withItems.length) {
				continue;
			}
			const items = entry.createEl("ul");
			for (const row of withItems.slice(0, ITEMS_PER_PROBLEM)) {
				const item = items.createEl("li");
				item.createSpan({ text: row.title || row.url || "" });
				if (row.title && row.url) {
					item.createEl("br");
					item.createEl("small", { text: row.url });
				}
				if (row.path) {
					item.createEl("br");
					item.createEl("small", { text: `File: ${row.path}` });
				}
			}
			if (withItems.length > ITEMS_PER_PROBLEM) {
				items.createEl("li", {
					text: `… and ${withItems.length - ITEMS_PER_PROBLEM} more`,
				});
			}
		}
	}

	private displayTemplateSetting(
		containerEl: HTMLElement,
		{
			name,
			variables,
			defaultTemplate,
			key,
		}: {
			name: string;
			variables: string;
			defaultTemplate: string;
			key: Exclude<TextKey, "accessToken">;
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
					.setValue(this.pendingText[key] ?? this.value[key])
					.onChange((value) => {
						this.pendingText[key] = value;
					});
				textarea.inputEl.rows = 10;
				textarea.inputEl.addEventListener("change", () => {
					void this.flushText();
				});
			});
	}

	private displayTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Web highlights template",
			variables:
				"{{url}}, {{glasp_url}}, {{thumbnail_url}}, {{tags}}, {{tags_yaml}}, {{updated_at}}, {{content}}, and {{#each highlights}} … {{/each}} with {{text}} (or {{highlight}}), {{note}}, {{color}}, {{highlightStyle}}, {{highlighted_at}}, {{yt_playback_position}}. Helpers: (eq a b), (lines text)",
			defaultTemplate: HIGHLIGHT_TEMPLATE,
			key: "template",
		});
	}

	private displayKindleTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Kindle highlights template",
			variables:
				"{{url}}, {{glasp_url}}, {{author}}, {{thumbnail_url}}, {{tags}}, {{tags_yaml}}, {{updated_at}}, {{content}}, and {{#each highlights}} … {{/each}} with {{text}} (or {{highlight}}), {{note}}, {{color}}, {{highlightStyle}}, {{highlighted_at}}, {{location}}, {{location_type}}. Helpers: (eq a b), (lines text)",
			defaultTemplate: KINDLE_HIGHLIGHT_TEMPLATE,
			key: "kindleTemplate",
		});
	}

	private displaySummaryTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Summaries template",
			variables:
				"{{url}}, {{title}}, {{domain}}, {{thumbnail_url}}, {{created_at}}, {{updated_at}}, {{summary}}, {{content}}",
			defaultTemplate: SUMMARY_TEMPLATE,
			key: "summaryTemplate",
		});
	}

	private displayBookmarkTemplate(containerEl: HTMLElement): void {
		this.displayTemplateSetting(containerEl, {
			name: "Bookmarks template",
			variables:
				"{{url}}, {{title}}, {{domain}}, {{category}}, {{description}}, {{thumbnail_url}}, {{created_at}}, {{updated_at}}, {{title_text}}, {{url_text}}",
			defaultTemplate: BOOKMARK_TEMPLATE,
			key: "bookmarkTemplate",
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
						await this.glaspPlugin.setUpdateFrequency(value as UpdateFrequency);
						this.display();
					});
			});
	}
}
