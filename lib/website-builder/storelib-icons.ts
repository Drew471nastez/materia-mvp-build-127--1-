/**
 * ===========================================================================
 *  THE ICONS A SECTION ASKS FOR BY NAME (round Q)
 * ===========================================================================
 * Headers the agent wrote showed "Search", "Cart", "Region", "Sign in" as
 * words, because drawing an icon meant writing an SVG by hand, and a hand
 * drawn bag at 3am is how a header starts to look generated. A section now
 * names the icon and the page draws it:
 *
 *   <button type="button" data-storelib-search aria-label="Search">
 *     <span data-storelib-icon="search"></span>
 *   </button>
 *
 * Any element marked `data-storelib-icon="<name>"` gets the icon drawn as
 * the first thing inside it, on the server, so it is there in the first
 * paint, on the live site and in the canvas alike (renderStorelibSection).
 * One stroke weight (1.6 on a 24 grid), round caps, `currentColor`, so it
 * takes the section's own colour and size (1.25em unless the section sets
 * `--icon-size` or sizes the svg). Always `aria-hidden`: the words a screen
 * reader says stay on the button (aria-label, or a visually hidden span).
 *
 * The paths are first-party, written for this file. Nothing here comes from
 * the section: the name is looked up, never written into the markup.
 */

const P = (d: string) => `<path d="${d}"/>`
const C = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`
const R = (x: number, y: number, w: number, h: number, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`

/** Name to the inside of a 24 by 24 stroked SVG. */
export const STORELIB_ICONS: Readonly<Record<string, string>> = {
  bag: P("M5 8h14l-1.1 12.1a1 1 0 0 1-1 .9H7.1a1 1 0 0 1-1-.9L5 8z") + P("M9 10V7a3 3 0 0 1 6 0v3"),
  cart: P("M3 4h2.2l2.1 10.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2") + C(9.5, 19.5, 1.2) + C(16.5, 19.5, 1.2),
  basket: P("M3.5 10h17l-1.6 9.2a1 1 0 0 1-1 .8H6.1a1 1 0 0 1-1-.8L3.5 10z") + P("M8 10l3-6M16 10l-3-6M9.5 14v3M14.5 14v3"),
  search: C(11, 11, 6.5) + P("M16 16l4.5 4.5"),
  user: C(12, 8.5, 3.8) + P("M4.5 20.5c1.1-3.7 4-5.6 7.5-5.6s6.4 1.9 7.5 5.6"),
  menu: P("M4 7h16M4 12h16M4 17h16"),
  "menu-short": P("M4 8h16M4 16h11"),
  close: P("M6 6l12 12M18 6L6 18"),
  globe: C(12, 12, 8.5) + P("M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z"),
  heart: P("M12 20s-7.5-4.4-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20z"),
  "arrow-right": P("M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5"),
  "arrow-left": P("M19.5 12h-15M10 6.5L4.5 12l5.5 5.5"),
  "arrow-up-right": P("M7 17L17 7M8.5 7H17v8.5"),
  "arrow-up": P("M12 19.5v-15M6.5 10L12 4.5l5.5 5.5"),
  "arrow-down": P("M12 4.5v15M6.5 14l5.5 5.5 5.5-5.5"),
  "chevron-down": P("M6 9.5l6 6 6-6"),
  "chevron-up": P("M6 14.5l6-6 6 6"),
  "chevron-right": P("M9.5 6l6 6-6 6"),
  "chevron-left": P("M14.5 6l-6 6 6 6"),
  plus: P("M12 5v14M5 12h14"),
  minus: P("M5 12h14"),
  check: P("M5 12.5l4.5 4.5L19 7.5"),
  play: P("M8 5.5v13l10.5-6.5L8 5.5z"),
  pause: P("M8.5 5.5v13M15.5 5.5v13"),
  star: P("M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4z"),
  mail: R(3.5, 5.5, 17, 13, 1.5) + P("M4 7l8 6 8-6"),
  phone: P("M6.5 3.5h3l1.5 4-2 1.3a10.5 10.5 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"),
  "map-pin": P("M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z") + C(12, 10, 2.3),
  calendar: R(3.5, 5, 17, 15.5, 1.5) + P("M3.5 10h17M8 3v4M16 3v4"),
  clock: C(12, 12, 8.5) + P("M12 7.5V12l3 2"),
  filter: P("M4 6h16M7 12h10M10 18h4"),
  sliders: P("M4 7h9M17 7h3M4 17h3M11 17h9") + C(15, 7, 2) + C(9, 17, 2),
  share: P("M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6"),
  external: P("M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10"),
  truck: P("M2.5 6.5h11v10h-11zM13.5 10h4l3 3.2v3.3h-7") + C(6.5, 18, 1.6) + C(17, 18, 1.6),
  return: P("M4.5 9.5h10a5 5 0 0 1 0 10H9M8 6L4.5 9.5 8 13"),
  lock: R(5, 10.5, 14, 10, 1.5) + P("M8 10.5V7.5a4 4 0 0 1 8 0v3"),
  info: C(12, 12, 8.5) + P("M12 11v5.5M12 7.6v.1"),
  sun: C(12, 12, 3.8) + P("M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"),
  moon: P("M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"),
  instagram: R(4, 4, 16, 16, 4.5) + C(12, 12, 3.6) + P("M16.8 7.2v.1"),
  youtube: R(2.8, 6, 18.4, 12, 3.5) + P("M10.3 9.3v5.4l4.5-2.7-4.5-2.7z"),
  tiktok: P("M14 3.5v11.2a3.7 3.7 0 1 1-3.2-3.7M14 3.5c.5 2.6 2.2 4.1 4.7 4.3"),
  facebook: P("M14.5 21v-7.5h2.8l.4-3.3h-3.2V8.3c0-.9.3-1.6 1.6-1.6h1.7V3.8a22 22 0 0 0-2.5-.1c-2.5 0-4.1 1.5-4.1 4.2v2.3H8.5v3.3h2.7V21"),
  x: P("M4.5 4.5l15 15M19.5 4.5l-15 15"),
  linkedin: R(4, 4, 16, 16, 2) + P("M8.2 10.5v5.5M8.2 7.8v.1M11.8 16v-5.5M11.8 13c0-1.5 1-2.6 2.3-2.6s2 .9 2 2.6v3"),
}

/** Names that mean the same icon, so a section asking for "account" or "cart-bag" is not left with nothing. */
const ALIASES: Readonly<Record<string, string>> = {
  account: "user",
  person: "user",
  profile: "user",
  "sign-in": "user",
  hamburger: "menu",
  burger: "menu",
  times: "close",
  language: "globe",
  region: "globe",
  currency: "globe",
  wishlist: "heart",
  bookmark: "heart",
  arrow: "arrow-right",
  next: "arrow-right",
  prev: "arrow-left",
  previous: "arrow-left",
  caret: "chevron-down",
  add: "plus",
  remove: "minus",
  location: "map-pin",
  email: "mail",
  shipping: "truck",
  delivery: "truck",
}

/** The icon a name asks for, or null when there is none by that name. */
export function iconName(name: string | null | undefined): string | null {
  const n = String(name ?? "").trim().toLowerCase()
  if (!n) return null
  if (STORELIB_ICONS[n]) return n
  const a = ALIASES[n]
  return a && STORELIB_ICONS[a] ? a : null
}

/** Every name a section may use: the icons and their aliases, sorted. */
export function iconNames(): string[] {
  return [...new Set([...Object.keys(STORELIB_ICONS), ...Object.keys(ALIASES)])].sort()
}

/** The SVG for an icon, or "" when there is none by that name. */
export function iconSvg(name: string | null | undefined): string {
  const n = iconName(name)
  if (!n) return ""
  return `<svg class="sl-icon" data-icon="${n}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${STORELIB_ICONS[n]}</svg>`
}

const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i
const ICON_TAG = /<([a-z][a-z0-9-]*)(\s(?:[^<>]*?\s)?data-storelib-icon\s*=\s*(?:"([^"]*)"|'([^']*)'|([a-z0-9-]+))[^<>]*)>(\s*<svg\b[\s\S]*?<\/svg>)?/gi

/**
 * Every element of a drawn section marked data-storelib-icon gets its icon
 * as its first child. An SVG the section already drew there (its own, or
 * ours from an earlier pass) is replaced by the named one, so every icon on
 * the site is one family; an unknown name leaves the element as it is. Pure, so the server and the
 * browser draw the same markup and React hydrates it.
 */
export function withStorelibIcons(html: string): string {
  if (!html.includes("data-storelib-icon")) return html
  return html.replace(ICON_TAG, (whole, tag: string, attrs: string, a?: string, b?: string, c?: string) => {
    if (VOID.test(tag)) return whole
    const svg = iconSvg(a ?? b ?? c ?? "")
    if (!svg) return whole
    return `<${tag}${attrs}>${svg}`
  })
}

/** The icons' base look, scoped under the page root: sized by the text, coloured by it, never caught by the section's own `svg` rules for size. */
export function iconBaseCss(root: string): string {
  return [
    `${root} [data-storelib-icon]{display:inline-flex;align-items:center;justify-content:center;line-height:0;}`,
    `${root} [data-storelib-icon]>svg.sl-icon{width:var(--icon-size,1.25em);height:var(--icon-size,1.25em);flex:none;}`,
  ].join("\n")
}
