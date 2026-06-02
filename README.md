# Glasp for Obsidian

![CI](https://github.com/glasp-co/obsidian-glasp-plugin/actions/workflows/ci.yml/badge.svg)

Import your [**Glasp**](https://glasp.co/) highlights and notes — from the web **and from Kindle** — directly into your [Obsidian](https://obsidian.md/) vault, and keep them in sync automatically.

> [Glasp](https://glasp.co/) is a social web highlighter that lets you highlight and take notes on the web, PDFs, YouTube, and Kindle, then own and export everything you collect. This plugin brings that knowledge into Obsidian as Markdown notes you fully control.

---

## ✨ Features

- 📥 **Import web highlights & notes** from Glasp into a folder of your choice.
- 📚 **Import Kindle highlights & notes** ([new in v0.2.0](https://glasp.co/)) into a **separate** folder, so book highlights stay out of your web notes.
- 🔁 **Automatic background sync** — every hour, every day, or once a week.
- ➕ **Incremental & non-destructive** — only new/updated highlights are fetched, and existing notes are matched by source URL and updated in place (no duplicates).
- 🎨 **Customizable templates** — define your own Markdown layout and frontmatter for web and Kindle notes, or use the sensible defaults.
- 📱 **Desktop & mobile** — works anywhere Obsidian runs.

## 📦 Installation

### From Obsidian Community Plugins (recommended)
1. Open **Settings → Community plugins** in Obsidian.
2. Search for **“Glasp”**, click **Install**, then **Enable**.

### Manual
1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/glasp-co/obsidian-glasp-plugin/releases).
2. Copy them into `[YourVault]/.obsidian/plugins/glasp/`.
3. Reload Obsidian and enable **Glasp** under **Community plugins**.

## 🚀 Getting started

> 📺 Prefer a walkthrough? Follow the [full step-by-step tutorial](https://blog.glasp.co/how-to-export-highlights-into-obsidian/) on exporting Glasp highlights into Obsidian.

1. **Get your access token** from your Glasp account: **https://glasp.co/settings/access_token**
   - 💡 If the link opens *inside* Obsidian and you can’t sign in, use the **copy button** next to the token field and paste the URL into your default browser (Chrome, Safari, etc.).
2. In **Settings → Glasp**, paste the **Access token**.
3. Choose an **output folder** for web highlights and/or an **output folder** for Kindle highlights.
   - Leaving a folder unset simply skips that source — enable web, Kindle, or both.
4. Pick an **update frequency**. Your highlights are imported on startup and then on that schedule. You can also trigger an import any time via the ribbon icon or the command palette (**“Glasp: Import highlights”**).

## ⚙️ Settings

| Setting | Description |
| --- | --- |
| **Access token** | Your Glasp API token. Stored locally in your vault and sent only to `api.glasp.co`. |
| **Web highlights output folder** | Where web highlight notes are saved. Unset = skip web import. |
| **Kindle highlights output folder** | Where Kindle highlight notes are saved. Unset = skip Kindle import. |
| **Web / Kindle highlights template** | Custom note layout (see below). Empty = default template. |
| **Update frequency** | How often highlights are synced automatically (hourly / daily / weekly). |

## 🎨 Customizing the template

You can fully control how each note looks using [Handlebars](https://handlebarsjs.com/) placeholders. Leave a template empty to use the default.

**Web highlights** — available variables:
`{{url}}` · `{{glasp_url}}` · `{{tags}}` · `{{updated_at}}` · `{{content}}`

**Kindle highlights** — available variables:
`{{url}}` · `{{glasp_url}}` · `{{author}}` · `{{tags}}` · `{{updated_at}}` · `{{content}}`

<details>
<summary>Default web template</summary>

```handlebars
---
URL: {{url}}
Glasp URL: {{glasp_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
```
</details>

<details>
<summary>Default Kindle template</summary>

```handlebars
---
URL: {{url}}
Glasp URL: {{glasp_url}}
Author: {{author}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
```
</details>

## 🔒 Privacy & security

- Your access token is stored **locally** in your vault (`.obsidian/plugins/glasp/data.json`) and is used **only** to call the official Glasp API at `https://api.glasp.co`.
- The plugin has **read-only** access to your own highlights. It never sends your notes anywhere.
- ⚠️ If you sync or share your vault, be aware that `data.json` contains your token — treat it like a password.

## 🛠️ Development

```bash
git clone https://github.com/glasp-co/obsidian-glasp-plugin
cd obsidian-glasp-plugin
npm install
npm run dev      # watch & rebuild
npm test         # run unit tests
npm run build    # production build
```

To develop against a live vault, clone into `[YourVault]/.obsidian/plugins/` and run `npm run dev`.

## 🐞 Bugs & feedback

Found a bug or have a feature request? Please open an [issue](https://github.com/glasp-co/obsidian-glasp-plugin/issues).

## 🔗 Links

- 🌐 [Glasp](https://glasp.co/) — highlight & organize what you read
- 📖 [Glasp API documentation](https://glasp.co/docs/apis)
- 📺 [Tutorial: Export highlights into Obsidian](https://blog.glasp.co/how-to-export-highlights-into-obsidian/)
- 🔑 [Get your access token](https://glasp.co/settings/access_token)
- 🧩 [Obsidian](https://obsidian.md/)

## License

[MIT](./LICENSE) © [Glasp](https://glasp.co/)
