/**
 * Settings › Checkout › Checkout text, the real CheckoutTextCard
 * (components/app/settings/checkout-text.tsx), for scripts/check-checkout-text.mjs,
 * in a column as wide as the settings sheet's.
 *
 * GET /api/store/checkout-text is answered here for a store whose default
 * language is English with Romanian added (Romanian's defaults are the hand
 * written words, lib/markets/curated/ro.ts); every PUT is kept in
 * window.__puts and answered as saved.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CheckoutTextCard } from "@/components/app/settings/checkout-text"
import { CHECKOUT_TEXT_WORDS } from "@/lib/markets/checkout-text"
import ro from "@/lib/markets/curated/ro"

const w = window as unknown as { __puts?: { locale: string; items: { key: string; value: string }[] }[] }
const saved: Record<string, Record<string, string>> = { en: {}, ro: {} }

const fallbackOf = (locale: string, key: string, source: string) => {
  if (locale !== "ro") return source
  if (key.startsWith("ui:")) return (ro.ui as Record<string, string>)[key.slice(3)] ?? source
  return ro.checkout[source] ?? source
}

const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
  if (url.pathname === "/api/store/checkout-text" && (init?.method ?? "GET") === "GET") {
    const locale = url.searchParams.get("locale") || "en"
    return json({ ready: true, locale, defaultLanguage: "en", languages: ["en", "ro"], shop: "AndrewRullz", items: CHECKOUT_TEXT_WORDS.map((x) => ({ key: x.key, source: x.source, group: x.group, fallback: fallbackOf(locale, x.key, x.source), value: saved[locale]?.[x.key] ?? "" })) })
  }
  if (url.pathname === "/api/store/checkout-text" && init?.method === "PUT") {
    const body = JSON.parse(String(init.body || "{}"))
    ;(w.__puts ||= []).push(body)
    for (const it of body.items) saved[body.locale][it.key] = it.value
    return json({ saved: 1, removed: 0 })
  }
  if (url.pathname.startsWith("/api/")) return json({})
  return realFetch(input, init)
}) as typeof window.fetch

createRoot(document.getElementById("app")!).render(
  <div className="min-h-screen bg-[#f8f9fa]">
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6">
      <CheckoutTextCard />
    </div>
  </div>,
)
