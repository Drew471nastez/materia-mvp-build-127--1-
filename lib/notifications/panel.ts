/**
 * ===========================================================================
 *  HOW THE PANEL ORDERS, FILES AND MARKS A NOTIFICATION
 * ===========================================================================
 * components/app/notifications-modal.tsx draws; this decides. Pure, with no
 * React, so tests/notifications-panel.test.ts can hold it.
 *
 *   ORDER   What needs the creator first, whatever its age: critical, then
 *           problems, then the next step (the browser-made to-dos are next
 *           steps too). Within those, the higher priority first. Everything
 *           else newest first.
 *
 *   TABS    The panel's four stay. Updates is what happened on the account:
 *           critical, problems, milestones, Storelib's own launches, reviews
 *           and payouts. Opportunities is what the creator could do next:
 *           opportunities and next steps. Messages is messages. All is all.
 *
 *   TONE    A critical row's word is red with a small red dot before it; a
 *           problem's dot is amber. Nothing else changes colour: no red
 *           ground, no banner.
 *
 *   A TAP   On a critical row, a problem or a digest: it opens and is marked
 *           read, and stays until it is fixed (it then resolves and drops
 *           off). On anything else: it opens and is put away, as before.
 */
import type { Category } from "./types"

export type PanelTab = "all" | "updates" | "messages" | "opportunities"

export interface PanelItem {
  id: string
  type: string
  category?: Category | null
  kind?: string | null
  priority?: number | null
  createdAt: Date
}

const RANK: Record<string, number> = { critical: 0, problem: 1, next_step: 2 }

export function rankOf(n: Pick<PanelItem, "category">): number {
  return RANK[n.category ?? ""] ?? 3
}

export function panelOrder<T extends PanelItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      rankOf(a) - rankOf(b) ||
      (rankOf(a) < 3 ? (b.priority ?? 0) - (a.priority ?? 0) : 0) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  )
}

const UPDATE_CATEGORIES = new Set(["critical", "problem", "milestone", "update"])
const OPPORTUNITY_CATEGORIES = new Set(["opportunity", "next_step"])
/** Rows from before categories, by their type. */
const UPDATE_TYPES = new Set(["update", "new_review", "announcement", "payout", "new_sale"])
const OPPORTUNITY_TYPES = new Set(["opportunity", "action"])

export function inTabOf(n: Pick<PanelItem, "type" | "category">, tab: PanelTab): boolean {
  if (tab === "all") return true
  if (tab === "messages") return n.type === "message"
  if (n.category) return tab === "updates" ? UPDATE_CATEGORIES.has(n.category) : OPPORTUNITY_CATEGORIES.has(n.category)
  return tab === "updates" ? UPDATE_TYPES.has(n.type) : OPPORTUNITY_TYPES.has(n.type)
}

export type Tone = "critical" | "problem" | null

export function toneOf(n: Pick<PanelItem, "category">): Tone {
  return n.category === "critical" ? "critical" : n.category === "problem" ? "problem" : null
}

/** A tap opens it and leaves it in the list, read, until it resolves. */
export function staysOnOpen(n: Pick<PanelItem, "category" | "kind">): boolean {
  return n.category === "critical" || n.category === "problem" || n.kind === "opportunity_digest"
}

/**
 * A row's link, followed with the app's own navigation: a path on this
 * site only (the engine's are all inside /app; older rows link to a
 * product's public page). Anything else is no link.
 */
export function panelHref(href: string | null | undefined): string | undefined {
  if (!href || !href.startsWith("/") || href.startsWith("//") || /[\s\\]/.test(href)) return undefined
  return href
}
