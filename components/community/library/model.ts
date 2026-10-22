/**
 * What the Library's pages and its admin are handed (lib/communities/server/
 * library.ts makes them). Plain data, browser safe: never a storage path,
 * never a link's address for somebody who may not open it, a price already
 * formatted. The words are made here, in tt(), so every language has them.
 */
import type { LibraryKind, LibraryLink, LibraryMode, LibraryStatus } from "@/lib/communities/library"
import { tt } from "@/lib/i18n/text"

export type LibraryLockReason = "tier" | "level" | "paid"

export interface LibraryLock {
  reason: LibraryLockReason
  /** A level lock: the level it opens at, and the viewer's own. */
  level?: number
  viewerLevel?: number
  /** A tier lock: the tiers' names. */
  tiers?: string[]
}

export interface LibraryCardView {
  id: string
  kind: LibraryKind
  title: string
  /** The description as plain text, for the card. */
  summary: string | null
  coverUrl: string | null
  sectionId: string | null
  /** What is inside, counted: files (and the one file's type when there is one), links. */
  files: number
  links: number
  fileType: string | null
  /** The viewer opens it now. */
  open: boolean
  /** The viewer owns its product: bought here or in the store. */
  owned: boolean
  lock: LibraryLock | null
  /** "$12" for an item that is sold, whether or not this viewer has it. */
  priceLabel: string | null
  /** Only the people who run the Library ever see a draft, or a private item off their list. */
  draft: boolean
  private: boolean
  /** /community/<slug>/library/<id>. */
  href: string
}

export interface LibraryShelfData {
  communityId: string
  communityName: string
  slug: string
  sections: { id: string; name: string }[]
  items: LibraryCardView[]
  /** The admin's Library, for somebody who may change it; null for everybody else. */
  manageHref: string | null
}

export interface LibraryFileView {
  id: string
  name: string
  sizeLabel: string
  /** The download route, for somebody who may open the item; null otherwise. */
  href: string | null
}

export interface LibraryLinkView {
  label: string
  host: string
  href: string | null
}

export interface LibraryItemData {
  communityId: string
  communityName: string
  slug: string
  item: LibraryCardView & {
    /** The rich description, cleaned on the server. */
    descriptionHtml: string | null
    fileList: LibraryFileView[]
    linkList: LibraryLinkView[]
    /** Where the product sits in the buyer's own Storelib library, once it is theirs. */
    libraryProductHref: string | null
    sectionName: string | null
  }
  libraryHref: string
  aboutHref: string
  /** The leaderboard, for a level lock; null when the community has no points. */
  levelsHref: string | null
  manageHref: string | null
  /** The creator's account takes payments: Buy can be pressed. */
  canBuy: boolean
}

/* ── The admin ──────────────────────────────────────────────────────────── */

export interface AdminLibraryProduct {
  id: string
  title: string
  coverUrl: string | null
  priceCents: number | null
  priceLabel: string | null
  status: string
  files: number
  hasOptions: boolean
}

export interface AdminLibraryItem {
  id: string
  kind: LibraryKind
  productId: string | null
  madeProduct: boolean
  /** An attached product as it is now; null for a resource. */
  product: AdminLibraryProduct | null
  title: string
  descriptionHtml: string
  coverUrl: string | null
  sectionId: string | null
  files: { fileId: string; name: string; size: number }[]
  links: LibraryLink[]
  mode: LibraryMode
  tierIds: string[]
  minLevel: number | null
  /** Its own price; null for a product sold at the product's price. */
  priceCents: number | null
  /** What a member pays when it is sold, formatted. */
  priceLabel: string | null
  currency: string
  members: { userId: string; name: string; avatarUrl: string | null }[]
  status: LibraryStatus
  stats: { views: number; downloads: number; sales: number; revenueLabel: string | null }
}

export interface AdminLibraryData {
  /** Part 278 has run. */
  ready: boolean
  enabled: boolean
  communityId: string
  slug: string
  currency: string
  canSell: boolean
  sections: { id: string; name: string; count: number }[]
  items: AdminLibraryItem[]
  /** The creator's own digital products, for Attach a product. */
  products: AdminLibraryProduct[]
  tiers: { id: string; name: string }[]
  levels: { level: number; name: string }[]
}

/* ── Words ──────────────────────────────────────────────────────────────── */

/** What is inside, in one line: "PDF", "3 files", "2 links", "1 file and 1 link". */
export function contentsLine(c: Pick<LibraryCardView, "files" | "links" | "fileType">): string {
  if (c.files === 1 && !c.links && c.fileType) return c.fileType
  const files = c.files ? tt("{n, plural, one {# file} other {# files}}", { n: c.files }) : ""
  const links = c.links ? tt("{n, plural, one {# link} other {# links}}", { n: c.links }) : ""
  if (files && links) return tt("{files} and {links}", { files, links })
  return files || links || tt("Nothing added yet")
}

/** The lock in a few words, for a card: "Level 3", "Gold members", "$12". */
export function lockWords(item: Pick<LibraryCardView, "lock" | "priceLabel">): string | null {
  const l = item.lock
  if (!l) return null
  if (l.reason === "paid") return item.priceLabel ?? tt("For sale")
  if (l.reason === "level") return tt("Level {level}", { level: l.level ?? 2 })
  const names = l.tiers ?? []
  if (names.length === 1) return tt("{name} members", { name: names[0] })
  return tt("Some plans only")
}

/** The lock in a sentence, for the item's page. */
export function lockSentence(item: Pick<LibraryCardView, "lock" | "priceLabel">): string {
  const l = item.lock
  if (!l) return ""
  if (l.reason === "paid") return tt("Buy it once and it is yours: here, and in your Storelib library with its receipt.")
  if (l.reason === "level")
    return typeof l.viewerLevel === "number"
      ? tt("This opens at level {level}. You are at level {current}. Levels come from points for taking part.", { level: l.level ?? 2, current: l.viewerLevel })
      : tt("This opens at level {level}. Levels come from points for taking part.", { level: l.level ?? 2 })
  const names = l.tiers ?? []
  return names.length ? tt("This is for members on {names}.", { names: names.join(", ") }) : tt("This is for members on some plans.")
}

/** Who opens it, in one line, for the admin's list. */
export function accessLine(i: Pick<AdminLibraryItem, "mode" | "minLevel" | "tierIds" | "members" | "priceLabel">, tiers: { id: string; name: string }[]): string {
  switch (i.mode) {
    case "paid":
      return i.priceLabel ?? tt("For sale")
    case "level":
      return tt("From level {level}", { level: i.minLevel ?? 2 })
    case "tier": {
      const names = i.tierIds.map((id) => tiers.find((t) => t.id === id)?.name).filter((n): n is string => !!n)
      return names.length ? tt("Members of {names}", { names: names.join(", ") }) : tt("Members of some tiers")
    }
    case "private":
      return tt("Private, {n, plural, one {# member} other {# members}}", { n: i.members.length })
    default:
      return tt("Free for members")
  }
}
