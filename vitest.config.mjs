import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Source files import each other as "src/..." (tsconfig baseUrl "."), which
// Vite does not read from tsconfig. "obsidian" exists only inside the app, so
// tests get a small stand-in.
export default defineConfig({
	resolve: {
		alias: {
			src: fileURLToPath(new URL("./src", import.meta.url)),
			obsidian: fileURLToPath(
				new URL("./test/obsidian-stub.ts", import.meta.url),
			),
		},
	},
});
