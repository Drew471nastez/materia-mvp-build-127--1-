/**
 * Round 39's tab bar, rendered the way the site serves it: the server's HTML
 * first (react-dom/server, as Next renders the marketing layout; nobody is
 * known to be signed in there), then hydrated in the page. Built twice by
 * scripts/check-tab-bar-auth-r39.mjs: for node (SSR=true, renderToString)
 * and for the browser (hydrateRoot over that HTML).
 *
 * A page shaped like the buyer's side of storelib.com: the black header, a
 * light page with cards, the dark footer, and the real BuyerTabBar mounted
 * after it the way app/(marketing)/layout.tsx mounts it.
 */
import React from "react"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { LocaleProvider } from "@/components/locale-provider"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"

declare const SSR: boolean

function Cards({ n }: { n: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="aspect-[4/3] bg-neutral-200" />
          <p className="p-3 text-[13px] text-[#1a1a2e]">Product {i + 1}</p>
        </div>
      ))}
    </div>
  )
}

export function App() {
  return (
    <LocaleProvider>
      <ExploreMarketplaceProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce={false}>
        <div className="flex min-h-svh flex-col bg-[#fafafa]">
          <header className="sticky top-0 z-40 h-[64px] bg-black" data-probe-header="" />
          <main className="flex-1">
            <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6">
              <h1 className="text-[28px] font-bold text-[#1a1a2e]">Discover</h1>
              <div className="mt-6">
                <Cards n={4} />
              </div>
            </div>
          </main>
          <footer className="bg-[#111] px-4 py-10 text-[13px] text-white/70" data-probe-footer="">
            <p data-footer-last="">The last line of the footer</p>
          </footer>
          <BuyerTabBar />
        </div>
      </ExploreMarketplaceProvider>
    </LocaleProvider>
  )
}

if (!SSR) {
  void import("react-dom/client").then(({ hydrateRoot }) => {
    const errors: string[] = []
    ;(window as unknown as { __hydrationErrors: string[] }).__hydrationErrors = errors
    hydrateRoot(document.getElementById("app")!, <App />, { onRecoverableError: (e) => errors.push(String((e as Error)?.message ?? e).slice(0, 200)) })
  })
}
