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
		return response;
	}
}
