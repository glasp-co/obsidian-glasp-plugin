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
): Partial<StorageData> | null =>
	generationNow === read.generation && state[key] === read.value
		? ({ [key]: value } as Partial<StorageData>)
		: null;

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
