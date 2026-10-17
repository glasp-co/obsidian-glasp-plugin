import { type BaseSpec, GLASP_BASES_FOLDER } from "./bases";

/** The "Create Bases views" setting as an import saw it when it started. */
export type BasesSetting = { enabled: boolean; revision: number };

export type BasesSyncDeps = {
	ensureFolder: (path: string) => Promise<void>;
	createFileIfAbsent: (path: string, content: string) => Promise<boolean>;
	writeFile: (path: string, content: string) => Promise<void>;
	/** The current `basesCreated` record. */
	recorded: () => Record<string, string>;
	/** The setting now (turning it off bumps `revision` at once). */
	live: () => BasesSetting;
	/**
	 * Merge `records` into `basesCreated` inside the serialized state writer,
	 * only if the setting still matches `captured` when the write runs.
	 */
	commit: (
		records: Record<string, string>,
		captured: BasesSetting,
	) => Promise<boolean>;
};

/**
 * Create one `.base` database view per enabled source, all collected in the
 * `Glasp Bases` folder. As in 0.3.0, a view is created once (and not
 * resurrected after the user deletes it) and rewritten when its source folder
 * setting changed. Two differences: the folder is created only when a view is
 * about to be written, so a deleted `Glasp Bases` folder stays deleted once
 * every view is recorded; and nothing is started once "Create Bases views" is
 * off, or was turned off or on after this import began (a write already in
 * flight may finish, but its record is not saved).
 */
export const syncBases = async (
	specs: BaseSpec[],
	captured: BasesSetting,
	deps: BasesSyncDeps,
): Promise<void> => {
	const allowed = (): boolean => {
		const live = deps.live();
		return (
			captured.enabled && live.enabled && live.revision === captured.revision
		);
	};

	if (!allowed()) {
		return;
	}
	const recorded = deps.recorded();
	const pending = specs.filter(
		(spec) => recorded[spec.filename] !== spec.folder,
	);
	if (!pending.length || !allowed()) {
		return;
	}

	try {
		await deps.ensureFolder(GLASP_BASES_FOLDER);
	} catch (_e) {
		// Can't create the folder; skip (non-fatal — notes still import).
		return;
	}

	const written: Record<string, string> = {};
	for (const spec of pending) {
		if (!allowed()) {
			break;
		}
		const path = `${GLASP_BASES_FOLDER}/${spec.filename}`;
		try {
			if (recorded[spec.filename] === undefined) {
				// First time: don't clobber a pre-existing (possibly user-edited) file.
				await deps.createFileIfAbsent(path, spec.content);
			} else {
				// Folder setting changed: rewrite so the filter points at it.
				await deps.writeFile(path, spec.content);
			}
			written[spec.filename] = spec.folder;
		} catch (_e) {
			// Non-fatal: the notes still import without this database view.
		}
	}

	if (Object.keys(written).length) {
		await deps.commit(written, captured);
	}
};
