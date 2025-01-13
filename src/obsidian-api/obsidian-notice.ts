import { Notice } from "obsidian";

export class ObsidianNotice extends Notice {
	constructor(message: string, duration?: number) {
		/**
		 * it can be difficult to identify the source of a message if user added many plugins
		 * to address this, attach a label to the messages.
		 */
		const customMessage = `Obsidian Glasp Plugin: ${message}`;
		super(customMessage, duration);
	}
}
