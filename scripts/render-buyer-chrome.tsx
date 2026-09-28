/**
 * The buyer's chrome as the layouts draw it, for scripts/check-buyer-chrome.
 * mjs: the real ConditionalHeader (and the real platform header inside it),
 * the real ConditionalFooter, and the real phone tab bar with the search
 * screen it opens, around a stand in page for each address. The probe stubs
 * the router and Supabase (who is signed in, and what a search finds) and
 * says which page and which visitor through window.__nav and window.__who.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { LocaleProvider } from "@/components/locale-provider"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { SearchPage } from "@/components/search/search-page"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"

function Rows({ n, label }: { n: number; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="aspect-[4/3] bg-neutral-200" />
          <p className="p-3 text-[13px] text-[#1a1a2e]">{label} {i + 1}</p>
        </div>
      ))}
    </div>
  )
}

function Body({ path }: { path: string }) {
  if (path === "/explore/search") return <SearchPage />
  if (path.startsWith("/explore")) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6" data-probe-page="explore">
        <h1 className="text-[28px] font-bold text-[#1a1a2e]">Discover</h1>
        <div className="mt-4" {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
          <input className="h-[52px] w-full rounded-[10px] border border-neutral-200 bg-white px-4 text-[16px]" placeholder="Search products" />
        </div>
        <div className="mt-6"><Rows n={16} label="Product" /></div>
      </div>
    )
  }
  if (path.startsWith("/library")) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6" data-probe-page="library">
        <h1 className="text-[24px] font-bold text-[#1a1a2e]">Library</h1>
        <div className="mt-6"><Rows n={12} label="Purchase" /></div>
      </div>
    )
  }
  if (path.startsWith("/account")) {
    return (
      <div className="mx-auto max-w-[640px] px-4 pb-8 pt-6" data-probe-page="account">
        <h1 className="text-[24px] font-bold text-[#1a1a2e]">Account</h1>
        <div className="mt-6"><Rows n={8} label="Card" /></div>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-[1200px] bg-white px-4 pb-8 pt-10" data-probe-page="marketing">
      <h1 className="text-[34px] font-bold text-[#1a1a2e]">Sell what you make</h1>
      <div className="mt-6"><Rows n={8} label="Section" /></div>
    </div>
  )
}

function Page() {
  const path = usePathname() || "/explore"
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]">
      <ConditionalHeader onPlatformDomain />
      <main className="flex-1" data-probe-path={path}>
        <Body path={path} />
      </main>
      <div className="relative isolate">
        <Suspense fallback={null}>
          <ConditionalFooter />
        </Suspense>
      </div>
      <BuyerTabBar />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Page />
  </LocaleProvider>,
)
