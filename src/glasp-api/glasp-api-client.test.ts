import * as obsidian from "obsidian";
import { describe, expect, test, vi } from "vitest";
import { describeError } from "../core/import-highlights/import-highlights";
import { APIError } from "./error";
import { GlaspAPIClient, withTimeout } from "./glasp-api-client";

describe("GlaspAPIClient.get", () => {
	test("an HTTP error keeps its status", async () => {
		vi.spyOn(obsidian, "requestUrl").mockRejectedValue(
			Object.assign(new Error("Request failed, status 429"), { status: 429 }),
		);
		const client = new GlaspAPIClient({ accessToken: "t" });
		await expect(client.get("/v1/x")).rejects.toMatchObject({ status: 429 });
		vi.restoreAllMocks();
	});

	test("a connection error becomes status 0 with its message, not HTTP 500", async () => {
		vi.spyOn(obsidian, "requestUrl").mockRejectedValue(
			new Error("net::ERR_INTERNET_DISCONNECTED"),
		);
		const client = new GlaspAPIClient({ accessToken: "t" });
		const error = (await client.get("/v1/x").catch((e) => e)) as APIError;
		expect(error).toBeInstanceOf(APIError);
		expect(error.status).toBe(0);
		expect(describeError(error)).toBe(
			"Could not reach Glasp (net::ERR_INTERNET_DISCONNECTED)",
		);
		vi.restoreAllMocks();
	});
});

describe("withTimeout", () => {
	test("a request that never settles is given up after the timeout", async () => {
		const never = new Promise<never>(() => {});
		const error = (await withTimeout(never, 20).catch((e) => e)) as APIError;
		expect(error).toBeInstanceOf(APIError);
		expect(error.status).toBe(0);
		expect(describeError(error)).toMatch(
			/Could not reach Glasp \(no answer within/,
		);
	});

	test("an answer in time passes through", async () => {
		await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
	});
});
