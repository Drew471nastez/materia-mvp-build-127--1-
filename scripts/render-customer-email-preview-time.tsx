/**
 * The real Customer emails panel, with every /api/store/emails read answered
 * after `window.__delay` ms (the server's previews from
 * scripts/customer-email-preview-samples.ts), for
 * scripts/check-customer-email-preview-time.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

type W = { __delay: number; __previews: Record<string, { subject: string; html: string }>; __requests: string[] }
const w = window as unknown as W
w.__requests = []
const shop = { name: "AndrewRullz", supportEmail: "hello@andrewrullz.test", storeUrl: "https://andrewrullz.storelib.com", logoUrl: null, phone: "+40 721 000 000", currency: "USD" }
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/api/store/emails")) return realFetch(input, init)
  w.__requests.push(url)
  await new Promise((r) => setTimeout(r, w.__delay))
  const u = new URL(url, location.origin)
  if (u.pathname.endsWith("/activity")) return reply({ days: 30, emails: {}, communities: {}, flows: [], reminderReplacedBy: null })
  if (u.pathname.endsWith("/preview")) {
    const p = w.__previews[u.searchParams.get("id") ?? ""]
    return p ? reply({ ...p, version: "default" }) : new Response("{}", { status: 404 })
  }
  return reply({ shop, copy: {}, ready: true, creator: { name: "Andrew", photoUrl: null, logoUrl: null }, languages: { defaultLanguage: "en", others: [] }, language: { lang: "en", words: {}, own: true }, reminder: true, communities: [] })
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <div className="mx-auto max-w-[760px] px-4 py-6">
      <CustomerEmailsPanel />
    </div>
  </PlatformSettingsProvider>,
)
