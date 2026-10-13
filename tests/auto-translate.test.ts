/**
 * Translate changes automatically (lib/markets/auto-translate.ts): each hour,
 * a store's new and changed website text is translated into its other
 * languages and goes live; only what changed, a text already translated
 * elsewhere reused with no call, never a translation the merchant wrote, and
 * never one that lost a placeholder, a Liquid tag, a link or an HTML tag
 * (lib/markets/draft-check.ts). Against a real HTTP server standing in for
 * the model and a database that records every write.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fixedParts, keepsFixedParts } from "@/lib/markets/draft-check"
import { aiMayWrite, reusableTranslations, sourceHash, type TranslationRow } from "@/lib/markets/translate"
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
function answer(req: IncomingMessage, res: ServerResponse) {
  let raw = ""
  req.on("data", (c) => { raw += c })
  req.on("end", () => {
    calls++
    const body = JSON.parse(raw) as { input: { content: { text: string }[] }[] }
    const items = (JSON.parse(body.input[0].content[0].text) as { items: { key: string; text: string }[] }).items
    asked.push(...items.map((i) => i.key))
    const text = JSON.stringify({ translations: items.map((i) => ({ key: i.key, text: i.text.includes("{{ name }}") ? `FR Bonjour` : `FR ${i.text}` })) })
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ id: `resp_${calls}`, object: "response", created_at: 0, status: "completed", model: "test", output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }] }))
  })
}

/** A database: rows by table, every write kept. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const writes: { table: string; kind: string; rows: unknown }[] = []
  return {
    writes,
    db: {
      from(table: string) {
        let single = false
        let manualOnly = false
        const q: Record<string, unknown> = {}
        for (const m of ["select", "in", "order", "limit", "range", "delete", "neq", "is", "not", "or", "ilike", "gte", "lte"]) q[m] = () => q
        q.eq = (col: string, v: unknown) => { if (col === "source" && v === "manual") manualOnly = true; return q }
        q.maybeSingle = () => { single = true; return q }
        q.single = () => { single = true; return q }
        q.upsert = (rows: unknown) => { writes.push({ table, kind: "upsert", rows }); return Promise.resolve({ error: null }) }
        q.update = (rows: unknown) => { writes.push({ table, kind: "update", rows }); return { eq: () => Promise.resolve({ error: null }) } }
        q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          let rows = tables[table] ?? []
          if (manualOnly) rows = rows.filter((r) => r.source === "manual")
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(ok, bad)
        }
        return q
      },
    },
  }
}

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
  check("  the switch in Markets and languages, with what its last run did", /label=\{tt\("Translate changes automatically"\)\}/.test(panel) && /<AutoTranslateRunLine run=/.test(panel))
  const sql = read("supabase/sql/run-now/175_automatic_translation.sql")
  check("SQL part 175: one statement a line, safe to run again, schema reloaded last", sql.trim().split("\n").length === 3 && /ADD COLUMN IF NOT EXISTS auto_translate boolean NOT NULL DEFAULT false/.test(sql) && /ADD COLUMN IF NOT EXISTS auto_translate_run jsonb/.test(sql) && /notify pgrst, 'reload schema';$/.test(sql.trim()))
  check("  the same as its migration, and checked after", sql === read("supabase/migrations/20270115_automatic_translation.sql") && /as p175_automatic_translation/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
  check("the job runs hourly, behind the cron secret, and is listed", vercel.crons.some((c) => c.path === "/api/cron/translations" && c.schedule === "47 * * * *") && /requireBearerSecret\(request, "CRON_SECRET"\)/.test(read("app/api/cron/translations/route.ts")) && /"\/api\/cron\/translations"/.test(read("lib/admin/schema-expectations.ts")))

  console.log("\nAn hour's run, against a model and a database")
  const http = createServer(answer)
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r))
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

  http.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
