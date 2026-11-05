/**
 * ===========================================================================
 *  THE FIRST BIG PICTURE OF AN IMPORTED THEME'S PAGE, ASKED FOR FIRST (round 53)
 * ===========================================================================
 * On a phone the largest thing drawn first is nearly always the picture at
 * the top of the page's first section: a slideshow's first slide, a banner,
 * the product's photo. A Shopify theme puts that section after its header,
 * and Storelib's first load gathers the sections' CSS into the head
 * (./first-load.ts), so the picture's tag is found only after a few hundred
 * kilobytes of head have been read: on the owner's front page, 400KB in.
 *
 * So, as Shopify's own themes do for the first section's picture
 * (fetchpriority "high" when section.index is 1), the first picture of the
 * page's first sections that the theme did not mark to load late is:
 *   - preloaded from the very top of the head, with its own srcset and
 *     sizes, so the browser asks for it with the stylesheets;
 *   - marked fetchpriority="high", unless the theme said otherwise.
 * A picture in the header (the logo) or one the theme loads late is never
 * chosen. Nothing else on the page changes; a page with no such picture is
 * returned as it came.
 */
import { attr, readTag } from "./first-load"

/** How far into the body a first picture is looked for: past that it is not what is seen first. */
const LOOK_CHARS = 120_000
/** The page's first sections that are not the header or another group. */
const FIRST_SECTIONS = 2

export interface LcpHint {
  html: string
  /** The picture's address, when one was chosen. */
  src: string | null
}

function sectionStarts(html: string, from: number, to: number): { at: number; group: boolean }[] {
  const out: { at: number; group: boolean }[] = []
  const re = /<(?:div|section)\b[^>]*\bid="shopify-section-[^"]*"[^>]*>/gi
  re.lastIndex = from
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && m.index < to) out.push({ at: m.index, group: /shopify-section-group-/.test(m[0]) })
  return out
}

export function withLcpHint(html: string): LcpHint {
  const bodyAt = html.search(/<body\b/i)
  if (bodyAt < 0) return { html, src: null }
  const headEnd = html.lastIndexOf("</head>", bodyAt)
  if (headEnd < 0) return { html, src: null }
  const limit = Math.min(html.length, bodyAt + LOOK_CHARS)
  const sections = sectionStarts(html, bodyAt, limit)
  const own = sections.filter((s) => !s.group)
  if (own.length === 0) return { html, src: null }
  /* From the first section of the page's own to the end of its second (or the search limit). */
  const start = own[0].at
  const nextOwn = own[FIRST_SECTIONS]?.at ?? limit
  const re = /<img\b/gi
  re.lastIndex = start
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && m.index < nextOwn) {
    const tag = readTag(html, m.index)
    if (!tag) continue
    const src = attr(tag.raw, "src")
    const srcset = attr(tag.raw, "srcset")
    if (!src && !srcset) continue
    if ((src ?? "").startsWith("data:")) continue
    if ((attr(tag.raw, "loading") ?? "").toLowerCase() === "lazy") continue
    const priority = attr(tag.raw, "fetchpriority")
    if (priority !== null && priority.toLowerCase() === "low") continue
    /* Small pictures (an icon, a badge) are never the largest thing drawn. */
    const width = Number(attr(tag.raw, "width") ?? NaN)
    if (Number.isFinite(width) && width > 0 && width < 200) continue
    const sizes = attr(tag.raw, "sizes")
    const q = (v: string) => v.replace(/"/g, "&quot;")
    const link = (o: { href?: string | null; srcset?: string | null; sizes?: string | null; media?: string | null }) =>
      `<link rel="preload" as="image" data-sl-lcp${o.href ? ` href="${q(o.href)}"` : ""}${o.srcset ? ` imagesrcset="${q(o.srcset)}"` : ""}${o.sizes ? ` imagesizes="${q(o.sizes)}"` : ""}${o.media ? ` media="${q(o.media)}"` : ""} fetchpriority="high">`
    /*
      IN A <picture>: the browser draws the first <source> whose media
      matches, so each is preloaded for its own media, and the <img> for the
      rest when there is one such source. A source naming a type (AVIF, WebP)
      is not preloaded: a browser that cannot draw it would fetch it anyway.
    */
    const pictureAt = html.lastIndexOf("<picture", tag.start)
    const sources: { srcset: string; sizes: string | null; media: string | null }[] = []
    let typed = false
    if (pictureAt > start && html.lastIndexOf("</picture", tag.start) < pictureAt) {
      const inside = html.slice(pictureAt, tag.start)
      for (const sm of inside.matchAll(/<source\b[^>]*>/gi)) {
        const t = attr(sm[0], "type")
        if (t) typed = true
        const set = attr(sm[0], "srcset")
        if (set && !t) sources.push({ srcset: set, sizes: attr(sm[0], "sizes"), media: attr(sm[0], "media") })
      }
    }
    if (typed) return { html, src: null }
    let preload = sources.map((x) => link({ srcset: x.srcset, sizes: x.sizes, media: x.media })).join("")
    if (sources.length === 0) preload = link({ href: src, srcset, sizes })
    else if (sources.length === 1 && sources[0].media) preload += link({ href: src, srcset, sizes, media: `not all and ${sources[0].media}` })
    /* A picture from another host: its connection opened at once too. */
    const first = sources[0]?.srcset ?? srcset ?? src ?? ""
    const origin = /^https:\/\/[^/\s"']+/i.exec(first.trim())?.[0]
    /* Never one that names the platform the theme came from (page.ts withoutVendorTraces leaves those out too). */
    if (origin && !/shopify/i.test(origin)) preload = `<link rel="preconnect" href="${q(origin)}" data-sl-lcp>${preload}`
    const marked = priority === null ? tag.raw.replace(/^<img\b/i, '<img fetchpriority="high"') : tag.raw
    /* The preload as early in the head as it can go: after its charset and viewport, before any stylesheet. */
    const headStart = html.search(/<head\b[^>]*>/i)
    const headOpenEnd = headStart >= 0 ? html.indexOf(">", headStart) + 1 : -1
    if (headOpenEnd <= 0 || headOpenEnd > headEnd) return { html, src: null }
    let at = headOpenEnd
    const meta = /<meta\b[^>]*(?:charset|name=["']?viewport)[^>]*>/gi
    meta.lastIndex = headOpenEnd
    let mm: RegExpExecArray | null
    while ((mm = meta.exec(html)) && mm.index < headEnd && mm.index - at < 400) at = mm.index + mm[0].length
    const out = html.slice(0, at) + preload + html.slice(at, tag.start) + marked + html.slice(tag.end)
    return { html: out, src: src ?? srcset }
  }
  return { html, src: null }
}
