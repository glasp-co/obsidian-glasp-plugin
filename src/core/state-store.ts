export type StatePatch<T> =
	| Partial<T>
	| ((state: Readonly<T>) => Partial<T> | null);

/**
 * The one authoritative copy of the plugin's saved state, and its one writer.
 *
 * Writes run one at a time, in the order they were asked for. Each merges its
 * patch into the state as it is when the write runs (a function patch is
 * evaluated then too, and may return null to write nothing), saves the result,
 * and only then makes it the current state. A rejected save leaves the
 * previous state in force and rejects that write's promise; later writes still
 * run, because each waits for the previous one to settle, not to succeed.
 *
 * So a settings change can no longer write back the cursor values it saw when
 * Settings was opened, and an import can no longer write back the settings it
 * saw when it started.
 */
export class StateStore<T extends object> {
	private state: T;
	private tail: Promise<unknown> = Promise.resolve();

	constructor(
		initial: T,
		private persist: (state: T) => Promise<void>,
	) {
		this.state = initial;
	}

	get(): Readonly<T> {
		return this.state;
	}

	/** Resolves true when the patch was saved, false when it chose to write nothing. */
	update(patch: StatePatch<T>): Promise<boolean> {
		const write = async (): Promise<boolean> => {
			const changes = typeof patch === "function" ? patch(this.state) : patch;
			if (changes === null) {
				return false;
			}
			const candidate = { ...this.state, ...changes };
			await this.persist(candidate);
			this.state = candidate;
			return true;
		};
		const result = this.tail.then(write, write);
		this.tail = result.catch(() => undefined);
		return result;
	}

	/**
	 * Replace the state without saving it (e.g. data.json changed on disk). Runs
	 * in the write queue, so `next` (which may read the file) sees no write land
	 * while it runs.
	 */
	replace(next: (state: Readonly<T>) => T | Promise<T>): Promise<void> {
		const apply = async (): Promise<void> => {
			this.state = await next(this.state);
		};
		const result = this.tail.then(apply, apply);
		this.tail = result.catch(() => undefined);
		return result;
	}
}
