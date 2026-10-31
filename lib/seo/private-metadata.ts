/**
 * ===========================================================================
 *  THE METADATA OF A PRIVATE PAGE (round 45)
 * ===========================================================================
 * What a layout at the top of each private route exports, so every page
 * under it inherits noindex and no canonical without saying so itself
 * (lib/seo/indexing.ts PRIVATE_ROUTES and AUTH_FLOW_ROUTES). /checkout used
 * to say `index, follow` with a canonical of its own: it set no robots, and
 * the root layout's index stood.
 *
 * `robots` replaces the root layout's whole robots object, its googleBot
 * part included. `canonical: null` replaces an inherited one: a private
 * page names no address as the one to index, its own or another.
 *
 * A page under these routes may still set its own title; it must not set
 * robots to index or a canonical (tests/seo-platform-r45.test.ts).
 */
import type { Metadata } from "next"

/** One person's own screen: an order, a library, an editor, the app. */
export const PRIVATE_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
}

/** A step on the way in (logging in, a reset): not indexed, links followed. */
export const AUTH_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: null },
}

/** An auth step's own title, with the same robots. */
export function authPageMetadata(title: string, description?: string): Metadata {
  return { ...AUTH_PAGE_METADATA, title, ...(description ? { description } : {}) }
}
