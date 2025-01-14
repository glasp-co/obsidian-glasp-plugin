import { Notice } from "obsidian";

export class ObsidianNotice extends Notice {
	constructor(message: string, duration?: number) {
		/**
		 * it can be difficult to identify the source of a message if user added many plugins
		 * to address this, attach a label to the messages.
		 */
		const customMessage = `Glasp: ${message}`;
		super(customMessage, duration);
	}
}
