/**
 * The real /app search (components/app/app-search.tsx) over a page shaped
 * like /app, for scripts/check-app-search.mjs. The server is a stand-in
 * `fetch` that answers from fixtures with a delay, records every query it is
 * asked and honours an abort, so the probe can see debouncing, stale answers
 * being dropped, the empty state and the error state.
 *
 *   "slow..."  answers after 700ms, to race a faster query behind it
 *   "boom"     answers 500
 *   anything with no fixture answers empty groups
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AppSearch, type AppSearchHandle } from "@/components/app/app-search"
import { emptyResult, type SearchResult } from "@/lib/search/app-search"

declare global {
  interface Window {
    __asked: string[]
    __aborted: string[]
    __search: AppSearchHandle | null
  }
}
window.__asked = []
window.__aborted = []

function result(partial: Partial<SearchResult["groups"]>): SearchResult {
  const r = emptyResult()
  Object.assign(r.groups, partial)
  return r
}

const JANE = result({
  orders: [
    { id: "o3", title: "Order #1043", detail: "Jane Doe · Portrait retouching course · $29.00", href: "/app/orders?order=o3" },
    { id: "o1", title: "Order #1012", detail: "Jane Doe · Lightroom presets · $12.00", href: "/app/orders?order=o1" },
  ],
  customers: [
    { id: "buyer:jane@example.com", title: "Jane Doe", detail: "jane@example.com · 2 orders", href: "/app/orders?range=all_time&q=jane%40example.com" },
    { id: "contact:janet@list.com", title: "Janet Park", detail: "janet@list.com · On your email list", href: "/app/emails" },
  ],
  emails: [{ id: "e1", title: "Jane's favourite presets are back", detail: "Draft", href: "/app/emails/edit/e1" }],
})

const FIXTURES: Record<string, SearchResult> = {
  jane: JANE,
  "#1043": result({ orders: [JANE.groups.orders[0]] }),
  launch: result({
    products: [{ id: "p1", title: "Launch course", detail: "Published · $49.00", href: "/app/products/p1" }],
    emails: [{ id: "e2", title: "Launch week", detail: "Sent", href: "/app/emails/edit/e2" }],
    automations: [{ id: "f1", title: "Launch welcome", detail: "On", href: "/app/emails/flow/f1" }],
  }),
  slowly: result({ products: [{ id: "px", title: "STALE ANSWER", detail: "", href: "/app/products/px" }] }),
  slow: result({ products: [{ id: "py", title: "Slow cooker guide", detail: "Draft · $5.00", href: "/app/products/py" }] }),
}

window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  /* Changed on purpose (round 42): only the search's own questions are recorded; the platform's flags read is answered with none. */
  if (!String(url).includes("/api/app/search")) return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
  const q = JSON.parse(String(init?.body ?? "{}")).q as string
  window.__asked.push(q)
  const wait = q.startsWith("slowly") ? 700 : 60
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, wait)
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(t)
      window.__aborted.push(q)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
  if (q === "boom") return new Response(JSON.stringify({ error: "Search is not working right now." }), { status: 500 })
  return new Response(JSON.stringify(FIXTURES[q] ?? emptyResult()), { status: 200, headers: { "Content-Type": "application/json" } })
}) as typeof fetch

function Shell() {
  const ref = React.useRef<AppSearchHandle>(null)
  React.useEffect(() => {
    window.__search = ref.current
  })
  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 hidden h-[58px] items-center bg-[#131316] px-5 md:flex">
        <span className="text-[13px] font-medium text-white/90">Materia Themes</span>
        <div className="relative flex flex-1 justify-center px-6">
          <AppSearch ref={ref} />
        </div>
        <span className="text-[15px] font-semibold text-white">Storelib</span>
      </header>
      <header className="fixed left-0 right-0 top-0 z-50 flex h-[68px] items-center justify-between bg-[#111111] px-4 md:hidden">
        <span className="text-[13px] font-medium text-white/90">Materia Themes</span>
        <button type="button" data-phone-search="" aria-label="Search" onClick={() => ref.current?.open()} className="h-9 w-9 text-white">
          S
        </button>
      </header>
      <div className="app-content-scroll fixed inset-x-0 bottom-0 top-[68px] overflow-y-auto bg-[#f8f9fa] md:top-[58px]">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Dashboard</h1>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="mt-4 h-[120px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
          ))}
        </div>
      </div>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Shell />)
