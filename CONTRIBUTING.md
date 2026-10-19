# Contributing

Thanks for helping improve the Glasp plugin for Obsidian.

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/glasp-co/obsidian-glasp-plugin/issues) with what you did, what you expected and what happened. Include your Obsidian version, your device (desktop or mobile, and the OS), the plugin version, and, for a sync problem, what **Settings → Glasp → Last sync errors** shows. Leave out your access token and anything private in your notes.

## Setting up

You need Node.js 20 or later (CI uses the version in `.node-version`) and npm.

```bash
git clone https://github.com/glasp-co/obsidian-glasp-plugin
cd obsidian-glasp-plugin
npm ci
npm run dev        # watch & rebuild main.js
```

To try it in a vault, clone into `[YourVault]/.obsidian/plugins/glasp` (or the config folder your vault uses), then reload Obsidian and enable the plugin. Use a test vault: the plugin writes notes.

## Before you open a pull request

```bash
npm test             # unit tests
npm run lint:check   # Biome lint and format check of src/
npm run build        # type check and production build
```

- Open the pull request against `develop`. `main` is updated from `develop` for each release.
- Keep a pull request to one change, and add or update tests for it.
- Describe what changes for someone using the plugin, and how you checked it.
- Do not change `manifest.json`, `versions.json` or the version in `package.json`; releases set them.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
