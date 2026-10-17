import { describe, expect, test } from "vitest";
import { CoalescingRunner } from "./coalescing-runner";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("CoalescingRunner", () => {
	test("triggers during a pass coalesce into exactly one more pass", async () => {
		const releases: (() => void)[] = [];
		let passes = 0;
		const runner = new CoalescingRunner(async () => {
			passes++;
			await new Promise<void>((resolve) => releases.push(resolve));
		});

		const first = runner.trigger();
		await tick();
		expect(passes).toBe(1);
		// Three triggers while the first pass runs (interval, ribbon, command).
		await Promise.all([runner.trigger(), runner.trigger(), runner.trigger()]);
		expect(passes).toBe(1);

		releases.shift()?.();
		await tick();
		expect(passes).toBe(2);
		releases.shift()?.();
		await first;
		expect(passes).toBe(2);
		expect(runner.busy).toBe(false);
	});

	test("a trigger during the follow-up pass gets another pass", async () => {
		const releases: (() => void)[] = [];
		let passes = 0;
		const runner = new CoalescingRunner(async () => {
			passes++;
			await new Promise<void>((resolve) => releases.push(resolve));
		});

		const first = runner.trigger();
		await tick();
		void runner.trigger();
		releases.shift()?.();
		await tick();
		expect(passes).toBe(2);
		void runner.trigger(); // during the follow-up
		releases.shift()?.();
		await tick();
		expect(passes).toBe(3);
		releases.shift()?.();
		await first;
		expect(passes).toBe(3);
	});

	test("a failing pass does not stop a requested rerun", async () => {
		let passes = 0;
		const errors: unknown[] = [];
		let release!: () => void;
		const runner = new CoalescingRunner(
			async () => {
				passes++;
				if (passes === 1) {
					await new Promise<void>((resolve) => {
						release = resolve;
					});
					throw new Error("boom");
				}
			},
			(e) => errors.push(e),
		);
		const first = runner.trigger();
		await tick();
		void runner.trigger();
		release();
		await first;
		expect(passes).toBe(2);
		expect(errors).toHaveLength(1);
	});
});
