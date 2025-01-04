import { type RequestUrlParam, requestUrl } from "obsidian";

type Constructor = {
	accessToken: string;
};

export class GlaspAPIClient {
	// TODO: replace right api endpoint
	private baseUrl = "https://api.thecatapi.com/v1/images/search?limit=100";
	private accessToken: string;

	constructor({ accessToken }: Constructor) {
		this.accessToken = accessToken;
	}

	async get<T>(path: string): Promise<T> {
		const _url = `${this.baseUrl}${path}`;
		// TODO: use _url after API is implemented
		console.debug(_url);

		const url = `${this.baseUrl}`;
		const headers = {
			Accept: "application/json",
			Authorization: `Bearer ${this.accessToken}`,
		};
		const params: RequestUrlParam = {
			url,
			headers,
			method: "GET",
		};
		const response = await requestUrl(params);
		return response.json;
	}
}
