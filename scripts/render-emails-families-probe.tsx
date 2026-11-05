/**
 * Emails › Customer emails, the real panel (components/app/settings/
 * customer-emails-panel.tsx) with its family switch, its community emails
 * (components/app/emails/community-emails.tsx) and its editor, against
 * stand-ins for the routes it reads, for scripts/check-emails-families.mjs
 * to drive in Chromium on a phone and a computer. At /app/emails it is the
 * Emails page's list (app/(storelib)/app/emails/emails-home.tsx) on its Customer emails
 * tab; at /app/settings, Settings' card. Every request is written to
 * window.__requests.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { EmailsHome, type EmailsHomeProps } from "@/app/(storelib)/app/emails/emails-home"

type W = { __requests: { method: string; url: string; body?: unknown }[] }
const w = window as unknown as W
w.__requests = []

const MAKERS = "11111111-1111-4111-8111-111111111111"
const RUNNERS = "22222222-2222-4222-8222-222222222222"
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const store = {
  shop: { name: "Angus Farm", supportEmail: "hello@angus.test", storeUrl: "https://angus.storelib.com", logoUrl: null, logoFrom: null, phone: null, currency: "EUR", accent: null },
  creator: { name: "Andrei Popescu", photoUrl: null, logoUrl: null },
  languages: { defaultLanguage: "en", others: ["fr", "de"] },
  language: { lang: "en", words: {}, own: true },
  copy: {},
  ready: true,
  reminder: true,
  communities: [
    { id: MAKERS, name: "Makers Club", slug: "makers" },
    { id: RUNNERS, name: "Morning Runners", slug: "runners" },
  ],
}
const FR = { lang: "fr", own: false, words: { "Thanks for your order, {name}": "Merci pour votre commande, {name}", "Your receipt for {title}": "Votre reçu pour {title}", "View your receipt": "Voir votre reçu", Total: "Total" } }
const activity = {
  days: 30,
  emails: { receipt: { sent: 41, lastAt: day(1) }, digital_refund: { sent: 2, lastAt: day(9) }, order_confirmation: { sent: 18, lastAt: day(0) }, shipping_confirmation: { sent: 15, lastAt: day(2) }, delivered: { sent: 9, lastAt: day(3) } },
  communities: { [MAKERS]: { community_welcome: { sent: 7, lastAt: day(2) }, community_invite: { sent: 3, lastAt: day(5) } } },
  flows: [
    { id: "f1", name: "Thanks for your course", trigger_type: "purchase", status: "active", families: ["digital"], products: 2, sent: 12, lastAt: day(1) },
    { id: "f2", name: "Care tips after delivery", trigger_type: "purchase", status: "paused", families: ["physical"], products: 3, sent: 0, lastAt: null },
    { id: "f3", name: "Any order thank you", trigger_type: "first_purchase", status: "active", families: ["digital", "physical"], products: null, sent: 30, lastAt: day(0) },
  ],
  reminderReplacedBy: null,
}
const memberEmails = {
  emails: { ready: true, audience: 42, nextAt: null, recent: [{ id: "b1", subject: "New lessons are up", status: "sent", sentCount: 40, createdAt: day(3), sentAt: day(3), authorName: "Andrei" }] },
  words: { ready: true, words: { welcome: { subject: "You made it into {community}", heading: "", intro: "" } } },
}
/* A community email as the server draws it: a stand-in page with what was asked, so the frame can be checked. */
const communityMail = (body: Record<string, unknown>) => ({
  subject: body.kind === "broadcast" ? String(body.subject ?? "") : `Sample ${String(body.kind)}`,
  preview: "",
  html: `<!doctype html><html lang="en"><head></head><body><div data-kind="${String(body.kind)}">Makers Club · ${String(body.subject ?? "")}</div></body></html>`,
})

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/api/")) return realFetch(input, init)
  const method = (init?.method ?? "GET").toUpperCase()
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  w.__requests.push({ method, url, body })
  await new Promise((r) => setTimeout(r, 60))
  if (url.includes("/api/store/emails/activity")) return reply(200, activity)
  if (url.includes("/api/store/emails?lang=fr")) return reply(200, { language: FR })
  if (url.includes("/api/store/emails?lang=")) return reply(200, { language: { lang: new URL(url, location.href).searchParams.get("lang"), words: {}, own: false } })
  if (url.includes("/api/store/emails?channel=storelib")) return reply(200, { language: { lang: "en", words: {}, own: true } })
  if (url.includes("/api/store/emails")) return reply(200, store)
  if (url.includes("/api/store/settings")) return reply(200, { settings: {} })
  if (url.includes("/api/automations/flows/")) return reply(200, { ok: true, stopped: 0 })
  if (/\/api\/app\/community\/[^/]+\/emails\/preview/.test(url)) return reply(200, communityMail(body ?? {}))
  if (/\/api\/app\/community\/[^/]+\/emails\/templates/.test(url)) return reply(200, { ok: true })
  if (/\/api\/app\/community\/[^/]+\/emails/.test(url)) return reply(200, memberEmails)
  return reply(404, { error: "Not here" })
}

function Settings() {
  return (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <div className="min-h-screen bg-[#f8f9fa]">
        <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
          <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e]">Settings</h1>
          <CustomerEmailsPanel />
        </div>
      </div>
    </PlatformSettingsProvider>
  )
}

const none = () => {}
function EmailsPage() {
  const [data, setData] = React.useState<EmailsHomeProps["customerEmails"]>(null)
  React.useEffect(() => {
    void fetch("/api/store/emails").then((r) => r.json()).then(setData)
  }, [])
  const props = {
    tab: "customer",
    onTab: none,
    loading: false,
    subscribers: [],
    checkoutBuyersCount: 0,
    customerEmails: data,
    physical: true,
    search: "",
    onSearch: none,
    onExportSubscribers: none,
    onCopyEmail: none,
    onRemoveSubscriber: none,
    messages: [],
    messagesAvailable: true,
    onOpenMessage: none,
    onToggleRead: none,
    onDeleteMessage: none,
    flows: [],
    onToggleFlow: none,
    onDeleteFlow: none,
    onDuplicateFlow: none,
    campaigns: [],
    onOpenCampaign: none,
    onOpenContact: none,
    onCampaignIntent: none,
    onDuplicateCampaign: none,
    onDeleteCampaign: none,
    overview: null,
    usage: { sent: 0, limit: 2000 },
    period: { preset: "30d" },
    onPeriod: none,
    today: "2026-10-21",
  } as unknown as EmailsHomeProps
  return (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <div className="min-h-screen bg-[#f8f9fa]">
        <EmailsHome {...props} />
      </div>
    </PlatformSettingsProvider>
  )
}

createRoot(document.getElementById("app")!).render(location.pathname.startsWith("/app/emails") ? <EmailsPage /> : <Settings />)
