/**
 * The whole Emails page (app/(storelib)/app/emails/emails-client.tsx): its tabs, its
 * cache, and an email's own page over the list, against a stand-in
 * Supabase (./.emails-probe/supabase-client.js, written by the probe) and a
 * stand-in server answered here, for scripts/check-emails-page.mjs to drive
 * in Chromium.
 *
 * Every request waits LATENCY ms, like a real one, and is written to
 * window.__requests, so the probe can tell a tab drawn from the cache from
 * one drawn after a wait. The email's page is the real HTML the send builds
 * (lib/email-campaigns/template.ts).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EmailsClient } from "@/app/(storelib)/app/emails/emails-client"
import { buildEmail } from "@/lib/email-campaigns/template"
import { newBlock, renderBlocks, type Block } from "@/lib/email-campaigns/blocks"
import { themeOf } from "@/lib/email-campaigns/brand"

const LATENCY = 150
type W = { __requests: { method: string; url: string; at: number }[] }
const w = window as unknown as W
w.__requests = []

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const sent = Array.from({ length: 14 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  subject: i === 1 ? "New presets are out, and the autumn pack is half price until Sunday" : `Studio notes, issue ${30 - i}`,
  status: i === 2 ? "partially_failed" : "sent",
  sent_at: new Date(Date.parse("2026-09-20T15:04:00Z") - i * 3 * 86400000).toISOString(),
  created_at: "2026-09-10T09:00:00Z",
  recipient_count: 1200 + i,
  unique_opens: 610 - i * 7,
  unique_clicks: 140 - i,
}))
const scheduled = [{ id: "00000000-0000-4000-8000-000000000101", subject: "October drop", status: "scheduled", scheduled_at: "2026-10-01T09:00:00Z", created_at: "2026-09-18T09:00:00Z", updated_at: "2026-09-19T11:00:00Z", audience_count: 1204 }]
const drafts = Array.from({ length: 4 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000020${i}`, subject: i === 0 ? "" : `Draft ${i}`, status: "draft", created_at: "2026-09-15T09:00:00Z", updated_at: new Date(Date.parse("2026-09-22T10:00:00Z") - i * 86400000).toISOString() }))

const brand = { name: "Ana Pop Studio", logoUrl: null, storeUrl: "https://storelib.com/anapop", accent: "#0f766e", address: "12 Harbour Street, Portland, ME 04101" }
const blocks: Block[] = [
  newBlock("rich", { html: "<h2>Studio notes</h2><p>Hi there,</p><p>Three things from the studio this week, and one thing I am giving away.</p><ul><li>The autumn presets are out</li><li>A new video on skin tones</li><li>The print sale ends Sunday</li></ul>" } as Partial<Block>),
  newBlock("button", { label: "Get the autumn pack", url: "https://storelib.com/anapop/autumn" } as Partial<Block>),
]
const emailHtml = buildEmail({ subject: "Studio notes", previewText: "Three things from the studio", bodyHtml: renderBlocks(blocks, themeOf(brand)), brand, kind: "marketing", unsubscribeUrl: "https://storelib.com/unsubscribe" })

function report(id: string) {
  const row = [...sent, ...scheduled, ...drafts].find((c) => c.id === id)
  const isSent = !!row && "sent_at" in row && row.status !== "scheduled"
  return {
    campaign: {
      id,
      subject: row?.subject ?? "Studio notes",
      preview_text: "Three things from the studio",
      status: row?.status ?? "sent",
      audience_type: "all",
      segment_id: null,
      audience_count: 1204,
      scheduled_at: (row as { scheduled_at?: string } | undefined)?.scheduled_at ?? null,
      sent_at: (row as { sent_at?: string } | undefined)?.sent_at ?? null,
      completed_at: isSent ? (row as { sent_at?: string }).sent_at : null,
      created_at: "2026-09-10T09:00:00Z",
      updated_at: "2026-09-19T11:00:00Z",
      track_opens: true,
      last_error: row?.status === "partially_failed" ? "The address was refused as invalid." : null,
    },
    counts: isSent ? { total: 1204, pending: 0, sending: 0, sent: 402, delivered: 790, bounced: 9, failed: 2, skipped: 1, unknown: 0 } : null,
    stats: isSent ? { sent: 1201, delivered: 790, bounced: 8, complained: 1, opened: 604, clicked: 139, unsubscribed: 6, failed: 2, unknown: 0, skipped: 1, waiting: 0 } : null,
    links: isSent
      ? [
          { url: "https://storelib.com/anapop/autumn", clicks: 120, people: 98 },
          { url: "https://anapop.studio/blog/skin-tones-in-evening-light", clicks: 51, people: 44 },
          { url: "https://instagram.com/anapop", clicks: 9, people: 9 },
        ]
      : [],
    html: emailHtml,
    sender: { name: "Ana Pop Studio", from: "Ana Pop Studio <noreply@storelib.com>", replyTo: "hello@anapop.studio", address: brand.address },
    upgraded: true,
  }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method || "GET").toUpperCase()
  w.__requests.push({ method, url, at: performance.now() })
  await new Promise((r) => setTimeout(r, LATENCY))
  if (url.startsWith("/api/email/stats")) {
    return reply(200, {
      campaigns: sent,
      stats: { totalSent: 16840, totalOpens: 8420, totalClicks: 1930, totalUnsubscribed: 31, openRate: 50, clickRate: 11 },
      monthlyUsage: { sent: 1402, limit: 2000 },
    })
  }
  if (url.startsWith("/api/email/campaigns?status=scheduled")) return reply(200, { campaigns: scheduled })
  if (url.startsWith("/api/email/campaigns?status=draft")) return reply(200, { campaigns: drafts })
  const rep = /^\/api\/email\/campaigns\/([^/]+)\/report$/.exec(url)
  if (rep) return reply(200, report(rep[1]))
  const one = /^\/api\/email\/campaigns\/([^/?]+)$/.exec(url)
  if (one) return reply(200, { campaign: { id: one[1], subject: "Draft", body: "", status: "draft", updated_at: "2026-09-22T10:00:00Z" }, counts: null, upgraded: true })
  /* Round 52: Automations reads its list from the server (app/api/email/area), no longer from Supabase in the browser. */
  if (url.startsWith("/api/email/area?part=flows")) return reply(200, [
    { id: "f1", name: "Welcome", trigger_type: "new_subscriber", status: "active", steps: [{ id: "a", type: "email", config: { subject: "Hi", body: "<p>Hi</p>" } }], totals: { sent: 412, opened: 252, clicked: 40, failed: 0, in_progress: 6 } },
    { id: "f2", name: "Thank you for buying", trigger_type: "purchase", status: "paused", steps: [], totals: null },
  ])
  if (/^\/api\/automations\/flows\/[^/]+\/status$/.test(url) && method === "POST") return reply(200, { ok: true, stopped: 0 })
  return reply(404, { error: "Not in the probe" })
}

function App() {
  return (
    <div id="shell" style={{ position: "fixed", inset: 0 }}>
      <EmailsClient initialTab="campaigns" />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
