import type { Highlight, UserHighlight } from "src/glasp-api/highlight/type";
import { toYaml } from "./frontmatter";
import { highlightStyleOf, normalizeTags } from "./highlight-fields";
import { toYamlFlowTags } from "./yaml-tags";

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
