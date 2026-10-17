import { describe, expect, test } from "vitest";
import { basesCommitPatch, cursorCommitPatch } from "./commit-rules";
import { normalizeStorageData } from "./storage-data";

const state = normalizeStorageData({
	lastUpdated: "2026-09-23T00:00:00.000Z",
	summaryLastUpdated: "",
	basesCreated: { "Glasp Web Highlights.base": "Glasp" },
});

describe("cursorCommitPatch", () => {
	const read = { value: "2026-09-23T00:00:00.000Z", generation: 0 };

	test("commits when nothing changed since the run read the cursor", () => {
		expect(
			cursorCommitPatch(
				state,
				"lastUpdated",
				"2026-10-01T00:00:00.000Z",
				read,
				0,
			),
		).toEqual({
			lastUpdated: "2026-10-01T00:00:00.000Z",
		});
	});

	test("writes nothing after a reset was saved (value changed)", () => {
		const reset = { ...state, lastUpdated: "" };
		expect(
			cursorCommitPatch(
				reset,
				"lastUpdated",
				"2026-10-01T00:00:00.000Z",
				read,
				0,
			),
		).toBeNull();
	});

	test("writes nothing after a reset was asked for (generation bumped), even if the value is the same", () => {
		const emptyRead = { value: "", generation: 0 };
		expect(
			cursorCommitPatch(state, "summaryLastUpdated", "x", emptyRead, 1),
		).toBeNull();
	});
});

describe("basesCommitPatch", () => {
	const on = { enabled: true, revision: 2 };

	test("merges the new records into the latest ones", () => {
		expect(
			basesCommitPatch(state, { "Glasp Summaries.base": "S" }, on, on),
		).toEqual({
			basesCreated: {
				"Glasp Web Highlights.base": "Glasp",
				"Glasp Summaries.base": "S",
			},
		});
	});

	test("records nothing once the setting is off or changed", () => {
		expect(
			basesCommitPatch(state, { a: "b" }, on, { enabled: false, revision: 3 }),
		).toBeNull();
		expect(
			basesCommitPatch(state, { a: "b" }, on, { enabled: true, revision: 3 }),
		).toBeNull();
		expect(
			basesCommitPatch(state, { a: "b" }, { enabled: false, revision: 2 }, on),
		).toBeNull();
	});
});
