import type { Highlight, UserHighlight } from "src/glasp-api/highlight/type";
import { toInline, toYaml } from "./frontmatter";
import { highlightStyleOf, normalizeTags } from "./highlight-fields";
import { toYamlDoubleQuoted, toYamlFlowTags } from "./yaml-tags";

/**
 * The page's title for a web highlights template: `{{title}}` quoted for
 * frontmatter, and `{{title_text}}` unquoted on one line, without `[` and `]`,
 * for the note's body (the page's URL, flattened the same way, when it has no
 * title). They are not among the values whose hash decides whether a note is
 * written again (`normalizeHighlight`'s), so a title that differs from one
 * sync to the next does not by itself write a note again: a note shows the
 * title it was last written with.
 */
export const highlightTitleValues = (userHighlight: UserHighlight) => ({
	title: toYamlDoubleQuoted(String(userHighlight.title ?? "")),
	title_text: toInline(userHighlight.title) || toInline(userHighlight.url),
});

export const normalizeHighlight = (userHighlight: UserHighlight) => {
	let content = "";
	if (userHighlight.summary) {
		content += "#### Summary\n";
		content += `${userHighlight.summary}\n\n`;
	}

	if (userHighlight.document_note) {
		content += "#### Thoughts & Comments\n";
		content += `${userHighlight.document_note}\n\n`;
	}

	content += "#### Highlights & Notes\n\n";
	// biome-ignore lint/complexity/noForEach:
	userHighlight.highlights.forEach((highlight) => {
		const text = modifyHighlightText(highlight);
		content += `${text}\n\n`;
	});

	const tags = normalizeTags(userHighlight.tags);
	return {
		url: toYaml(userHighlight.url),
		glasp_url: toYaml(userHighlight.glasp_url),
		thumbnail_url: toYaml(userHighlight.thumbnail_url),
		tags,
		tags_yaml: toYamlFlowTags(tags),
		updated_at: new Date(userHighlight.updated_at).toISOString().slice(0, 10),
		content,
		highlights: userHighlight.highlights.map((highlight) => ({
			text: highlight.text,
			highlight: highlight.text,
			note: highlight.note ?? "",
			color: highlight.color,
			highlightStyle: highlightStyleOf(highlight.color),
			highlighted_at: highlight.highlighted_at,
			// The API sends a video position as `location` with location_type
			// "time_offset".
			yt_playback_position:
				highlight.yt_playback_position ??
				(highlight.location_type === "time_offset"
					? (highlight.location ?? null)
					: null),
		})),
	};
};

const modifyHighlightText = (highlight: Highlight) => {
	let text = `> ${highlight.text}`;
	if (text.includes("\n")) {
		text = text.replace(/\n/g, "");
	}

	if (highlight.note) {
		text += `\n- ${highlight.note}`;
	}
	return text;
};
