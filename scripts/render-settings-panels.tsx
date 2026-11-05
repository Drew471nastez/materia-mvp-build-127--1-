/*
 * Round T's settings panels against a stubbed API, for
 * scripts/check-settings-panels.mjs. `window.__panel` picks one;
 * `window.__api` answers by path (GET), and every PUT/POST/DELETE is
 * recorded in `window.__settingsPanelsSent` and answered with `window.__api[path]`.
 */
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { CheckoutPanel } from "@/components/app/settings/checkout-panel"
import { TaxesPanel } from "@/components/app/settings/taxes-panel"
import { MarketsPanel } from "@/components/app/settings/markets-panel"
import { ReasonsPanel } from "@/components/app/settings/reasons-panel"
import { ChannelsPanel } from "@/components/app/settings/channels-panel"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { FilesLibrary, FilesLibraryChooser } from "@/components/files/files-library"
import { ActivityPanel } from "@/components/app/settings/activity-panel"
import { SalesChannelsCard } from "@/app/(storelib)/app/products/new/sales-channels-card"
import { Totals } from "@/app/(storelib)/checkout/parts/order-summary"
import * as React from "react"
import { digitalTax } from "@/lib/tax/rules"

/* The checkout's bottom total with a tax line, worked out the way the page does. */
function TotalsProbe({ included }: { included: boolean }) {
  const [country, setCountry] = React.useState<string | null>("RO")
  const regions = [{ id: "r-ro", country: "RO", region: null, rateBps: 1900 }, { id: "r-de", country: "DE", region: null, rateBps: 1900 }, { id: "r-bg", country: "BG", region: null, rateBps: 2000 }]
  const t = digitalTax({ enabled: true, digital: true, included, regions, overrides: [] }, { taxableCents: 2900, tipCents: 0, productId: "p", country })
  return (
    <div data-totals-probe={included ? "included" : "added"} style={{ background: "#fff", padding: 20, borderRadius: 16 }}>
      <Totals part="bottom" subtotal={2900} discountCents={0} total={t.totalCents} tax={{ cents: t.taxCents, rateBps: t.rateBps, included, country, countries: regions.map((r) => r.country), onCountry: setCountry, suffix: included ? "i" : "a" }} />
    </div>
  )
}

type W = Window & { __settingsPanelsGets?: string[]; __panel?: string; __api?: Record<string, unknown>; __settingsPanelsSent?: { method: string; path: string; body: unknown }[]; __panels?: Record<string, () => React.ReactElement> }
const w = window as W
w.__settingsPanelsSent = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
  const method = (init?.method || "GET").toUpperCase()
  if (!path.startsWith("/api/")) return realFetch(input, init)
  if (method !== "GET") w.__settingsPanelsSent!.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
  else (w.__settingsPanelsGets ??= []).push(url.replace(/^https?:\/\/[^/]+/, ""))
  const body = w.__api?.[`${method} ${path}`] ?? w.__api?.[path] ?? {}
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

/** The website builder's chooser, open, with what it hands back shown. */
function PickProbe() {
  const [open, setOpen] = React.useState(true)
  const [picked, setPicked] = React.useState<string | null>(null)
  return (
    <div>
      <p data-picked={picked ?? ""}>{picked ?? "nothing yet"}</p>
      <FilesLibraryChooser open={open} onClose={() => setOpen(false)} onPick={setPicked} />
    </div>
  )
}

const panels: Record<string, () => React.ReactElement> = {
  store: () => <StoreDetailsPanel />,
  checkout: () => <CheckoutPanel />,
  taxes: () => <TaxesPanel />,
  markets: () => <MarketsPanel />,
  channels: () => <ChannelsPanel />,
  integrations: () => <IntegrationsDirectory />,
  emails: () => <CustomerEmailsPanel />,
  files: () => <FilesLibrary mode="manage" />,
  activity: () => <ActivityPanel />,
  filesPick: () => <PickProbe />,
  channelCard: () => (
    <div style={{ maxWidth: 360 }}>
      <SalesChannelsCard productId={null} cardClass="space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" titleClass="text-[16px] font-semibold text-[#1a1a2e]" />
    </div>
  ),
  reasons: () => (
    <div style={{ display: "grid", gap: 16 }}>
      <ReasonsPanel kinds={["return", "refund"]} />
    </div>
  ),
  totals: () => (
    <div style={{ display: "grid", gap: 16 }}>
      <TotalsProbe included={false} />
      <TotalsProbe included />
    </div>
  ),
  ...(w.__panels ?? {}),
}
const Panel = panels[w.__panel ?? "store"] ?? panels.store
createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px" }}>
      <Panel />
    </div>
  </PlatformSettingsProvider>,
)
