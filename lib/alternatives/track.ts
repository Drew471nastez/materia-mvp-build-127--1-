"use client"

/**
 * ===========================================================================
 *  THE COMPARISON PAGES' EVENTS, THROUGH VERCEL WEB ANALYTICS
 * ===========================================================================
 * storelib.com's own pages are measured by Vercel Web Analytics, which the
 * cookie banner loads only after a yes to analytics
 * (components/cookie-consent-banner). It counts page views by itself; these
 * are the custom events on top. `track` from @vercel/analytics calls the
 * script it loaded and does nothing when it is not there, so without
 * consent nothing is sent and nothing is stored.
 *
 * (The other analytics pipeline, lib/analytics/collect, measures visits to
 * creators' pages for creators, and is not for Storelib's own marketing.)
 *
 *   Comparison viewed       a comparison page or the hub opened
 *   Comparison filter       a category picked on the hub
 *   Comparison search       a search typed on the hub (its length only)
 *   Fee calculator used     the calculator's numbers changed (rounded)
 *   Comparison CTA          a sign up button pressed (which page, which button)
 *   Signup started          /signup opened from a page that tagged it
 *   Signup completed        an account was created from such a visit
 */
import { track } from "@vercel/analytics"

type Props = Record<string, string | number | boolean | null>

export type AlternativesEvent =
  | "Comparison viewed"
  | "Comparison filter"
  | "Comparison search"
  | "Fee calculator used"
  | "Comparison CTA"
  | "Signup started"
  | "Signup completed"

export function trackAlternatives(name: AlternativesEvent, props: Props = {}): void {
  try {
    track(name, props)
  } catch {
    /* analytics is never in the way of the page */
  }
}

/** A price or a count rounded so an event says roughly what was asked, never the exact figure typed. */
export function bucket(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  const edges = [5, 10, 25, 50, 100, 250, 500, 1000, 5000]
  const top = edges.find((e) => n <= e)
  return top ? `<=${top}` : ">5000"
}
