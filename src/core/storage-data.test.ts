import { describe, expect, test } from "vitest";
import { buildSyncReport } from "./import-highlights/sync-report";
import {
	normalizeStorageData,
	readStorageFile,
	sameData,
} from "./storage-data";

describe("normalizeStorageData", () => {
	test("a 0.3.0 data.json keeps its settings and cursors, and Bases stay on", () => {
		const raw = {
			accessToken: "token",
			folder: "Glasp",
			lastUpdated: "2026-09-23T00:00:00.000Z",
			summaryLastUpdated: "2026-09-24T00:00:00.000Z",
			summaryIncludeContent: true,
			updateFrequency: "60" as const,
			basesCreated: { "Glasp Web Highlights.base": "Glasp" },
		};
		const state = normalizeStorageData(raw);
		expect(state).toMatchObject(raw);
		expect(state.createBasesViews).toBe(true);
		expect(state.lastSyncReport).toBeUndefined();
	});

	test("an empty data.json gets the defaults", () => {
		expect(normalizeStorageData(null)).toMatchObject({
			accessToken: "",
			updateFrequency: "1440",
			summaryIncludeContent: false,
			createBasesViews: true,
			basesCreated: {},
		});
	});

	test("a legacy array basesCreated becomes an empty record", () => {
		expect(
			normalizeStorageData({
				basesCreated: ["x"] as unknown as Record<string, string>,
			}).basesCreated,
		).toEqual({});
	});

	test("keeps a stored report of this version and drops any other", () => {
		const report = buildSyncReport({
			finishedAt: "2026-10-16T00:00:00.000Z",
			sources: [],
			failures: [],
		});
		expect(
			normalizeStorageData({ lastSyncReport: report }).lastSyncReport,
		).toEqual(report);
		expect(
			normalizeStorageData({
				lastSyncReport: {
					...report,
					schemaVersion: 9,
				} as unknown as typeof report,
			}).lastSyncReport,
		).toBeUndefined();
	});
});

describe("readStorageFile", () => {
	test("tells a missing, a readable and an unreadable data.json apart", () => {
		expect(readStorageFile(null)).toEqual({ readable: true, data: null });
		expect(readStorageFile({ folder: "Glasp" })).toEqual({
			readable: true,
			data: { folder: "Glasp" },
		});
		// Obsidian's loadData gives undefined when the file exists but cannot be read.
		expect(readStorageFile(undefined)).toEqual({ readable: false, data: null });
		expect(readStorageFile([1])).toEqual({ readable: false, data: null });
		expect(readStorageFile("x")).toEqual({ readable: false, data: null });
	});
});

describe("sameData", () => {
	test("compares by value, whatever the key order", () => {
		expect(
			sameData({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }),
		).toBe(true);
		expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
		expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(true);
	});
});

describe("fields a newer version saved", () => {
	test("are kept, so this version does not strip them", () => {
		const state = normalizeStorageData({
			folder: "Glasp",
			futureSetting: "x",
		} as unknown as Parameters<typeof normalizeStorageData>[0]);
		expect((state as unknown as Record<string, unknown>).futureSetting).toBe(
			"x",
		);
	});
});
