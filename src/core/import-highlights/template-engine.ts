import Handlebars from "handlebars";

/**
 * The Handlebars instance every note is rendered with. It adds one helper,
 * `eq`, a strict (`===`) comparison for conditions such as
 * `{{#if (eq highlightStyle "1")}}…{{/if}}`. Values are not HTML-escaped
 * (`noEscape`), as in 0.3.0.
 */
const handlebars = Handlebars.create();
handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

const compiled = new Map<string, ReturnType<typeof handlebars.compile>>();

export const renderTemplate = (template: string, data: unknown): string => {
	let render = compiled.get(template);
	if (!render) {
		render = handlebars.compile(template, { noEscape: true });
		compiled.set(template, render);
	}
	return render(data);
};
