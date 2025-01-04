import { GlaspHighlightAPI } from "src/glasp-api";

export class WriteHighlightController {
	async run({ accessToken, folder }: { accessToken: string; folder: string }) {
		const highlightAPI = new GlaspHighlightAPI({ accessToken });
		const response = await highlightAPI.fetchHighlights();
		console.log(response);
	}
}
