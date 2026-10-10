/*
 * Round T's settings panels against a stubbed API, for
 * scripts/check-settings-panels.mjs. `window.__panel` picks one;
 * `window.__api` answers by path (GET), and every PUT/POST/DELETE is
 * recorded in `window.__sent` and answered with `window.__api[path]`.
 */
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { CheckoutPanel } from "@/components/app/settings/checkout-panel"

type W = Window & { __panel?: string; __api?: Record<string, unknown>; __sent?: { method: string; path: string; body: unknown }[]; __panels?: Record<string, () => JSX.Element> }
const w = window as W
w.__sent = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
  const method = (init?.method || "GET").toUpperCase()
  if (!path.startsWith("/api/")) return realFetch(input, init)
  if (method !== "GET") w.__sent!.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
  const body = w.__api?.[`${method} ${path}`] ?? w.__api?.[path] ?? {}
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

const panels: Record<string, () => JSX.Element> = {
  store: () => <StoreDetailsPanel />,
  checkout: () => <CheckoutPanel />,
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
