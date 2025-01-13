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

	async fetchHighlights(args?: { pageCursor?: string; updatedAfter?: string }) {
		const queryParams = new URLSearchParams();
		if (args?.pageCursor) {
			queryParams.append("pageCursor", args.pageCursor);
		}
		if (args?.updatedAfter) {
			queryParams.append("updatedAfter", args.updatedAfter);
		}

		/**
		 * API Document
		 * @see https://glasp.co/docs/api
		 */
		const response = await this.client.get<HighlightsResponse>(
			`/v1/highlights/export?${queryParams.toString()}`,
		);
		return response;
	}
}
