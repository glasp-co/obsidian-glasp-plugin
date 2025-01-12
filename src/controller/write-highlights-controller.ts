import { HIGHLIGHT_TEMPLATE } from "src/constant/template";
import { GlaspHighlightAPI } from "src/glasp-api";
import type { Highlight, UserHighlight } from "src/glasp-api/highlight/type";
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
				data: this.parseHighlight(highlight),
			});
		});

		await Promise.all(promises);
	}

	private parseHighlight(highlight: UserHighlight) {
		let content = "";
		if (highlight.document_note) {
			content += "#### Thoughts & Comments\n";
			content += `
${highlight.document_note}

`;
		}

		content += "#### Highlights & Notes\n";
		highlight.highlights.forEach((highlight, i) => {
			const text = this.parseHighlightContent(highlight);
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

	private parseHighlightContent(highlight: Highlight) {
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
}
