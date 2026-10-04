/**
 * The app's shell as the phone app draws it, for scripts/check-native-shell.
 * mjs: the real ConditionalHeader (and the real platform header inside it),
 * the real NativeChrome from the root layout, and under the header the real
 * thing each page puts at its top:
 *
 *   /explore            real ProductCard and ExploreCommunityCard tiles
 *   /account            the profile column's rows, with a picture each
 *   /account/library    the real LibraryPanel with the real LibraryTabs
 *   /maker              a creator's page: the real ProfileTopBar (the back
 *                       chevron next to the person) under the header
 *   /list, /detail      two pages for the back probe: a long list, and a
 *                       page whose only control is the real BackChevron
 *
 * The probe stubs the router and Supabase and says which page and which
 * visitor through window.__nav and window.__who, as check-buyer-chrome does.
 */
import React, { Suspense } from "react"
import { createRoot } from "react-dom/client"
import { usePathname } from "next/navigation"

import { LocaleProvider } from "@/components/locale-provider"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { NativeChrome } from "@/components/platform/native-chrome"
import { ProductCard } from "@/components/explore/product-card"
import { ExploreCommunityCard } from "@/components/explore/community-card"
import { LibraryPanel } from "@/components/library/library-panel"
import { LibraryTabs } from "@/components/library/library-tabs"
import { BackChevron, ProfileTopBar } from "@/components/profile/profile-top-bar"
import type { CommunityCard } from "@/lib/communities/types"

const HUES = [18, 42, 160, 200, 220, 260]
const picture = (i: number, w = 640, h = 360) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${HUES[i % HUES.length]} 35% 82%)"/><circle cx="${w * 0.7}" cy="${h * 0.42}" r="${h * 0.22}" fill="hsl(${HUES[i % HUES.length]} 32% 64%)"/></svg>`,
  )

const product = (i: number) => ({
  id: `p${i}`,
  title: ["Trapsodia Trap Pack", "Notion Life OS", "Brand Kit Pro", "Piano one shots"][i % 4],
  slug: `product-${i}`,
  description: "A short description.",
  price_cents: [0, 1900, 4900, 1200][i % 4],
  thumbnail_url: picture(i),
  type: "digital",
  categoryName: "Other",
  reviews_count: 3,
  reviews_average: 5,
  creator: { id: `c${i}`, slug: `maker${i}`, profile: { display_name: "Negru W", avatar_url: picture(i + 3, 64, 64), username: `maker${i}` } },
})

const community = (i: number): CommunityCard =>
  ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    slug: `club-${i}`,
    name: ["SalajanyWood Club", "Film Photo Club"][i % 2],
    tagline: "One love ponda' Salajan",
    excerpt: null,
    logoUrl: picture(i + 1, 96, 96),
    coverUrl: picture(i + 2),
    category: "design",
    access: "free",
    visibility: "public",
    memberCount: 4,
    priceLine: "Free",
    creator: { id: `cr${i}`, name: "AndrewRullz", username: "andrewrullz", avatarUrl: picture(i + 4, 64, 64) },
    url: `/community/club-${i}`,
    viewCount: 5,
    rating: null,
    launchedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  }) as unknown as CommunityCard

function Explore() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-6" data-probe-page="explore">
      <h1 className="text-[28px] font-bold text-[#1a1a2e]">Discover</h1>
      {/* A red block right under the header: if the header lets anything through, it is this. */}
      <div data-probe-red="" className="mt-4 h-[120px] rounded-xl bg-[#ff0000]" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" data-probe-grid="">
        {[0, 1].map((i) => (
          <div key={`p${i}`} data-probe-card={`product-${i}`}>
            <ProductCard product={product(i)} clientNav />
          </div>
        ))}
        {[0, 1].map((i) => (
          <div key={`c${i}`} data-probe-card={`community-${i}`}>
            <ExploreCommunityCard card={community(i)} />
          </div>
        ))}
        <div data-probe-card="community-row">
          <ExploreCommunityCard card={community(0)} layout="row" />
        </div>
      </div>
      <div className="h-[1400px]" />
    </div>
  )
}

function Account() {
  return (
    <div className="mx-auto max-w-[640px] px-4 pb-8 pt-6" data-probe-page="account">
      <div data-probe-red="" className="h-[120px] rounded-xl bg-[#ff0000]" />
      <div className="mt-6" data-probe-card="community-row">
        <ExploreCommunityCard card={community(0)} layout="row" />
      </div>
      <div className="h-[1600px]" />
    </div>
  )
}

function LibraryScreen({ path }: { path: string }) {
  const words: Record<string, string> = {
    "/account/library": "Products",
    "/account/library/courses": "Courses",
    "/account/library/communities": "Communities",
    "/account/library/wishlist": "Wishlist",
    "/account/library/reviews": "Reviews",
    "/account/library/receipts": "Receipts",
  }
  return (
    <div data-probe-screen={path} className="space-y-3">
      <div data-probe-red="" className="h-[80px] rounded-xl bg-[#ff0000]" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-3">
          <div className="h-12 w-12 rounded-lg bg-neutral-200" />
          <p className="text-[14px] text-[#1a1a2e]">
            {words[path] ?? "Screen"} {i + 1}
          </p>
        </div>
      ))}
    </div>
  )
}

function Library({ path }: { path: string }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-4" data-probe-page="library">
      <LibraryPanel head={<LibraryTabs communities />}>
        <LibraryScreen path={path} />
      </LibraryPanel>
      <div className="h-[1200px]" />
    </div>
  )
}

function Maker() {
  return (
    <div data-probe-page="maker">
      <ProfileTopBar initiallyShown name="Andrew Rullz" avatarUrl={picture(5, 64, 64)} />
      <div className="mx-auto max-w-[960px] px-4 pt-4">
        <div data-probe-red="" className="h-[120px] rounded-xl bg-[#ff0000]" />
        <div className="h-[1600px]" />
      </div>
    </div>
  )
}

function List() {
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-4" data-probe-page="list">
      {Array.from({ length: 60 }, (_, i) => (
        <a key={i} href="/detail" data-probe-row={i} className="mb-2 block rounded-xl border border-neutral-200 bg-white p-4 text-[15px]">
          Row {i + 1}
        </a>
      ))}
    </div>
  )
}

function Detail() {
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-4" data-probe-page="detail">
      <BackChevron fallback="/explore" />
      <p className="mt-4 text-[15px]">Detail</p>
    </div>
  )
}

function Body({ path }: { path: string }) {
  if (path.startsWith("/account/library")) return <Library path={path} />
  if (path.startsWith("/account")) return <Account />
  if (path === "/maker") return <Maker />
  if (path === "/list") return <List />
  if (path === "/detail") return <Detail />
  return <Explore />
}

function Page() {
  const path = usePathname() || "/explore"
  const light = (window as unknown as { __light?: boolean }).__light !== false
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]">
      <ConditionalHeader onPlatformDomain buyerHeaderLight={light} />
      <main className="flex-1" data-probe-path={path}>
        <Body path={path} />
      </main>
      <NativeChrome />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </LocaleProvider>,
)
