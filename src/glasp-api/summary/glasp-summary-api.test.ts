import { summarySource } from "src/core/import-highlights/sources";
import type { Summary } from "src/glasp-api/summary/type";
import { describe, expect, test, vi } from "vitest";
import { APIError } from "../error";
import { GlaspAPIClient } from "../glasp-api-client";
import { RequestPacer } from "../request-pacer";
import { ContentSkippedError, GlaspSummaryAPI } from "./glasp-summary-api";

describe("RequestPacer", () => {
	test("spaces request starts at least the interval apart", async () => {
		// Three requests asked for at the same moment.
		const now = 1000;
		const waits: number[] = [];
		const pacer = new RequestPacer(
			700,
			() => now,
			async (ms: number) => {
				waits.push(ms);
			},
		);
		await Promise.all([pacer.turn(), pacer.turn(), pacer.turn()]);
		expect(waits).toEqual([700, 1400]);
	});

	test("does not wait when requests are already far apart", async () => {
		let now = 0;
		const wait = vi.fn(async () => {});
		const pacer = new RequestPacer(700, () => now, wait);
		await pacer.turn();
		now += 5000;
		await pacer.turn();
		expect(wait).not.toHaveBeenCalled();
	});
});

const summary = (id: string): Summary => ({
	id,
	url: `https://example.com/${id}`,
	domain: "example.com",
	title: id,
	thumbnail_url: "",
	summary: "text",
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-24T10:00:00.000Z",
});

describe("summarySource with full page content", () => {
	test("a content failure rejects (the item fails) instead of dropping the body", async () => {
		const api = new GlaspSummaryAPI({ accessToken: "t" });
		vi.spyOn(api, "fetchSummaryContent").mockRejectedValue(
			new APIError({ status: 500 }),
		);
		const src = summarySource("t", "Summaries", "", true, { api });
		await expect(src.hydrate?.(summary("a"))).rejects.toBeInstanceOf(APIError);
	});

	test("with content off there is no hydration", () => {
		expect(summarySource("t", "Summaries", "", false).hydrate).toBeUndefined();
	});
});

describe("fetchSummaryContent", () => {
	const noWait = () => new RequestPacer(0);

	test("a rate-limit refusal is not retried, and later requests are not sent", async () => {
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockRejectedValue(new APIError({ status: 429 }));
		const api = new GlaspSummaryAPI({ accessToken: "t", pacer: noWait() });

		await expect(api.fetchSummaryContent("a")).rejects.toMatchObject({
			status: 429,
		});
		await expect(api.fetchSummaryContent("b")).rejects.toBeInstanceOf(
			ContentSkippedError,
		);
		expect(get).toHaveBeenCalledTimes(1);
		get.mockRestore();
	});

	test("requests already waiting for their turn are dropped after a refusal", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockImplementationOnce(async () => {
				await gate;
				throw new APIError({ status: 429 });
			})
			.mockResolvedValue({ content: "never" });
		const api = new GlaspSummaryAPI({
			accessToken: "t",
			pacer: new RequestPacer(5),
		});

		const first = api.fetchSummaryContent("a");
		const queued = [api.fetchSummaryContent("b"), api.fetchSummaryContent("c")];
		release();
		await expect(first).rejects.toMatchObject({ status: 429 });
		for (const q of queued) {
			await expect(q).rejects.toBeInstanceOf(ContentSkippedError);
		}
		expect(get).toHaveBeenCalledTimes(1);
		get.mockRestore();
	});

	test("a server error is retried", async () => {
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockRejectedValueOnce(new APIError({ status: 503 }))
			.mockResolvedValue({ content: "body" });
		const api = new GlaspSummaryAPI({ accessToken: "t", pacer: noWait() });

		await expect(api.fetchSummaryContent("a")).resolves.toBe("body");
		expect(get).toHaveBeenCalledTimes(2);
		get.mockRestore();
	});
});

describe("after a refusal", () => {
	test("the remaining content requests are skipped without waiting their turn", async () => {
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockRejectedValue(new APIError({ status: 429 }));
		// The real interval: 30 skipped requests must not cost 30 x 700 ms.
		const api = new GlaspSummaryAPI({ accessToken: "t" });
		await expect(api.fetchSummaryContent("first")).rejects.toMatchObject({
			status: 429,
		});
		const started = Date.now();
		for (let i = 0; i < 30; i++) {
			await expect(api.fetchSummaryContent(`s${i}`)).rejects.toBeInstanceOf(
				ContentSkippedError,
			);
		}
		expect(Date.now() - started).toBeLessThan(200);
		expect(get).toHaveBeenCalledTimes(1);
		get.mockRestore();
	});
});

describe("after the plugin is unloaded", () => {
	test("a content request waiting for its turn is not sent", async () => {
		const get = vi
			.spyOn(GlaspAPIClient.prototype, "get")
			.mockResolvedValue({ content: "x" });
		let unloaded = false;
		const api = new GlaspSummaryAPI({
			accessToken: "t",
			pacer: new RequestPacer(0),
			isCancelled: () => unloaded,
		});
		unloaded = true;
		await expect(api.fetchSummaryContent("a")).rejects.toBeInstanceOf(
			ContentSkippedError,
		);
		expect(get).not.toHaveBeenCalled();
		get.mockRestore();
	});
});
