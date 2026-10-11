/**
 * /admin/physical-commerce with its real content, for
 * scripts/check-admindocs23.mjs. The page component, the real sections
 * (lib/admin/commerce-docs.ts) and the real lists printed from the code
 * (lib/admin/commerce-docs-facts.ts). The live status is the one thing
 * stubbed, because it needs a database: `?status=empty` answers exactly what
 * readCommerceStatus answers with nothing configured and nothing readable
 * (tests/admindocs23.test.ts proves that shape), `?status=data` a running
 * platform, `?status=error` a failed read.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { CommerceDocsAdmin } from "@/app/admin/physical-commerce/commerce-docs-admin"
import { COMMERCE_DOCS, type FactKey } from "@/lib/admin/commerce-docs"
import { factsFor } from "@/lib/admin/commerce-docs-facts"
import type { CommerceStatus } from "@/lib/admin/commerce-status"
import { PHYSICAL_ARTICLES } from "@/lib/help/physical-articles"

const NOW = Date.now()
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
const params = new URLSearchParams(location.search)
const mode = params.get("status") ?? "data"

const JOBS = [
  { path: "/api/cron/process-scheduled-emails", name: "Abandoned checkout reminders (hourly email job)", schedule: "0 * * * *", what: "Sends email flow steps that are due" },
  { path: "/api/cron/physical", name: "Low stock emails, order emails and stock holds (physical commerce job)", schedule: "3,13,23,33,43,53 * * * *", what: "Physical commerce" },
  { path: "/api/cron/rollup-daily", name: "Daily rollup: analytics and the performance score", schedule: "0 1 * * *", what: "Adds up yesterday's analytics" },
]

const COUNT_LABELS: [string, string][] = [
  ["physical_products", "Physical products"],
  ["physical_live", "Physical products published"],
  ["shops", "Stores set up for shipping"],
  ["physical_orders", "Paid physical orders"],
  ["physical_orders_30d", "Paid physical orders, last 30 days"],
  ["waiting", "Waiting to ship"],
  ["shipments", "Shipments"],
  ["delivered", "Shipments delivered"],
  ["returns", "Returns"],
  ["locations", "Locations"],
  ["zones", "Shipping zones"],
  ["tax_regions", "Tax regions"],
  ["started", "Checkouts started, last 7 days"],
  ["digital_orders", "Completed orders, all products"],
]
const PARTS = ["13_checkout_contacts.sql", "78_physical_commerce.sql", "109_store_settings.sql", "110_taxes.sql", "111_sales_channel_kinds.sql", "112_integrations.sql", "118_store_identity.sql", "127_checkout_start_basket.sql", "129_customer_email_words_and_tax_on_receipts.sql", "131_products_max_per_order.sql"]
const TABLES = ["commerce_settings", "store_settings", "commerce_checkouts", "inventory_locations", "inventory_levels", "shipping_zones", "shipping_rates", "commerce_tax_rates", "fulfillments", "commerce_returns", "commerce_jobs", "checkout_starts", "stripe_webhook_events", "cron_runs"]

function empty(): CommerceStatus {
  const reason = "Not in the database"
  return {
    generatedAt: new Date(NOW).toISOString(),
    physical: { enabled: null, source: null, reason },
    jobs: JOBS.map((j) => ({
      ...j,
      lastRun: null,
      runs24h: null,
      failed24h: null,
      evidence: [{ label: "Last sign of work", at: null, value: "Could not be read" }],
      health: "unknown",
      note: reason,
    })),
    email: { provider: "Mailgun", configured: false, domainSet: false, keySet: false, fromSet: false, webhookKeySet: false, lastSentAt: null, cronSecretSet: false },
    stripe: {
      secretKey: "missing",
      publishableKey: "missing",
      modesMatch: null,
      platformWebhookSecret: false,
      connectWebhookSecret: false,
      endpoint: { asked: false, reason: "No Stripe secret key, so Stripe was not asked.", url: null, status: null, missingEvents: [], allEvents: false },
      lastEventAt: null,
      lastProcessedAt: null,
      events24h: null,
      failed24h: null,
    },
    parts: PARTS.map((f) => ({ part: f.split("_")[0], file: f, state: "unknown", appliedAt: null })),
    tables: TABLES.map((t) => ({ table: t, present: false, reason })),
    counts: COUNT_LABELS.map(([id, label]) => ({ id, label, value: null, reason })),
  }
}

function data(): CommerceStatus {
  return {
    generatedAt: new Date(NOW).toISOString(),
    physical: { enabled: true, source: "database", reason: null },
    jobs: [
      { ...JOBS[0], lastRun: { startedAt: iso(22), finishedAt: iso(21), ok: true, status: 200 }, runs24h: 24, failed24h: 0, evidence: [{ label: "Last started checkout decided", at: iso(22) }, { label: "Reminded or entered a reminder, last 7 days", at: null, value: "41" }], health: "ok", note: "Ran on time and worked." },
      { ...JOBS[1], lastRun: { startedAt: iso(6), finishedAt: iso(6), ok: true, status: 200 }, runs24h: 144, failed24h: 2, evidence: [{ label: "Last low stock email", at: iso(300), value: "Sent" }, { label: "Last queued job finished", at: iso(6) }], health: "ok", note: "Ran on time and worked." },
      { ...JOBS[2], lastRun: { startedAt: iso(31 * 60), finishedAt: iso(31 * 60 - 2), ok: false, status: 500 }, runs24h: 0, failed24h: 0, evidence: [{ label: "Newest performance day scored", at: iso(31 * 60), value: "2026-10-09, 84" }], health: "failed", note: "The last run failed (answered 500)." },
    ],
    email: { provider: "Mailgun", configured: true, domainSet: true, keySet: true, fromSet: true, webhookKeySet: true, lastSentAt: iso(9), cronSecretSet: true },
    stripe: {
      secretKey: "live",
      publishableKey: "live",
      modesMatch: true,
      platformWebhookSecret: true,
      connectWebhookSecret: true,
      endpoint: { asked: true, reason: null, url: "https://storelib.com/api/stripe/webhook", status: "enabled", missingEvents: ["checkout.session.expired"], allEvents: false },
      lastEventAt: iso(3),
      lastProcessedAt: iso(3),
      events24h: 1288,
      failed24h: 1,
    },
    parts: PARTS.map((f, i) => ({ part: f.split("_")[0], file: f, state: i === 9 ? "missing" : "applied", appliedAt: iso(9000) })),
    tables: TABLES.map((t) => ({ table: t, present: true, reason: null })),
    counts: COUNT_LABELS.map(([id, label], i) => ({ id, label, value: i === 11 ? null : [412, 377, 96, 1840, 233, 37, 1702, 1611, 58, 140, 311, null, 905, 15802][i], reason: i === 11 ? "Not in the database" : null })),
  }
}

const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url.includes("/api/admin/commerce-status")) {
    await new Promise((r) => setTimeout(r, 250))
    if (mode === "error") return new Response(JSON.stringify({ error: "The status could not be read." }), { status: 500 })
    return new Response(JSON.stringify(mode === "empty" ? empty() : data()), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  return realFetch(input, init)
}) as typeof fetch

const keys = [...new Set(COMMERCE_DOCS.flatMap((s) => s.facts ?? []))] as FactKey[]
createRoot(document.getElementById("root")!).render(
  <CommerceDocsAdmin docs={COMMERCE_DOCS} facts={factsFor(keys)} help={PHYSICAL_ARTICLES.map((a) => ({ slug: a.slug, title: a.title }))} />,
)
