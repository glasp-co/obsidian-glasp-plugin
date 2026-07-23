import { GlaspAPIClient } from "../glasp-api-client";
import type { BookmarksResponse } from "./type";

type Constructor = {
	accessToken: string;
};

export class GlaspBookmarkAPI {
	private client: GlaspAPIClient;

	constructor({ accessToken }: Constructor) {
		this.client = new GlaspAPIClient({ accessToken });
	}

	async fetchBookmarks(args?: { pageCursor?: string; updatedAfter?: string }) {
		const queryParams = new URLSearchParams();
		if (args?.pageCursor) {
			queryParams.append("pageCursor", args.pageCursor);
		}
		if (args?.updatedAfter) {
			queryParams.append("updatedAfter", args.updatedAfter);
		}

		/**
		 * API Document
		 * @see https://glasp.co/docs/apis#bookmark-export
		 */
		const response = await this.client.get<BookmarksResponse>(
			`/v1/bookmarks/export?${queryParams.toString()}`,
		);

		return response;
	}
}
