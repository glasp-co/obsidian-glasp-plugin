import { type BaseSpec, retargetBase } from "./bases";

/** The "Create Bases views" setting as an import saw it when it started. */
export type BasesSetting = { enabled: boolean; revision: number };

/** The setting plus the "Bases folder" the import started with. */
export type BasesRun = BasesSetting & { folder: string };

export type BasesSyncDeps = {
	ensureFolder: (path: string) => Promise<void>;
	createFileIfAbsent: (path: string, content: string) => Promise<boolean>;
	writeFile: (path: string, content: string) => Promise<void>;
	/** The file's text, or null when there is no file at the path. */
	readFile: (path: string) => Promise<string | null>;
	/** A view whose folder filter could not be updated was left as it is. */
	leftAsIs: (path: string, previous: string, next: string) => void;
	/** Obsidian's parseYaml, to check an edit reads back as meant. */
	parseYaml: (text: string) => unknown;
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
 * "Bases folder" (`Glasp Bases` unless another is chosen). As in 0.3.0, a view
 * is created once (and not resurrected after the user deletes it) and
 * rewritten when its source folder setting changed. Two differences: the
 * folder is created only when a view is about to be written, so a deleted
 * Bases folder stays deleted once every view is recorded; and nothing is
 * started once "Create Bases views" is off, or either setting was changed
 * after this import began (a write already in flight may finish, but its
 * record is not saved).
 */
export const syncBases = async (
	specs: BaseSpec[],
	captured: BasesRun,
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
		await deps.ensureFolder(captured.folder);
	} catch {
		// Can't create the folder; skip (non-fatal — notes still import).
		return;
	}

	const written: Record<string, string> = {};
	for (const spec of pending) {
		if (!allowed()) {
			break;
		}
		const path = `${captured.folder}/${spec.filename}`;
		try {
			const previous = recorded[spec.filename];
			if (previous === undefined) {
				// First time: don't clobber a pre-existing (possibly user-edited) file.
				await deps.createFileIfAbsent(path, spec.content);
			} else {
				// Source folder changed: point the view's folder filter at it,
				// keeping everything else in the file. A file without that filter
				// (one of the user's own, or a filter they changed) is left as it is.
				const current = await deps.readFile(path);
				if (current === null) {
					await deps.createFileIfAbsent(path, spec.content);
				} else {
					const retargeted = retargetBase(
						current,
						previous,
						spec.folder,
						deps.parseYaml,
					);
					if (retargeted === null) {
						deps.leftAsIs(path, previous, spec.folder);
					} else if (retargeted !== current) {
						await deps.writeFile(path, retargeted);
					}
				}
			}
			written[spec.filename] = spec.folder;
		} catch {
			// Non-fatal: the notes still import without this database view.
		}
	}

	if (Object.keys(written).length) {
		await deps.commit(written, captured);
	}
};

export type BasesMoveDeps = {
	/** A file (not a folder) is at this path. */
	isFile: (path: string) => boolean;
	/** A file or folder is at this path. */
	exists: (path: string) => boolean;
	ensureFolder: (path: string) => Promise<void>;
	/** Move a file, updating links to it. */
	move: (from: string, to: string) => Promise<void>;
	isEmptyFolder: (path: string) => boolean;
	/** Put a folder in the trash, as the user's deletion setting says. */
	trashFolder: (path: string) => Promise<void>;
};

/**
 * Move the views (`filenames`: the names the plugin writes) from the old
 * Bases folder to the new one, after the user chose another folder. A file
 * already at the destination is never overwritten: that view stays where it
 * was. A view no longer in the old folder (deleted, or moved by the user) is
 * left alone. `trashFolder` is asked to remove the old folder only when this
 * move left it empty; it decides whether that folder may go.
 */
export const moveBasesViews = async (
	filenames: string[],
	from: string,
	to: string,
	deps: BasesMoveDeps,
): Promise<{ moved: string[]; left: string[] }> => {
	const moved: string[] = [];
	const left: string[] = [];
	const present = filenames.filter((name) => deps.isFile(`${from}/${name}`));
	if (from === to || !present.length) {
		return { moved, left };
	}
	try {
		// Once: a destination the user renames away while a move waits (for
		// Obsidian's question about links) is not created again under its old
		// name; the views not moved yet stay where they are.
		await deps.ensureFolder(to);
	} catch {
		return { moved, left: present };
	}
	for (const filename of present) {
		const target = `${to}/${filename}`;
		if (deps.exists(target)) {
			left.push(filename);
			continue;
		}
		try {
			await deps.move(`${from}/${filename}`, target);
			moved.push(filename);
		} catch {
			// Non-fatal: the view still works where it is.
			left.push(filename);
		}
	}
	if (moved.length && deps.isEmptyFolder(from)) {
		try {
			await deps.trashFolder(from);
		} catch {
			// An empty folder left behind is harmless.
		}
	}
	return { moved, left };
};
