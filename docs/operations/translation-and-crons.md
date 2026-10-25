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
| 186 | Changes translated within minutes of a publish (`translate_dirty_at`, `translate_lease_until`) |
| 305 | The translators' log: models read, rests, calls per day, texts refused by the checks (`supabase/sql/run-now/305_translation_providers.sql`) |

## 2. Set up the translators (free)

**First: Google Gemini (free tier).** Accurate (whole sentences as shop copy,
with their markup and placeholders kept) and free within its daily
allowance. No model name has to be set or ever updated: once a day Storelib
reads the models the key can use from Google (`GET /v1beta/models`) and
picks the best cheap text model by its family: Flash-Lite before Flash,
stable before preview, newest first. When Google retires a model (a 404),
or a model's free allowance for the day is used (each model has its own),
the next one is asked. `lib/markets/gemini-models.ts` has the rules.

1. Open https://aistudio.google.com/apikey and press **Create API key**. No
   billing is needed.
2. Vercel → your project → Settings → Environment Variables: add
   `GEMINI_API_KEY` with that key, for Production.
3. Redeploy.

Optional: `GEMINI_TRANSLATE_MODEL` (comma separated) is asked first; the
discovered models still follow, so a stale name never stops translating.
`GEMINI_RPM` (default 10) is the calls a minute to one model.

**Second, also free: Cloudflare Workers AI.** 10,000 "neurons" a day on the
free Workers plan, no card; past that it waits until 00:00 UTC, it is never
billed. Cloudflare does not train on what it is sent. The model is read from
the account's own list the same way (Gemma first).

1. Sign up at https://dash.cloudflare.com (free plan). Copy the Account ID
   from the right of the account home page.
2. My Profile → API Tokens → Create Token → Custom token with **Account ›
   Workers AI › Read** and **Edit**.
3. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` in Vercel, redeploy.

With both, Gemini goes first and Cloudflare takes whatever Gemini cannot do
right now. `TRANSLATE_PROVIDERS=cloudflare,gemini` changes the order (or
leaves one out).

**A note on Google's terms.** Google's Gemini API terms say "You may use only
Paid Services when making API Clients available to users in the European
Economic Area" (also Switzerland and the UK), and that content sent to the
free tier may be used to improve Google's products. Storelib only ever sends
a store's public website text (never a customer's details), but if Storelib
serves stores in those regions, read the terms
(https://ai.google.dev/gemini-api/terms) and decide: either turn on billing
for the Google Cloud project (Flash-Lite costs about a cent per website), or
put Cloudflare first with `TRANSLATE_PROVIDERS=cloudflare,gemini`.

**Optional extras**, used after those when set:

| Name | Value |
| --- | --- |
| `DEEPL_API_KEY` | DeepL API Free, 500,000 characters a month (very accurate) |
| `TRANSLATE_LLM_URL`, `TRANSLATE_LLM_MODEL`, `TRANSLATE_LLM_KEY` | any OpenAI-compatible host with an open model (Groq, OpenRouter, a local Ollama) |
| `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY` | your own LibreTranslate server (the public ones are not for production) |
| `HF_TOKEN` | Hugging Face (needs bought credits; one out of credits is asked again after 6 hours) |
| `MYMEMORY_EMAIL` | the keyless last resort's allowance, 50,000 characters a day |

The keyless last resort (MyMemory) is used only while no other translator is
set up; `TRANSLATE_FREE_FALLBACK=off` turns it off, `=on` keeps it after the
others.

**How it stays free.** Each text is translated once per language and kept in
translation memory (part 178) for every store, so a store's unchanged text,
and the next store with the same words, cost no call. A store's own new text
goes 40 texts to a call. Measured in `tests/e2e-translations-cron.test.ts`:
the first store in a language (Storelib's shop, checkout and email words plus
its own) needed 28 calls for about 900 texts; the next store with the same
words needed none, and its own products cost about one call per 40 texts. A
translation that changes a number, loses a placeholder or link, renames the
store or adds words is never saved (the original shows) and waits an hour,
then longer each time, before it is tried again.

**Is it working?** storelib.com/admin/translations: each translator, the
models it read, which are resting and until when, calls per day, and the
stores where translating stopped, with the reason. Visitors never see a
failure: a text with no translation shows in its own language.

Also add `CRON_SECRET` (any long random string, `openssl rand -hex 32`): it
lets the background job carry on between runs.

## 3. The scheduled jobs (crons)

Nothing to do by hand: `vercel.json` lists them and Vercel runs them on every
production deploy. The Pro plan is needed, since some run every few minutes.

To check they run: Vercel → your project → Settings → Cron Jobs. Each one is
listed with its schedule and a "Run" button, and Logs shows each run.

| Path | When | What it does |
| --- | --- | --- |
| `/api/cron/translation-jobs` | every 5 minutes | carries on a translation that ran out of time, so it finishes even with the tab closed; and translates the stores with "Translate changes automatically" on whose website changed a couple of minutes ago |
| `/api/cron/translations` | hourly, at :47 | the safety sweep: queues a store nothing has queued for a day. Before part 186 it translates the stores itself |
| `/api/cron/fx-rates` | weekdays, 15:35 UTC | the day's exchange rates for extra currencies |
| `/api/cron/physical` | every 10 minutes | gives back stock held by unpaid checkouts, sends order emails and webhooks, and moves tracked parcels on |

A job answered `401` means `CRON_SECRET` is missing or different from the one
Vercel has: set it, then redeploy.

### How "Translate changes automatically" decides what to do

1. A save that changes what a visitor reads marks the store: Publish in the
   builder, a page saved live, theme settings, menus, a product saved in the
   product editor (its options too), a collection. Turning the switch on
   marks it as well. The mark is one small update after the save has
   answered (`lib/markets/translate-queue.ts`); it never slows or fails a
   save, and only stores with the switch on are marked.
2. Every 5 minutes the run takes the marked stores whose last change is at
   least 2 minutes old, oldest first, up to 20 a run. A burst of edits is
   translated once. A store is held by a lease while it runs, so two runs
   never translate the same store.
3. Each store's new and changed text is translated into its other languages
   and goes live. When it is up to date the mark is cleared, unless the
   store changed again meanwhile. A store that made progress and has more
   stays marked for the next run; one the translator could not be reached
   for is tried again 10 minutes later.
4. The hourly sweep only marks the stores nothing has marked for a day (60
   an hour), for changes no save marks, such as Storelib's own words.

So a store that changes nothing costs nothing, and a publish is in every
language within about 5 minutes, whatever the number of stores.

### Translations the store wrote are never replaced

A translation the store wrote, or edited after Storelib AI wrote it, is
never sent to the translator and never overwritten. When the original
behind it changes, it stays on the website as they wrote it and is counted
as needing a look: on the language's row in Settings, under the switch
with a Review link, and in the Translate sheet's Needs review list, where
they edit it or press Keep as is. Storelib AI's own translation of a
changed text is hidden (the new original shows) and written again by the
next run.

The SQL check, to see what is waiting:

```sql
select creator_id, translate_dirty_at, translate_lease_until, auto_translate_run
from public.store_localization
where translate_dirty_at is not null
order by translate_dirty_at;
```

## 4. Check it end to end

1. Settings → Languages & Currency → Store currency → Edit: pick your
   currency and Save. The builder, the live website and checkout all use it.
2. Add a language, open it, press Translate the rest. Close the tab, open it
   again a minute later: the progress is where the server left it.
3. If it says "Automatic translation isn't set up on Storelib yet", no
   translator variable is set in that deployment.
