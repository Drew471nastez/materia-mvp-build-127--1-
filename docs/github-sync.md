# Setting up GitHub for Storelib sites

Creators link a site to a GitHub repository from **Website settings › Connections** in the builder. For that to work, Storelib needs its own GitHub App. It is free, and made once, by the owner of storelib.com.

## 1. Run the database file

In the Supabase SQL editor, run these two files, in this order. Both are safe to run again.

1. `supabase/sql/RUN_AGENT_CONNECTIONS.sql`
2. `supabase/sql/RUN_GITHUB_SYNC.sql`

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
| Contents | Read and write | Read pushed section files; write the site's files when a repository is linked or **Send to GitHub** is pressed. |
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
- **Link.** The creator picks a repository the installation can reach. Storelib writes the site's section files and an `AGENTS.md` and `CLAUDE.md` into it, in one commit.
- **Push.** GitHub posts to `/api/github/webhook`. The signature is checked against the exact body. Each changed `sections/<type>.storelib` on the linked branch is compiled and saved as a draft through the same save the code editor uses, and written to the activity log an open builder reads every few seconds. The commit gets a Storelib status.
- **Tokens.** Storelib mints a short-lived installation token from the private key each time it needs one. No GitHub token is ever stored.

The code is in `lib/github-sync/` and `app/api/github/`. The tests are in `tests/github-sync.test.ts`.
