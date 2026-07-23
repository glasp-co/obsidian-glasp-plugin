import { APIError } from "../error";
import { GlaspAPIClient } from "../glasp-api-client";
import type { SummariesResponse, SummaryDetail } from "./type";

/** Retry transient failures (rate-limit / server errors) a few times so a 429
 * burst during a large content sync does not permanently drop the body. */
const CONTENT_MAX_ATTEMPTS = 3;

const isTransient = (e: unknown): boolean => {
	const status = e instanceof APIError ? e.status : 0;
	return status === 429 || (status >= 500 && status < 600);
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

type Constructor = {
	accessToken: string;
};

export class GlaspSummaryAPI {
	private client: GlaspAPIClient;

	constructor({ accessToken }: Constructor) {
		this.client = new GlaspAPIClient({ accessToken });
	}

	async fetchSummaries(args?: { pageCursor?: string; updatedAfter?: string }) {
		const queryParams = new URLSearchParams();
		if (args?.pageCursor) {
			queryParams.append("pageCursor", args.pageCursor);
		}
		if (args?.updatedAfter) {
			queryParams.append("updatedAfter", args.updatedAfter);
		}

		/**
		 * API Document
		 * @see https://glasp.co/docs/apis#summary-export
		 */
		const response = await this.client.get<SummariesResponse>(
			`/v1/summaries/export?${queryParams.toString()}`,
		);

		return response;
	}

	/**
	 * Fetch a single summary's full page/PDF Markdown body. Returns null when the
	 * summary has no stored body.
	 *
	 * @see https://glasp.co/docs/apis#summary-get
	 */
	async fetchSummaryContent(id: string): Promise<string | null> {
		const queryParams = new URLSearchParams({ id, include: "content" });
		const path = `/v1/summaries/get?${queryParams.toString()}`;

		for (let attempt = 1; ; attempt++) {
			try {
				const response = await this.client.get<SummaryDetail>(path);
				return response.content ?? null;
			} catch (e) {
				if (attempt >= CONTENT_MAX_ATTEMPTS || !isTransient(e)) {
					throw e;
				}
				await sleep(400 * attempt);
			}
		}
	}
}
