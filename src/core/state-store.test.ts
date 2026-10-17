import { describe, expect, test } from "vitest";
import { StateStore } from "./state-store";

type S = { cursor: string; setting: string };

const deferred = () => {
	let resolve!: () => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

describe("StateStore", () => {
	test("a settings change after a sync does not write the old cursor back", async () => {
		const saved: S[] = [];
		const store = new StateStore<S>({ cursor: "", setting: "a" }, async (s) => {
			saved.push(s);
		});
		await store.update({ cursor: "2026-10-16" }); // the import
		await store.update({ setting: "b" }); // the settings tab
		expect(store.get()).toEqual({ cursor: "2026-10-16", setting: "b" });
		expect(saved.at(-1)).toEqual({ cursor: "2026-10-16", setting: "b" });
	});

	test("writes run one at a time, in order, each on the latest state", async () => {
		const gate = deferred();
		const saved: S[] = [];
		let first = true;
		const store = new StateStore<S>({ cursor: "", setting: "a" }, async (s) => {
			if (first) {
				first = false;
				await gate.promise;
			}
			saved.push(s);
		});
		const a = store.update({ cursor: "1" });
		const b = store.update({ setting: "b" });
		const c = store.update((s) => ({ cursor: `${s.cursor}+` }));
		gate.resolve();
		await Promise.all([a, b, c]);
		expect(saved).toEqual([
			{ cursor: "1", setting: "a" },
			{ cursor: "1", setting: "b" },
			{ cursor: "1+", setting: "b" },
		]);
	});

	test("a rejected save keeps the previous state and does not block later writes", async () => {
		let fail = true;
		const store = new StateStore<S>({ cursor: "", setting: "a" }, async () => {
			if (fail) {
				fail = false;
				throw new Error("disk full");
			}
		});
		await expect(store.update({ cursor: "x" })).rejects.toThrow("disk full");
		expect(store.get()).toEqual({ cursor: "", setting: "a" });
		await expect(store.update({ setting: "b" })).resolves.toBe(true);
		expect(store.get()).toEqual({ cursor: "", setting: "b" });
	});

	test("a function patch can decline to write", async () => {
		const saved: S[] = [];
		const store = new StateStore<S>({ cursor: "", setting: "a" }, async (s) => {
			saved.push(s);
		});
		await expect(store.update(() => null)).resolves.toBe(false);
		expect(saved).toEqual([]);
	});

	test("replace swaps the state without saving", async () => {
		const saved: S[] = [];
		const store = new StateStore<S>({ cursor: "", setting: "a" }, async (s) => {
			saved.push(s);
		});
		await store.replace(() => ({ cursor: "synced", setting: "z" }));
		expect(store.get()).toEqual({ cursor: "synced", setting: "z" });
		expect(saved).toEqual([]);
	});
});
