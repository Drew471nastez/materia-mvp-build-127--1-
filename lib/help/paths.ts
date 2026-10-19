/**
 * ===========================================================================
 *  ONE HELP CENTER, TWO ADDRESSES
 * ===========================================================================
 * The Help Center is public at /help (search engines, buyers, anyone signed
 * out) and it is also a page inside the dashboard at /app/help, opened from
 * the account menu, with the app's header, rail and pill around it.
 *
 * Both draw the same articles from lib/help/articles, whose links are
 * written once, as /help/... . This moves a link to the address of the
 * center it is shown in, so a link inside an article read in the app stays
 * in the app instead of dropping the reader on the public site. Anything
 * that is not a Help Center address is left as it is.
 */

export const HELP_BASE = "/help"
export const APP_HELP_BASE = "/app/help"
export type HelpBase = typeof HELP_BASE | typeof APP_HELP_BASE

/** `href` as it should be linked from the Help Center at `base`. */
export function helpHref(href: string, base: HelpBase = HELP_BASE): string {
  if (base === HELP_BASE) return href
  /* A file under public/help (an article's screenshot) is served where it is. */
  if (/\.[a-z0-9]{2,5}(?:[?#]|$)/i.test(href)) return href
  if (href === HELP_BASE || /^\/help[/?#]/.test(href)) return base + href.slice(HELP_BASE.length)
  return href
}

/**
 * THE HELP CENTER'S OWN ADDRESS: help.storelib.com (proxy.ts serves /help
 * there). The dashboard's Help rows open it, in a new tab, like Shopify's.
 * Without a main domain (a local run) it is /help on the same host.
 */
export function publicHelpUrl(path = ""): string {
  const main = (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").trim().toLowerCase().replace(/^www\./, "")
  if (!main || main.startsWith("localhost") || main.includes(":")) return `/help${path}`
  return `https://help.${main}${path}`
}
