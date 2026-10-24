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
- 🗂️ **Database views (Obsidian Bases)** — each source gets an auto-generated `.base` view collected in one folder (**`Glasp Bases`**, or one you choose), so you can browse everything as a sortable **Table** or a **Cards** gallery with thumbnails. _(Requires Obsidian 1.9+.)_
- 🔁 **Automatic background sync** — every hour, every day, or once a week.
- ➕ **Incremental** — only items changed since the last sync are fetched (with a few minutes of overlap; an item fetched again unchanged is left alone). Existing notes in the output folder are matched by source URL and updated in place, and a note whose content has not changed is left alone, so its modification date stays put. When an item changes on Glasp, its note is written again from the template, so text you add to the note yourself is replaced then; keep your own writing in a separate note. A note you move out of the output folder is no longer updated: when its item changes, a new note is created in the output folder.
- 🧾 **Clear sync errors** — if an item can't be saved, **Settings → Glasp → Last sync errors** lists which one, where and why; later syncs try it again (for Create missing notes, run it again).
- 🩹 **Create missing notes** — one button fetches all your items once and creates a note for each item that has none anywhere in your vault, for example items an earlier version could not save. Notes you moved to another folder stay where they are; notes you deleted are created again.
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

Once a source has imported, a matching database view appears in the **`Glasp Bases`** folder (or the **Bases folder** you chose) — open it and switch between **Table** and **Cards** at the top.

## ⚙️ Settings

| Setting | Description |
| --- | --- |
| **Access token** | Your Glasp API token. Stored locally in your vault and sent only to `api.glasp.co`. |
| **Web highlights output folder** | Where web highlight notes are saved. Unset = skip web import. |
| **Kindle highlights output folder** | Where Kindle highlight notes are saved. Unset = skip Kindle import. |
| **Summaries output folder** | Where summary notes are saved. Unset = skip summary import. |
| **Include full page content in summaries** | Also embed the full article/PDF text in each summary note. Slower (one extra request per summary) and makes notes larger. Turning it on fetches every summary again. Glasp limits how many of these requests can be made per day, so with a very large library the full text can take more than a day to arrive; the oldest summaries are filled first. |
| **Bookmarks output folder** | Where bookmark notes are saved. Unset = skip bookmark import. |
| **Create Bases views** | Create the database views in the **Bases folder** (on by default). When off, the plugin creates no Bases folder and no `.base` file, and leaves existing ones alone. |
| **Bases folder** | Where the database views go (available while **Create Bases views** is on). Default: **`Glasp Bases`** at the top of your vault. Choosing another folder moves the views (`Glasp Web Highlights.base`, `Glasp Summaries.base`, …) from the old folder to it; a file already there with the same name is never overwritten. If the old folder was `Glasp Bases` and the move left it empty, it is removed as your **Files and links → Deleted files** setting says. Moving the Bases folder in Obsidian's file explorer changes this setting too. |
| **Update frequency** | How often your data is synced automatically (hourly / daily / weekly). |
| **Create missing notes** | Fetches all your items once and creates a note for every item that has no note anywhere in your vault. Existing notes are not changed, wherever they are; notes you deleted are created again. |
| **Last sync errors** | What the last sync could not do (source, title, URL, file, reason), grouped by problem. Up to 500 items are kept (fewer when titles and URLs are long), with the total. |
| **Templates (Advanced)** | Custom note layout for each source (see below). Empty = default template. |

An output folder must already exist; the plugin does not create it. If it is missing (for example, you deleted it) and there is something to import, that source is skipped and reported under **Last sync errors** until the folder exists again or you pick another one.

## 🗂️ Database views (Bases)

For every enabled source, the plugin creates a [Bases](https://help.obsidian.md/bases) view in the **Bases folder** (a top-level **`Glasp Bases`** folder unless you choose another one in the settings) — for example `Glasp Bookmarks.base` and `Glasp Summaries.base`. Each view is a live database over that source's notes, so your imports read like a table instead of a long file list:

- **Table** view for sorting and scanning by domain, date, tags, etc.
- **Cards** view with thumbnail covers for a visual gallery.

The views are created once and are **not** re-created if you delete them, so you're free to customize or remove them. Deleting the whole Bases folder keeps it deleted, until you enable another source or change a source's output folder (either one writes that view again, in the Bases folder). When a source's output folder changes, only the view's folder filter is changed, so what else you changed in the view (columns, sort, widths) stays; a view whose folder filter you changed, or a file of your own with the same name, is left as it is, and the plugin says so. To keep the views somewhere else, such as inside the folder you keep your highlights in, choose that folder as the **Bases folder**, or simply drag the `Glasp Bases` folder there in Obsidian: the plugin follows the folder when it is moved or renamed in Obsidian (a move made outside Obsidian, for example in Finder, is not followed: choose the folder in the settings instead). A view works wherever it is, because it lists the notes in its source's folder. If you moved the `Glasp Bases` folder before this setting existed, the next sync makes the folder holding your views the Bases folder, when all of them are found together in one folder. While another folder is chosen, views that turn up in `Glasp Bases` (for example written by a device on an earlier version) are moved to it at the next sync, unless a view with the same name is already there, and `Glasp Bases` is removed if that left it empty. To keep the plugin out of your folder structure altogether, turn off **Create Bases views**.

> Bases is a core plugin included with Obsidian 1.9+. Enable it under **Settings → Core plugins → Bases** if it isn't already.

## 🎨 Customizing the template

You can fully control how each note looks using [Handlebars](https://handlebarsjs.com/) placeholders. Leave a template empty to use the default.

**Web highlights** — available variables:
`{{url}}` · `{{glasp_url}}` · `{{thumbnail_url}}` · `{{tags}}` · `{{tags_yaml}}` · `{{updated_at}}` · `{{content}}` · `{{#each highlights}}…{{/each}}`

**Kindle highlights** — available variables:
`{{url}}` · `{{glasp_url}}` · `{{author}}` · `{{thumbnail_url}}` · `{{tags}}` · `{{tags_yaml}}` · `{{updated_at}}` · `{{content}}` · `{{#each highlights}}…{{/each}}`

**Summaries** — available variables:
`{{url}}` · `{{title}}` · `{{domain}}` · `{{thumbnail_url}}` · `{{created_at}}` · `{{updated_at}}` · `{{summary}}` · `{{content}}`

**Bookmarks** — available variables:
`{{url}}` · `{{title}}` · `{{domain}}` · `{{category}}` · `{{description}}` · `{{thumbnail_url}}` · `{{created_at}}` · `{{updated_at}}` · `{{title_text}}` · `{{url_text}}`

> ℹ️ Frontmatter values (e.g. `{{title}}`, `{{domain}}`) are emitted already quoted so they can't break the note's Properties — keep them on their own line. The `_text` variants are unquoted, for use in the note body (e.g. a Markdown link). Keeping the `URL` property in your template is what lets the plugin match and update existing notes instead of duplicating them. The `Glasp` property is reserved: keep `Glasp: summary` in a summaries template and `Glasp: bookmark` in a bookmarks template, and do not use those two values in the web or Kindle templates.

> ℹ️ Use `Tags: [{{tags_yaml}}]` for tags in frontmatter (the default templates do). Ordinary tags come out exactly as `{{tags}}` writes them; a tag containing a comma, bracket, quote or other YAML syntax, or one YAML would read as something else (such as `true`, `null` or `2024`), is quoted, so it can't split into two tags or break the Properties.

### Styling each highlight (`{{#each highlights}}`)

`{{content}}` is the ready-made list of highlights. To lay highlights out yourself, loop over `highlights`. Each one has:

| Variable | Value |
| --- | --- |
| `{{text}}` (or `{{highlight}}`) | The highlighted text |
| `{{note}}` | Your note on it (empty if none) |
| `{{color}}` | `pink`, `yellow`, `blue` or `green` (Kindle: `pink`, `yellow`, `blue` or `orange`) |
| `{{highlightStyle}}` | The colour as a number: `"1"` pink, `"2"` yellow, `"3"` green, `"4"` blue, `"5"` orange |
| `{{highlighted_at}}` | When you highlighted it |
| `{{yt_playback_position}}` | YouTube timestamp in seconds (web only; empty otherwise) |
| `{{location}}`, `{{location_type}}` | Kindle location (Kindle only) |

The `eq` helper compares two values exactly, so you can pick a style per colour. Put the loop where `{{content}}` is in the template, below the frontmatter, and keep the frontmatter's `URL: {{url}}` line: that is how the plugin finds the note again (without it, a new note is created each time the page changes):

```handlebars
---
URL: {{url}}
Tags: [{{tags_yaml}}]
---
{{#each highlights}}
{{#if (eq highlightStyle "1")}}<mark style="background:rgb(242,178,188); color:#000;">{{{highlight}}}</mark>
{{else if (eq highlightStyle "2")}}<mark style="background:rgb(249,213,108); color:#000;">{{{highlight}}}</mark>
{{else if (eq highlightStyle "3")}}<mark style="background:rgb(175,213,151); color:#000;">{{{highlight}}}</mark>
{{else if (eq highlightStyle "4")}}<mark style="background:rgb(181,205,238); color:#000;">{{{highlight}}}</mark>
{{else}}{{{highlight}}}
{{/if}}
{{#if note}}> [!Note] {{{note}}}{{/if}}

{{/each}}
```

`highlightStyle` is a string, so compare it with a quoted number (`"1"`), or compare `color` instead (`(eq color "pink")`).

#### Highlights that span several lines

Markdown such as `==…==` or `> ` applies to one line, so a highlight that spans several lines needs it on each of them. The `lines` helper gives a text's lines, trimmed and without the empty ones: loop over `(lines highlight)` or `(lines note)`, where `{{this}}` is the line and `../` reaches the highlight's own fields. For example, with the coloured highlights of Obsidian 1.14 and later (a colour emoji at the start of a highlight sets its colour):

```handlebars
{{#each highlights}}
{{#each (lines highlight)}}
=={{#if (eq ../highlightStyle "1")}}🔴{{else if (eq ../highlightStyle "2")}}🟡{{else if (eq ../highlightStyle "3")}}🟢{{else if (eq ../highlightStyle "4")}}🔵{{else if (eq ../highlightStyle "5")}}🟠{{/if}}{{{this}}}==
{{/each}}
{{#if (lines note)}}
> [!Note]
{{#each (lines note)}}
> {{{this}}}
{{/each}}
{{/if}}

{{/each}}
```

<details>
<summary>Default web template</summary>

```handlebars
---
URL: {{url}}
Glasp URL: {{glasp_url}}
Thumbnail: {{thumbnail_url}}
Tags: [{{tags_yaml}}]
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
Tags: [{{tags_yaml}}]
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

## 📝 New note names

A new note is named after the item's title, cleaned so every platform Obsidian runs on accepts it: characters such as `[ ] | : \ / # ^ " * ? < >` are removed, a Windows device name (`CON`, `NUL`, `COM1`…) gets a leading `_`, trailing dots and spaces are dropped, and the name is kept within 120 bytes. When two items end up with the same name, the second gets ` (2)`, and so on. Notes that already exist keep their names: they are found by the `URL` in their frontmatter.

## 🔒 Privacy & security

- Your access token is stored **locally** in your vault (`.obsidian/plugins/glasp/data.json`) and is used **only** to call the official Glasp API at `https://api.glasp.co`.
- The plugin has **read-only** access to your own content. It never sends your notes anywhere.
- ⚠️ If you sync or share your vault, be aware that `data.json` contains your token — treat it like a password. Never paste the whole file into an issue or a chat; if you are asked for a value from it, copy only that line.
- `data.json` also keeps the last sync's error list, which includes the titles and URLs of the items that failed, and, for each source, the URLs of the items most recently synced (at most 2,000 per source), so that the next sync leaves them alone when they have not changed.
- If you sync the vault to other devices, update the plugin on all of them: a device on 0.3.0 does not know **Create Bases views** or **Bases folder** (and creates the `Glasp Bases` folder again on every sync), and a device on an earlier 0.4 version does not know **Bases folder**, so a view it writes goes to `Glasp Bases`. The plugin keeps this device's settings when a device on 0.3.0 saves the file.

## 🛠️ Development

```bash
git clone https://github.com/glasp-co/obsidian-glasp-plugin
cd obsidian-glasp-plugin
npm install
npm run dev      # watch & rebuild
npm test         # run unit tests
npm run build    # production build
```

To develop against a live vault, clone into `[YourVault]/.obsidian/plugins/glasp` and run `npm run dev`. See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

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
