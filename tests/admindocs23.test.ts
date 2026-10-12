/**
 * /admin/physical-commerce (round 23, A23): the owner's documentation of
 * physical and digital commerce, and its live status.
 *
 *   lib/admin/commerce-docs.ts        the words, one section per area
 *   lib/admin/commerce-docs-facts.ts  the lists printed from the code
 *   lib/admin/commerce-status.ts      the live status, from real data
 *   app/admin/physical-commerce/**    the page, admin only
 *   app/api/admin/commerce-status     the status for Refresh, admin only
 *
 * What this proves: every address the page links to exists, every file it
 * says it was written from exists, every table it names is made by an SQL
 * part, every label it copies is still the label the screen shows, every
 * Stripe event it asks for is handled, and the status never prints a number
 * it did not read: with nothing readable, every figure is null.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CommerceDocsAdmin } from "@/app/admin/physical-commerce/commerce-docs-admin"
import { COMMERCE_DOCS, matchesQuery, searchTextOf, type FactKey } from "@/lib/admin/commerce-docs"
import { FULFILMENT_MODEL_LABELS, LOCATION_KIND_LABELS, RATE_KINDS, STRIPE_COMMERCE_EVENTS, factFor, factsFor } from "@/lib/admin/commerce-docs-facts"
import { COMMERCE_PARTS, COMMERCE_TABLES, WATCHED_JOBS, jobHealth, keyMode, lateAfterHours, readCommerceStatus } from "@/lib/admin/commerce-status"
import { CRON_JOBS } from "@/lib/admin/schema-expectations"
import { SQL_PARTS } from "@/lib/admin/sql-parts.generated"
import { CUSTOMER_EMAILS } from "@/lib/emails/customer-catalog"
import { PHYSICAL_ARTICLES } from "@/lib/help/physical-articles"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { CARRIER_LIST } from "@/lib/physical/carriers"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const read = (p: string) => untt(readFileSync(p, "utf8"), p)

/* ── 1. The shape: ids, anchors, nothing empty ─────────────────────────── */

console.log("\nThe sections")
const ids = COMMERCE_DOCS.map((s) => s.id)
check("sections have unique ids", new Set(ids).size === ids.length, ids.join(","))
const anchors = COMMERCE_DOCS.flatMap((s) => [s.id, ...s.topics.map((t) => `${s.id}-${t.id}`)])
check("every anchor is unique, and none is the status block's", new Set(anchors).size === anchors.length && !anchors.includes("status"))
check("every anchor is a plain slug", anchors.every((a) => /^[a-z0-9-]+$/.test(a)))
for (const want of ["store-details", "checkout", "sales-channels", "emails", "taxes", "shipping", "locations-inventory", "returns-refunds", "domains", "integrations", "orders", "tracking", "receipts", "testing"]) {
  check(`the ${want} section is there`, ids.includes(want))
}
check("every section has an intro and at least one topic", COMMERCE_DOCS.every((s) => s.intro.length > 40 && s.topics.length > 0))
check("every topic says what it does", COMMERCE_DOCS.every((s) => s.topics.every((t) => t.does.length > 20)))
const withChecks = COMMERCE_DOCS.flatMap((s) => s.topics).filter((t) => t.check?.length).length
check("at least 20 topics say how to check them", withChecks >= 20, String(withChecks))

/* ── 2. The words: Storelib's copy rules ───────────────────────────────── */

console.log("\nThe words")
const OWN_FILES = [
  "lib/admin/commerce-docs.ts",
  "lib/admin/commerce-docs-facts.ts",
  "lib/admin/commerce-status.ts",
  "app/admin/physical-commerce/page.tsx",
  "app/admin/physical-commerce/commerce-docs-admin.tsx",
  "app/api/admin/commerce-status/route.ts",
  "tests/admindocs23.test.ts",
]
const EM_DASH = String.fromCharCode(0x2014)
const BANNED = new RegExp(["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge", "trans" + "form"].join("|"), "i")
for (const f of OWN_FILES) {
  const text = read(f)
  check(`${f}: no em dash`, !text.includes(EM_DASH))
  check(`${f}: none of the banned words`, !BANNED.test(text), text.match(BANNED)?.[0])
}
const allCopy = JSON.stringify(COMMERCE_DOCS)
check("the copy has no em dash and no banned word", !allCopy.includes(EM_DASH) && !BANNED.test(allCopy))

/* ── 3. Every link goes somewhere real ─────────────────────────────────── */

console.log("\nThe links")
const settingsTabs = new Set([...read("components/app/settings-form-new.tsx").matchAll(/\{ id: "([a-z_]+)", label: "[^"]+", icon:/g)].map((m) => m[1]))
const pageExists = (path: string): boolean => {
  const clean = path.split(/[?#]/)[0].replace(/\/$/, "")
  const candidates = [`app${clean}/page.tsx`, `app/(marketing)${clean}/page.tsx`, `app${clean}/[[...path]]/page.tsx`]
  return candidates.some((c) => existsSync(c))
}
const hrefs = COMMERCE_DOCS.flatMap((s) => [s.where?.href, ...s.topics.flatMap((t) => [...(t.buyers ?? []), ...(t.creators ?? [])].map((p) => p.href))]).filter((h): h is string => !!h)
check("there are links to check", hrefs.length > 20, String(hrefs.length))
for (const h of [...new Set(hrefs)]) {
  const tab = h.match(/^\/app\/settings\?tab=([a-z_]+)/)?.[1]
  if (tab) check(`${h}: Settings has that tab`, settingsTabs.has(tab), [...settingsTabs].join(","))
  else check(`${h}: the page exists`, pageExists(h))
}
check("no link is an address that depends on the creator", hrefs.every((h) => !/[<>]/.test(h) && h.startsWith("/")))

console.log("\nThe files each section was written from")
for (const s of COMMERCE_DOCS) for (const f of s.code) check(`${s.id}: ${f} exists`, existsSync(f))

console.log("\nThe tables the page names")
const sqlText = [
  ...readdirSync("supabase/sql/run-now").map((f) => join("supabase/sql/run-now", f)),
  ...readdirSync("supabase/sql").filter((f) => f.endsWith(".sql")).map((f) => join("supabase/sql", f)),
  ...(existsSync("supabase/migrations") ? readdirSync("supabase/migrations").map((f) => join("supabase/migrations", f)) : []),
]
  .filter((f) => f.endsWith(".sql"))
  .map(read)
  .join("\n")
  .toLowerCase()
const tableExists = (t: string) => new RegExp(`(create table (if not exists )?(public\\.)?"?${t}"?\\b)|(public\\.${t}\\b)`).test(sqlText)
const stored = COMMERCE_DOCS.flatMap((s) => s.topics.map((t) => t.stored ?? "")).join(" ")
const named = new Set([...stored.matchAll(/\b([a-z][a-z_]+)\.[a-z_]+/g)].map((m) => m[1]).filter((t) => t.includes("_") || ["products", "orders", "creators", "coupons", "fulfillments"].includes(t)))
for (const t of COMMERCE_TABLES) named.add(t)
for (const t of named) check(`table ${t} is made by an SQL part`, tableExists(t))

console.log("\nThe Help Center articles")
const slugs = new Set(PHYSICAL_ARTICLES.map((a) => a.slug))
for (const s of COMMERCE_DOCS) for (const h of s.help ?? []) check(`${s.id}: /help/physical-products/${h} exists`, slugs.has(h))

/* ── 4. The lists printed from the code ────────────────────────────────── */

console.log("\nThe lists from the code")
const keys = [...new Set(COMMERCE_DOCS.flatMap((s) => s.facts ?? []))] as FactKey[]
for (const k of keys) {
  const f = factFor(k)
  check(`${k}: has rows and names its source`, f.rows.length > 0 && f.source.length > 5)
}
check("every customer email is listed", factFor("customerEmails").rows.length === CUSTOMER_EMAILS.length)
check("every integration is listed", factFor("integrations").rows.length === INTEGRATIONS.length)
check("the carriers line names every carrier", CARRIER_LIST.every((c) => factFor("carriers").rows[0].name.includes(c.name)))
check("the seller list has the new sale notice and low stock", factFor("sellerEmails").rows.some((r) => r.name === "New sale") && factFor("sellerEmails").rows.some((r) => r.name === "Low stock"))
check("factsFor hands back every key asked", Object.keys(factsFor(keys)).length === keys.length)

const shipping = read("components/physical/shipping-settings.tsx")
for (const r of Object.values(RATE_KINDS)) check(`rate label "${r.label}" is still in Settings`, shipping.includes(`"${r.label}"`))
for (const l of Object.values(FULFILMENT_MODEL_LABELS)) check(`fulfilment label "${l}" is still in Settings`, shipping.includes(`"${l}"`))
for (const l of Object.values(LOCATION_KIND_LABELS)) check(`location label "${l}" is still in Settings`, shipping.includes(`"${l}"`))
const checkoutPanel = read("components/app/settings/checkout-panel.tsx")
for (const row of factFor("checkoutDefaults").rows) check(`checkout label "${row.name}" is still in Settings`, checkoutPanel.includes(row.name))
const webhook = read("app/api/stripe/webhook/route.ts")
for (const e of STRIPE_COMMERCE_EVENTS) check(`Stripe ${e.type} is handled by the webhook`, webhook.includes(`"${e.type}"`))

/* ── 5. The search ─────────────────────────────────────────────────────── */

console.log("\nThe search")
const hits = (q: string) => COMMERCE_DOCS.flatMap((s) => s.topics.filter((t) => matchesQuery(searchTextOf(s, t), q)).map((t) => `${s.id}-${t.id}`))
check("abandoned finds the checkout reminder", hits("abandoned").includes("checkout-abandoned"))
check("low stock finds the low stock line", hits("low stock").includes("locations-inventory-low-stock"))
check("tracking finds the order page", hits("tracking").length > 0)
check("two words must both match", hits("tax zzzz").length === 0)
check("case does not matter", hits("VAT").length > 0)

/* ── 6. The status: real or nothing ────────────────────────────────────── */

console.log("\nThe status helpers")
check("live secret key reads live", keyMode("sk_live_abc", "secret") === "live")
check("test secret key reads test", keyMode("sk_test_abc", "secret") === "test")
check("restricted key reads restricted", keyMode("rk_live_abc", "secret") === "restricted")
check("no key reads missing", keyMode(undefined, "secret") === "missing" && keyMode("  ", "publishable") === "missing")
check("a stray value reads invalid", keyMode("hello", "secret") === "invalid" && keyMode("sk_live_x", "publishable") === "invalid")
check("hourly jobs are late after 3 hours", lateAfterHours("0 * * * *") === 3)
check("every ten minutes is late after an hour", lateAfterHours("3,13,23,33,43,53 * * * *") === 1)
check("daily is late after 30 hours", lateAfterHours("0 1 * * *") === 30)
const now = Date.parse("2026-10-11T12:00:00Z")
check("no run reads no record", jobHealth(null, "0 * * * *", now).health === "unknown")
check("a failed run reads failed", jobHealth({ startedAt: "2026-10-11T11:00:00Z", finishedAt: "2026-10-11T11:00:05Z", ok: false, status: 500 }, "0 * * * *", now).health === "failed")
check("an old run reads late", jobHealth({ startedAt: "2026-10-11T06:00:00Z", finishedAt: "2026-10-11T06:00:05Z", ok: true, status: 200 }, "0 * * * *", now).health === "late")
check("a recent good run reads running", jobHealth({ startedAt: "2026-10-11T11:00:00Z", finishedAt: "2026-10-11T11:00:05Z", ok: true, status: 200 }, "0 * * * *", now).health === "ok")
check("the three watched jobs are scheduled jobs", WATCHED_JOBS.every((w) => CRON_JOBS.some((j) => j.path === w.path)) && WATCHED_JOBS.length === 3)
check("each watched job writes its runs down", WATCHED_JOBS.every((w) => read(`app/api/cron/${w.path.split("/").pop()}/route.ts`).includes(`recordCronRun("${w.path}"`)))
check("every commerce part in the repository is watched", ["78", "109", "110", "129"].every((p) => COMMERCE_PARTS.includes(p) && SQL_PARTS.some((x) => x.part === p)))

/* The rest reads the status, which is asynchronous; the project compiles to ES6, so no top-level await. */
async function rest() {
console.log("\nThe status with nothing readable")
/* A database that answers every question with "no such table". */
const missing = { data: null, error: { code: "42P01", message: 'relation "x" does not exist' }, count: null }
const chain: any = new Proxy(function () {}, {
  get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(missing) : chain),
  apply: () => chain,
})
const reasons = new Map<string, string>()
const fakeReader: any = {
  db: { from: () => chain, rpc: () => chain },
  count: async (metric: string) => {
    reasons.set(metric, "Not in the database")
    return null
  },
  rows: async (metric: string) => {
    reasons.set(metric, "Not in the database")
    return null
  },
  reasonFor: (metric: string) => reasons.get(metric) ?? null,
}
const saved = { ...process.env }
for (const k of ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "MAILGUN_API_KEY", "MAILGUN_DOMAIN", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "PHYSICAL_COMMERCE_ENABLED", "CRON_SECRET"]) delete process.env[k]
const status = await readCommerceStatus(fakeReader, now)
Object.assign(process.env, saved)
check("the switch says it could not be read, not off", status.physical.enabled === null)
check("every count is null, never zero", status.counts.length >= 10 && status.counts.every((c) => c.value === null && !!c.reason))
check("every job reads no record", status.jobs.every((j) => j.health === "unknown" && j.lastRun === null && j.runs24h === null))
check("email reads not configured", status.email.configured === false && status.email.lastSentAt === null && status.email.cronSecretSet === false)
check("Stripe reads not configured and was not asked", status.stripe.secretKey === "missing" && !status.stripe.endpoint.asked && status.stripe.lastEventAt === null && status.stripe.events24h === null)
check("parts read unknown without the record", status.parts.length > 0 && status.parts.every((p) => p.state === "unknown"))
check("tables read missing", status.tables.every((t) => t.present === false))

/* ── 7. The page and its gate ──────────────────────────────────────────── */

console.log("\nThe page")
const html = renderToStaticMarkup(createElement(CommerceDocsAdmin, { docs: COMMERCE_DOCS, facts: factsFor(keys), help: PHYSICAL_ARTICLES.map((a) => ({ slug: a.slug, title: a.title })), withStatus: false }))
check("every section is drawn with its anchor", COMMERCE_DOCS.every((s) => html.includes(`id="${s.id}"`)))
check("every topic is drawn with its anchor", COMMERCE_DOCS.every((s) => s.topics.every((t) => html.includes(`id="${s.id}-${t.id}"`))))
check("the contents link to every section", COMMERCE_DOCS.every((s) => html.includes(`href="#${s.id}"`)))
check("the search box is there", html.includes('type="search"'))
check("the code lists are drawn", keys.every((k) => html.includes(`data-fact="${k}"`)))
check("help links are drawn", html.includes('href="/help/physical-products/'))

const page = read("app/admin/physical-commerce/page.tsx")
check("the page checks the admin cookie before anything else", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(page) && page.indexOf("isAdminAuthenticated()") < page.indexOf("factsFor("))
check("the page is never indexed", /index: false/.test(page))
const route = read("app/api/admin/commerce-status/route.ts")
check("the status route asks for the admin first", /const denied = await requireAdmin\(\)\s*\n\s*if \(denied\) return denied/.test(route) && route.indexOf("requireAdmin()") < route.indexOf("readCommerceStatus()"))
check("the console's navigation has Physical commerce", /\{ href: "\/admin\/physical-commerce", label: "Physical commerce" \}/.test(read("app/admin/_console/shell.tsx")))
{
  /* Secrets planted in the environment never come back in the status: only their mode and whether they are set. */
  const keep = { ...process.env }
  Object.assign(process.env, { STRIPE_SECRET_KEY: "plantedsecret1", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_plantedsecret2", STRIPE_WEBHOOK_SECRET: "whsec_plantedsecret3", MAILGUN_API_KEY: "plantedsecret4", MAILGUN_DOMAIN: "mg.example.com" })
  const planted = JSON.stringify(await readCommerceStatus(fakeReader, now))
  for (const k of ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "MAILGUN_API_KEY", "MAILGUN_DOMAIN"]) delete process.env[k]
  Object.assign(process.env, keep)
  check("the status never sends a key", !planted.includes("plantedsecret") && !planted.includes("mg.example.com"))
  check("planted keys read by their mode", planted.includes('"publishableKey":"test"') && planted.includes('"secretKey":"invalid"') && planted.includes('"platformWebhookSecret":true') && planted.includes('"configured":true'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
}

rest().catch((e) => {
  console.error(e)
  process.exit(1)
})
