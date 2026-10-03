# Data model

The tables a Storelib website is stored in, as the builder, the live site and a connected agent see them. You never write to these directly: the builder, the code editor, the agent tools and an import are the ways in, and each checks what it writes. Knowing the shape explains why a change lands where it does. The database's row level security keeps each website's rows to the creator who owns it.

In every table below, `install_id` is the website a row belongs to.

## store_theme_installs

One row per website in the library.

| Column | What it holds |
| --- | --- |
| `id` | The website's id. The builder's address is `/website-builder/editor/<id>`. |
| `creator_id` | Whose website it is. |
| `theme_id` | The catalogue theme it was made from, a row in `themes`. |
| `name` | Its name in the library. Only the creator sees it. |
| `status` | `draft`, `published` or `unpublished`, which is a website that was live and was taken offline. One website per creator is `published` at a time, and the database refuses a second. |
| `is_custom` | Set on a website made by Duplicate or Import. |
| `parent_install_id` | The website a duplicate was made from. |
| `sort_order` | Its place in the library. |
| `published_at` | When it last went live. |
| `preview_token` | The website's [preview link](/developers/sharing-themes#preview-links) token, or empty when there is none. |
| `snapshot_url`, `snapshot_updated_at` | The cover picture on its library card, and when it was taken. |

## store_theme_settings

One row per website: the theme settings.

| Column | What it holds |
| --- | --- |
| `settings` | The live theme settings, as one JSON object. |
| `draft_settings` | The draft, or empty when nothing has changed since the last publish. |

The keys are in [Themes](/developers/themes#theme-settings).

## store_theme_pages

One row per page of a website, unique by `install_id` and `page_key`.

| Column | What it holds |
| --- | --- |
| `page_key` | `home`, `product`, `about`, `contact`, `products`, `search`, or a key the creator made. See [Pages](/developers/pages). |
| `sections` | The live page: a list of section instances with their settings and blocks. |
| `draft_sections` | The draft, or empty when the page has not changed since the last publish. |

A page with nothing in `sections` is not on the live site. The shape of a section instance is in [Pages and page settings](/developers/pages#what-a-page-stores).

## store_theme_custom_files

One row per file the creator saved, unique by `install_id` and `path`. The theme's own 33 section files ship with Storelib and have a row only once someone saves one.

| Column | What it holds |
| --- | --- |
| `path` | Where the file is in the theme, such as `sections/pricing_table.storelib`. |
| `content` | The live file. Empty for a file that has been created and never published, which the live site skips, so the theme's own file of that name is still drawn. |
| `draft_content` | The saved, unpublished version, or empty. |
| `updated_at` | When it last changed. A save that says when it read the file is refused as a conflict if this has changed since. |

The live site reads only the rows whose path ends in `.storelib`, draws a section from `sections/<type>.storelib` and a theme block from `blocks/<type>.storelib`. Other paths are stored and read by nothing.

## store_theme_file_versions

A row for every save of a file, every publish of it and every restore, so the code editor's **History** can put any of them back.

| Column | What it holds |
| --- | --- |
| `path` | The file. |
| `content` | The whole file as it was. |
| `kind` | `save`, `publish` or `restore`. |
| `created_at` | When. |

The newest 50 of each file are kept.

## store_theme_backups

The website's restore points, shown in Website settings › Backups & Versions.

| Column | What it holds |
| --- | --- |
| `label` | What it is: Published, Manual backup, Storelib AI finished a task, `Before restoring "…"`, or before a connected agent's change. |
| `source` | `publish`, `manual`, `ai` or `restore`. |
| `snapshot` | The theme settings and every page, drafts where there are drafts. Section files are not in it. |
| `fingerprint` | The SHA-256 of the snapshot, so the same state is not stored twice in a row. |

The newest 30 of each website are kept. See [Publishing and checks](/developers/publishing#backups).

## theme_publish_history

A row every time a website is published or taken offline: which one, by whom, when, and for a publish, the theme settings it went live with.

## themes

The catalogue: every theme Storelib ships, with its name, description, author, version and tags. It is the same for every account. Each website points at one through `theme_id`.

## Connections

Three tables hold what an agent or a repository is connected to. See [Building with AI agents](/developers/ai).

| Table | One row per | What it holds |
| --- | --- | --- |
| `theme_agent_tokens` | Connection | Its name, the website it reaches, when it was last used and when it was disconnected. The token itself is never stored: only its SHA-256 and its first few characters, to recognise it in the list. |
| `theme_agent_activity` | Change an agent made | Which agent, which file, and whether it created or updated it. An open builder reads this to show the change without a reload. |
| `theme_github_links` | Linked website | The repository, the branch, the folder, and the last commit it synced. |

`theme_editor_focus` holds the page, section and block open in the builder right now, which is how a connected agent knows what "the selected section" is.

## What is not here

A website's products, orders, customers and subscribers are the creator's account, not the website's, and live elsewhere. A theme's settings and pages never hold a price or a buyer: a section reads the creator's published products through `products` when it is drawn. See [Selling](/developers/selling).
