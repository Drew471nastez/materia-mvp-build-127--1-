/**
 * The two rewrites that keep a stylesheet answering to the PAGE rather than
 * the window (see `canvasSafeSelector` in ./css.ts for the whole story):
 * viewport units become `--sl-vh` / `--sl-vw`, and a media query that asks
 * only about width becomes the same container query. Here, apart from the
 * scoper, because they are pure string work and the theme's custom CSS uses
 * them in the browser, where the scoper's parser is not wanted.
 */
const VIEWPORT_UNIT = /(^|[^\w.-])(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)(?![\w-])/gi

export function canvasSafeUnits(value: string): string {
  if (!/\d(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)/i.test(value)) return value
  return value.replace(VIEWPORT_UNIT, (_m, lead: string, n: string, unit: string) => {
    const u = unit.toLowerCase()
    const vh = `var(--sl-vh, 1${u.endsWith("h") ? u : "vh"})`
    const vw = `var(--sl-vw, 1${u.endsWith("w") ? u : "vw"})`
    const one = u === "vmin" ? `min(${vw}, ${vh})` : u === "vmax" ? `max(${vw}, ${vh})` : u.endsWith("h") ? vh : vw
    return `${lead}calc(${n} * ${one})`
  })
}

const WIDTH_FEATURE = /^\(\s*(?:(?:min-|max-)?width\s*:\s*[^()]+|[^()]*\bwidth\b\s*(?:<=|>=|<|>|=)\s*[^()]+|[^()]+(?:<=|>=|<|>)\s*width\b[^()]*)\)$/i

/** The container query a width-only media query means, or null when it asks about more than width. */
export function widthQueryAsContainer(params: string): string | null {
  if (params.includes(",")) return null
  const rest = params.trim().replace(/^(only\s+)?(screen|all)\s+and\s+/i, "").trim()
  if (!rest || /^(only\s+)?(screen|all|print)$/i.test(rest)) return null
  const conditions = rest.split(/\s+and\s+/i).map((c) => c.trim())
  return conditions.every((c) => WIDTH_FEATURE.test(c)) ? conditions.join(" and ") : null
}

