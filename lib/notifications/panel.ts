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
 *   ONE LIST  No tabs. The panel had four (All, Updates, Messages,
 *           Opportunities) with a dark pill sliding between them; "get rid
 *           of those category pills". Everything is in one list, in the
 *           order above, and "Unread only" is the one filter.
 *
 *   LABEL   What kind of thing a row is, said on the quiet line above its
 *           title, before the date. Every row has one (labelOf): the area a
 *           rule names (Payouts, Domains, Emails), else a word for the row's
 *           type (Reviews, Sales), else for its category (Getting started,
 *           Opportunities), else Updates. Never blank.
 *
 *   TONE    A critical row's word is red with a small red dot before it; a
 *           problem's dot is amber. Nothing else changes colour: no red
 *           ground, no banner.
 *
 *   A TAP   On a critical row, a problem or a digest: it opens and is marked
 *           read, and stays until it is fixed (it then resolves and drops
 *           off). The browser's own "Set up payments" to-do is kept the same
 *           way until Stripe is connected (unread-state.ts
 *           STAYS_UNTIL_DONE). On anything else: it opens and is put away,
 *           as before.
 */
import type { Category } from "./types"

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

/** The browser-made to-dos (lib/notifications/unread-state.ts), by id. */
const SETUP_LABELS: Record<string, string> = {
  "payment-setup": "Payments",
  "onepage-setup": "OnePage",
}

/** Rows written before the engine, and by the review and sale code, by their type. */
const TYPE_LABELS: Record<string, string> = {
  new_review: "Reviews",
  new_sale: "Sales",
  new_subscriber: "Subscribers",
  payout: "Payouts",
  message: "Messages",
  opportunity: "Opportunities",
  action: "To do",
  announcement: "Updates",
  update: "Updates",
}

/** An engine row that somehow carries no area, by how much it matters. */
const CATEGORY_LABELS: Record<Category, string> = {
  critical: "Account",
  problem: "Account",
  next_step: "Getting started",
  opportunity: "Opportunities",
  milestone: "Milestone",
  update: "Updates",
}

/**
 * The word above a row's title: where it came from, not what icon it would
 * have had. With the tabs gone it is the only place a row's kind is said,
 * so it is never blank.
 */
export function labelOf(n: { id: string; type: string; category?: Category | null; area?: string | null }): string {
  const setup = SETUP_LABELS[n.id]
  if (setup) return setup
  /* A rule names its own area: Payouts, Domains, Emails, Milestone. */
  const area = typeof n.area === "string" ? n.area.trim() : ""
  if (area) return area
  const byType = TYPE_LABELS[n.type]
  if (byType) return byType
  if (n.category && CATEGORY_LABELS[n.category]) return CATEGORY_LABELS[n.category]
  return "Updates"
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
