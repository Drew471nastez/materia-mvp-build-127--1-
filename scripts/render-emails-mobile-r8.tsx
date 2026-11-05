/**
 * Round 8 of the phone polish, the email side, for scripts/check-emails-mobile-r8.mjs: the real composer
 * (components/email/compose/composer.tsx) in its route's layer (app/(storelib)/app/emails/new/layout.tsx: PageLayer, phone only),
 * over a shell shaped like /app's (the header marked [data-shell-chrome], the content scroller), and the Emails list's
 * top (the violet Try Pro strip) it goes back to. window.__go("new" | "list") moves between the two; the composer's own
 * Back goes to the list. The keyboard is window.__keyboard(px) on a stand-in visualViewport, as in
 * scripts/render-email-composer.tsx, with the real ViewportVars and KeyboardGuard reading it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { ViewportVars } from "@/components/viewport-vars"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { PageLayer } from "@/components/app/page-layer"
import { EmailComposer } from "@/components/email/compose/composer"
import { TryProStrip } from "@/components/app/announcement-bar-mobile"

/* ─── A visual viewport the probe can shrink ─── */
type VV = EventTarget & { height: number; width: number; offsetTop: number; offsetLeft: number; pageTop: number; pageLeft: number; scale: number }
const real = window.visualViewport
const fake = new EventTarget() as VV
let keyboard = 0
Object.defineProperties(fake, {
  height: { get: () => (real?.height ?? window.innerHeight) - keyboard },
  width: { get: () => real?.width ?? window.innerWidth },
  offsetTop: { get: () => 0 },
  offsetLeft: { get: () => 0 },
  pageTop: { get: () => window.scrollY },
  pageLeft: { get: () => window.scrollX },
  scale: { get: () => 1 },
})
Object.defineProperty(window, "visualViewport", { value: fake, configurable: true })
real?.addEventListener("resize", () => fake.dispatchEvent(new Event("resize")))
const w = window as unknown as {
  __keyboard: (px: number) => void
  __go: (to: "new" | "list") => void
  __requests: { method: string; url: string; body: Record<string, unknown> }[]
  __campaign: Record<string, unknown> | null
}
w.__keyboard = (px: number) => {
  keyboard = Math.max(0, px)
  fake.dispatchEvent(new Event("resize"))
}

/* ─── The stand-in server ─── */
type Json = Record<string, unknown>
w.__requests = []
w.__campaign = null
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
  await new Promise((r) => setTimeout(r, 20))
  if (url.startsWith("/api/email/audience")) {
    return reply(200, {
      options: [
        { type: "all", label: "All subscribers", count: 1204 },
        { type: "last_30days", label: "Joined in the last 30 days", count: 118 },
      ],
      segments: [],
      products: [
        { id: "p-1", title: "Glaze recipes" },
        { id: "p-2", title: "Wheel throwing course" },
        { id: "p-3", title: "Studio tote" },
      ],
      plan: { limit: 2000, used: 212 },
      brand: { name: "Ana Pop Studio", logoUrl: "https://cdn.example.com/logo.png", storeUrl: "https://storelib.com/anapop", accent: "#0f766e", address: "12 Harbour Street, Portland, ME 04101", avatarUrl: null },
      upgraded: true,
    })
  }
  if (url === "/api/email/segments/preview") return reply(200, { count: 312 })
  if (url === "/api/email/segments" && method === "POST") return reply(200, { segment: { id: "seg-1", name: body.name, count: 312 } })
  if (url === "/api/email/campaigns" && method === "POST") {
    w.__campaign = { ...body, status: "draft", updated_at: stamp(), created_at: stamp() }
    return reply(201, { campaign: w.__campaign })
  }
  const one = /^\/api\/email\/campaigns\/([^/]+)$/.exec(url)
  if (one && method === "PATCH") {
    const c = w.__campaign
    if (!c || c.updated_at !== body.expected_updated_at) return reply(409, { error: "Changed somewhere else.", status: "draft" })
    const { expected_updated_at: _drop, ...rest } = body
    void _drop
    w.__campaign = { ...c, ...rest, updated_at: stamp() }
    return reply(200, { campaign: w.__campaign })
  }
  if (url === "/api/email/send") return reply(200, { recipients: 1201, excluded: 3, warnings: [], sender: { name: "Ana Pop", from: "Ana Pop <noreply@storelib.com>", replyTo: "hello@anapop.studio", address: "12 Harbour Street" } })
  if (url === "/api/email/upload-image") return reply(200, { success: true, url: "https://cdn.example.com/upload.png" })
  return reply(404, { error: "Not in the probe" })
}

function List() {
  return (
    <div data-emails-page="" className="relative h-full overflow-hidden bg-[#f8f9fa]">
      <div className="orders-pane page-scroll absolute inset-0 overflow-y-auto">
        <TryProStrip />
        <div className="p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="mb-3 h-20 rounded-2xl border border-[#e5e7eb]/60 bg-white" />
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [route, setRoute] = React.useState<"new" | "list">(location.pathname.endsWith("/new") ? "new" : "list")
  React.useEffect(() => {
    w.__go = (to) => flushSync(() => setRoute(to))
  }, [])
  return (
    <div id="shell" style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <ViewportVars />
      <KeyboardGuard />
      <div data-shell-chrome="" data-probe-header="" className="h-[68px] shrink-0 bg-[#111113] md:h-[58px]" />
      <div className="app-content-scroll relative min-h-0 flex-1">
        {route === "new" ? (
          <PageLayer inset="page" phoneOnly>
            <EmailComposer campaignId={null} onExit={() => flushSync(() => setRoute("list"))} />
          </PageLayer>
        ) : (
          <List />
        )}
      </div>
      <nav data-app-nav-pill="" className="fixed bottom-4 left-1/2 z-[55] h-14 w-[240px] -translate-x-1/2 rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.15)] md:hidden" />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
