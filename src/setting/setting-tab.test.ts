import { expect, test, vi } from "vitest";
import { FakeVault } from "../../test/fake-vault";
import ObsidianGlaspPlugin from "../main";
import { ObsidianApp } from "../obsidian-api/obsidian-app";
import { SettingTab } from "./setting-tab";

vi.stubGlobal("window", {
	setInterval: () => 1,
	clearInterval: () => {},
	setTimeout: () => 1,
	clearTimeout: () => {},
});

test("a click right after typing waits for the save the typing started", async () => {
	const vault = new FakeVault(["Glasp"]);
	const app = vault.app() as unknown as Record<string, unknown>;
	app.workspace = { layoutReady: true, onLayoutReady: () => {} };
	const plugin = new ObsidianGlaspPlugin(
		app as never,
		{ id: "glasp", dir: ".obsidian/plugins/glasp" } as never,
	) as ObsidianGlaspPlugin & { stored: unknown };
	plugin.stored = { accessToken: "", folder: "Glasp", updateFrequency: "1440" };
	await plugin.onload();
	const tab = new SettingTab({
		obApp: new ObsidianApp(app as never),
		glaspPlugin: plugin,
	});
	const internals = tab as unknown as {
		pendingText: Record<string, string>;
		flushText(): Promise<void>;
	};
	let release!: () => void;
	const saveData = plugin.saveData.bind(plugin);
	vi.spyOn(plugin, "saveData").mockImplementationOnce(async (data) => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		return saveData(data);
	});

	internals.pendingText.accessToken = "NEW";
	const blur = internals.flushText(); // the field's change event
	let clickDone = false;
	const click = internals.flushText().then(() => {
		clickDone = true;
	}); // the button, a moment later
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(clickDone).toBe(false);
	release();
	await click;
	await blur;
	expect(plugin.store.get().accessToken).toBe("NEW");
});
