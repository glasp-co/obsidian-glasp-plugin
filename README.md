# Glasp for Obsidian

![CI](https://github.com/glasp-co/obsidian-glasp-plugin/actions/workflows/ci.yml/badge.svg)

Import your [**Glasp**](https://glasp.co/) highlights, notes, **summaries**, and **bookmarks** — from the web **and from Kindle** — directly into your [Obsidian](https://obsidian.md/) vault, and keep them in sync automatically.

> [Glasp](https://glasp.co/) is a social web highlighter that lets you highlight and take notes on the web, PDFs, YouTube, and Kindle, then own and export everything you collect. This plugin brings that knowledge into Obsidian as Markdown notes you fully control.

---

## ✨ Features

- 📥 **Import web highlights & notes** from Glasp into a folder of your choice.
- 📚 **Import Kindle highlights & notes** into a **separate** folder, so book highlights stay out of your web notes.
- 📝 **Import summaries** — your Glasp AI page/video summaries as notes, optionally embedding the full article/PDF text.
- 🔖 **Import bookmarks** — every page you've saved, as lightweight, metadata-rich notes.
- 🗂️ **Database views (Obsidian Bases)** — each source gets an auto-generated `.base` view collected in a dedicated **`Glasp Bases`** folder, so you can browse everything as a sortable **Table** or a **Cards** gallery with thumbnails. _(Requires Obsidian 1.9+.)_
- 🔁 **Automatic background sync** — every hour, every day, or once a week.
- ➕ **Incremental & non-destructive** — only new/updated items are fetched, and existing notes are matched by source URL and updated in place (no duplicates).
- 🎨 **Customizable templates** — define your own Markdown layout and frontmatter for every source, or use the sensible defaults.
- 📱 **Desktop & mobile** — works anywhere Obsidian runs.

## ✅ Requirements

- **Obsidian 1.9.0 or later** (the auto-generated database views use the built-in **Bases** core plugin). On older versions, use plugin **v0.2.x**.

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
3. Choose an **output folder** for each source you want — web highlights, Kindle highlights, summaries, and/or bookmarks.
   - Leaving a folder unset simply skips that source, so you can enable any combination.
   - Tip: give each source its own folder to keep them tidy.
4. Pick an **update frequency**. Your data is imported on startup and then on that schedule. You can also trigger an import any time via the ribbon icon or the command palette (**“Glasp: Import highlights”**).

Once a source has imported, a matching database view appears in the **`Glasp Bases`** folder — open it and switch between **Table** and **Cards** at the top.

## ⚙️ Settings

| Setting | Description |
| --- | --- |
| **Access token** | Your Glasp API token. Stored locally in your vault and sent only to `api.glasp.co`. |
| **Web highlights output folder** | Where web highlight notes are saved. Unset = skip web import. |
| **Kindle highlights output folder** | Where Kindle highlight notes are saved. Unset = skip Kindle import. |
| **Summaries output folder** | Where summary notes are saved. Unset = skip summary import. |
| **Include full page content in summaries** | Also embed the full article/PDF text in each summary note. Slower (one extra request per summary) and makes notes larger. |
| **Bookmarks output folder** | Where bookmark notes are saved. Unset = skip bookmark import. |
| **Update frequency** | How often your data is synced automatically (hourly / daily / weekly). |
| **Templates (Advanced)** | Custom note layout for each source (see below). Empty = default template. |

## 🗂️ Database views (Bases)

For every enabled source, the plugin creates a [Bases](https://help.obsidian.md/bases) view in a top-level **`Glasp Bases`** folder — for example `Glasp Bookmarks.base` and `Glasp Summaries.base`. Each view is a live database over that source's notes, so your imports read like a table instead of a long file list:

- **Table** view for sorting and scanning by domain, date, tags, etc.
- **Cards** view with thumbnail covers for a visual gallery.

The views are created once and are **not** re-created if you delete them, so you're free to customize or remove them. A view's folder filter is updated automatically if you later change that source's output folder.

> Bases is a core plugin included with Obsidian 1.9+. Enable it under **Settings → Core plugins → Bases** if it isn't already.

## 🎨 Customizing the template

You can fully control how each note looks using [Handlebars](https://handlebarsjs.com/) placeholders. Leave a template empty to use the default.

**Web highlights** — available variables:
`{{url}}` · `{{glasp_url}}` · `{{thumbnail_url}}` · `{{tags}}` · `{{updated_at}}` · `{{content}}`

**Kindle highlights** — available variables:
`{{url}}` · `{{glasp_url}}` · `{{author}}` · `{{thumbnail_url}}` · `{{tags}}` · `{{updated_at}}` · `{{content}}`

**Summaries** — available variables:
`{{url}}` · `{{title}}` · `{{domain}}` · `{{thumbnail_url}}` · `{{created_at}}` · `{{updated_at}}` · `{{summary}}` · `{{content}}`

**Bookmarks** — available variables:
`{{url}}` · `{{title}}` · `{{domain}}` · `{{category}}` · `{{description}}` · `{{thumbnail_url}}` · `{{created_at}}` · `{{updated_at}}` · `{{title_text}}` · `{{url_text}}`

> ℹ️ Frontmatter values (e.g. `{{title}}`, `{{domain}}`) are emitted already quoted so they can't break the note's Properties — keep them on their own line. The `_text` variants are unquoted, for use in the note body (e.g. a Markdown link). Keeping the `URL` property in your template is what lets the plugin match and update existing notes instead of duplicating them.

<details>
<summary>Default web template</summary>

```handlebars
---
URL: {{url}}
Glasp URL: {{glasp_url}}
Thumbnail: {{thumbnail_url}}
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
Thumbnail: {{thumbnail_url}}
Tags: [{{tags}}]
Last updated: {{updated_at}}
---
{{content}}
```
</details>

<details>
<summary>Default summary template</summary>

```handlebars
---
Glasp: summary
URL: {{url}}
Title: {{title}}
Domain: {{domain}}
Thumbnail: {{thumbnail_url}}
Created: {{created_at}}
Updated: {{updated_at}}
---

## Summary

{{summary}}
{{content}}
```
</details>

<details>
<summary>Default bookmark template</summary>

```handlebars
---
Glasp: bookmark
URL: {{url}}
Title: {{title}}
Domain: {{domain}}
Category: {{category}}
Description: {{description}}
Thumbnail: {{thumbnail_url}}
Created: {{created_at}}
Updated: {{updated_at}}
---

[{{title_text}}](<{{url_text}}>)
```
</details>

## 🔒 Privacy & security

- Your access token is stored **locally** in your vault (`.obsidian/plugins/glasp/data.json`) and is used **only** to call the official Glasp API at `https://api.glasp.co`.
- The plugin has **read-only** access to your own content. It never sends your notes anywhere.
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
