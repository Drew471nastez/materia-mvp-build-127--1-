/**
 * The compose page (components/email/compose/composer.tsx) against a
 * stand-in server, for scripts/check-compose-page.mjs to drive in Chromium.
 *
 * `fetch` is answered here, the way the real routes answer: drafts are
 * created and saved with a version, a save with a stale version is a 409,
 * the send's dry run counts, the send moves the campaign to queued and each
 * poll moves it on until it is sent. Every request is written to
 * window.__requests so the probe can read what the page asked for.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EmailComposer } from "@/components/email/compose/composer"

type Json = Record<string, unknown>
const w = window as unknown as { __requests: { method: string; url: string; body: Json }[]; __exit: string[]; __campaign: Json | null; __polls: number }
w.__requests = []
w.__exit = []
w.__campaign = null
w.__polls = 0

let version = 0
const stamp = () => new Date(Date.parse("2026-09-24T10:00:00Z") + ++version * 1000).toISOString()
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method || "GET").toUpperCase()
  let body: Json = {}
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body)
    } catch {
      body = {}
    }
  }
  w.__requests.push({ method, url, body })
  await new Promise((r) => setTimeout(r, 30))

  if (url.startsWith("/api/email/audience")) {
    return reply(200, {
      options: [
        { type: "all", label: "All subscribers", count: 1204 },
        { type: "last_7days", label: "Joined in the last 7 days", count: 31 },
        { type: "last_30days", label: "Joined in the last 30 days", count: 118 },
        { type: "last_90days", label: "Joined in the last 90 days", count: 402 },
        { type: "onepage", label: "Joined on your OnePage", count: 880 },
        { type: "store_builder", label: "Joined on your website", count: 324 },
      ],
      segments: [{ id: "11111111-1111-4111-8111-111111111111", name: "Bought the autumn presets", count: 212 }],
      plan: { limit: 2000, used: 212 },
      brand: { name: "Ana Pop Studio", logoUrl: null, storeUrl: "https://storelib.com/anapop", accent: "#0f766e", address: "12 Harbour Street, Portland, ME 04101", avatarUrl: null },
      upgraded: true,
    })
  }
  if (url === "/api/email/campaigns" && method === "POST") {
    w.__campaign = { ...body, status: "draft", updated_at: stamp(), created_at: stamp() }
    return reply(201, { campaign: w.__campaign })
  }
  const one = /^\/api\/email\/campaigns\/([^/]+)$/.exec(url)
  if (one && method === "PATCH") {
    const c = w.__campaign
    if (!c || c.updated_at !== body.expected_updated_at) return reply(409, { error: "This email was changed in another tab or on another device. Reload to see that version.", status: "draft" })
    const { expected_updated_at: _drop, ...rest } = body
    void _drop
    w.__campaign = { ...c, ...rest, updated_at: stamp() }
    return reply(200, { campaign: w.__campaign })
  }
  if (one && method === "GET") {
    const c = w.__campaign
    if (!c) return reply(404, { error: "This email was not found." })
    if (c.status === "queued" || c.status === "sending") {
      w.__polls++
      if (w.__polls >= 2) c.status = "sent"
      else c.status = "sending"
    }
    const sent = c.status === "sent" ? 1203 : c.status === "sending" ? 480 : 0
    const counts = c.status === "draft" || c.status === "scheduled" ? null : { total: 1204, pending: 1204 - sent - (c.status === "sent" ? 1 : 0), sending: 0, sent, delivered: 0, bounced: 0, failed: c.status === "sent" ? 1 : 0, skipped: 0, unknown: 0 }
    if (counts && c.status === "sent") counts.pending = 0
    return reply(200, { campaign: { ...c, last_error: c.status === "sent" ? null : null }, counts })
  }
  if (url === "/api/email/send") {
    if (body.dry_run) return reply(200, { recipients: 1201, excluded: 3, warnings: [], sender: { name: "Ana Pop", from: "Ana Pop <noreply@storelib.com>", replyTo: "hello@anapop.studio", address: "12 Harbour Street, Portland, ME 04101" } })
    if (w.__campaign) {
      w.__campaign.status = "queued"
      w.__campaign.sent_at = stamp()
      w.__campaign.updated_at = stamp()
    }
    return reply(202, { status: "queued", recipients: 1201, excluded: 3 })
  }
  if (/\/schedule$/.test(url)) {
    if (w.__campaign) {
      w.__campaign.status = body.scheduled_at ? "scheduled" : "draft"
      w.__campaign.scheduled_at = body.scheduled_at
      w.__campaign.updated_at = stamp()
    }
    return reply(200, { campaign: w.__campaign })
  }
  if (url === "/api/email/send-test") return reply(200, { success: true, sent_to: "ana@example.com" })
  if (url === "/api/email/upload-image") return reply(200, { success: true, url: "https://cdn.example.com/upload.png" })
  return reply(404, { error: "Not in the probe" })
}

function App() {
  return (
    <div id="shell" style={{ position: "fixed", inset: 0 }}>
      <EmailComposer campaignId={null} onExit={(tab) => w.__exit.push(tab ?? "")} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
