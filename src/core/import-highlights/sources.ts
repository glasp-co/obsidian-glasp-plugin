import {
	BOOKMARK_TEMPLATE,
	HIGHLIGHT_TEMPLATE,
	KINDLE_HIGHLIGHT_TEMPLATE,
	SUMMARY_TEMPLATE,
} from "src/constant/template";
import {
	GlaspBookmarkAPI,
	GlaspHighlightAPI,
	GlaspKindleHighlightAPI,
	GlaspSummaryAPI,
} from "src/glasp-api";
import type { Bookmark } from "src/glasp-api/bookmark/type";
import type { UserHighlight } from "src/glasp-api/highlight/type";
import type { KindleBook } from "src/glasp-api/kindle-highlight/type";
import type { Summary } from "src/glasp-api/summary/type";
import type { HighlightImportSource } from "./import-highlights";
import { normalizeBookmark } from "./normalize-bookmark";
import { normalizeHighlight } from "./normalize-highlight";
import { normalizeKindleHighlight } from "./normalize-kindle-highlight";
import { normalizeSummary } from "./normalize-summary";

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

export const summarySource = (
	accessToken: string,
	folder: string,
	template?: string,
	includeContent?: boolean,
): HighlightImportSource<Summary> => {
	const api = new GlaspSummaryAPI({ accessToken });
	return {
		label: "summaries",
		folder,
		template: template || SUMMARY_TEMPLATE,
		lastUpdatedKey: "summaryLastUpdated",
		fetchPage: (args) => api.fetchSummaries(args),
		normalize: normalizeSummary,
		filename: (summary) =>
			summary.title?.trim() || summary.domain || summary.id,
		sourceType: "summary",
		...(includeContent
			? {
					hydrate: async (summary: Summary): Promise<Summary> => {
						try {
							const content = await api.fetchSummaryContent(summary.id);
							return { ...summary, content };
						} catch (_e) {
							// Best-effort: write the note without the full body.
							return summary;
						}
					},
				}
			: {}),
	};
};

export const bookmarkSource = (
	accessToken: string,
	folder: string,
	template?: string,
): HighlightImportSource<Bookmark> => {
	const api = new GlaspBookmarkAPI({ accessToken });
	return {
		label: "bookmarks",
		folder,
		template: template || BOOKMARK_TEMPLATE,
		lastUpdatedKey: "bookmarkLastUpdated",
		fetchPage: (args) => api.fetchBookmarks(args),
		normalize: normalizeBookmark,
		filename: (bookmark) =>
			bookmark.title?.trim() || bookmark.domain || bookmark.id,
		sourceType: "bookmark",
	};
};
