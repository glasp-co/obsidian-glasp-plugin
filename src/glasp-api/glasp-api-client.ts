import { type RequestUrlParam, requestUrl } from "obsidian";
import { APIError } from "./error";

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
			const response = await requestUrl(params);
			return response.json;
		} catch (e) {
			if ("status" in e) {
				throw new APIError({ status: e.status });
			}
			throw new APIError({ status: 500 });
		}
	}
}
