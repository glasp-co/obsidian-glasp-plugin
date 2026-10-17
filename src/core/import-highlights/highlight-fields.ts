/**
 * `highlightStyle` for each colour, as a string: "1" pink, "2" yellow,
 * "3" green, "4" blue (the order the colours were asked for in). "5" is kept
 * for orange, which the API does not send yet (a Kindle orange highlight
 * arrives as pink). A colour not listed gives "".
 */
export const HIGHLIGHT_STYLE: ReadonlyMap<string, string> = new Map([
	["pink", "1"],
	["yellow", "2"],
	["green", "3"],
	["blue", "4"],
	["orange", "5"],
]);

export const highlightStyleOf = (color: string | null | undefined): string =>
	HIGHLIGHT_STYLE.get(color ?? "") ?? "";

/** The tag list both highlight templates render, as in 0.3.0. */
export const normalizeTags = (tags: string[] | null | undefined): string[] =>
	(tags ?? []).map((tag) =>
		String(tag ?? "")
			.trim()
			.replace(/\s+/g, "-"),
	);
