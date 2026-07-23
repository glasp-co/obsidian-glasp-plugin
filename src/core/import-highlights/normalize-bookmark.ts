import type { Bookmark } from "src/glasp-api/bookmark/type";
import { toInline, toIsoDate, toYaml } from "./frontmatter";

/**
 * A bookmark carries no body text, so it maps to a thin, frontmatter-rich note.
 * The frontmatter is what the auto-generated "Glasp Bookmarks.base" database
 * view renders as a table/cards. String values are YAML-escaped; the ISO
 * timestamps are emitted raw so Bases infers them as dates (sortable columns).
 */
export const normalizeBookmark = (bookmark: Bookmark) => ({
	url: toYaml(bookmark.url),
	title: toYaml(bookmark.title),
	domain: toYaml(bookmark.domain),
	category: toYaml(bookmark.category),
	description: toYaml(bookmark.description),
	thumbnail_url: toYaml(bookmark.thumbnail_url),
	created_at: toIsoDate(bookmark.created_at),
	updated_at: toIsoDate(bookmark.updated_at),
	// Raw values for the Markdown body (not frontmatter).
	title_text: toInline(bookmark.title) || bookmark.url,
	url_text: bookmark.url,
});
