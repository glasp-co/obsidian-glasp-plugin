/**
 * What went wrong in the last sync, kept so Settings → Glasp → "Last sync
 * errors" can list it. Kept apart from the sync cursors on purpose: nothing
 * here is ever read back to decide what to import.
 */

/**
 * Item stages: `hydrate` (fetching extra data, e.g. a summary's full page
 * content), `normalize` (reading the item), `render` (applying the template),
 * `create` / `update` (writing the note). Source stages, which carry no item
 * fields: `folder` (the output folder does not exist), `fetch` (the request to
 * Glasp failed), `cursor` (the sync position could not be saved),
 * `unexpected` (anything else that stopped the source).
 */
export type FailureStage =
	| "hydrate"
	| "normalize"
	| "render"
	| "create"
	| "update"
	| "folder"
	| "fetch"
	| "cursor"
	| "unexpected";

export type SyncFailure = {
	source: string;
	stage: FailureStage;
	message: string;
	title?: string;
	url?: string;
	path?: string;
};

export type SourceCounts = {
	source: string;
	fetched: number;
	created: number;
	updated: number;
	/** Fetched again but byte-identical to the note on disk, so not written. */
	unchanged: number;
	failed: number;
};

export type SyncReport = {
	schemaVersion: 1;
	finishedAt: string;
	sources: SourceCounts[];
	/** Every failure of the sync, also when `failures` holds fewer rows. */
	totalFailures: number;
	failures: SyncFailure[];
	/** True when rows were dropped or a text field was cut. */
	truncated: boolean;
};

export const REPORT_MAX_ROWS = 500;
export const REPORT_MAX_FIELD_CHARS = 300;
export const REPORT_MAX_BYTES = 100 * 1024;

const byteLength = (value: string): number =>
	new TextEncoder().encode(value).length;

/** The report's size as it sits in data.json (Obsidian indents by 2). */
const storedBytes = (report: SyncReport): number =>
	byteLength(JSON.stringify({ lastSyncReport: report }, null, 2));

export const buildSyncReport = ({
	finishedAt,
	sources,
	failures,
}: {
	finishedAt: string;
	sources: SourceCounts[];
	failures: SyncFailure[];
}): SyncReport => {
	let truncated = failures.length > REPORT_MAX_ROWS;

	const cut = (value: string | undefined): string | undefined => {
		if (value === undefined) return undefined;
		const chars = Array.from(value);
		if (chars.length <= REPORT_MAX_FIELD_CHARS) return value;
		truncated = true;
		return chars.slice(0, REPORT_MAX_FIELD_CHARS).join("");
	};

	const rows = failures.slice(0, REPORT_MAX_ROWS).map((failure) => {
		const row: SyncFailure = {
			source: cut(failure.source) ?? "",
			stage: failure.stage,
			message: cut(failure.message) ?? "",
		};
		const title = cut(failure.title);
		const url = cut(failure.url);
		const path = cut(failure.path);
		if (title !== undefined) row.title = title;
		if (url !== undefined) row.url = url;
		if (path !== undefined) row.path = path;
		return row;
	});

	const report: SyncReport = {
		schemaVersion: 1,
		finishedAt,
		sources,
		totalFailures: failures.length,
		failures: rows,
		truncated,
	};

	// Keep data.json small: keep as many leading rows as fit (binary search).
	if (storedBytes(report) > REPORT_MAX_BYTES) {
		let fits = 0;
		let fails = rows.length;
		while (fails - fits > 1) {
			const mid = Math.floor((fits + fails) / 2);
			if (
				storedBytes({ ...report, failures: rows.slice(0, mid) }) <=
				REPORT_MAX_BYTES
			) {
				fits = mid;
			} else {
				fails = mid;
			}
		}
		report.failures = rows.slice(0, fits);
		report.truncated = true;
	}
	return report;
};

/** Accept a stored report only in the shape this version writes. */
export const readStoredReport = (value: unknown): SyncReport | null => {
	if (
		value &&
		typeof value === "object" &&
		(value as { schemaVersion?: unknown }).schemaVersion === 1 &&
		Array.isArray((value as { failures?: unknown }).failures) &&
		Array.isArray((value as { sources?: unknown }).sources)
	) {
		return value as SyncReport;
	}
	return null;
};
