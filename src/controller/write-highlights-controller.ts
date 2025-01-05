import { HIGHLIGHT_TEMPLATE } from "src/constant/template";
import { GlaspHighlightAPI } from "src/glasp-api";
import type { ObsidianApp } from "src/obsidian-api";

export class WriteHighlightController {
	private obApp: ObsidianApp;

	constructor(obApp: ObsidianApp) {
		this.obApp = obApp;
	}

	async run({ accessToken, folder }: { accessToken: string; folder: string }) {
		const highlightAPI = new GlaspHighlightAPI({ accessToken });
		const response = await highlightAPI.fetchHighlights();

		const promises = response.results.map(async (highlight) => {
			this.obApp.createFile({
				folder,
				filename: highlight.title,
				template: HIGHLIGHT_TEMPLATE,
				data: highlight,
			});
		});

		await Promise.all(promises);
	}
}
