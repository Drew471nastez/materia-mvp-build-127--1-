# Setting up GitHub for Storelib sites

Creators link a site to a GitHub repository from **Website settings › Connections** in the builder. For that to work, Storelib needs its own GitHub App. It is free, and made once, by the owner of storelib.com.

## 1. Run the database file

In the Supabase SQL editor, run these two files, in this order. Both are safe to run again.

1. `supabase/sql/RUN_AGENT_CONNECTIONS.sql`
2. `supabase/sql/RUN_GITHUB_SYNC.sql`
3. `supabase/sql/run-now/132_github_whole_theme_and_agent_keys.sql` (also in the run-four files). Without it sync still works, but the builder cannot list each file a push could not bring in, and agent keys never expire and always write.

## 2. Make the GitHub App

On GitHub: **Settings › Developer settings › GitHub Apps › New GitHub App**. Use an organisation's settings instead if Storelib has one.

| Field | Value |
| --- | --- |
| GitHub App name | Storelib (the slug GitHub gives it goes in `GITHUB_APP_SLUG`) |
| Homepage URL | `https://storelib.com` |
| Callback URL | `https://storelib.com/api/github/setup` |
| Request user authorization (OAuth) during installation | **On**. This is how Storelib proves the person connecting owns the installation. |
| Redirect on update | On |
| Webhook | Active |
| Webhook URL | `https://storelib.com/api/github/webhook` |
| Webhook secret | A long random string, for example the output of `openssl rand -hex 32`. The same value goes in `GITHUB_WEBHOOK_SECRET`. |

**Repository permissions**

| Permission | Access | Why |
| --- | --- | --- |
| Contents | Read and write | Read pushed theme files; write the whole theme when a repository is linked, on **Push** and on **Publish**; comment on a commit with the files a push could not bring in. |
| Commit statuses | Read and write | The green or red Storelib check on each push. |
| Metadata | Read-only | Required by GitHub. |

Nothing else. **Subscribe to events**: Push. (Installation events are sent without subscribing.)

**Where can this GitHub App be installed**: Any account.

Create it, then on its page:

- Note the **App ID** and the **Client ID**.
- **Generate a new client secret**.
- **Generate a private key**. A `.pem` file downloads.

## 3. Set the environment variables in Vercel

Project › Settings › Environment Variables, for Production (and Preview if you want it there):

| Name | Value |
| --- | --- |
| `GITHUB_APP_ID` | The App ID |
| `GITHUB_APP_SLUG` | The app's slug, as in `github.com/apps/<slug>` |
| `GITHUB_APP_CLIENT_ID` | The Client ID |
| `GITHUB_APP_CLIENT_SECRET` | The client secret |
| `GITHUB_APP_PRIVATE_KEY` | The whole `.pem` file, including the BEGIN and END lines. Pasting it on one line with `\n` for each line break also works. |
| `GITHUB_WEBHOOK_SECRET` | The webhook secret from step 2 |

All six are server side only. None starts with `NEXT_PUBLIC_`, and none is ever sent to a browser, stored in the database or logged. Redeploy after adding them.

Until all six are set, the GitHub card in the builder says GitHub is not switched on, and the webhook answers 503.

## How it works

- **Connect.** `/api/github/connect` sends the creator to GitHub's install page with a signed, 15 minute state naming their site. GitHub sends them back to `/api/github/setup` with an installation id and a one-time code. The code is traded for a user token, used once to confirm that user can reach the installation, and thrown away. Only then is the link stored.
- **Link.** The creator picks a repository the installation can reach, and a branch. A branch that does not exist yet is made from the default branch, so a protected `main` is avoided by typing `storelib`. Storelib writes the whole theme into it in one commit (below).
- **Push (Storelib to GitHub).** On **Push**, after every **Publish**, and for each file saved in the builder. Only files whose bytes GitHub does not already have are sent: binary files and large ones as blobs, the tree in batches. A push to the branch in between is not a failure: the commit is made again on top of it, and the other push's files stay.
- **Push (GitHub to Storelib).** GitHub posts to `/api/github/webhook`. The signature is checked against the exact body. Every changed file the theme reads is checked and saved as a draft through the same saves the builder uses, and written to the activity log an open builder reads every few seconds (a page or the settings rewritten by a push is logged as replaced, and the builder reads it again from the draft; an edit there not saved yet is kept, and the builder says how to take GitHub's version). One bad file does not stop the rest. The commit gets a Storelib status, and a comment listing every file that was not taken, with its line and what to fix. The builder lists the same under GitHub in Connections.
- **Loops.** A push made by the app's bot, or whose every commit carries `[storelib-sync]`, or whose head is the commit Storelib last wrote, is not read back. Each file's git blob sha that GitHub and Storelib last agreed on is kept (`theme_github_links.sync_state`), so Storelib's own bytes coming back are recognised without being downloaded.
- **Both changed.** A file changed in the builder and in a push since the last sync: the push wins, the activity list says so, and nothing is lost. A section's earlier text is in its History, and a backup of the site is taken before pages or settings are written.
- **Tokens.** Storelib mints a short-lived installation token from the private key each time it needs one. No GitHub token is ever stored.

## What is in the repository

| Path | What it is | Read back |
| --- | --- | --- |
| `README.md`, `AGENTS.md`, `CLAUDE.md`, `storelib.json` | Written by Storelib on every Push. `storelib.json` lists the files left out (over 20 MB, a path over 240 characters, past 3,000 files). | No |
| `config/settings.json` | The theme's settings, as the builder has them. An imported theme's `compat` marker cannot be changed from here. | Yes |
| `config/settings_schema.json` | What the settings are (Storelib themes). | No |
| `templates/<page>.json` | Each page's own sections, Shopify's template shape. A new file is a new page. | Yes |
| `sections/header-group.json`, `footer-group.json`, `overlay-group.json` | The header, footer and overlay, once, for every page that has them. | Yes |
| `sections/*.storelib`, `blocks/*.storelib` | Every section and block, Storelib's built-in ones included. | Yes |
| `sections/<type>.json` | A built-in Storelib draws itself, its schema to read. | No |
| `snippets/`, `layout/` | An imported theme's snippets and page shell. | Yes |
| `shopify/**` | An imported theme's own files: templates, config, locales, CSS, JavaScript, fonts (as their bytes). | Yes |
| `shopify/assets/<pictures>` | An imported theme's pictures and videos, fetched from storage. Upload new ones in Files. | No |

Anything else in the repository is the owner's, and Storelib never writes or deletes it.

## A built-in section edited in the repository

Editing `sections/hero.storelib` (or any built-in section or block) in the repository is allowed. The push saves it as this site's own copy: a row at the built-in's path in `store_theme_custom_files`, which the renderer already reads first for that install only (`sectionSource` in `lib/website-builder/storelib-runtime.ts`), in the builder's preview and on the live site. Every other site keeps Storelib's. It is checked like any section of the creator's own (compile, the strict quality and integration checks, scripts included), except that a finding the built-in itself already has does not count against the copy. The builder lists it under GitHub as Edited in GitHub, with **Reset to Storelib's version**, which deletes the copy and puts Storelib's text back in the repository. `sections/header.storelib` and `sections/footer.storelib` stay refused: a header of the creator's own is a new section with `"kind": "header"`.

An imported Shopify theme has no Storelib built-ins: its `sections/slideshow.storelib` is the theme's own and is changed in place, schema included. The theme's own schema, under `shopify` in `<schema>`, is what the page draws; the builder's panel (the rest of `<schema>`) is made again from it by the import's own functions whenever either part changed, on every save (`syncCompatFile` in `lib/storelib-theme/compat/schema-sync.ts`, called by `saveThemeFile`). A change to the markup alone keeps the file as it was sent, and key order and spacing do not count. `shopify/config/settings_schema.json` is read the same way: the save makes `shopify/config/settings_panel.json`, the builder's Theme settings, again. A setting the panel has no control for is named in the commit comment. Agents over MCP, the agent API and Ask AI still may not change a built-in (`agentMayWrite`); the repository rule is `repoMayWrite` in `lib/agent-access/protected.ts`.

A Storelib theme's `config/settings_schema.json` and a built-in's `sections/<type>.json` are Storelib's own and written for reading. A push that changes one is refused for that file, with the commit red and what to change instead (`readOnlySchemaRefusal` in `lib/github-sync/sync.ts`): a theme setting's value in `config/settings.json`, a new setting in a section's `<schema>`.

## When a sync fails

`lib/github-sync/errors.ts` turns each failure into a sentence and a fix, shown on the card, in the activity list and on the commit: the app key refused, the installation removed (connect again), no write access (where on GitHub to give it), the repository or branch gone, a protected branch (use a branch of Storelib's own), the branch moved (pressed again, Storelib's changes go on top), GitHub's hourly limit (with the time it comes back), a file too large, GitHub down. 5xx answers, secondary limits and dropped connections are retried with backoff first.

## Agent keys (Claude Code, Codex over MCP)

Made in Website settings, Connections. A key works for 180 days unless made with `days` (0 for no end), and can be made read only (`access: "read"`), which can read and check but answers every write with how to get a key that can write. Disconnecting stamps `revoked_at` and the key stops on its next request. An expired key is refused with the day it expired. Keys made before part 132 keep working as they did.

The code is in `lib/github-sync/` and `app/api/github/`. The tests are `tests/github-sync.test.ts` and `tests/github-theme-sync.test.ts`, which runs everything against an in-memory GitHub (`tests/_fake-github.ts`).
