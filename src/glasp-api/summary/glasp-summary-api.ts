import { APIError } from "../error";
import { GlaspAPIClient } from "../glasp-api-client";
import { RequestPacer } from "../request-pacer";
import type { SummariesResponse, SummaryDetail } from "./type";

/** Retry server and connection errors a few times so a brief outage during a
 * large content sync does not drop the body. A rate-limit refusal is not
 * retried: requests are already paced under the per-minute limit, so a
 * refusal means a longer limit is reached, and retrying would only add
 * refused requests. */
const CONTENT_MAX_ATTEMPTS = 3;

const isTransient = (e: unknown): boolean => {
	const status = e instanceof APIError ? e.status : -1;
	return status === 0 || (status >= 500 && status < 600);
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimum gap between the starts of two content requests. The API limits how
 * many of them a user may make per minute; this keeps a large content sync
 * (turning on "Include full page content" re-syncs every summary) under that
 * limit, so it is not refused part-way through.
 */
export const CONTENT_REQUEST_INTERVAL_MS = 700;

/** Thrown instead of sending a content request once one was refused. */
export class ContentSkippedError extends Error {
	constructor() {
		super(
			"Skipped the full page content: the Glasp API's request limit was reached. It will be retried on the next sync.",
		);
	}
}

type Constructor = {
	accessToken: string;
	pacer?: RequestPacer;
	/** True once the plugin is unloaded: queued content requests are dropped. */
	isCancelled?: () => boolean;
};

export class GlaspSummaryAPI {
	private client: GlaspAPIClient;
	private pacer: RequestPacer;
	/** Set by the first rate-limit refusal; later content requests are not sent. */
	private refused = false;

	private isCancelled: () => boolean;

	constructor({ accessToken, pacer, isCancelled }: Constructor) {
		this.client = new GlaspAPIClient({ accessToken });
		this.pacer = pacer ?? new RequestPacer(CONTENT_REQUEST_INTERVAL_MS);
		this.isCancelled = isCancelled ?? (() => false);
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
			// Checked before waiting, so skipping costs no time, and again after
			// it, so requests queued behind a refused one are dropped.
			if (this.refused) {
				throw new ContentSkippedError();
			}
			await this.pacer.turn();
			if (this.refused || this.isCancelled()) {
				throw new ContentSkippedError();
			}
			try {
				const response = await this.client.get<SummaryDetail>(path);
				return response.content ?? null;
			} catch (e) {
				if (e instanceof APIError && e.status === 429) {
					this.refused = true;
				}
				if (attempt >= CONTENT_MAX_ATTEMPTS || !isTransient(e)) {
					throw e;
				}
				await sleep(400 * attempt);
			}
		}
	}
}
