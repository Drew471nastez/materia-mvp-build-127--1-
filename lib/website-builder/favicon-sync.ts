/**
 * ===========================================================================
 *  ONE FAVICON, WHEREVER IT IS SET
 * ===========================================================================
 * A website's favicon could be set in two places: Website settings ›
 * General (`favicon_url`, what Storelib's own pages and the site's metadata
 * read) and, on a theme imported from Shopify, the theme's own settings ›
 * Logos & Favicon (`shopify.favicon`, what the theme's layout draws its
 * <link rel="icon"> from). Uploading in one left the other on the old
 * picture, so the tab showed one icon and the settings another.
 *
 * They are one value now. A write of either carries the other with it, in
 * the same draft change (so one undo puts both back), and a reader asks
 * `faviconOf`, which falls back to the theme's own when the site's is empty
 * (an import that came with a favicon). Pure.
 */

const fetchable = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : ""
  return /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ""
}

const isImported = (settings: Record<string, unknown>): boolean => {
  const c = settings.compat
  return !!c && typeof c === "object" && (c as { kind?: unknown }).kind === "shopify"
}

const themeValues = (settings: Record<string, unknown>): Record<string, unknown> => {
  const v = settings.shopify
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** The favicon as a browser can fetch it: the site's own, or the imported theme's. Empty when neither is set. */
export function faviconOf(settings: Record<string, unknown> | null | undefined): string {
  const s = settings ?? {}
  return fetchable(s.favicon_url) || (isImported(s) ? fetchable(themeValues(s).favicon) : "")
}

/**
 * What else has to change when `key` is written with `value`, so the two
 * places agree. Null when nothing does.
 */
export function faviconFollows(settings: Record<string, unknown> | null | undefined, key: string, value: unknown): Record<string, unknown> | null {
  const s = settings ?? {}
  if (!isImported(s)) return null
  if (key === "favicon_url") {
    const next = typeof value === "string" ? value : ""
    const theme = themeValues(s)
    if ((theme.favicon ?? "") === next) return null
    return { shopify: { ...theme, favicon: next } }
  }
  if (key === "shopify" && value && typeof value === "object" && !Array.isArray(value)) {
    const before = themeValues(s).favicon
    const after = (value as Record<string, unknown>).favicon
    if (after === before) return null
    /* A picture the theme names by its Shopify address is not one a browser can fetch: the site's own favicon is left as it was. */
    const url = after === undefined || after === null || after === "" ? "" : fetchable(after)
    if (!url && after) return null
    if ((s.favicon_url ?? "") === url) return null
    return { favicon_url: url }
  }
  return null
}
