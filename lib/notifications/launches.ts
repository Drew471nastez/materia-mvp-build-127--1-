/**
 * ===========================================================================
 *  WHAT IS NEW IN STORELIB: THE ONLY SOURCE OF "UPDATE" NOTIFICATIONS
 * ===========================================================================
 * Added by hand, by the team, one entry per real feature launch: something
 * a creator can now do that they could not before. Never a restyle, a moved
 * button, a fix or a speed-up. If it would not be worth an email to every
 * creator, it does not belong here either.
 *
 * Each entry is shown once per account, to accounts that existed before it
 * went live (a newer account signed up into it), within LAUNCH_FRESH_DAYS of
 * going live, and never pushed. tests/notification-rules.test.ts checks every
 * entry: a stable id, a real date, a link inside /app, plain words.
 *
 * To add one:
 *
 *   {
 *     id: "2026-10-product-bundles",   // never changes: it is the dedupe key
 *     live: "2026-10-14",              // the day everyone has it
 *     title: "Sell products together as a bundle",
 *     message: "Pick two or more products, set one price, and buyers get every file.",
 *     href: "/app/products/new",
 *     audience: (s) => (s.products?.length ?? 0) >= 2,   // optional
 *   },
 */
import type { CreatorSnapshot } from "./types"

export interface Launch {
  id: string
  /** YYYY-MM-DD, the day it went live for everyone. */
  live: string
  title: string
  message: string
  href: `/app${string}`
  /** Who it is news for. Everyone when absent. */
  audience?: (s: CreatorSnapshot) => boolean
}

/** How long after going live a launch is still news. */
export const LAUNCH_FRESH_DAYS = 14

export const LAUNCHES: readonly Launch[] = []
