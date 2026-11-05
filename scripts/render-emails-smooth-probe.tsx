/**
 * The whole Emails page (app/(storelib)/app/emails/emails-client.tsx) against a stand-in
 * server whose every route waits as long as the probe says
 * (window.__delays[prefix], ms), for scripts/check-emails-smooth.mjs to
 * measure tab switches, the Customer emails families and editor, a contact's
 * page and the bar in Chromium. Every request is written to window.__requests.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EmailsClient } from "@/app/(storelib)/app/emails/emails-client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

type W = { __requests: { method: string; url: string; at: number }[]; __delays: Record<string, number>; __defaultDelay: number }
const w = window as unknown as W
w.__requests = []
w.__delays = w.__delays ?? {}
w.__defaultDelay = w.__defaultDelay ?? 150

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const day = (n: number) => new Date(Date.parse("2026-10-20T10:00:00Z") - n * 86_400_000).toISOString()

const subscribers = Array.from({ length: 120 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  email: `person${i}@example.com`,
  name: i % 3 === 0 ? "" : `Person ${i}`,
  source: i % 2 ? "onepage" : "store_builder",
  status: i % 9 === 0 ? "unsubscribed" : i % 10 === 7 ? "customer" : "subscribed",
  subscribed_at: day(i),
  unsubscribed_at: null,
  consent_text: i % 4 === 0 ? "Ticked \"Keep me updated\" on the checkout page" : null,
}))
const messages = Array.from({ length: 12 }, (_, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  email: `writer${i}@example.com`,
  name: `Writer ${i}`,
  subject: i % 2 ? `Question ${i}` : null,
  message: `Hello, I have a question about order ${1000 + i}.\n\nThanks!`,
  site: "bread.storelib.com",
  page: "contact",
  consent: i % 3 === 0,
  subscriber_id: null,
  created_at: day(i),
  read_at: i < 3 ? null : day(i),
  replies: [],
}))
const flows = [
  { id: "f1", name: "Welcome", trigger_type: "new_subscriber", status: "active", steps: [], totals: { sent: 412, opened: 252, clicked: 40, failed: 0, in_progress: 6 } },
  { id: "f2", name: "Thank you for buying", trigger_type: "purchase", status: "paused", steps: [], totals: null },
]
const sent = Array.from({ length: 14 }, (_, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, subject: `Studio notes, issue ${30 - i}`, status: "sent", sent_at: day(i * 3), created_at: day(i * 3 + 1), recipient_count: 1200 + i, unique_opens: 600 - i * 7, unique_clicks: 140 - i }))
const scheduled = [{ id: "30000000-0000-4000-8000-000000000001", subject: "October drop", status: "scheduled", scheduled_at: "2026-11-01T09:00:00Z", created_at: day(2), updated_at: day(1), audience_count: 1204 }]
const drafts = Array.from({ length: 4 }, (_, i) => ({ id: `40000000-0000-4000-8000-00000000000${i}`, subject: `Draft ${i}`, status: "draft", created_at: day(5), updated_at: day(i) }))
const store = {
  shop: { name: "Angus Farm", supportEmail: "hello@angus.test", storeUrl: "https://angus.storelib.com", logoUrl: null, logoFrom: null, phone: null, currency: "EUR", accent: null },
  creator: { name: "Andrei Popescu", photoUrl: null, logoUrl: null },
  languages: { defaultLanguage: "en", others: ["fr"] },
  language: { lang: "en", words: {}, own: true },
  copy: { receipt: { subject: "Your order from {{shop_name}}", footer: "Returns within 30 days." } },
  ready: true,
  reminder: true,
  communities: [{ id: "11111111-1111-4111-8111-111111111111", name: "Makers Club", slug: "makers" }],
}
const activity = { days: 30, emails: { receipt: { sent: 41, lastAt: day(1) }, order_confirmation: { sent: 18, lastAt: day(0) } }, communities: {}, flows: [], reminderReplacedBy: null }

function delayFor(url: string): number {
  for (const [prefix, ms] of Object.entries(w.__delays)) if (url.startsWith(prefix)) return ms
  return w.__defaultDelay
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method || "GET").toUpperCase()
  w.__requests.push({ method, url, at: performance.now() })
  await new Promise((r) => setTimeout(r, delayFor(url)))
  if (url.startsWith("/api/email/area?part=subscribers")) return reply(200, { rows: subscribers, buyers: 4 })
  if (url.startsWith("/api/email/area?part=messages")) return reply(200, { available: true, rows: messages })
  if (url.startsWith("/api/email/area?part=flows")) return reply(200, flows)
  if (url.startsWith("/api/email/area?part=contact")) return reply(200, { runs: [], messages: [], customer: { orders: 3, spent: [{ currency: "EUR", cents: 12900 }], lastOrderAt: day(4), location: { city: "Cluj-Napoca", region: null, country: "RO" }, tags: ["vip"] } })
  if (url.startsWith("/api/email/stats")) return reply(200, { campaigns: sent, stats: { totalSent: 16840, totalOpens: 8420, totalClicks: 1930, totalUnsubscribed: 31, openRate: 50, clickRate: 11 }, monthlyUsage: { sent: 1402, limit: 2000 } })
  if (url.startsWith("/api/email/campaigns?status=scheduled")) return reply(200, { campaigns: scheduled })
  if (url.startsWith("/api/email/campaigns?status=draft")) return reply(200, { campaigns: drafts })
  if (url.startsWith("/api/store/emails/activity")) return reply(200, activity)
  if (/^\/api\/app\/community\/[^/]+\/emails$/.test(url)) return reply(200, { emails: { ready: true, audience: 42, nextAt: null, recent: [] }, words: { ready: true, words: {} } })
  if (url.startsWith("/api/store/emails?lang=")) return reply(200, { language: { lang: "fr", words: {}, own: false } })
  if (url.startsWith("/api/store/emails")) return reply(200, store)
  return reply(404, { error: "Not in the probe" })
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <div id="shell" style={{ position: "fixed", inset: 0 }}>
      <EmailsClient initialTab="subscribers" />
    </div>
  </PlatformSettingsProvider>,
)
