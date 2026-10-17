/**
 * Translate changes automatically (lib/markets/auto-translate.ts): a few
 * minutes after a store publishes, its new and changed website text is
 * translated into its other languages and goes live; only what changed, a
 * text already translated elsewhere reused with no call, never a
 * translation the merchant wrote, and never one that lost a placeholder, a
 * Liquid tag, a link or an HTML tag (lib/markets/draft-check.ts). Only the
 * stores a save marked are looked at (lib/markets/translate-queue.ts, SQL
 * part 186); an hourly sweep marks the quiet ones once a day. Against a
 * real HTTP server standing in for the model and a database that records
 * every write.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fixedParts, keepsFixedParts } from "@/lib/markets/draft-check"
import { aiMayWrite, needsReview, reusableTranslations, sourceHash, type TranslationRow } from "@/lib/markets/translate"
import { validateLocalization } from "@/lib/markets/model"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const P1 = "a0000000-0000-4000-8000-0000000000a1"
const P2 = "a0000000-0000-4000-8000-0000000000a2"
const P3 = "a0000000-0000-4000-8000-0000000000a3"

/* The model: "FR " before every text, except a description it "translates" by dropping the placeholder. */
let calls = 0
let asked: string[] = []
/* The model refusing every call (the account out of credit): Storelib AI is unreachable, and pauses itself for a while. */
let refusing = false
function answer(req: IncomingMessage, res: ServerResponse) {
  let raw = ""
  req.on("data", (c) => { raw += c })
  req.on("end", () => {
    calls++
    if (refusing) {
      res.writeHead(429, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota", code: "insufficient_quota" } }))
      return
    }
    const body = JSON.parse(raw) as { input: { content: { text: string }[] }[] }
    const items = (JSON.parse(body.input[0].content[0].text) as { items: { key: string; text: string }[] }).items
    asked.push(...items.map((i) => i.key))
    const text = JSON.stringify({ translations: items.map((i) => ({ key: i.key, text: i.text.includes("{{ name }}") ? `FR Bonjour` : `FR ${i.text}` })) })
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ id: `resp_${calls}`, object: "response", created_at: 0, status: "completed", model: "test", output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }] }))
  })
}

/**
 * A database: rows by table, every write kept with the filters it was sent
 * with. `claim: false` stands for another run holding the store (the lease
 * update matches nothing); `missing` makes every read naming it fail as a
 * column that is not there (a database without that SQL part).
 */
function fakeDb(tables: Record<string, Record<string, unknown>[]>, opts: { claim?: boolean; missing?: string } = {}) {
  const writes: { table: string; kind: string; rows: unknown; filters: [string, unknown[]][] }[] = []
  return {
    writes,
    db: {
      from(table: string) {
        let single = false
        let manualOnly = false
        let columns = ""
        let writing: Record<string, unknown> | null = null
        const filters: [string, unknown[]][] = []
        const q: Record<string, unknown> = {}
        for (const m of ["in", "order", "limit", "range", "delete", "neq", "is", "not", "or", "ilike", "gte", "lte"]) q[m] = (...a: unknown[]) => { filters.push([m, a]); return q }
        q.select = (c?: string) => { if (!writing) columns = c ?? ""; return q }
        q.eq = (col: string, v: unknown) => { filters.push(["eq", [col, v]]); if (col === "source" && v === "manual") manualOnly = true; return q }
        q.maybeSingle = () => { single = true; return q }
        q.single = () => { single = true; return q }
        q.upsert = (rows: unknown) => { writes.push({ table, kind: "upsert", rows, filters }); return Promise.resolve({ error: null }) }
        q.update = (rows: Record<string, unknown>) => { writing = rows; writes.push({ table, kind: "update", rows, filters }); return q }
        q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          if (writing) {
            /* The lease taken: the store comes back, unless another run holds it. */
            /* Before part 186 the hourly run holds it by claimed_until on its kept run. */
            const run = writing.auto_translate_run as Record<string, unknown> | undefined
            const claimed = (typeof writing.translate_lease_until === "string" || typeof run?.claimed_until === "string") && opts.claim !== false
            return Promise.resolve({ data: claimed ? [{ creator_id: "c1" }] : [], error: null }).then(ok, bad)
          }
          const named = (x: unknown) => typeof x === "string" && !!opts.missing && x.includes(opts.missing)
          if (opts.missing && (named(columns) || filters.some(([, a]) => a.some(named)))) return Promise.resolve({ data: null, error: { code: "42703", message: `column store_localization.${opts.missing} does not exist` } }).then(ok, bad)
          let rows = tables[table] ?? []
          if (manualOnly) rows = rows.filter((r) => r.source === "manual")
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(ok, bad)
        }
        return q
      },
    },
  }
}

const keyOfIn = (writes: { table: string; kind: string; rows: unknown }[], k: string) => writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Record<string, unknown>[]).find((w) => w.key === k)

async function main() {
  console.log("\nA translation keeps what is not words")
  check("placeholders, Liquid, a link and tags, moved about: kept", keepsFixedParts('<p>Hi {{ name }}, see <a href="https://a.test/x">this</a> {% if x %}now{% endif %}</p>', '<p>{% if x %}Maintenant{% endif %} <a href="https://a.test/x">ceci</a>, salut {{name}}</p>'))
  check("a dropped {{ name }}: refused", !keepsFixedParts("Hello {{ name }}", "Bonjour"))
  check("a link rewritten: refused", !keepsFixedParts('<a href="/shop">Shop</a>', '<a href="/boutique">Boutique</a>'))
  check("a closing tag lost: refused", !keepsFixedParts("<p><strong>New</strong> in</p>", "<p><strong>Nouveau dans</p>"))
  check("a {name} slot renamed: refused", !keepsFixedParts("Spend {amount} more", "Dépensez {montant} de plus"))
  check("an address and a URL in the words: kept and counted", fixedParts("Write to hi@shop.test or https://shop.test.").size === 2 && keepsFixedParts("Write to hi@shop.test or https://shop.test.", "Écrivez à hi@shop.test ou https://shop.test."))
  check("plain words: nothing to keep", fixedParts("Free shipping over 50").size === 0)

  console.log("\nOnly what changed, never the merchant's")
  const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "ai", ...extra })
  check("missing: AI may write it", aiMayWrite(undefined, "Mug"))
  check("written for this original: left alone", !aiMayWrite(row("k", "Tasse", "Mug"), "Mug"))
  check("its original changed since: AI may write it again", aiMayWrite(row("k", "Tasse", "Mug"), "Big mug"))
  check("the merchant's, outdated or not: never", !aiMayWrite(row("k", "Tasse", "Mug", { source: "manual" }), "Big mug"))
  check("  outdated, it is theirs to review, and only theirs", needsReview(row("k", "Tasse", "Mug", { source: "manual" }), "Big mug") && !needsReview(row("k", "Tasse", "Mug", { source: "manual" }), "Mug") && !needsReview(row("k", "Tasse", "Mug"), "Big mug"))
  const reuse = reusableTranslations([row("menu:a", "Boutique", "Shop"), row("menu:b", "Magasin", "Shop", { source: "manual" }), row("menu:c", "Brouillon", "Draft", { status: "draft" })])
  check("the same original elsewhere is reused, the merchant's first", reuse.get(sourceHash("Shop")) === "Magasin")
  check("  never a draft", !reuse.has(sourceHash("Draft")))

  console.log("\nThe setting")
  const on = validateLocalization({ defaultLanguage: "en", languages: [{ code: "fr", published: true }], markets: [{ id: "a", name: "Home", primary: true }], autoTranslate: true }, { baseCurrency: "RON" })
  check("saved with the rest", on.ok && on.value.autoTranslate === true)
  const off = validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "Home", primary: true }] }, { baseCurrency: "RON" })
  check("  off unless turned on", off.ok && off.value.autoTranslate === false)
  const server = read("lib/markets/server.ts")
  check("  until part 175 runs, everything else saves and the switch says what it needs", /autoTranslateMissing\(auto\.error\)/.test(server) && /AUTO_TRANSLATE_NEEDS_PART/.test(server) && /Run SQL part 175 in Supabase/.test(server))
  const panel = read("components/app/settings/markets-panel.tsx")
  check(
    "  the switch in Languages & Currency, with where it stands",
    /* Changed on purpose (translate within minutes of a publish): the last run's line became a status (up to date, translating now, translator unreachable) with the translations to review. */
    /label=\{tt\("Translate changes automatically"\)\}/.test(panel) && /<AutoTranslateStatus/.test(panel),
  )
  const sql = read("supabase/sql/run-now/175_automatic_translation.sql")
  check("SQL part 175: one statement a line, safe to run again, schema reloaded last", sql.trim().split("\n").length === 3 && /ADD COLUMN IF NOT EXISTS auto_translate boolean NOT NULL DEFAULT false/.test(sql) && /ADD COLUMN IF NOT EXISTS auto_translate_run jsonb/.test(sql) && /notify pgrst, 'reload schema';$/.test(sql.trim()))
  check("  the same as its migration, and checked after", sql === read("supabase/migrations/20270115_automatic_translation.sql") && /as p175_automatic_translation/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
  check("the safety sweep runs hourly, behind the cron secret, and is listed", vercel.crons.some((c) => c.path === "/api/cron/translations" && c.schedule === "47 * * * *") && /requireBearerSecret\(request, "CRON_SECRET"\)/.test(read("app/api/cron/translations/route.ts")) && /"\/api\/cron\/translations"/.test(read("lib/admin/schema-expectations.ts")))

  console.log("\nThe switch says what happens, in plain words")
  check("when: within a few minutes of a publish, not each hour", /When you publish changes, new and edited text is translated into your other languages within a few minutes\. Translations you edit yourself are never replaced\./.test(panel) && !/Each hour|each hour/.test(panel))
  check("  where it stands: up to date, translating now, or the translator out of reach", /tt\("Up to date, checked \{at\}"/.test(panel) && /tt\("\{left\} waiting, translating now"/.test(panel) && /tt\("Translating your latest changes"\)/.test(panel) && /It tries again in a few minutes\./.test(panel))
  check("  the merchant's own with a changed original: counted, with Review", /need a look because the original changed\./.test(panel) && /data-review-translations=""/.test(panel) && /reviewLanguage\(first\)/.test(panel))
  check("  and on each language's row", /p\.review \? tt\("\{count\} need a look"/.test(panel))
  check("  no em dash in what it says", !/\u2014/.test(panel.split("function AutoTranslateStatus")[1]?.split("export function MarketsPanel")[0] ?? "x"))
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("the Translate sheet lists them under Needs review, opened there from the count", /review: \{ get label\(\) \{ return tt\("Needs review"\) \}/.test(sheet) && /setFilter\(focus === "review" \? "review" : "todo"\)/.test(sheet) && /focus=\{sheetFocus\}/.test(panel))
  check("  Keep as is saves it for the new original, an edit makes it theirs as before", /i\.review \? tt\("Keep as is"\) : tt\("Approve"\)/.test(sheet))
  check("  Translate the rest never offers to redo them", /* Changed on purpose (round K3): nor one kept as written. */ /const aiCanDo = \(i: Item\) => !i\.excluded && \(i\.status === "missing" \|\| \(i\.status === "outdated" && !i\.review\)\)/.test(sheet) && /items\.some\(aiCanDo\)/.test(sheet))
  const route = read("app/api/store/translations/route.ts")
  check("  counted per language by the server, as translated and live", /if \(needsReview\(map\.get\(t\.key\), t\.source\)\) \{\s*row\.done\+\+\s*row\.review\+\+/.test(route) && /review: needsReview\(row, t\.source\)/.test(route))
  check("the builder's preview hides Storelib AI's outdated ones as the website does, and keeps the merchant's", /s: "ai" as const/.test(route) && /source: x\.s === "ai" \? \("ai" as const\) : \("manual" as const\)/.test(read("components/website-builder/use-preview-language.ts")))

  console.log("\nMarked when the website changes, translated minutes later")
  const p186 = read("supabase/sql/run-now/186_translation_queue.sql")
  check("SQL part 186: one statement a line, safe to run again, schema reloaded last", p186.trim().split("\n").length === 3 && /ADD COLUMN IF NOT EXISTS translate_dirty_at timestamptz/.test(p186) && /ADD COLUMN IF NOT EXISTS translate_lease_until timestamptz/.test(p186) && /CREATE INDEX IF NOT EXISTS idx_store_localization_translate_dirty ON public\.store_localization \(translate_dirty_at\) WHERE translate_dirty_at IS NOT NULL/.test(p186) && /notify pgrst, 'reload schema';$/.test(p186.trim()))
  check("  the same as its migration, checked after, and in the bundles", p186 === read("supabase/migrations/20270125_translation_queue.sql") && /as p186_translation_queue/.test(read("supabase/sql/run-now/99_check_after.sql")) && /186_translation_queue\.sql/.test(read("scripts/build-currency-cod-languages-sql.py")) && read("supabase/sql/store-currency-cod-languages/1_run.sql").includes(p186.split("\n")[1]) && /part: "186", file: "186_translation_queue\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))
  const marks: [string, RegExp][] = [
    ["app/api/website-builder/themes/[installId]/publish/route.ts", /translationsChanged\(creator\.id\)/],
    ["app/api/website-builder/themes/[installId]/sections/route.ts", /if \(mode === "publish" && creatorId\) \{\s*await revalidatePublishedSite\(creatorId\)[\s\S]{0,200}translationsChanged\(creatorId\)/],
    ["app/api/website-builder/themes/[installId]/sections/sync-global/route.ts", /translationsChanged\(\(creator as \{ id: string \}\)\.id\)/],
    ["app/api/website-builder/themes/[installId]/settings/route.ts", /if \(update\.settings !== undefined && creatorId\) \{[\s\S]{0,250}translationsChanged\(creatorId\)/],
    ["app/api/website-builder/menus/route.ts", /translationsChanged\(who\.creatorId\)/],
    ["app/api/revalidate/route.ts", /translationsChanged\(owned\.creator_id\)/],
    ["app/api/physical/products/[id]/route.ts", /translationsChanged\(c\.creatorId\)/],
    ["app/api/collections/route.ts", /translationsChanged\(c\.creatorId\)/],
    ["app/api/collections/[id]/route.ts", /translationsChanged\(c\.creatorId\)/],
  ]
  const unmarked = marks.filter(([f, re]) => !re.test(read(f)) || !/import \{ translationsChanged \} from "@\/lib\/markets\/translate-queue"/.test(read(f))).map(([f]) => f)
  check("publishing, a page saved live, theme settings, menus, a product and a collection mark the store", unmarked.length === 0, unmarked)
  const queueSrc = read("lib/markets/translate-queue.ts")
  check("  the mark is one update after the answer, for stores with the switch on, and never fails a save", /after\(work\)/.test(queueSrc) && /\.eq\("auto_translate", true\)/.test(queueSrc) && /catch \{/.test(queueSrc))
  check("  turning it on marks the store too", /if \(!auto\.error && v\.autoTranslate\) await markTranslationsChanged\(db, creatorId\)/.test(read("lib/markets/server.ts")))
  const jobsRoute = read("app/api/cron/translation-jobs/route.ts")
  /* Changed on purpose: main moved the run to every five minutes to cut Vercel invocations. */
  check("the five-minute run takes the changed stores beside the background jobs", vercel.crons.some((c) => c.path === "/api/cron/translation-jobs" && c.schedule === "*/5 * * * *") && /Promise\.all\(\[continueJobs\(started \+ RUN_WINDOW_MS\), runChangedStores\(started \+ RUN_WINDOW_MS\)\]\)/.test(jobsRoute))

  console.log("\nAn hour's run, against a model and a database")
  const http = createServer(answer)
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r))
  /* The paid model is reached only with no free translator: the keyless fallback is off here. */
  process.env.TRANSLATE_FREE_FALLBACK = "off"
  process.env.OPENAI_API_KEY = "test-key"
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(http.address() as AddressInfo).port}/v1`
  const { autoTranslateStore } = await import("@/lib/markets/auto-translate")
  const tables = () => ({
    store_localization: [{ creator_id: "c1", default_language: "en", languages: [{ code: "fr", published: true }], markets: [], visitor_language: false, auto_translate: true, auto_translate_run: {} }],
    products: [
      { id: P1, title: "Mug", description: "", seo_title: "", seo_description: "" },
      { id: P2, title: "Bowl", description: "Hello {{ name }}", seo_title: "", seo_description: "" },
      { id: P3, title: "Plate", description: "", seo_title: "", seo_description: "" },
    ],
    site_translations: [
      /* The merchant's own, written for an older title: still never replaced. */
      { key: `product:${P3}:title`, value: "Assiette", source_hash: sourceHash("Old plate"), status: "approved", source: "manual" },
      /* Up to date: never sent again. */
      { key: `product:${P1}:title`, value: "Tasse", source_hash: sourceHash("Mug"), status: "approved", source: "ai" },
    ],
  })
  const first = fakeDb(tables())
  const run = await autoTranslateStore(first.db as never, "c1", Date.now() + 60_000)
  const written = first.writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Record<string, unknown>[])
  const keyOf = (k: string) => written.find((w) => w.key === k)
  check("the new title is translated and goes live, labelled as Storelib AI's", keyOf(`product:${P2}:title`)?.value === "FR Bowl" && keyOf(`product:${P2}:title`)?.status === "approved" && keyOf(`product:${P2}:title`)?.source === "ai", keyOf(`product:${P2}:title`))
  check("the one already up to date is not sent", !asked.includes(`product:${P1}:title`))
  check("the merchant's own is neither sent nor written", !asked.includes(`product:${P3}:title`) && !keyOf(`product:${P3}:title`))
  check("one that lost its placeholder is not kept: the original shows, and it is tried again", !keyOf(`product:${P2}:description`) && asked.includes(`product:${P2}:description`))
  check("the run says what it did and what is left", !!run && run.translated === written.length && run.left >= 1 && !run.error, run)

  const sentBefore = asked.length
  const dup = fakeDb({ ...tables(), products: [{ id: P1, title: "Mug", description: "", seo_title: "", seo_description: "" }, { id: P2, title: "Mug", description: "", seo_title: "", seo_description: "" }] })
  await autoTranslateStore(dup.db as never, "c1", Date.now() + 60_000)
  const dupRows = dup.writes.filter((w) => w.table === "site_translations" && w.kind === "upsert").flatMap((w) => w.rows as Record<string, unknown>[])
  check("a text already translated under another key is reused, with no call for it", dupRows.find((r) => r.key === `product:${P2}:title`)?.value === "Tasse" && !asked.slice(sentBefore).includes(`product:${P2}:title`), dupRows)

  const offDb = fakeDb({ ...tables(), store_localization: [{ ...tables().store_localization[0], auto_translate: false }] })
  check("with the switch off, nothing runs", (await autoTranslateStore(offDb.db as never, "c1", Date.now() + 60_000)) === null && offDb.writes.length === 0)

  const late = fakeDb(tables())
  const callsBefore = calls
  const lateRun = await autoTranslateStore(late.db as never, "c1", Date.now() + 5_000)
  check("no time left: nothing sent, everything counted for the next run", calls === callsBefore && !!lateRun && lateRun.translated === 0 && lateRun.left > 0, lateRun)

  process.env.OPENAI_API_KEY = ""
  const down = await autoTranslateStore(fakeDb(tables()).db as never, "c1", Date.now() + 60_000)
  check("Storelib AI unreachable: the run says so, and the original shows", !!down && down.error === "unavailable" && down.left > 0, down)

  console.log("\nThe changed stores, against a model and a database")
  process.env.OPENAI_API_KEY = "test-key"
  const { runChangedStores, runAutoTranslate, outcomeOf } = await import("@/lib/markets/auto-translate")
  const { markTranslationsChanged, SETTLE_MS } = await import("@/lib/markets/translate-queue")
  check("what a run leaves: done, more to do, or tried again later", outcomeOf(null) === "done" && outcomeOf({ at: "", translated: 3, left: 0 }) === "done" && outcomeOf({ at: "", translated: 3, left: 4 }) === "more" && outcomeOf({ at: "", translated: 0, left: 4 }) === "done" && outcomeOf({ at: "", translated: 0, left: 4, error: "unavailable" }) === "retry")
  const seen = new Date(Date.now() - SETTLE_MS - 60_000).toISOString()
  const marked = () => {
    const t = tables()
    return { ...t, store_localization: [{ ...t.store_localization[0], translate_dirty_at: seen }], products: [{ id: P1, title: "Mug", description: "", seo_title: "", seo_description: "" }, { id: P3, title: "Plate", description: "", seo_title: "", seo_description: "" }] }
  }
  const loc = (w: { table: string }) => w.table === "store_localization"
  const has = (w: { filters: [string, unknown[]][] }, col: string, v: unknown) => w.filters.some(([m, a]) => m === "eq" && a[0] === col && a[1] === v)
  const changed = fakeDb(marked())
  const callsBeforeQueue = calls
  const out = await runChangedStores(Date.now() + 120_000, changed.db as never)
  const locWrites = changed.writes.filter(loc)
  const lease = locWrites.find((w) => typeof (w.rows as Record<string, unknown>).translate_lease_until === "string")
  check("a marked store is held by its lease, for the mark it read", !!lease && has(lease, "translate_dirty_at", seen), lease)
  check("  translated and live", out.stores === 1 && out.translated > 0 && calls > callsBeforeQueue, out)
  /* The shop's built-in words are more than one run's share: progress, with more to do. */
  check("  more to do after real progress: still marked, so the next run carries on", out.left > 0 && !locWrites.some((w) => "translate_dirty_at" in (w.rows as Record<string, unknown>)), out)
  check("  the lease let go for that next run", locWrites.some((w) => (w.rows as Record<string, unknown>).translate_lease_until === null))
  const done = fakeDb({ ...marked(), store_localization: [{ ...marked().store_localization[0], auto_translate: false }] })
  await runChangedStores(Date.now() + 120_000, done.db as never)
  const cleared = done.writes.filter(loc).find((w) => (w.rows as Record<string, unknown>).translate_dirty_at === null)
  check("nothing left to do (here, the switch turned off since): the mark cleared, only if no newer change came in meanwhile", !!cleared && has(cleared, "translate_dirty_at", seen), done.writes.filter(loc).map((w) => w.rows))
  check("  the merchant's own is neither sent nor written", !keyOfIn(changed.writes, `product:${P3}:title`))
  const held = fakeDb(marked(), { claim: false })
  const callsBeforeHeld = calls
  const heldOut = await runChangedStores(Date.now() + 120_000, held.db as never)
  check("one another run holds is left to it: nothing sent, nothing written", heldOut.stores === 0 && calls === callsBeforeHeld && !held.writes.some((w) => w.table === "site_translations"), heldOut)
  const noQueue = fakeDb(marked(), { missing: "translate_dirty_at" })
  check("before part 186: nothing here, the hourly run works as before", (await runChangedStores(Date.now() + 120_000, noQueue.db as never)).skipped === "no queue")

  console.log("\nThe hourly sweep only queues the quiet stores")
  const sweepTables = (at: string | null) => ({ ...tables(), store_localization: [{ ...tables().store_localization[0], translate_dirty_at: null, auto_translate_run: at ? { at, translated: 0, left: 0 } : {} }] })
  const quiet = fakeDb(sweepTables(new Date(Date.now() - 2 * 86_400_000).toISOString()))
  const callsBeforeSweep = calls
  const swept = await runAutoTranslate(Date.now() + 120_000, quiet.db as never)
  const queuedWrite = quiet.writes.find((w) => loc(w) && typeof (w.rows as Record<string, unknown>).translate_dirty_at === "string")
  check("a store nothing marked for a day is queued, translated by the next three-minute run", swept.queued === 1 && !!queuedWrite && queuedWrite.filters.some(([m, a]) => m === "in" && a[0] === "creator_id"), swept)
  check("  the sweep itself translates nothing", calls === callsBeforeSweep && !quiet.writes.some((w) => w.table === "site_translations"))
  const recent = fakeDb(sweepTables(new Date(Date.now() - 3_600_000).toISOString()))
  const recentOut = await runAutoTranslate(Date.now() + 120_000, recent.db as never)
  check("  one translated an hour ago is left alone", recentOut.queued === 0 && !recent.writes.some((w) => loc(w) && "translate_dirty_at" in (w.rows as Record<string, unknown>)), recentOut)
  const before186 = fakeDb(sweepTables(null), { missing: "translate_dirty_at" })
  const before186Out = await runAutoTranslate(Date.now() + 120_000, before186.db as never)
  check("  before part 186 it translates the stores itself, as it always did", before186Out.queued === undefined && before186Out.stores === 1, before186Out)

  console.log("\nThe mark")
  const marking = fakeDb(tables())
  await markTranslationsChanged(marking.db as never, "c1")
  const mark = marking.writes[0]
  check("one update of the store's row, only with the switch on", marking.writes.length === 1 && typeof (mark.rows as Record<string, unknown>).translate_dirty_at === "string" && has(mark, "creator_id", "c1") && has(mark, "auto_translate", true), marking.writes)
  let threw = false
  try {
    await markTranslationsChanged({ from() { throw new Error("down") } } as never, "c1")
  } catch {
    threw = true
  }
  check("  a database that is down never fails the save", !threw)

  console.log("\nThe translator out of reach (last: Storelib AI pauses itself after this)")
  /* The translator out of reach: every call refused. Fresh words, so none is found already translated. */
  refusing = true
  const unreachable = fakeDb({ ...marked(), products: [{ id: P1, title: "Saucer", description: "", seo_title: "", seo_description: "" }] })
  const unreachableOut = await runChangedStores(Date.now() + 120_000, unreachable.db as never)
  refusing = false
  const later = unreachable.writes.filter(loc).find((w) => typeof (w.rows as Record<string, unknown>).translate_dirty_at === "string")
  check("translator unreachable: tried again in a few minutes, not every run", !!later && Date.parse((later.rows as { translate_dirty_at: string }).translate_dirty_at) > Date.now() && has(later, "translate_dirty_at", seen), { out: unreachableOut, writes: unreachable.writes.filter(loc).map((w) => w.rows) })
  http.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
