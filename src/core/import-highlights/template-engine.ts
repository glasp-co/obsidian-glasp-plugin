import Handlebars from "handlebars";

/**
 * The Handlebars instance every note is rendered with. It adds two helpers:
 * `eq`, a strict (`===`) comparison for conditions such as
 * `{{#if (eq highlightStyle "1")}}…{{/if}}`, and `lines`. Values are not
 * HTML-escaped (`noEscape`), as in 0.3.0.
 */
const handlebars = Handlebars.create();
handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

/**
 * A text's lines, each trimmed, without the empty ones, for
 * `{{#each (lines highlight)}}…{{/each}}`: Markdown such as `==…==` or `> `
 * applies to one line, so a highlight that spans several lines needs it on
 * each of them (and an empty line could otherwise end up as `====`, which
 * Markdown reads as a heading underline). Anything but a string has no lines.
 */
handlebars.registerHelper("lines", (text: unknown) =>
	typeof text === "string"
		? text
				.split(/\r\n|\r|\n/)
				.map((line) => line.trim())
				.filter((line) => line !== "")
		: [],
);

const compiled = new Map<string, ReturnType<typeof handlebars.compile>>();

export const renderTemplate = (template: string, data: unknown): string => {
	let render = compiled.get(template);
	if (!render) {
		render = handlebars.compile(template, { noEscape: true });
		compiled.set(template, render);
	}
	return render(data);
};
