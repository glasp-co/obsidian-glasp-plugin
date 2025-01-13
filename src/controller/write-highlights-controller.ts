import type { TFile } from "obsidian";
import { HIGHLIGHT_TEMPLATE } from "src/constant/template";
import { GlaspHighlightAPI } from "src/glasp-api";
import { APIError } from "src/glasp-api/error";
import type { Highlight, UserHighlight } from "src/glasp-api/highlight/type";
import {
	type ObsidianApp,
	ObsidianNotice,
	type ObsidianPlugin,
} from "src/obsidian-api";
import type { StorageData } from "src/types/storage";

type Constructor = {
	obApp: ObsidianApp;
	obPlugin: ObsidianPlugin;
	storageData: StorageData;
};

export class WriteHighlightController {
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;
	private storageData: StorageData;

	constructor({ obApp, obPlugin, storageData }: Constructor) {
		this.obApp = obApp;
		this.obPlugin = obPlugin;
		this.storageData = storageData;
	}

	async run({ accessToken, folder }: { accessToken: string; folder: string }) {
		try {
			const userHighlights: UserHighlight[] = [];
			await this.pagingFetch({
				accessToken,
				userHighlights,
				updatedAfter: this.storageData.lastUpdated,
			});
			this.updateLastUpdate();

			if (!userHighlights.length) {
				return;
			}

			const allFiles = this.obApp.getAllFiles();

			const promises = userHighlights.map(async (highlight) => {
				const existFile = allFiles.find((file) =>
					this.isExistFile({ file, folder, url: highlight.url }),
				);
				if (existFile) {
					this.obApp.updateFile({
						file: existFile,
						template: HIGHLIGHT_TEMPLATE,
						data: this.normalizeHighlight(highlight),
					});
				} else {
					this.obApp.createFile({
						folder,
						filename: highlight.title,
						template: HIGHLIGHT_TEMPLATE,
						data: this.normalizeHighlight(highlight),
					});
				}
			});

			await Promise.all(promises);
		} catch (e) {
			if (e instanceof APIError) {
				if (e.status === 401) {
					new ObsidianNotice("Access Token is invalid");
					return;
				}
			}
			new ObsidianNotice("failed to update Highlights");
		}
	}

	// fetch recursively
	private async pagingFetch({
		accessToken,
		userHighlights,
		updatedAfter,
		pageCursor,
	}: {
		accessToken: string;
		userHighlights: UserHighlight[];
		updatedAfter?: string;
		pageCursor?: string;
	}) {
		const highlightAPI = new GlaspHighlightAPI({ accessToken });
		const response = await highlightAPI.fetchHighlights({
			pageCursor,
			updatedAfter,
		});

		if (!response.results.length) {
			return;
		}

		if (response.results.length < 50) {
			userHighlights.push(...response.results);
			return;
		}

		if (!response.nextPageCursor) {
			return;
		}

		userHighlights.push(...response.results);
		await this.pagingFetch({
			accessToken,
			userHighlights,
			updatedAfter,
			pageCursor: response.nextPageCursor,
		});
	}

	private normalizeHighlight(highlight: UserHighlight) {
		let content = "";
		if (highlight.document_note) {
			content += "#### Thoughts & Comments\n";
			content += `
${highlight.document_note}

`;
		}

		content += "#### Highlights & Notes\n";
		// biome-ignore lint/complexity/noForEach:
		highlight.highlights.forEach((highlight) => {
			const text = this.modifyHighlightText(highlight);
			content += `
${text}
`;
		});

		return {
			url: highlight.url,
			tags: highlight.tags,
			content,
		};
	}

	private modifyHighlightText(highlight: Highlight) {
		let text = `> ${highlight.text}`;
		if (text.includes("\n")) {
			text = text.replace(/\n/g, "");
		}

		if (highlight.note) {
			text += `
---
  **note:**
  ${highlight.note}
`;
		}
		return text;
	}

	private isExistFile({
		file,
		folder,
		url,
	}: { file: TFile; folder: string; url: string }) {
		const cachedMetadata = this.obApp.getFileMetadataCache(file);
		if (!cachedMetadata) {
			return;
		}

		return (
			cachedMetadata.frontmatter?.URL === url &&
			file.path.startsWith(`${folder}/`)
		);
	}

	private updateLastUpdate() {
		this.storageData.lastUpdated = new Date().toISOString();
		this.obPlugin.saveData(this.storageData);
	}
}
