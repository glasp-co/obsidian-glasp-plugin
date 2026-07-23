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

/** Top-level folder that holds every generated `.base` view. */
export const GLASP_BASES_FOLDER = "Glasp Bases";

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
