/** How many " (n)" suffixes are tried before giving up on a name. */
const MAX_SUFFIX = 1000;

/**
 * Two paths with the same key may be the same file: macOS and Windows ignore
 * letter case, macOS also ignores how an accent is encoded, and Obsidian
 * normalizes new paths to NFC. Comparing this way is stricter than any one
 * file system needs, which only means an extra " (2)" in rare cases; a
 * difference this key misses is still caught by retrying on "already exists".
 */
export const pathKey = (path: string): string =>
	path.normalize("NFC").toLowerCase();

/**
 * Hands out new-note paths for one import run. Paths are compared by
 * `pathKey`, and a path handed out once is never handed out again in the same
 * run, so two items whose titles clean up to the same name get "Name.md" and
 * "Name (2).md" even while their files are being created concurrently, and a
 * new note never takes the name of an existing one that differs only in case.
 */
export class PathReserver {
	private reserved = new Set<string>();

	/** `isTaken` answers whether a path already exists in the vault. */
	constructor(private isTaken: (path: string) => boolean) {}

	reserve(folder: string, name: string): string {
		const base = `${folder}/${name}`;
		for (let n = 1; n <= MAX_SUFFIX; n++) {
			const candidate = n === 1 ? `${base}.md` : `${base} (${n}).md`;
			const key = pathKey(candidate);
			if (this.reserved.has(key) || this.isTaken(candidate)) {
				continue;
			}
			this.reserved.add(key);
			return candidate;
		}
		throw new Error(
			`No free file name for "${name}" in "${folder}" (tried ${MAX_SUFFIX} names).`,
		);
	}
}
