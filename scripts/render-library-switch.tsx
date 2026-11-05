/**
 * The library inside the profile, as app/(storelib)/account/layout.tsx and
 * app/(storelib)/account/library/layout.tsx draw it, for scripts/check-library-switch.mjs:
 * the account's wrapper (components/account/account-nav-fade.tsx) and column,
 * then the library's stage (components/library/library-panel.tsx) with its
 * head (components/library/library-tabs.tsx) over the real screens filled
 * with a made up buyer: Products, Courses, Communities, Wishlist, Reviews,
 * Receipts.
 *
 * THE TABS AS ROUTES, stood in for, the way Next's router moves: the probe's
 * next/navigation reads the path from a context this file updates in a
 * transition. A warm press (the router holds the page) commits the address
 * and the screen together; a cold one (window.__cold) commits the route's
 * loading.tsx first and the screen __coldMs later; a slow one (window.__delay)
 * commits nothing until its answer comes.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AccountNavFade } from "@/components/account/account-nav-fade"
import { AccountColumn } from "@/components/account/account-column"
import { LibraryTabs } from "@/components/library/library-tabs"
import { LibraryPanel } from "@/components/library/library-panel"
import { LibraryRouteSkeleton } from "@/components/library/library-route-skeleton"
import { LibraryHome } from "@/components/library/library-home"
import { LibraryReviews } from "@/components/library/library-reviews"
import { LibraryReceipts } from "@/components/library/library-receipts"
import { CoursesIndex } from "@/components/courses/courses-index"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import type { WishlistEntry } from "@/components/wishlist/wishlist-entry"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"
import type { LibraryCommunityRow } from "@/components/community/public/types"
import type { CommunityCard } from "@/lib/communities/types"
import type { MyCourse } from "@/lib/courses/types"
import { assembleLibrary, type LibraryExtras } from "@/lib/library/library-view"
import type { DownloadRow } from "@/lib/library/get-library-downloads"

const w = window as unknown as {
  __path?: string
  __cold?: boolean
  __coldMs?: number
  __delay?: number
  __navigate?: (href: string) => void
  __PathContext: React.Context<string | null>
  __commits?: { path: string; loading: boolean; at: number }[]
}

function cover(a: string, b: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="14" y="140" font-family="Inter,Arial" font-weight="700" font-size="22" fill="rgba(255,255,255,0.92)">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const row = (over: Partial<DownloadRow>): DownloadRow => ({
  id: "e",
  productId: "p",
  title: "Product",
  thumbnailUrl: null,
  creatorName: "Maya Chen",
  createdAt: "2026-09-20T10:00:00Z",
  purchasedAtLabel: "",
  files: [],
  creatorId: "c1",
  creatorSlug: "mayachen",
  creatorAvatarUrl: null,
  productSlug: "product",
  productStatus: "published",
  ...over,
})

const downloads: DownloadRow[] = [
  row({ productId: "p1", title: "Film Emulation Presets: Portra, Gold and Ektar", thumbnailUrl: cover("#b45309", "#78350f", "PRESETS"), createdAt: "2026-09-24T10:00:00Z", files: [{ id: "a1", fileName: "Film-Presets-Lightroom.zip", sizeBytes: 48_300_000 }, { id: "a2", fileName: "Install guide.pdf", sizeBytes: 820_000 }] }),
  row({ productId: "p2", title: "The Buyer Question Playbook", thumbnailUrl: cover("#1e3a8a", "#0f172a", "PLAYBOOK"), createdAt: "2026-09-12T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [{ id: "b1", fileName: "buyer-question-playbook.pdf", sizeBytes: 5_400_000 }] }),
  row({ productId: "p3", title: "Drum One Shots Vol. 1", thumbnailUrl: cover("#111827", "#374151", "DRUMS"), createdAt: "2026-08-30T10:00:00Z", creatorId: "c3", creatorName: "Kiko Beats", creatorSlug: "kikobeats", files: [{ id: "c1", fileName: "Drum One Shots Vol 1.zip", sizeBytes: 612_000_000 }] }),
  row({ productId: "p4", title: "Notion Content Calendar", thumbnailUrl: cover("#0f766e", "#134e4a", "NOTION"), createdAt: "2026-07-02T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [] }),
  row({ productId: "p5", title: "Watercolor Brush Pack", thumbnailUrl: cover("#be123c", "#4c0519", "BRUSHES"), createdAt: "2026-05-18T10:00:00Z", files: [{ id: "e1", fileName: "brushes.abr", sizeBytes: 31_000_000 }] }),
]

const extras: LibraryExtras = {
  ownCreatorId: null,
  variantFiles: new Map(),
  creators: [
    { id: "c1", name: "Maya Chen", slug: "mayachen", avatarUrl: null, supportEmail: "hello@mayachen.co" },
    { id: "c2", name: "Luca Dragoste", slug: "lucadragoste", avatarUrl: null, supportEmail: null },
    { id: "c3", name: "Kiko Beats", slug: "kikobeats", avatarUrl: null, supportEmail: null },
  ],
  orders: [
    { id: "8a1f4c2e-0000-4000-8000-000000000001", product_id: "p1", created_at: "2026-09-24T10:00:00Z", status: "completed", amount_cents: 2900, receipt_token: "tok_p1_0000000000000001", stripe_session_id: "cs_a", stripe_payment_intent_id: "pi_a", currency: "usd", product: { title: "Film Emulation Presets: Portra, Gold and Ektar", thumbnail_url: downloads[0].thumbnailUrl, creator_id: "c1" } },
    { id: "3c9d2b7a-0000-4000-8000-000000000002", product_id: "p2", created_at: "2026-09-12T10:00:00Z", status: "completed", amount_cents: 1900, receipt_token: "tok_p2_0000000000000002", stripe_payment_intent_id: "pi_b", currency: "usd", product: { title: "The Buyer Question Playbook", thumbnail_url: downloads[1].thumbnailUrl, creator_id: "c2" } },
    { id: "5e2a8f1d-0000-4000-8000-000000000003", product_id: "p3", created_at: "2026-08-30T10:00:00Z", status: "completed", amount_cents: 3500, receipt_token: "tok_p3_0000000000000003", stripe_payment_intent_id: "pi_c", currency: "usd", product: { title: "Drum One Shots Vol. 1", thumbnail_url: downloads[2].thumbnailUrl, creator_id: "c3" } },
  ],
  reviews: [{ id: "r1", product_id: "p2", rating: 4, content: "Short, practical, and I used two of the question lists the same week.", created_at: "2026-09-15T10:00:00Z", seller_reply: null }],
} as unknown as LibraryExtras

const data = assembleLibrary(downloads, extras)

const COURSES: MyCourse[] = [
  { productId: "k1", title: "Watercolour from the first wash to a finished landscape", thumbnailUrl: cover("#7c2d12", "#431407", "COURSE"), creator: { id: "c1", name: "Ana Ruiz", avatarUrl: null, storeHref: "/ana" }, total: 8, completed: 3, percent: 37, status: "in_progress", totalSeconds: 7400, lastOpenedAt: "2026-09-27T10:00:00Z", purchasedAt: "2026-09-01T10:00:00Z", resume: { lessonId: "l4", title: "Flat wash", number: 4 } },
  { productId: "k2", title: "Lightroom presets, and editing a whole shoot in an hour", thumbnailUrl: cover("#1e40af", "#172554", "EDIT"), creator: { id: "c2", name: "Marco Bellini", avatarUrl: null, storeHref: "/marco" }, total: 12, completed: 12, percent: 100, status: "completed", totalSeconds: 16200, lastOpenedAt: "2026-09-10T10:00:00Z", purchasedAt: "2026-08-01T10:00:00Z", resume: { lessonId: "x", title: "Import", number: 1 } },
]

const wish = (over: Partial<WishlistEntry>): WishlistEntry => ({
  id: "w",
  productId: "w",
  title: "Product",
  slug: "product",
  type: "digital",
  priceCents: 1900,
  compareAtCents: null,
  payWhatYouWant: false,
  pwywMinCents: null,
  interval: null,
  hasOptions: false,
  owned: false,
  thumbnailUrl: null,
  creator: { name: "Maya Chen", username: "mayachen", avatarUrl: null },
  savedAt: "2026-09-20T10:00:00Z",
  ...over,
})

const WISHLIST: WishlistEntry[] = [
  wish({ id: "w1", productId: "q1", title: "Cinematic LUT Pack for Sony and Canon", slug: "luts", priceCents: 2900, compareAtCents: 3900, thumbnailUrl: cover("#0e7490", "#164e63", "LUTS") }),
  wish({ id: "w2", productId: "q2", title: "Lo-fi Sample Kit", slug: "lofi", payWhatYouWant: true, pwywMinCents: 500, priceCents: 500, thumbnailUrl: cover("#be123c", "#4c0519", "LO-FI"), creator: { name: "Kiko Beats", username: "kikobeats", avatarUrl: null } }),
  wish({ id: "w3", productId: "q3", title: "Freelance Contract Templates", slug: "contracts", priceCents: 0, thumbnailUrl: cover("#334155", "#0f172a", "CONTRACTS") }),
]

const logo = (hue: number, letter: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${hue} 40% 46%)"/><text x="48" y="60" font-family="Inter,Arial" font-size="40" font-weight="700" fill="white" text-anchor="middle">${letter}</text></svg>`)
const community = (i: number, name: string, tagline: string, members: number, price: string): CommunityCard => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  tagline,
  logoUrl: logo(30 + i * 70, name[0]),
  coverUrl: null,
  category: "design",
  access: price === "Free" ? "free" : "paid",
  visibility: "public",
  memberCount: members,
  priceLine: price,
  creator: { id: `cr${i}`, name: ["Ines Duarte", "Sam Reyes", "Ava Stone"][i], username: `maker${i}`, avatarUrl: null },
  url: `/community/c${i}`,
  viewCount: [5210, 128_000, 1200][i],
  rating: i === 0 ? { average: 4.9, count: 37 } : null,
  excerpt: null,
})
const CARDS = [community(0, "Film Photo Club", "Film photographers sharing scans and lab tips.", 284, "$9/month"), community(1, "Founders Weekly", "Weekly calls for founders.", 9800, "Free"), community(2, "Design Systems Guild", "Tokens, components and the people who keep them.", 43, "$19/month")]
const COMMUNITIES: LibraryCommunityRow[] = CARDS.map((card, i) => ({
  id: card.id,
  slug: card.slug,
  name: card.name,
  logoUrl: card.logoUrl,
  coverUrl: card.coverUrl,
  creatorName: card.creator?.name ?? null,
  status: i === 2 ? "pending" : "active",
  role: i === 0 ? "owner" : "member",
  tierName: null,
  memberCount: card.memberCount,
  url: card.url,
  card,
}))

function screenFor(path: string): React.ReactNode {
  switch (path) {
    case "/account/library/courses":
      return <CoursesIndex courses={COURSES} />
    case "/account/library/communities":
      return (
        <div data-page-communities="" className="space-y-3 pb-4">
          <p className="text-[14px] text-[#6b7280]">2 communities</p>
          <LibraryCommunitiesList rows={COMMUNITIES} />
        </div>
      )
    case "/account/library/wishlist":
      return <WishlistContent isLibrary initialItems={WISHLIST} />
    case "/account/library/reviews":
      return <LibraryReviews items={data.items} />
    case "/account/library/receipts":
      return <LibraryReceipts receipts={data.receipts} />
    default:
      return <LibraryHome items={data.items} creators={data.creators} toReview={data.items.filter((i) => i.canReview).length} wishlistCount={3} />
  }
}

function NavApp() {
  const [state, setState] = React.useState({ path: w.__path || "/account/library", loading: false })
  React.useEffect(() => {
    w.__navigate = (href: string) => {
      const path = href.split("?")[0]
      const go = () => {
        history.pushState({}, "", path)
        React.startTransition(() => setState({ path, loading: !!w.__cold }))
        if (w.__cold) window.setTimeout(() => React.startTransition(() => setState({ path, loading: false })), w.__coldMs ?? 450)
      }
      if (w.__delay) window.setTimeout(go, w.__delay)
      else go()
    }
    const onPop = () => React.startTransition(() => setState({ path: location.pathname, loading: false }))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  React.useLayoutEffect(() => {
    ;(w.__commits ||= []).push({ path: state.path, loading: state.loading, at: performance.now() })
  }, [state])
  const PathContext = w.__PathContext
  return (
    <PathContext.Provider value={state.path}>
      <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
        <div className="sticky top-0 z-40 h-14 border-b border-[#eceef1] bg-white" data-fake-header="" />
        <main className="flex-1 overflow-x-hidden">
          <AccountNavFade>
            <AccountColumn>
              <div data-page="library">
                {/* `communities` is the switch, read by the library's layout on the server. */}
                <LibraryPanel head={<LibraryTabs {...({ communities: true } as object)} />}>
                  {state.loading ? <LibraryRouteSkeleton path={state.path} /> : <div data-probe-path={state.path}>{screenFor(state.path)}</div>}
                </LibraryPanel>
              </div>
            </AccountColumn>
          </AccountNavFade>
        </main>
        <footer className="h-64 bg-[#0b0b10]" data-fake-footer="" />
      </div>
    </PathContext.Provider>
  )
}

createRoot(document.getElementById("app")!).render(<NavApp />)
