const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** A clock that does not jump when the user changes the system time. */
const monotonicNow = (): number =>
	typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Hands out request start times at least `intervalMs` apart, so a long run of
 * requests stays under the API's per-minute limit instead of being refused
 * part-way through. The first request never waits.
 */
export class RequestPacer {
	private nextStart = Number.NEGATIVE_INFINITY;

	constructor(
		private intervalMs: number,
		private now: () => number = monotonicNow,
		private wait: (ms: number) => Promise<void> = sleep,
	) {}

	async turn(): Promise<void> {
		const now = this.now();
		const start = Math.max(now, this.nextStart);
		this.nextStart = start + this.intervalMs;
		if (start > now) {
			await this.wait(start - now);
		}
	}
}
