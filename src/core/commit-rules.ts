import type { StorageData } from "src/types/storage";
import type { BasesSetting } from "./import-highlights/bases-sync";
import type {
	CursorRead,
	LastUpdatedKey,
} from "./import-highlights/import-highlights";

/**
 * The patch that commits a source's cursor, evaluated inside the state writer
 * when the write runs, or null to write nothing. A run commits only if neither
 * the generation (bumped by a reset) nor the saved cursor changed since it
 * read them, so a reset saved, queued or still being saved always wins.
 */
export const cursorCommitPatch = (
	state: Readonly<StorageData>,
	key: LastUpdatedKey,
	value: string,
	read: CursorRead,
	generationNow: number,
	written: Record<string, string>,
	shown: Record<string, string>,
): Partial<StorageData> | null => {
	if (generationNow !== read.generation || state[key] !== read.value) {
		return null;
	}
	return {
		[key]: value,
		writtenAhead: withEntries(state.writtenAhead, key, written),
		shownAhead: withEntries(state.shownAhead, key, shown),
	} as Partial<StorageData>;
};

type AheadMap = NonNullable<StorageData["writtenAhead"]>;

/** `map` with `key`'s entries replaced; left out of data.json when empty. */
const withEntries = (
	map: AheadMap | undefined,
	key: LastUpdatedKey,
	entries: Record<string, string>,
): AheadMap | undefined => {
	const next = { ...(map ?? {}) };
	if (Object.keys(entries).length) {
		next[key] = entries;
	} else {
		delete next[key];
	}
	return Object.keys(next).length ? next : undefined;
};

/**
 * The patch that records Bases views written by a run, or null when "Create
 * Bases views" was turned off, or changed in any way, since the run began.
 */
export const basesCommitPatch = (
	state: Readonly<StorageData>,
	records: Record<string, string>,
	captured: BasesSetting,
	live: BasesSetting,
): Partial<StorageData> | null =>
	live.enabled && captured.enabled && live.revision === captured.revision
		? { basesCreated: { ...(state.basesCreated ?? {}), ...records } }
		: null;
