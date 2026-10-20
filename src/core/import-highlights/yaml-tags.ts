/**
 * `{{tags_yaml}}`: the tags as the inside of a YAML flow sequence
 * (`Tags: [{{tags_yaml}}]`). A tag that Obsidian's own YAML parser reads back
 * as exactly the same string is written bare, so for ordinary tags the output
 * is byte-identical to what `{{tags}}` renders (`foo,bar`) and upgrading
 * rewrites no note. Any other tag is double-quoted, so a comma, bracket, quote
 * or `#` in a tag can no longer split it, end the list early or invalidate the
 * frontmatter (an invalid frontmatter hides the note's URL from
 * de-duplication).
 */

export type YamlParse = (text: string) => unknown;

let obsidianParse: YamlParse | undefined;
const verdicts = new Map<string, boolean>();

/**
 * Called once at load with Obsidian's `parseYaml`, which then decides which
 * tags stay bare. Without it (unit tests) the rules below decide.
 */
export const useYamlParser = (parse: YamlParse | undefined): void => {
	obsidianParse = parse;
	verdicts.clear();
};

/** Scalars YAML would read as something other than this string. */
const NON_STRING_SCALARS: RegExp[] = [
	/^(?:~|null|Null|NULL)$/,
	/^(?:true|True|TRUE|false|False|FALSE)$/,
	// YAML 1.1 booleans, still honoured by some parsers.
	/^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/,
	/^[-+]?[0-9][0-9_]*$/,
	/^[-+]?0o[0-7_]+$/,
	/^[-+]?0x[0-9a-fA-F_]+$/,
	/^[-+]?0b[01_]+$/,
	/^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*(?:[eE][-+]?[0-9]+)?$/,
	/^[-+]?[0-9][0-9_]*[eE][-+]?[0-9]+$/,
	/^[-+]?\.(?:inf|Inf|INF)$/,
	/^\.(?:nan|NaN|NAN)$/,
	// Timestamps (read as dates by YAML 1.1 parsers).
	/^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}(?:[Tt].*)?$/,
	// Merge and value keys.
	/^(?:<<|=)$/,
];

/**
 * Whitespace, the flow indicators `, [ ] { }`, and `:` (a key marker in a
 * flow sequence) are never safe in a bare tag.
 */
const UNSAFE_ANYWHERE = /[\s,[\]{}:]/;

/**
 * Code points YAML does not allow unescaped: C0 and C1 controls, DEL, line
 * and paragraph separators, BOM, and lone surrogates (iterating a string by
 * code point yields a surrogate only when it is unpaired, so emoji pass).
 */
const isYamlUnprintable = (codePoint: number): boolean =>
	codePoint < 0x20 ||
	(codePoint >= 0x7f && codePoint <= 0x9f) ||
	codePoint === 0x2028 ||
	codePoint === 0x2029 ||
	codePoint === 0xfeff ||
	(codePoint >= 0xd800 && codePoint <= 0xdfff);

const hasUnprintable = (value: string): boolean => {
	for (const ch of value) {
		if (isYamlUnprintable(ch.codePointAt(0) ?? 0)) return true;
	}
	return false;
};

/** Characters that start something other than a plain scalar. */
const UNSAFE_FIRST = /^[#&*!|>'"%@`]/;

/** `-` and `?` may start a plain scalar only when another character follows. */
const INDICATOR_NEEDING_NEXT = /^[-?]/;

/** The fallback when no parser is available: conservative rules. */
export const isBareByRules = (tag: string): boolean => {
	if (tag === "") return false;
	if (UNSAFE_ANYWHERE.test(tag) || hasUnprintable(tag)) return false;
	if (UNSAFE_FIRST.test(tag)) return false;
	if (INDICATOR_NEEDING_NEXT.test(tag) && tag.length === 1) return false;
	if (NON_STRING_SCALARS.some((re) => re.test(tag))) return false;
	return true;
};

/** Does `parse` read `Tags: [tag]` back as exactly `[tag]`? */
export const parsesBackBare = (tag: string, parse: YamlParse): boolean => {
	try {
		const parsed = (parse(`Tags: [${tag}]`) as { Tags?: unknown } | null)?.Tags;
		return Array.isArray(parsed) && parsed.length === 1 && parsed[0] === tag;
	} catch {
		return false;
	}
};

export const isBareYamlTag = (
	tag: string,
	parse: YamlParse | undefined = obsidianParse,
): boolean => {
	// Unprintable characters are invalid YAML whatever a parser tolerates.
	if (tag === "" || hasUnprintable(tag)) return false;
	if (!parse) return isBareByRules(tag);
	if (parse === obsidianParse) {
		let verdict = verdicts.get(tag);
		if (verdict === undefined) {
			verdict = parsesBackBare(tag, parse);
			verdicts.set(tag, verdict);
		}
		return verdict;
	}
	return parsesBackBare(tag, parse);
};

/**
 * A YAML double-quoted scalar: JSON's escapes, plus a `\u` escape for the
 * code points JSON leaves raw that YAML does not allow (JSON already escapes
 * C0 controls and lone surrogates).
 */
export const toYamlDoubleQuoted = (value: string): string =>
	Array.from(JSON.stringify(value), (ch) => {
		const codePoint = ch.codePointAt(0) ?? 0;
		return codePoint >= 0x7f && isYamlUnprintable(codePoint)
			? `\\u${codePoint.toString(16).padStart(4, "0")}`
			: ch;
	}).join("");

export const toYamlFlowTags = (
	tags: string[],
	parse: YamlParse | undefined = obsidianParse,
): string =>
	tags
		.filter((tag) => tag !== "")
		.map((tag) => (isBareYamlTag(tag, parse) ? tag : toYamlDoubleQuoted(tag)))
		.join(",");
