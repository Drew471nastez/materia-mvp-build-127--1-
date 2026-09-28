/**
 * The real buyer tab bar (with the search screen it opens), the real search
 * page and the real account page,
 * in a shell shaped like the buyer's side of storelib.com: the black header,
 * a light page, the dark footer, and the bar mounted after it the way the
 * layouts mount it. The router is the probe's stub (scripts/check-buyer-tab-
 * bar.mjs), which changes the path a moment after a push, the way a page
 * arrives. A product page browsed from Explore carries the real buy bar, so
 * the two bars can be measured together.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { SearchPage } from "@/components/search/search-page"
import { AccountPage } from "@/components/account/account-page"
import { LiveStickyAddToCart } from "@/components/store-builder/sticky-add-to-cart"
import { LocaleProvider } from "@/components/locale-provider"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"

const THUMB = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#c7d2fe"/><circle cx="48" cy="40" r="18" fill="#818cf8"/></svg>`)

function Cards({ n, label }: { n: number; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="aspect-[4/3] bg-neutral-200" />
          <p className="p-3 text-[13px] text-[#1a1a2e]">{label} {i + 1}</p>
        </div>
      ))}
    </div>
  )
}

function Explore() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6">
      <h1 className="text-[28px] font-bold text-[#1a1a2e]">Discover</h1>
      <div className="mt-4" {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
        <input data-explore-field="" className="h-[52px] w-full rounded-[10px] border border-neutral-200 bg-white px-4 text-[16px]" placeholder="Search products" />
      </div>
      <div className="mt-6"><Cards n={10} label="Product" /></div>
    </div>
  )
}

function Library() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6">
      <h1 className="text-[24px] font-bold text-[#1a1a2e]">Library</h1>
      <div className="mt-6"><Cards n={6} label="Purchase" /></div>
    </div>
  )
}

function Product() {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-4">
        <div className="aspect-square w-full rounded-2xl bg-neutral-200" />
        <h1 className="mt-4 text-[22px] font-bold">Preset pack</h1>
        <div data-description-section="" className="mt-6 space-y-3">
          <h2 className="text-[17px] font-semibold">Description</h2>
          {Array.from({ length: 90 }, (_, i) => <p key={i} className="text-[14px] text-neutral-600">Line {i + 1} of what is in the pack.</p>)}
        </div>
      </div>
      <LiveStickyAddToCart
        settings={{ visible: true } as never}
        product={{ id: "p1", title: "Preset pack", price_cents: 1900, thumbnail_url: THUMB, slug: "preset-pack" } as never}
        creatorId="c1"
      />
    </div>
  )
}

const WISHLIST = {
  count: 7,
  items: [1, 2, 3, 4].map((i) => ({ id: `w${i}`, title: `Saved ${i}`, thumbnail: THUMB, href: `/maria/saved-${i}` })),
}

function Account() {
  const signedIn = (window as unknown as { __signedIn?: boolean }).__signedIn
  return (
    <AccountPage
      userId="u1"
      email="alex@example.com"
      name={signedIn ? "Alex Morgan" : ""}
      avatarUrl={null}
      createdAt="2025-03-14T10:00:00Z"
      hasPassword={!(window as unknown as { __oauthOnly?: boolean }).__oauthOnly}
      via="Google"
      isSeller={!!(window as unknown as { __seller?: boolean }).__seller}
      newsletter={false}
      personalized={true}
      wishlist={WISHLIST}
    />
  )
}

function Page() {
  const path = usePathname() || "/explore"
  const body =
    path === "/explore/search" ? <SearchPage />
      : path.startsWith("/explore") ? <Explore />
        : path.startsWith("/library") ? <Library />
          : path.startsWith("/account") ? <Account />
            : path.split("/").filter(Boolean).length === 2 ? <Product />
              : <p className="p-6">Elsewhere: {path}</p>
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]">
      <header className="sticky top-0 z-40 h-[64px] bg-black" data-probe-header="" />
      <main className="flex-1" data-probe-path={path}>{body}</main>
      <footer className="bg-[#111] px-4 py-10 text-[13px] text-white/70" data-probe-footer="">
        <p>Storelib</p>
        <p className="mt-2" data-footer-last="">The last line of the footer</p>
      </footer>
      <BuyerTabBar />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Page />
  </LocaleProvider>,
)
