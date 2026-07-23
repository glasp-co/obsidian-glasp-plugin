/**
 * Serialize an arbitrary string as a YAML-safe scalar for use as a frontmatter
 * value. `JSON.stringify` produces a valid YAML double-quoted flow scalar for
 * any input: it quotes the value, escapes embedded quotes/backslashes and turns
 * newlines/control characters into `\n`-style escapes (which YAML interprets
 * inside double quotes). This prevents a bookmark/summary title, description or
 * URL from breaking the YAML frontmatter (or injecting extra properties), which
 * would otherwise corrupt the note and the Bases database view that reads it.
 */
export const toYaml = (value: string | null | undefined): string =>
	JSON.stringify(String(value ?? ""));

/**
 * Flatten a string for safe use inside an inline Markdown context (e.g. the
 * text of a `[title](url)` link): strip newlines and the `[]` characters that
 * would break the link syntax.
 */
export const toInline = (value: string | null | undefined): string =>
	String(value ?? "")
		.replace(/[\r\n]+/g, " ")
		.replace(/[[\]]/g, "")
		.trim();

/**
 * Emit an ISO-8601 timestamp raw (unquoted) so Bases infers it as a sortable
 * date column. Any value that is not a plain ISO datetime is dropped to an
 * empty string, so a malformed/multi-line value can never break the YAML
 * frontmatter even though this field is not quoted.
 */
export const toIsoDate = (value: string | null | undefined): string =>
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
		value ?? "",
	)
		? (value as string)
		: "";
