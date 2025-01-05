import { GlaspAPIClient } from "../glasp-api-client";
import type { HighlightsResponse } from "./type";

type Constructor = {
	accessToken: string;
};

export class GlaspHighlightAPI {
	private client: GlaspAPIClient;

	constructor({ accessToken }: Constructor) {
		this.client = new GlaspAPIClient({ accessToken });
	}

	async fetchHighlights() {
		const response =
			await this.client.get<HighlightsResponse>("/v1/highlights");
		return markdownList;
		// return response;
	}
}

const markdownList = {
	results: [
		{
			id: "1",
			title: "How to use toMatchImageSnapshot method in differencify",
			url: "https://sample.com",
			content: "- **Task 1**: Setup environment",
		},
		{
			id: "2",
			title: "How Airbnb Smoothly Upgrades React",
			url: "https://sample.com",
			content: "- **Task 1**: Setup environment",
		},
		{
			id: "3",
			title: "Functions: ImageResponse | Next.js",
			url: "https://sample.com",
			content: "- **Task 1**: Setup environment",
		},
	],
};
