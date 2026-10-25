/**
 * Builders for Obsidian "Bases" database views (a core plugin since Obsidian
 * 1.9). Each Glasp source (web / Kindle highlights, summaries, bookmarks) gets
 * its own `.base` file, and they are all collected in one dedicated folder
 * (`Glasp Bases/`) instead of being mixed in with the imported notes — so the
 * views are easy to find. A `.base`'s `file.inFolder(...)` filter points at the
 * source's note folder, so the view works regardless of where the `.base` file
 * itself lives. The source folder is also returned on the spec so the caller
 * can rewrite a base whose folder setting later changed.
 *
 * Column expressions are kept to single-word note properties (`note.Tags`, …)
 * and built-in file properties (`file.name`, `file.mtime`) to avoid the
 * space-containing keys (`Last updated`) some templates use, which are awkward
 * to reference. The cards view is limited to the minimally-documented keys
 * (type/name/image) to stay valid across Bases versions; the table view uses
 * the officially documented `order` + `note.<Property>` syntax.
 *
 * @see https://obsidian.md/help/bases/syntax
 */

/** The folder that holds every generated `.base` view, unless one is chosen. */
export const GLASP_BASES_FOLDER = "Glasp Bases";

/**
 * The saved "Bases folder" as a vault path: the default when it is not set,
 * blank, or not text (hand-edited, or from a newer version). Spaces are kept:
 * a folder name may start or end with one.
 */
export const resolveBasesFolder = (value: unknown): string => {
	if (typeof value !== "string" || !value.trim()) {
		return GLASP_BASES_FOLDER;
	}
	// As Obsidian's normalizePath, which the vault's own paths have been
	// through: one slash between names, plain spaces, composed accents.
	const path = value
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.replace(/[\u00a0\u202f]/g, " ")
		.normalize("NFC");
	return path.trim() ? path : GLASP_BASES_FOLDER;
};

export type BaseSpec = { filename: string; folder: string; content: string };

/** YAML single-quoted scalar (doubles embedded single quotes). Used so a folder
 * name containing ` #` cannot start a YAML comment and truncate the filter. */
const yamlSingleQuoted = (value: string): string =>
	`'${value.replace(/'/g, "''")}'`;

const buildBase = ({
	folder,
	order,
	image,
}: {
	folder: string;
	order: string[];
	image?: string;
}): string => {
	const orderLines = order.map((o) => `      - ${o}`).join("\n");
	// The whole expression is a single-quoted YAML scalar; the folder itself is
	// JSON-escaped inside the expression's double quotes.
	const inFolder = yamlSingleQuoted(`file.inFolder(${JSON.stringify(folder)})`);
	let content = `filters:
  and:
    - ${inFolder}
    - 'file.ext == "md"'
views:
  - type: table
    name: Table
    order:
${orderLines}
`;
	if (image) {
		content += `  - type: cards
    name: Cards
    image: ${image}
`;
	}
	return content;
};

export const webHighlightBase = (folder: string): BaseSpec => ({
	filename: "Glasp Web Highlights.base",
	folder,
	content: buildBase({
		folder,
		order: ["file.name", "note.Tags", "note.Thumbnail", "file.mtime"],
		image: "note.Thumbnail",
	}),
});

export const kindleHighlightBase = (folder: string): BaseSpec => ({
	filename: "Glasp Kindle Highlights.base",
	folder,
	content: buildBase({
		folder,
		order: ["file.name", "note.Author", "note.Tags", "note.Thumbnail"],
		image: "note.Thumbnail",
	}),
});

export const summaryBase = (folder: string): BaseSpec => ({
	filename: "Glasp Summaries.base",
	folder,
	content: buildBase({
		folder,
		order: ["file.name", "note.Domain", "note.Created", "note.Updated"],
		image: "note.Thumbnail",
	}),
});

export const bookmarkBase = (folder: string): BaseSpec => ({
	filename: "Glasp Bookmarks.base",
	folder,
	content: buildBase({
		folder,
		order: [
			"file.name",
			"note.Domain",
			"note.Category",
			"note.Created",
			"note.Updated",
		],
		image: "note.Thumbnail",
	}),
});

const BUILDERS = [
	webHighlightBase,
	kindleHighlightBase,
	summaryBase,
	bookmarkBase,
];

/** The name of every view the plugin writes. */
export const BASE_FILENAMES: readonly string[] = BUILDERS.map(
	(build) => build("").filename,
);

/**
 * A view whose source folder changed from `previous` to `next`, with only its
 * folder filter changed, so whatever else the user (or Obsidian, which writes
 * the whole file again when a column is resized or the sort is changed) put
 * in it stays. The filter is the list item `file.inFolder("<previous>")`, in
 * any of YAML's three ways of writing it, as a whole item; it is written back
 * as the plugin writes it. Null when there is no such item, or more than one
 * (a file of the user's own, or a filter they changed): it is left as it is.
 * The edit is made only when `parse` (Obsidian's parseYaml) reads it back as
 * exactly that one string changed, so a line that only looks like the item
 * (inside a longer text, or continued on the next line) is never touched.
 */
export const retargetBase = (
	content: string,
	previous: string,
	next: string,
	parse: (text: string) => unknown,
): string | null => {
	const before = `file.inFolder(${JSON.stringify(previous)})`;
	const forms = new Set([
		before,
		yamlSingleQuoted(before),
		JSON.stringify(before),
	]);
	const lines = content.split("\n");
	let found = -1;
	for (const [i, line] of lines.entries()) {
		const item = /^(\s*-\s+)(.*?)(\r?)$/.exec(line);
		if (item && forms.has(item[2])) {
			if (found >= 0) {
				return null;
			}
			found = i;
		}
	}
	if (found < 0) {
		return null;
	}
	const after = `file.inFolder(${JSON.stringify(next)})`;
	const [, indent, , cr] = /^(\s*-\s+)(.*?)(\r?)$/.exec(lines[found]) ?? [];
	lines[found] = `${indent}${yamlSingleQuoted(after)}${cr}`;
	const edited = lines.join("\n");
	try {
		const meant = replaceString(parse(content), before, after);
		return sameValue(parse(edited), meant) ? edited : null;
	} catch {
		return null;
	}
};

/** `value` with every string equal to `from` replaced by `to`. */
const replaceString = (value: unknown, from: string, to: string): unknown => {
	if (value === from) return to;
	if (Array.isArray(value)) return value.map((v) => replaceString(v, from, to));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, replaceString(v, from, to)]),
		);
	}
	return value;
};

/** The same data, as parsed YAML compares. */
const sameValue = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b);
