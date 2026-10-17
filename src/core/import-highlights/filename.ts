/**
 * File-name rules for NEW notes. Existing notes keep their names: the importer
 * finds them by the `URL` in their frontmatter, never by their file name.
 */

/** A new note's name (without " (n)" or ".md") never exceeds this many UTF-8 bytes. */
export const NOTE_NAME_MAX_BYTES = 120;

/** Used for one retry when the file system reports the name as too long. */
export const NOTE_NAME_SHORT_BYTES = 60;

/**
 * Windows reserves these names for devices, with or without an extension
 * (COM and LPT with 0-9 and the superscript digits 1-3).
 */
const WINDOWS_DEVICE_NAME =
	/^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i;

const utf8Bytes = (codePoint: number): number => {
	if (codePoint < 0x80) return 1;
	if (codePoint < 0x800) return 2;
	if (codePoint < 0x10000) return 3;
	return 4;
};

const isLoneSurrogate = (ch: string): boolean => {
	const code = ch.charCodeAt(0);
	return ch.length === 1 && code >= 0xd800 && code <= 0xdfff;
};

/** Cut `value` to at most `maxBytes` UTF-8 bytes without splitting a code point. */
export const truncateUtf8 = (value: string, maxBytes: number): string => {
	let bytes = 0;
	let out = "";
	for (const ch of value) {
		const size = utf8Bytes(ch.codePointAt(0) ?? 0);
		if (bytes + size > maxBytes) {
			break;
		}
		bytes += size;
		out += ch;
	}
	return out;
};

export const utf8Length = (value: string): number => {
	let bytes = 0;
	for (const ch of value) {
		bytes += utf8Bytes(ch.codePointAt(0) ?? 0);
	}
	return bytes;
};

/** Prefix "_" when the part before the first dot is a Windows device name. */
const avoidDeviceName = (name: string): string => {
	const stem = name.split(".")[0].trimEnd();
	return WINDOWS_DEVICE_NAME.test(stem) ? `_${name}` : name;
};

const trimTrailingDotsAndSpaces = (name: string): string =>
	name.replace(/[. ]+$/, "");

/**
 * Turn an item title into a file name that every platform Obsidian runs on
 * accepts: no path, link or wildcard characters (`[ ] | : \ / # ^ " * ? < >`),
 * no control characters or lone surrogates, no leading dot, no trailing dot or
 * space, no Windows device name, and at most `maxBytes` UTF-8 bytes (cut on a
 * code-point boundary). Accents are composed (NFC), as Obsidian stores paths.
 * An empty result becomes "Untitled".
 */
export const escapeFilename = (
	filename: string,
	maxBytes: number = NOTE_NAME_MAX_BYTES,
): string => {
	// Replace control characters (code point < 32, or DEL 127) with a space
	// instead of matching them with a regex literal, so no raw control byte
	// ever appears in this source file. Lone surrogates cannot be encoded in a
	// file name at all, so they are dropped.
	const withoutControls = Array.from(
		String(filename ?? "").normalize("NFC"),
		(ch) => {
			if (isLoneSurrogate(ch)) return "";
			const code = ch.charCodeAt(0);
			return code < 32 || code === 127 ? " " : ch;
		},
	).join("");

	let name = withoutControls
		.replace(/[[\]|:\\/#^"*?<>]/g, "")
		.replace(/\s+/g, " ")
		// A leading dot would create a hidden file Obsidian never shows (e.g.
		// ".md", or ". .NET" once "|" is removed), so dots and spaces go together.
		.replace(/^[.\s]+/, "")
		.trim();

	name = avoidDeviceName(name);
	name = trimTrailingDotsAndSpaces(truncateUtf8(name, maxBytes));
	name = avoidDeviceName(name);
	if (utf8Length(name) > maxBytes) {
		// Only reachable when the second device-name check added "_".
		name = trimTrailingDotsAndSpaces(truncateUtf8(name, maxBytes));
	}

	// Never return an empty name (would otherwise yield "folder/.md").
	return name || "Untitled";
};
