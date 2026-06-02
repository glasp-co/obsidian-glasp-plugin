import type { TFile } from "obsidian";
import { APIError } from "src/glasp-api/error";
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

type LastUpdatedKey = "lastUpdated" | "kindleLastUpdated";

/**
 * Describes one importable highlight source (web or Kindle). The paging,
 * de-duplication and file creation logic is identical across sources, so the
 * differences (endpoint, template, normalizer, folder, last-updated cursor)
 * are injected here.
 */
export type HighlightImportSource<T extends { url: string; title: string }> = {
	label: string;
	folder: string;
	template: string;
	lastUpdatedKey: LastUpdatedKey;
	fetchPage: (args: {
		pageCursor?: string;
		updatedAfter?: string;
	}) => Promise<{ results: T[]; nextPageCursor: string | null }>;
	normalize: (item: T) => unknown;
};

export class ImportHighlights {
	private obApp: ObsidianApp;
	private obPlugin: ObsidianPlugin;
	private storageData: StorageData;

	constructor({ obApp, obPlugin, storageData }: Constructor) {
		this.obApp = obApp;
		this.obPlugin = obPlugin;
		this.storageData = storageData;
	}

	async run<T extends { url: string; title: string }>(
		source: HighlightImportSource<T>,
	) {
		new ObsidianNotice(`Updating ${source.label}`);

		try {
			const items: T[] = [];
			await this.pagingFetch({
				fetchPage: source.fetchPage,
				items,
				updatedAfter: this.storageData[source.lastUpdatedKey],
			});
			this.updateLastUpdate(source.lastUpdatedKey);

			if (!items.length) {
				return;
			}

			const allFiles = this.obApp.getAllFiles();

			const promises = items.map(async (item) => {
				const existFile = allFiles.find((file) =>
					this.isExistFile({ file, folder: source.folder, url: item.url }),
				);
				if (existFile) {
					this.obApp.updateFile({
						file: existFile,
						template: source.template,
						data: source.normalize(item),
					});
				} else {
					this.obApp.createFile({
						folder: source.folder,
						filename: item.title,
						template: source.template,
						data: source.normalize(item),
					});
				}
			});

			await Promise.all(promises);
		} catch (e) {
			if (e instanceof APIError) {
				if (e.status === 401) {
					new ObsidianNotice("Access token is invalid");
					return;
				}
			}
			new ObsidianNotice(`Failed to update ${source.label}`);
		}
	}

	// fetch recursively
	private async pagingFetch<T extends { url: string; title: string }>({
		fetchPage,
		items,
		updatedAfter,
		pageCursor,
	}: {
		fetchPage: HighlightImportSource<T>["fetchPage"];
		items: T[];
		updatedAfter?: string;
		pageCursor?: string;
	}) {
		const response = await fetchPage({ pageCursor, updatedAfter });

		if (!response.results.length) {
			return;
		}

		if (response.results.length < 50) {
			items.push(...response.results);
			return;
		}

		if (!response.nextPageCursor) {
			return;
		}

		items.push(...response.results);
		await this.pagingFetch({
			fetchPage,
			items,
			updatedAfter,
			pageCursor: response.nextPageCursor,
		});
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

	private updateLastUpdate(key: LastUpdatedKey) {
		this.storageData[key] = new Date().toISOString();
		this.obPlugin.saveData(this.storageData);
	}
}
