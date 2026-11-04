import type { Metadata } from "next"

/**
 * ONE ROBOTS TAG ON A 404, AND IT SAYS NOINDEX (round 45 leftovers).
 *
 * Next writes its own <meta name="robots" content="noindex"> on every 404
 * (next/dist/server/app-render NonIndex). The root layout's `robots` (index,
 * follow, and the googlebot line with it) was inherited on top, so
 * storelib.com's 404s and every native website's printed both "noindex"
 * and "index, follow". `null` clears the inherited value and leaves Next's
 * noindex as the only one. Not `index: false`: that prints a second noindex
 * beside Next's.
 *
 * Every not-found.tsx exports this as its `metadata`: Next takes a 404's
 * metadata from the nearest not-found file, and one without an export
 * inherits the layout's again.
 */
export const NOT_FOUND_METADATA: Metadata = { robots: null }
