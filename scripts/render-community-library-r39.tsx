/**
 * Round 39's community Library, for scripts/check-community-library-r39.mjs: the real admin section (the list, the
 * Library off, an item's editor) and the member's screens (the shelf, an open item, one for sale, one for a level),
 * with fixture props, inside a stand in for the community editor's section or the member shell's middle column. The
 * API is the probe's. The case is the query string:
 *
 *   ?admin  ?admin-off  ?editor  ?editor-product       the admin
 *   ?shelf  ?open  ?paid  ?level  ?empty               a member
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LibraryAdmin } from "@/components/community/library/library-admin"
import { LibraryShelf } from "@/components/community/library/library-shelf"
import { LibraryItem } from "@/components/community/library/library-item"
import type { AdminLibraryData, AdminLibraryItem, LibraryCardView, LibraryItemData, LibraryShelfData } from "@/components/community/library/model"

const COMMUNITY = "8d0f3c52-5b8a-4a0e-9a57-3f0c6d1e2a11"
const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`

function cover(title: string, bg: string, fg = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="${bg}"/><text x="40" y="330" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="700" fill="${fg}">${title}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const RICH = "<p>Every template we use to price a commission, as spreadsheets you can copy. <strong>Start with the quote sheet</strong>, then the materials list.</p><ul><li>Quote sheet</li><li>Materials and hours</li><li>Deposit letter</li></ul>"

const base = (over: Partial<LibraryCardView>): LibraryCardView => ({
  id: id(1),
  kind: "resource",
  title: "Welcome pack",
  summary: "Start here: the studio rules, the kiln schedule and who to ask.",
  coverUrl: null,
  sectionId: null,
  files: 1,
  links: 0,
  fileType: "PDF",
  open: true,
  owned: false,
  lock: null,
  priceLabel: null,
  draft: false,
  private: false,
  href: "/community/makers/library/x",
  ...over,
})

const SECTIONS = [
  { id: id(90), name: "Templates" },
  { id: id(91), name: "Recordings" },
  { id: id(92), name: "Guides" },
]

const cards: LibraryCardView[] = [
  base({ id: id(1), title: "Welcome pack", sectionId: id(92) }),
  base({ id: id(2), title: "Pricing kit for commissions", kind: "product", summary: "Quote sheet, materials list and a deposit letter.", coverUrl: cover("Pricing kit", "#e8e3d9", "#1a1a2e"), files: 3, fileType: null, open: false, lock: { reason: "paid" }, priceLabel: "$29", sectionId: id(90) }),
  base({ id: id(3), title: "Glaze test recordings", summary: "Six firings, filmed at the kiln, with the notes.", coverUrl: cover("Glaze tests", "#2f3e46"), files: 0, links: 2, fileType: null, open: false, lock: { reason: "level", level: 3, viewerLevel: 1 }, sectionId: id(91) }),
  base({ id: id(4), title: "Gold member templates", summary: "The full set we sell, free on the Gold tier.", files: 4, fileType: null, open: false, lock: { reason: "tier", tiers: ["Gold"] }, sectionId: id(90) }),
  base({ id: id(5), title: "Studio playlist", summary: null, files: 0, links: 1, fileType: null, coverUrl: cover("Playlist", "#5c4b51"), sectionId: id(91) }),
  base({ id: id(6), title: "Kiln loading checklist", summary: "One page, laminated by the kiln too.", files: 1, fileType: "PDF", open: true, owned: true, priceLabel: "$9", coverUrl: cover("Checklist", "#b08968"), sectionId: id(92) }),
]

const shelf: LibraryShelfData = { communityId: COMMUNITY, communityName: "Makers", slug: "makers", sections: SECTIONS, items: cards, manageHref: null }

const page = (item: Partial<LibraryItemData["item"]>, over: Partial<LibraryItemData> = {}): LibraryItemData => ({
  communityId: COMMUNITY,
  communityName: "Makers",
  slug: "makers",
  item: { ...base({}), descriptionHtml: null, fileList: [], linkList: [], libraryProductHref: null, sectionName: null, ...item },
  libraryHref: "/community/makers/library",
  aboutHref: "/community/makers/about",
  levelsHref: "/community/makers/leaderboard",
  manageHref: null,
  canBuy: true,
  ...over,
})

const adminItem = (over: Partial<AdminLibraryItem>): AdminLibraryItem => ({
  id: id(1),
  kind: "resource",
  productId: null,
  madeProduct: false,
  product: null,
  title: "Welcome pack",
  descriptionHtml: "",
  coverUrl: null,
  sectionId: null,
  files: [],
  links: [],
  mode: "free",
  tierIds: [],
  minLevel: null,
  priceCents: null,
  priceLabel: null,
  currency: "USD",
  members: [],
  status: "published",
  stats: { views: 0, downloads: 0, sales: 0, revenueLabel: null },
  ...over,
})

const admin: AdminLibraryData = {
  ready: true,
  enabled: true,
  communityId: COMMUNITY,
  slug: "makers",
  currency: "USD",
  canSell: true,
  sections: [
    { id: id(90), name: "Templates", count: 2 },
    { id: id(91), name: "Recordings", count: 2 },
    { id: id(92), name: "Guides", count: 1 },
  ],
  tiers: [
    { id: id(40), name: "Gold" },
    { id: id(41), name: "Studio" },
  ],
  levels: [
    { level: 2, name: "Regular" },
    { level: 3, name: "Maker" },
  ],
  products: [
    { id: id(60), title: "Pricing kit for commissions", coverUrl: cover("Pricing kit", "#e8e3d9", "#1a1a2e"), priceCents: 2900, priceLabel: "$29", status: "published", files: 3, hasOptions: false },
    { id: id(61), title: "Throwing drills, printable", coverUrl: null, priceCents: 900, priceLabel: "$9", status: "published", files: 1, hasOptions: false },
  ],
  items: [
    adminItem({ id: id(1), title: "Welcome pack", sectionId: id(92), files: [{ fileId: id(70), name: "welcome.pdf", size: 820_000 }], stats: { views: 214, downloads: 96, sales: 0, revenueLabel: null } }),
    adminItem({ id: id(2), kind: "product", productId: id(60), title: "Pricing kit for commissions", coverUrl: cover("Pricing kit", "#e8e3d9", "#1a1a2e"), sectionId: id(90), mode: "paid", priceLabel: "$29", product: { id: id(60), title: "Pricing kit for commissions", coverUrl: cover("Pricing kit", "#e8e3d9", "#1a1a2e"), priceCents: 2900, priceLabel: "$29", status: "published", files: 3, hasOptions: false }, descriptionHtml: RICH, stats: { views: 388, downloads: 41, sales: 17, revenueLabel: "$493" } }),
    adminItem({ id: id(3), title: "Glaze test recordings", coverUrl: cover("Glaze tests", "#2f3e46"), sectionId: id(91), mode: "level", minLevel: 3, links: [{ url: "https://vimeo.com/showcase/123", label: "Firing one" }, { url: "https://vimeo.com/showcase/124", label: "Firing two" }], stats: { views: 120, downloads: 33, sales: 0, revenueLabel: null } }),
    adminItem({ id: id(4), title: "Gold member templates", sectionId: id(90), mode: "tier", tierIds: [id(40)], files: [{ fileId: id(71), name: "templates.zip", size: 14_200_000 }], stats: { views: 64, downloads: 20, sales: 0, revenueLabel: null } }),
    adminItem({ id: id(5), title: "Firing workbook", status: "draft", mode: "paid", priceCents: 1500, priceLabel: "$15", madeProduct: false, files: [{ fileId: id(72), name: "firing-workbook.pdf", size: 2_400_000 }], descriptionHtml: "<p>Forty pages on reading cones, logging firings and fixing faults.</p>" }),
  ],
}

const which = location.search.slice(1) || "admin"
let body: React.ReactNode = null
let wide = false
switch (which) {
  case "admin":
    wide = true
    body = <LibraryAdmin communityId={COMMUNITY} initial={admin} canSwitch />
    break
  case "admin-off":
    wide = true
    body = <LibraryAdmin communityId={COMMUNITY} initial={{ ...admin, enabled: false, items: admin.items.slice(0, 2) }} canSwitch />
    break
  case "admin-empty":
    wide = true
    body = <LibraryAdmin communityId={COMMUNITY} initial={{ ...admin, items: [], sections: [] }} canSwitch />
    break
  case "editor":
    wide = true
    body = <LibraryAdmin communityId={COMMUNITY} initial={admin} initialOpenId={id(5)} canSwitch />
    break
  case "editor-product":
    wide = true
    body = <LibraryAdmin communityId={COMMUNITY} initial={admin} initialOpenId={id(2)} canSwitch />
    break
  case "shelf":
    body = <LibraryShelf shelf={shelf} />
    break
  case "empty":
    body = <LibraryShelf shelf={{ ...shelf, items: [], sections: [] }} />
    break
  case "open":
    body = (
      <LibraryItem
        data={page({
          ...cards[5],
          coverUrl: cover("Checklist", "#b08968"),
          descriptionHtml: "<p>One page for the kiln room. Print it, laminate it, tick it every firing.</p>",
          sectionName: "Guides",
          files: 1,
          links: 1,
          fileList: [{ id: id(70), name: "kiln-loading-checklist.pdf", sizeLabel: "640 KB", href: `/api/community/${COMMUNITY}/library/${id(6)}/files/${id(70)}` }],
          linkList: [{ label: "Printable version on Drive", host: "drive.google.com", href: `/api/community/${COMMUNITY}/library/${id(6)}/links/0` }],
          libraryProductHref: `/account/library/products/${id(66)}`,
        })}
      />
    )
    break
  case "paid":
    body = <LibraryItem data={page({ ...cards[1], descriptionHtml: RICH, sectionName: "Templates", fileList: [{ id: id(80), name: "quote-sheet.xlsx", sizeLabel: "48 KB", href: null }, { id: id(81), name: "materials.xlsx", sizeLabel: "36 KB", href: null }, { id: id(82), name: "deposit-letter.docx", sizeLabel: "22 KB", href: null }] })} />
    break
  case "level":
    body = <LibraryItem data={page({ ...cards[2], descriptionHtml: "<p>Six firings filmed at the kiln, with the notes for each.</p>", sectionName: "Recordings", linkList: [{ label: "Firing one", host: "", href: null }, { label: "Firing two", host: "", href: null }] })} />
    break
}

createRoot(document.getElementById("app")!).render(
  <div className="min-h-screen bg-[#f8f9fa]" data-probe-case={which}>
    <main className={wide ? "mx-auto w-full max-w-[1200px] px-4 pt-6 sm:px-6 lg:px-8" : "mx-auto w-full max-w-[880px] px-4 py-5 sm:px-6 lg:py-8"}>{body}</main>
  </div>,
)
