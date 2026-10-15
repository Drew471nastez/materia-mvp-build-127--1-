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

## 2. Set the environment variables in Vercel

Vercel → your project → Settings → Environment Variables. Add each one for
Production (and Preview if you test there), then redeploy.

| Name | Value | Why |
| --- | --- | --- |
| `CRON_SECRET` | any long random string, for example the output of `openssl rand -hex 32` | Vercel sends it to every scheduled job, and a translation that runs out of time uses it to start its next run straight away |
| `LIBRETRANSLATE_URL` | the address of a LibreTranslate server, for example `https://translate.yourdomain.com` | the free, open source translator (option A below) |
| `LIBRETRANSLATE_API_KEY` | only if that server asks for a key | |
| `HF_TOKEN` | a Hugging Face access token, `hf_...` | open chat models (Llama, Qwen) through Hugging Face (option B below) |
| `TRANSLATE_LLM_URL`, `TRANSLATE_LLM_MODEL`, `TRANSLATE_LLM_KEY` | any OpenAI-compatible host serving an open model, for example `https://api.groq.com/openai/v1` with `llama-3.3-70b-versatile` | option C below |
| `MYMEMORY_EMAIL` | your email | raises the free fallback's daily allowance from 5,000 to 50,000 characters |

Translators are tried in this order: LibreTranslate, your own model host,
Hugging Face, then MyMemory. MyMemory is free, needs no key and is always the
last resort, so translating works before anything is set up; its daily
allowance runs out on a large website. `TRANSLATE_FREE_FALLBACK=off` turns it
off. `OPENAI_API_KEY` is used only when every free translator is off.

When a translation fails, the Languages page now says which translator
refused and what it answered (for example "Hugging Face refused the key
(HTTP 401)"), so the fix is the one it names.

### Option A: LibreTranslate on your own server (recommended)

Free and open source (Argos Translate models). It needs a small server with
about 2 to 4 GB of memory, for example a Hetzner, DigitalOcean or Railway box.

```bash
docker run -d --restart unless-stopped -p 5000:5000 \
  -e LT_LOAD_ONLY=en,es,fr,de,it,pt,ro,pl,nl \
  libretranslate/libretranslate
```

`LT_LOAD_ONLY` keeps memory low: list the languages your stores use. Put it
behind HTTPS (Caddy or the host's own proxy), then set `LIBRETRANSLATE_URL`
to that address. To check it:

```bash
curl -s https://translate.yourdomain.com/translate \
  -H 'Content-Type: application/json' \
  -d '{"q":["Add to cart"],"source":"en","target":"fr","format":"text"}'
```

### Option B: Hugging Face

1. Sign in at huggingface.co → Settings → Access Tokens → Create new token,
   type "Read" (tick "Make calls to Inference Providers").
2. Set `HF_TOKEN` to it.

Storelib asks an open chat model through Hugging Face's router first
(`meta-llama/Llama-3.3-70B-Instruct`, then Qwen 2.5 72B, then Llama 3.1 8B;
`HF_CHAT_MODEL` picks others, comma separated), then the older translation
models (opus-mt, NLLB 200) where Hugging Face still serves them. The free
tier has a small monthly allowance; the translation memory (part 178) means
each sentence is only ever sent once.

### Option C: your own model host

Any host with an OpenAI-compatible `/chat/completions` endpoint serving an
open model works: Groq and OpenRouter have free tiers, Together is cheap, or
run Ollama yourself (`TRANSLATE_LLM_URL=http://your-server:11434/v1`,
`TRANSLATE_LLM_MODEL=llama3.1`, no key).

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
