import type { Summary } from "src/glasp-api/summary/type";
import { toIsoDate, toYaml } from "./frontmatter";

/**
 * A summary has real body content (the AI summary), so it maps to a body-rich
 * note. Frontmatter string values are YAML-escaped; the ISO timestamps are
 * emitted raw so Bases infers them as dates. The summary body is raw Markdown.
 * When the full page/PDF body was fetched (opt-in), it is appended as a
 * "## Content" section; otherwise `content` is empty.
 */
export const normalizeSummary = (summary: Summary) => ({
	url: toYaml(summary.url),
	title: toYaml(summary.title),
	domain: toYaml(summary.domain),
	thumbnail_url: toYaml(summary.thumbnail_url),
	created_at: toIsoDate(summary.created_at),
	updated_at: toIsoDate(summary.updated_at),
	summary: summary.summary ?? "",
	content: summary.content ? `\n## Content\n\n${summary.content}\n` : "",
});
