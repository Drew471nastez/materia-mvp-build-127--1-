import type { Metadata } from "next"

/**
 * ===========================================================================
 *  SEARCH ENGINE SITE VERIFICATION, FROM THE ENVIRONMENT
 * ===========================================================================
 * Google Search Console and Bing Webmaster Tools both accept a meta tag on
 * the home page as proof that whoever added the site owns it:
 *
 *   GOOGLE_SITE_VERIFICATION  <meta name="google-site-verification" content="…">
 *   BING_SITE_VERIFICATION    <meta name="msvalidate.01" content="…">
 *
 * Read in the root layout's metadata, so the tag is on storelib.com's pages
 * when the variable is set and nowhere when it is not. A value is a token,
 * so anything that is not one (spaces, quotes, markup) is dropped rather
 * than written into the page. Search Console's Domain properties verify by
 * DNS instead; this is for a URL prefix property or for Bing.
 */

const TOKEN = /^[A-Za-z0-9_\-.=+/]{8,200}$/

function token(value: string | undefined): string | null {
  const v = (value ?? "").trim()
  return TOKEN.test(v) ? v : null
}

/** The `verification` field for Next's Metadata, or undefined when neither variable is set. */
export function siteVerification(env: Record<string, string | undefined> = process.env): Metadata["verification"] {
  const google = token(env.GOOGLE_SITE_VERIFICATION)
  const bing = token(env.BING_SITE_VERIFICATION)
  if (!google && !bing) return undefined
  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  }
}
