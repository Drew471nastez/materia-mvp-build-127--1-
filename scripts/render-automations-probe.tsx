/**
 * The automation chooser, the builder and the Subscribers view with sources,
 * mounted with fixture data for scripts/check-automations.mjs to measure.
 * `?view=chooser|builder|broken|subscribers`. Every request the pages make is
 * answered here and written to window.__calls.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { FlowChooser } from "@/app/(storelib)/app/emails/flow/new/chooser"
import { FlowBuilder, type BuilderData } from "@/app/(storelib)/app/emails/flow/[id]/builder"
import { EmailsHome, type EmailsTab, type SubscriberRow } from "@/app/(storelib)/app/emails/emails-home"
import { ContactPage } from "@/app/(storelib)/app/emails/contact-detail"
import { PageLayer } from "@/components/app/page-layer"
import { Toaster } from "@/components/ui/toaster"
import { resolveValue, todayIn } from "@/lib/date-range/range"
import { TEMPLATES } from "@/lib/automations/templates"

type W = Window & { __calls: Array<[string, string]> }
const w = window as unknown as W
w.__calls = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  w.__calls.push([init?.method ?? "GET", url])
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.endsWith("/status")) return json({ status: JSON.parse(String(init?.body ?? "{}")).on ? "active" : "paused", stopped: 3 })
  if (url.includes("/api/automations/flows/") && init?.method === "PATCH") {
    const body = JSON.parse(String(init.body))
    return json({ flow: { name: body.name, trigger_type: body.trigger_type, trigger_config: body.trigger_config, steps: body.steps, status: "draft", updated_at: new Date().toISOString() } })
  }
  if (url.includes("/api/automations/flows/") && init?.method === "DELETE") return json({ ok: true })
  if (url.endsWith("/api/automations/flows")) return json({ id: "new-flow" })
  if (url.includes("/test")) return json({ ok: true, to: "astrid@example.com" })
  if (url.endsWith("/preview")) return json({ html: '<!doctype html><html><body style="margin:0;background:#f4f5f7"><table width="100%"><tr><td style="padding:24px"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px;font:16px/1.6 Arial">Hi Alex,<p>Thanks for joining.</p></div></td></tr></table></body></html>', subject: "Welcome, Alex", previewText: "", fromName: "Astrid" })
  if (url.endsWith("/duplicate")) return json({ id: "copy-flow" })
  return realFetch(input, init)
}

const view = new URLSearchParams(location.search).get("view") ?? "chooser"
const welcome = TEMPLATES.find((t) => t.id === "welcome")!
const winBack = TEMPLATES.find((t) => t.id === "win_back")!

/** Start from scratch: the trigger the creator chose and no steps. */
function scratchData(): BuilderData {
  return {
    flow: { id: "f2", name: "Untitled automation", trigger_type: "purchase", trigger_config: { template: "blank", entry: { mode: "each" } }, status: "draft", steps: [], updated_at: "2026-09-20T10:00:00Z" },
    products: [],
    stats: {},
    runs: [],
    counts: { active: 0, finished: 0, left: 0, failed: 0 },
    failedJobs: 0,
    tracking: true,
    startsRecorded: true,
    accountEmail: "astrid@example.com",
  }
}

/** A checkout reminder on an account whose started checkouts are not recorded yet. */
function reminderData(): BuilderData {
  const t = TEMPLATES.find((x) => x.id === "checkout_reminder")!
  return { ...scratchData(), flow: { id: "f3", name: t.name, trigger_type: t.trigger, trigger_config: { template: t.id, entry: t.entry }, status: "draft", steps: t.steps, updated_at: "2026-09-20T10:00:00Z" }, startsRecorded: false }
}

function builderData(broken: boolean): BuilderData {
  const steps = broken
    ? [{ id: "e1", type: "email", config: { subject: "", body: "<p></p>" } }, { id: "w", type: "wait", config: { amount: 2, unit: "days" } }]
    : [...welcome.steps, winBack.steps[1], { id: "e3", type: "email", config: { subject: "The presets most people start with, and a note on the new autumn pack", body: "<p>Hi {{first_name}},</p><p>Three to try first.</p>" } }]
  const sources = [
    { surface: "website", site: "andrewrullz.storelib.com", form: "footer", from: "instagram" },
    { surface: "profile", form: "bar" },
    { surface: "onepage", form: "lead_magnet", from: "tiktok" },
    null,
    { surface: "website", site: "shop.astridlens.com", form: "newsletter", from: "google" },
  ]
  const statuses = ["active", "completed", "exited", "failed", "active", "cancelled"]
  return {
    /* The creator as a send reads them, which the page brings for the preview; the broken flow's page has none, so its preview asks the server. */
    look: broken ? null : { fromName: "Astrid Lens", replyTo: "", storeUrl: "https://storelib.com/astrid", brand: { name: "Astrid Lens", logoUrl: null, accentColor: "#0f766e", onAccent: "#ffffff" } },
    flow: { id: "f1", name: "Welcome series", trigger_type: "new_subscriber", trigger_config: { template: "welcome", entry: { mode: "after", days: 30 } }, status: broken ? "draft" : "active", steps, updated_at: "2026-09-20T10:00:00Z" },
    products: [
      { id: "11111111-1111-1111-1111-111111111111", title: "Autumn presets" },
      { id: "22222222-2222-2222-2222-222222222222", title: "Lightroom course, the long version with every lesson" },
    ],
    stats: broken ? {} : { welcome_1: { sent: 412, opened: 251, clicked: 49, failed: 2 }, welcome_2: { sent: 380, opened: 190, clicked: 31, failed: 0 } },
    runs: broken
      ? []
      : Array.from({ length: 12 }, (_, i) => ({
          id: `r${i}`,
          email: i === 2 ? "a-very-long-address-that-keeps-going@studio-with-a-long-domain.com" : `person${i}@example.com`,
          name: null,
          status: statuses[i % statuses.length],
          exit_reason: statuses[i % statuses.length] === "failed" ? "Mailgun 500" : statuses[i % statuses.length] === "exited" ? "Unsubscribed." : statuses[i % statuses.length] === "cancelled" ? "The flow was turned off." : null,
          started_at: new Date(Date.parse("2026-09-20") - i * 86400000).toISOString(),
          finished_at: null,
          current_step_id: i % 2 ? "welcome_wait" : "welcome_2",
          source_detail: sources[i % sources.length],
          trigger_type: "new_subscriber",
        })),
    counts: broken ? { active: 0, finished: 0, left: 0, failed: 0 } : { active: 14, finished: 380, left: 21, failed: 2 },
    failedJobs: broken ? 0 : 2,
    tracking: true,
    accountEmail: "astrid@example.com",
  }
}

const today = todayIn("UTC", Date.parse("2026-09-24T12:00:00Z"))
const subscribers = Array.from({ length: 64 }, (_, i) => {
  const kinds = [
    { source: "website_builder_newsletter", source_detail: { surface: "website", site: "andrewrullz.storelib.com", form: "footer", from: "instagram", utm_campaign: "autumn" } },
    { source: "creator_page", source_detail: { surface: "product", form: "bar", from: "google" } },
    { source: "onepage", source_detail: null },
    { source: "direct", source_detail: null },
    { source: "checkout", source_detail: { surface: "checkout", site: "shop.astridlens.com" } },
    { source: "website_builder_newsletter", source_detail: { surface: "website", site: "shop.astridlens.com", form: "newsletter" } },
  ]
  const k = kinds[i % kinds.length]
  return {
    id: `s${i}`,
    email: `person${i}@example.com`,
    name: i % 3 ? `Person ${i}` : "",
    status: i % 11 === 0 ? "unsubscribed" : "subscribed",
    subscribed_at: new Date(Date.parse("2026-09-01") - i * 86400000).toISOString(),
    unsubscribed_at: null,
    consent_text: "Subscribed via the sign-up box in the footer of this creator's website",
    ...k,
  }
})

function Subscribers() {
  const [tab, setTab] = React.useState<EmailsTab>("subscribers")
  const [contact, setContact] = React.useState<SubscriberRow | null>(null)
  const [search, setSearch] = React.useState("")
  const [period, setPeriod] = React.useState(() => resolveValue({ preset: "last_30_days" }, today, "last_30_days"))
  /* A contact opens as its own page over the list, as emails-client.tsx does it. */
  if (contact) {
    return (
      <div data-contact-page="" className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]">
        <ContactPage contact={contact} onBack={() => setContact(null)} onCopy={() => {}} onRemove={() => {}} />
      </div>
    )
  }
  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]">
      <EmailsHome
        physical={false} messages={[]} messagesAvailable onOpenMessage={() => {}} onToggleRead={() => {}} onDeleteMessage={() => {}}
        onOpenContact={setContact}
        tab={tab}
        onTab={setTab}
        loading={false}
        subscribers={subscribers}
        checkoutBuyersCount={3}
        search={search}
        onSearch={setSearch}
        onExportSubscribers={() => {}}
        onCopyEmail={() => {}}
        onRemoveSubscriber={() => {}}
        flows={[
          { id: "f1", name: "Welcome series", trigger_type: "new_subscriber", status: "active", steps: welcome.steps, totals: { sent: 792, opened: 441, clicked: 80, failed: 2, in_progress: 14 } },
          { id: "f2", name: "Bring buyers back", trigger_type: "purchase", status: "paused", steps: winBack.steps, totals: null },
        ]}
        onToggleFlow={() => {}}
        onDeleteFlow={() => {}}
        onDuplicateFlow={() => {}}
        campaigns={[]}
        onOpenCampaign={() => {}}
        onCampaignIntent={() => {}}
        onDuplicateCampaign={() => {}}
        onDeleteCampaign={() => {}}
        overview={null}
        usage={{ sent: 0, limit: 3000 }}
        period={period}
        onPeriod={setPeriod}
        today={today}
      />
    </div>
  )
}

/**
 * The shell as app/(storelib)/app/layout.tsx draws it, reduced to what the pages sit
 * in: the black bar (68px on a phone, 58px from 768px, marked as the shell's
 * chrome so the real stylesheet hides it under a phone layer) and the
 * content area under it. The flow pages are inside their real layout
 * (app/(storelib)/app/emails/flow/layout.tsx: PageLayer), the way the router puts them.
 */
function Shell({ layer, children }: { layer: boolean; children: React.ReactNode }) {
  return (
    <div id="shell" style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div data-shell-chrome="" data-probe-topbar="" className="h-[68px] shrink-0 bg-[#111113] md:h-[58px]" />
      <div className="app-content-scroll relative min-h-0 flex-1">{layer ? <PageLayer inset="bar" phoneOnly>{children}</PageLayer> : children}</div>
      {/* The phone's nav pill, marked as the shell marks it: a full screen layer does not show it. */}
      <nav data-app-nav-pill="" data-probe-pill="" className="fixed bottom-4 left-1/2 z-[55] h-14 w-[240px] -translate-x-1/2 rounded-full bg-white md:hidden" />
    </div>
  )
}

function App() {
  return (
    <>
      <Shell layer={view !== "subscribers"}>
        {view === "chooser" ? <FlowChooser existing={{ thank_you: "f9" }} /> : null}
        {view === "builder" ? <FlowBuilder data={builderData(false)} /> : null}
        {view === "broken" ? <FlowBuilder data={builderData(true)} /> : null}
        {view === "scratch" ? <FlowBuilder data={scratchData()} /> : null}
        {view === "reminder" ? <FlowBuilder data={reminderData()} /> : null}
        {view === "subscribers" ? <Subscribers /> : null}
      </Shell>
      <Toaster />
    </>
  )
}
createRoot(document.getElementById("app")!).render(<App />)
