/**
 * Runs one import at a time. A trigger that arrives while an import is running
 * (startup, the interval, the ribbon icon or the command) does not start a
 * second, overlapping import: it asks for one more pass, which starts when the
 * current pass ends. Any number of triggers during one pass ask for exactly one
 * more pass, and a trigger during that pass asks for another.
 */
export class CoalescingRunner {
	private running = false;
	private rerunRequested = false;

	constructor(
		private task: () => Promise<void>,
		private onError: (error: unknown) => void = () => {},
	) {}

	get busy(): boolean {
		return this.running;
	}

	/**
	 * Starts an import and resolves when it and every pass asked for during it
	 * have finished. While an import is running, only asks for one more pass and
	 * resolves at once.
	 */
	async trigger(): Promise<void> {
		if (this.running) {
			this.rerunRequested = true;
			return;
		}
		this.running = true;
		try {
			do {
				this.rerunRequested = false;
				try {
					await this.task();
				} catch (error) {
					this.onError(error);
				}
			} while (this.rerunRequested);
		} finally {
			this.running = false;
		}
	}
}
