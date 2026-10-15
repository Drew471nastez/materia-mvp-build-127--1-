# Translation and scheduled jobs: setup

What has to be set once, outside the code, for languages, currencies and the
background jobs to work in production.

## 1. Run the SQL

In Supabase, open SQL Editor and use a new query tab for each file:

1. `supabase/sql/store-currency-cod-languages/1_run.sql`: press Run. It is one
   transaction and safe to run again.
2. `supabase/sql/store-currency-cod-languages/2_check.sql`: press Run. Every
   row in the first result should say `true`.

The parts it contains:

| Part | What it adds |
| --- | --- |
| 174 | Cash on delivery |
| 175 | Translating changes automatically |
| 176 | The store's own currency |
| 177 | Translation jobs in the background |
| 178 | Translation memory, the permanent cache |

## 2. Set up the translator (one key)

**Recommended: Google Gemini.** Accurate (it translates whole sentences as
shop copy, with their markup and placeholders kept), fast, and free to start:
Gemini's free tier covers a lot of translating every day, and past it a whole
website costs about a cent or two. Every sentence translated is kept for good
in the translation memory (SQL part 178) and shared by every store, so the
same sentence is never paid for twice and the cost falls as Storelib grows.

1. Open https://aistudio.google.com/apikey and press **Create API key**.
2. Vercel → your project → Settings → Environment Variables: add
   `GEMINI_API_KEY` with that key, for Production.
3. Redeploy.

When the free daily allowance runs out, a translation waits and carries on by
itself a few minutes later (the cron below), instead of failing. Enable
billing on the Google Cloud project for no daily limit at all.

**Also good, as a backup: DeepL.** Very accurate, 500,000 characters a month
free. Create a free account at https://www.deepl.com/pro-api and add
`DEEPL_API_KEY`. With both keys, Gemini goes first and DeepL takes over
whatever Gemini cannot do.

Other choices, used in this order after those two when set:

| Name | Value |
| --- | --- |
| `TRANSLATE_LLM_URL`, `TRANSLATE_LLM_MODEL`, `TRANSLATE_LLM_KEY` | any OpenAI-compatible host with an open model (Groq, OpenRouter, a local Ollama) |
| `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` | your own LibreTranslate server |
| `HF_TOKEN` | Hugging Face (its free credits are small) |
| `MYMEMORY_EMAIL` | the keyless last resort's allowance, 50,000 characters a day |

`TRANSLATE_FREE_FALLBACK=off` turns the keyless last resort off. When a
translation fails, Languages says which translator refused and what it said.

Also add `CRON_SECRET` (any long random string, `openssl rand -hex 32`): it
lets the background job carry on between runs.

## 3. The scheduled jobs (crons)

Nothing to do by hand: `vercel.json` lists them and Vercel runs them on every
production deploy. The Pro plan is needed, since some run every few minutes.

To check they run: Vercel → your project → Settings → Cron Jobs. Each one is
listed with its schedule and a "Run" button, and Logs shows each run.

| Path | When | What it does |
| --- | --- | --- |
| `/api/cron/translation-jobs` | every 3 minutes | carries on a translation that ran out of time, so it finishes even with the tab closed |
| `/api/cron/translations` | hourly, at :47 | translates new or changed text for stores that turned on "Translate changes automatically" |
| `/api/cron/fx-rates` | weekdays, 15:35 UTC | the day's exchange rates for extra currencies |
| `/api/cron/physical` | every 10 minutes | gives back stock held by unpaid checkouts, sends order emails and webhooks, and moves tracked parcels on |

A job answered `401` means `CRON_SECRET` is missing or different from the one
Vercel has: set it, then redeploy.

## 4. Check it end to end

1. Settings → Languages & Currency → Store currency → Edit: pick your
   currency and Save. The builder, the live website and checkout all use it.
2. Add a language, open it, press Translate the rest. Close the tab, open it
   again a minute later: the progress is where the server left it.
3. If it says "Automatic translation isn't set up on Storelib yet", no
   translator variable is set in that deployment.
