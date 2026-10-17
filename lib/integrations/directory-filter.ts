/**
 * ===========================================================================
 *  THE INTEGRATIONS MARKETPLACE: WHAT IS SHOWN, AND WHAT THE ADDRESS KEEPS
 * ===========================================================================
 * Round K4. The search, the category pill and the Filter menu work together,
 * at once, on the cards already drawn: a card is shown when it is in the pill,
 * matches every word typed and passes the filters. Each pill's number is the
 * cards it would show with the same search and filters, so the numbers move
 * as you type and a pill never promises cards it doesn't have.
 *
 * The whole state lives in the address (?category=&q=&status=&by=), written
 * in place, so Back from an integration's page lands on the same list. The
 * old ?c= pill address still opens its pill.
 *
 * Pure: no I/O, safe in the browser and in tests
 * (components/app/settings/integrations-directory.tsx reads it).
 */
import { CATEGORY_ORDER, type IntegrationCategory } from "@/lib/integrations/catalog"
import type { DirectoryPill } from "@/lib/integrations/directory-order"

/** Where a card stands, as the Filter menu groups it. */
export type Standing = "installed" | "built_in" | "available" | "coming_soon" | "attention"
/** The Filter menu's Status: anything, ready to connect now, coming soon, or one that needs a look. */
export type StatusFilter = "any" | "available" | "coming_soon" | "attention"
/** The Filter menu's Made by: anything, Storelib's own, or another company's service. */
export type MakerFilter = "any" | "storelib" | "partner"

export interface DirectoryState {
  category: DirectoryPill
  q: string
  status: StatusFilter
  by: MakerFilter
}

export const DEFAULT_DIRECTORY_STATE: DirectoryState = { category: "all", q: "", status: "any", by: "any" }

const STATUS_VALUES: StatusFilter[] = ["any", "available", "coming_soon", "attention"]
const MAKER_VALUES: MakerFilter[] = ["any", "storelib", "partner"]

/** A search is kept short in the address; anything longer is cut, never refused. */
const Q_MAX = 80

export function pillFrom(value: string | null | undefined): DirectoryPill {
  return value === "installed" || value === "storelib" || CATEGORY_ORDER.includes(value as IntegrationCategory) ? (value as DirectoryPill) : "all"
}

/** The state an address names. Unknown values are the default, never an error. */
export function readDirectoryState(params: { get(name: string): string | null } | null | undefined): DirectoryState {
  if (!params) return { ...DEFAULT_DIRECTORY_STATE }
  const status = params.get("status") as StatusFilter | null
  const by = params.get("by") as MakerFilter | null
  return {
    /* ?c= was the pill's address before round K4: an old link or a kept history entry still opens its pill. */
    category: pillFrom(params.get("category") ?? params.get("c")),
    q: (params.get("q") ?? "").slice(0, Q_MAX),
    status: status && STATUS_VALUES.includes(status) ? status : "any",
    by: by && MAKER_VALUES.includes(by) ? by : "any",
  }
}

/** The same address with this state in it: defaults are left out, so All with nothing typed is the plain address. */
export function writeDirectoryState(href: string, s: DirectoryState): string {
  const url = new URL(href)
  const set = (name: string, value: string, fallback: string) => {
    if (value && value !== fallback) url.searchParams.set(name, value)
    else url.searchParams.delete(name)
  }
  url.searchParams.delete("c")
  set("category", s.category, "all")
  set("q", s.q.trim().slice(0, Q_MAX), "")
  set("status", s.status, "any")
  set("by", s.by, "any")
  return url.toString()
}

/** One card, as the marketplace filters it. */
export interface CardFacets {
  id: string
  name: string
  summary: string
  category: IntegrationCategory | null
  /** The category's name, searched too. */
  categoryName: string | null
  /** Made by Storelib (its own apps and the parts of Storelib shown as integrations). */
  storelib: boolean
  installed: boolean
  standing: Standing
}

/** Every word typed is somewhere in the name, the line under it or the category. "storelib" finds Storelib's own. */
export function matchesQuery(card: CardFacets, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = `${card.name} ${card.summary} ${card.categoryName ?? ""} ${card.storelib ? "storelib built in built-in" : ""}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function passesFilters(card: CardFacets, s: Pick<DirectoryState, "status" | "by">): boolean {
  if (s.by === "storelib" && !card.storelib) return false
  if (s.by === "partner" && card.storelib) return false
  if (s.status === "available") return card.standing === "available"
  if (s.status === "coming_soon") return card.standing === "coming_soon"
  if (s.status === "attention") return card.standing === "attention"
  return true
}

export function inPill(card: CardFacets, pill: DirectoryPill): boolean {
  if (pill === "all") return true
  if (pill === "installed") return card.installed
  if (pill === "storelib") return card.storelib
  return card.category === pill
}

/** Shown under this state: in the pill, matching the search, through the filters. */
export function visibleIn(card: CardFacets, s: DirectoryState): boolean {
  return inPill(card, s.category) && matchesQuery(card, s.q) && passesFilters(card, s)
}

/** Each pill's number: the cards it would show with the same search and filters. */
export function pillCounts(cards: CardFacets[], s: DirectoryState, pills: DirectoryPill[]): Map<DirectoryPill, number> {
  const through = cards.filter((c) => matchesQuery(c, s.q) && passesFilters(c, s))
  return new Map(pills.map((p) => [p, through.filter((c) => inPill(c, p)).length]))
}

/** How many filters in the menu are set, for the Filter button. */
export function activeFilterCount(s: Pick<DirectoryState, "status" | "by">): number {
  return (s.status !== "any" ? 1 : 0) + (s.by !== "any" ? 1 : 0)
}
