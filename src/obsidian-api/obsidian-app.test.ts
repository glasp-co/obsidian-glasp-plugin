import { expect, test } from "vitest";
import { FakeVault } from "../../test/fake-vault";
import { ObsidianApp } from "./obsidian-app";

test("writeFile creates a missing file, overwrites a file, and refuses a folder of that name", async () => {
	const vault = new FakeVault(["Glasp", "Glasp/A folder.base"]);
	const app = new ObsidianApp(vault.app());

	await app.writeFile("Glasp/View.base", "one");
	expect(vault.files.get("Glasp/View.base")?.content).toBe("one");
	await app.writeFile("Glasp/View.base", "two");
	expect(vault.files.get("Glasp/View.base")?.content).toBe("two");

	await expect(app.writeFile("Glasp/A folder.base", "three")).rejects.toThrow(
		/is a folder, not a file/,
	);
	expect(vault.files.has("Glasp/A folder.base")).toBe(false);
});
