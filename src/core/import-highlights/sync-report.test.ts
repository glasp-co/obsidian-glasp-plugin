import { describe, expect, test } from "vitest";
import {
	REPORT_MAX_BYTES,
	REPORT_MAX_FIELD_CHARS,
	REPORT_MAX_ROWS,
	type SyncFailure,
	buildSyncReport,
	readStoredReport,
} from "./sync-report";

const failure = (i: number, extra: Partial<SyncFailure> = {}): SyncFailure => ({
	source: "web highlights",
	stage: "create",
	message: `failed ${i}`,
	title: `Title ${i}`,
	url: `https://example.com/${i}`,
	path: `Glasp/Title ${i}.md`,
	...extra,
});

const sources = [
	{
		source: "web highlights",
		fetched: 3,
		created: 1,
		updated: 1,
		unchanged: 0,
		failed: 1,
	},
];

describe("buildSyncReport", () => {
	test("keeps every row of a small report", () => {
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources,
			failures: [failure(1)],
		});
		expect(report.schemaVersion).toBe(1);
		expect(report.totalFailures).toBe(1);
		expect(report.failures).toEqual([failure(1)]);
		expect(report.truncated).toBe(false);
	});

	test("stores at most 500 rows but always the full count", () => {
		const failures = Array.from({ length: 700 }, (_, i) => failure(i));
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources,
			failures,
		});
		expect(report.failures.length).toBeLessThanOrEqual(REPORT_MAX_ROWS);
		expect(report.totalFailures).toBe(700);
		expect(report.truncated).toBe(true);
	});

	test("cuts each text field to 300 characters", () => {
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources,
			failures: [failure(1, { title: "読".repeat(400) })],
		});
		expect(Array.from(report.failures[0].title ?? "").length).toBe(
			REPORT_MAX_FIELD_CHARS,
		);
		expect(report.truncated).toBe(true);
	});

	test("the whole report stays under 100 KB", () => {
		const failures = Array.from({ length: 500 }, (_, i) =>
			failure(i, {
				title: "読".repeat(300),
				message: "x".repeat(300),
				url: "y".repeat(300),
			}),
		);
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources,
			failures,
		});
		// Measured as Obsidian writes data.json (indented by 2).
		const bytes = new TextEncoder().encode(
			JSON.stringify({ lastSyncReport: report }, null, 2),
		).length;
		expect(bytes).toBeLessThanOrEqual(REPORT_MAX_BYTES);
		// And it keeps as many rows as fit: one more would not.
		const oneMore = {
			...report,
			failures: failures.slice(0, report.failures.length + 1),
		};
		expect(
			new TextEncoder().encode(
				JSON.stringify({ lastSyncReport: oneMore }, null, 2),
			).length,
		).toBeGreaterThan(REPORT_MAX_BYTES);
		expect(report.failures.length).toBeLessThan(500);
		expect(report.totalFailures).toBe(500);
		expect(report.truncated).toBe(true);
	});

	test("source-level failures carry no item fields", () => {
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources,
			failures: [
				{ source: "web highlights", stage: "folder", message: "missing" },
			],
		});
		expect(report.failures[0]).toEqual({
			source: "web highlights",
			stage: "folder",
			message: "missing",
		});
	});
});

describe("readStoredReport", () => {
	test("accepts only the version this code writes", () => {
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources,
			failures: [],
		});
		expect(readStoredReport(report)).toEqual(report);
		expect(readStoredReport({ ...report, schemaVersion: 2 })).toBeNull();
		expect(readStoredReport(undefined)).toBeNull();
		expect(readStoredReport("x")).toBeNull();
	});
});

describe("readStoredReport", () => {
	test("drops rows that are not objects, so the rest can be shown", () => {
		const read = readStoredReport({
			schemaVersion: 1,
			finishedAt: "2026-10-17T00:00:00.000Z",
			totalFailures: 1,
			truncated: false,
			sources: [null, { source: "web highlights", fetched: 1 }],
			failures: [
				null,
				7,
				{ source: "web highlights", stage: "create", message: "x" },
			],
		});
		expect(read?.sources).toHaveLength(1);
		expect(read?.failures).toEqual([
			{ source: "web highlights", stage: "create", message: "x" },
		]);
	});
});
