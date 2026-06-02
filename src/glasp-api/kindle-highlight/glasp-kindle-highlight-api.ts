import { GlaspAPIClient } from "../glasp-api-client";
import type { KindleHighlightsResponse } from "./type";

type Constructor = {
	accessToken: string;
};

export class GlaspKindleHighlightAPI {
	private client: GlaspAPIClient;

	constructor({ accessToken }: Constructor) {
		this.client = new GlaspAPIClient({ accessToken });
	}

	async fetchKindleHighlights(args?: {
		pageCursor?: string;
		updatedAfter?: string;
	}) {
		const queryParams = new URLSearchParams();
		if (args?.pageCursor) {
			queryParams.append("pageCursor", args.pageCursor);
		}
		if (args?.updatedAfter) {
			queryParams.append("updatedAfter", args.updatedAfter);
		}

		/**
		 * API Document
		 * @see https://glasp.co/docs/apis#kindle-highlight-export
		 */
		const response = await this.client.get<KindleHighlightsResponse>(
			`/v1/kindle-highlights/export?${queryParams.toString()}`,
		);

		return response;
	}
}
