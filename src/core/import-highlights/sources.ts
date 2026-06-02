import {
	HIGHLIGHT_TEMPLATE,
	KINDLE_HIGHLIGHT_TEMPLATE,
} from "src/constant/template";
import { GlaspHighlightAPI, GlaspKindleHighlightAPI } from "src/glasp-api";
import type { UserHighlight } from "src/glasp-api/highlight/type";
import type { KindleBook } from "src/glasp-api/kindle-highlight/type";
import type { HighlightImportSource } from "./import-highlights";
import { normalizeHighlight } from "./normalize-highlight";
import { normalizeKindleHighlight } from "./normalize-kindle-highlight";

export const webHighlightSource = (
	accessToken: string,
	folder: string,
	template?: string,
): HighlightImportSource<UserHighlight> => {
	const api = new GlaspHighlightAPI({ accessToken });
	return {
		label: "web highlights",
		folder,
		template: template || HIGHLIGHT_TEMPLATE,
		lastUpdatedKey: "lastUpdated",
		fetchPage: (args) => api.fetchHighlights(args),
		normalize: normalizeHighlight,
	};
};

export const kindleHighlightSource = (
	accessToken: string,
	folder: string,
	template?: string,
): HighlightImportSource<KindleBook> => {
	const api = new GlaspKindleHighlightAPI({ accessToken });
	return {
		label: "Kindle highlights",
		folder,
		template: template || KINDLE_HIGHLIGHT_TEMPLATE,
		lastUpdatedKey: "kindleLastUpdated",
		fetchPage: (args) => api.fetchKindleHighlights(args),
		normalize: normalizeKindleHighlight,
	};
};
