/**
 * Settings › Customer emails, the real panel and editor
 * (components/app/settings/customer-emails-panel.tsx), against a stand-in
 * /api/store/emails that saves the way the route does (readCopy, then the
 * whole set back), for scripts/check-customer-emails.mjs to drive in
 * Chromium on a computer and a phone. Every request is written to
 * window.__requests; the saved words are window.__saved. At /app/emails it
 * is the Emails page's list (app/(storelib)/app/emails/emails-home.tsx) on its
 * Customer emails tab instead, the same panel inside it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { readCopy, readSavedCopy, type CustomerEmailsCopy } from "@/lib/emails/customer-custom"
import { EmailsHome, type EmailsHomeProps } from "@/app/(storelib)/app/emails/emails-home"

type W = { __requests: { method: string; url: string; body?: unknown }[]; __saved: CustomerEmailsCopy }
const w = window as unknown as W
w.__requests = []
w.__saved = {}

const shop = { name: "AndrewRullz", supportEmail: "hello@andrewrullz.test", storeUrl: "https://andrewrullz.storelib.com", logoUrl: null, phone: "+40 721 000 000", currency: "USD" }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/api/store/emails")) return realFetch(input, init)
  const method = (init?.method ?? "GET").toUpperCase()
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  w.__requests.push({ method, url, body })
  await new Promise((r) => setTimeout(r, 120))
  if (method === "GET") return reply(200, { shop, copy: w.__saved, ready: true })
  const id = body?.id
  const read = body?.copy === null ? ({ ok: true, copy: null } as const) : readCopy(id, body?.copy)
  if (read.ok === false) return reply(400, { error: read.error })
  const next = readSavedCopy(w.__saved)
  if (read.copy) next[id] = read.copy
  else delete next[id]
  w.__saved = next
  return reply(200, { copy: next })
}

function Page() {
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
    today: "2026-10-11",
  } as unknown as EmailsHomeProps
  return (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <div className="min-h-screen bg-[#f8f9fa]">
        <EmailsHome {...props} />
      </div>
    </PlatformSettingsProvider>
  )
}

createRoot(document.getElementById("app")!).render(location.pathname.startsWith("/app/emails") ? <EmailsPage /> : <Page />)
