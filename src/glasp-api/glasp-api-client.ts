import { type RequestUrlParam, requestUrl } from "obsidian";
import { APIError } from "./error";

/**
 * How long to wait for an answer. Obsidian's request can stay pending forever
 * when a connection drops mid-response, and one request that never settles
 * would hold the sync (and every later trigger) until Obsidian restarts.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Rejects with a status-0 APIError if `promise` has not settled in `ms`. */
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() =>
				reject(
					new APIError({
						status: 0,
						message: `no answer within ${Math.round(ms / 1000)} s`,
					}),
				),
			ms,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});

type Constructor = {
	accessToken: string;
};

export class GlaspAPIClient {
	private baseUrl = "https://api.glasp.co";
	private accessToken: string;

	constructor({ accessToken }: Constructor) {
		this.accessToken = accessToken;
	}

	async get<T>(path: string): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers = {
			Accept: "application/json",
			Authorization: `Bearer ${this.accessToken}`,
		};
		const params: RequestUrlParam = {
			url,
			headers,
			method: "GET",
		};

		try {
			const response = await withTimeout(
				requestUrl(params),
				REQUEST_TIMEOUT_MS,
			);
			return response.json;
		} catch (e) {
			if (e instanceof APIError) {
				throw e;
			}
			// Obsidian attaches `status` to HTTP errors only; anything else (offline,
			// connection reset, a body that is not JSON) gets status 0.
			const status =
				e &&
				typeof e === "object" &&
				typeof (e as { status?: unknown }).status === "number"
					? (e as { status: number }).status
					: 0;
			throw new APIError({
				status,
				message: status ? "" : e instanceof Error ? e.message : String(e ?? ""),
			});
		}
	}
}
