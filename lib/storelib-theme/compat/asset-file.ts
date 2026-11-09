/**
 * ===========================================================================
 *  A THEME FILE'S TYPE AND BYTES, WITH NOTHING ELSE LOADED (round AQ)
 * ===========================================================================
 * The asset route (app/api/site-theme/assets) answers forty or more requests
 * for one page right after a deploy, each on a server that may be starting.
 * It used to load the whole Liquid engine to answer a plain script: these
 * three came from ./install.ts, which brings the theme's links, filters and
 * runtime with it. Kept here on their own, re-exported by ./install.ts, so
 * every other reader is unchanged.
 */

/** The asset names a theme's pictures and videos were stored under, to their addresses (./install.ts COMPAT_PREFIX + "config/assets.json"). */
export const ASSET_MAP_PATH = "shopify/config/assets.json"

/** A font kept as `base64:` and its bytes. */
export function binaryOf(text: string): Uint8Array | null {
  if (!text.startsWith("base64:")) return null
  try {
    const raw = atob(text.slice(7))
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  xml: "application/xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
}

/** The type a theme's file is served as, from its extension. */
export function assetType(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return TYPES[ext] ?? null
}
