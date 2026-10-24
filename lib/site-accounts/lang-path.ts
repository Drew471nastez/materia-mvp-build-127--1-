/**
 * The pure half of ./lang.ts: a path of the website under a language's
 * prefix, for the routes and for the pages an imported theme draws
 * (lib/storelib-theme/compat/account.ts), which run where the server's
 * language lookup does not.
 */

/** The language of a prefix, for the next form ("/fr" → "fr"). */
export function langOfRoot(root: string): string {
  return root.replace(/^\//, "")
}

/**
 * A path of the website under a language's prefix: "/account" → "/fr/account",
 * "/" → "/fr". A path already under it, an API path and the checkout (whose
 * language travels its own way, lib/markets/checkout-language) are kept.
 */
export function inLang(root: string, path: string): string {
  if (!root || !path.startsWith("/")) return path
  const lower = path.toLowerCase()
  if (lower === root || lower.startsWith(`${root}/`) || lower.startsWith(`${root}?`) || lower.startsWith(`${root}#`)) return path
  if (/^\/(?:api|checkout|receipt|cdn|_next)(?:[/?#]|$)/.test(path)) return path
  return path === "/" ? root : `${root}${path}`
}
