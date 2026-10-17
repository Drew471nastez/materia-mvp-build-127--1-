/**
 * ===========================================================================
 *  EVERY PICTURE AND VIDEO ON A STORELIB SITE LOADS THE SAME WAY
 * ===========================================================================
 * A section is markup somebody wrote: Storelib, the creator, Storelib AI, or
 * Claude Code and Codex through GitHub. Whoever wrote it, its pictures used to
 * arrive as they were written: a 4 MB upload for a 300px card, all of them at
 * once whether on screen or four screens down, popping in a line at a time.
 *
 * So the markup every .storelib section draws passes through here, once, on
 * the way out of the renderer (./storelib-runtime.ts), on the live site and
 * in the canvas alike:
 *
 *   <img>     loading="lazy" and decoding="async" unless the author chose
 *             otherwise; a srcset through the site's image optimizer
 *             (lib/images/optimized-url.ts: AVIF or WebP at the width the
 *             screen needs) for an address it can fetch; and a mark the page
 *             uses to fade it in once it has loaded (./media-fade.ts), so a
 *             picture never snaps into place.
 *   <video>   preload="metadata" unless set, so a page does not download every
 *             film before it is played; an autoplaying one is muted and
 *             plays inline, which is what lets a phone play it at all.
 *   <iframe>  loading="lazy" unless set.
 *
 * What the author wrote always wins: an existing loading, decoding, srcset,
 * preload or sizes is left exactly as it is. Only the tags themselves are
 * touched, never anything between them.
 *
 * Pure string work, browser safe: the canvas renders sections in the browser.
 */

import { isOptimizableImage, optimizedSrcSet, SITE_PICTURE_QUALITY } from "@/lib/images/optimized-url"

/** The widths a picture is offered at: a phone's card up to a wide screen at twice the density. */
export const MEDIA_WIDTHS = [384, 640, 828, 1080, 1200, 1920, 2048]

/** The quality every section picture is served at: a published website's, never visibly softer than the upload (lib/images/optimized-url.ts). */
const QUALITY = SITE_PICTURE_QUALITY

const TAG = /<(img|video|iframe)\b([^>]*?)(\/?)>/gi

function has(attrs: string, name: string): boolean {
  return new RegExp(`(^|\\s)${name}(\\s*=|\\s|$)`, "i").test(attrs)
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs)
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null
}

/** "&amp;" back to "&": an attribute value as the browser will read it. */
function decode(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

/**
 * `sizes` for a picture with none: its own width when it says one (a thumbnail
 * asks for a thumbnail), otherwise the whole screen, which is right for the
 * banner and only generous for a card.
 */
function sizesFor(attrs: string): string {
  const w = Number(attr(attrs, "width"))
  return Number.isFinite(w) && w > 0 && w < 1200 ? `(min-width: ${Math.round(w)}px) ${Math.round(w)}px, 100vw` : "100vw"
}

export function optimizeSectionMedia(html: string): string {
  if (!html || !/<(img|video|iframe)\b/i.test(html)) return html
  return html.replace(TAG, (whole, tagName: string, rawAttrs: string, selfClose: string) => {
    const tag = tagName.toLowerCase()
    let attrs = rawAttrs
    const add: string[] = []
    if (tag === "img") {
      if (!has(attrs, "loading")) add.push('loading="lazy"')
      if (!has(attrs, "decoding")) add.push('decoding="async"')
      const src = attr(attrs, "src")
      const clean = src ? decode(src).trim() : ""
      if (clean && !has(attrs, "srcset") && /^(https:\/\/|\/(?!\/))/.test(clean) && !clean.startsWith("/_next/image") && isOptimizableImage(clean)) {
        const set = optimizedSrcSet(clean, MEDIA_WIDTHS, QUALITY)
        if (set) {
          add.push(`srcset="${escape(set)}"`)
          if (!has(attrs, "sizes")) add.push(`sizes="${escape(sizesFor(attrs))}"`)
        }
      }
      if (!has(attrs, "data-sl-media")) add.push('data-sl-media=""')
    } else if (tag === "video") {
      if (!has(attrs, "preload")) add.push(has(attrs, "autoplay") ? 'preload="auto"' : 'preload="metadata"')
      if (has(attrs, "autoplay")) {
        if (!has(attrs, "muted")) add.push("muted")
        if (!has(attrs, "playsinline")) add.push("playsinline")
      }
      if (!has(attrs, "data-sl-media")) add.push('data-sl-media=""')
    } else if (tag === "iframe") {
      if (!has(attrs, "loading")) add.push('loading="lazy"')
    }
    if (!add.length) return whole
    attrs = `${attrs.replace(/\s+$/, "")} ${add.join(" ")}`
    return `<${tagName}${attrs.startsWith(" ") ? "" : " "}${attrs}${selfClose}>`
  })
}

/**
 * ===========================================================================
 *  THE FIRST PICTURE OF A PAGE IS ASKED FOR FIRST
 * ===========================================================================
 * The pass above makes every picture lazy, which is right four screens down
 * and wrong at the top: the hero's photograph is the largest thing a visitor
 * sees first (the page's LCP), and a lazy one is not even asked for until
 * the layout is done. The live page knows which sections come first
 * (renderWithSources), so it hands them here:
 *
 *   eagerMedia(html)       the sections at the top of the page: drawn at once,
 *                          not lazily (what the pass added; an author's own
 *                          loading="lazy" too, since it is on screen)
 *   heroMedia(html)        the first picture of the first section with one:
 *                          eager and fetchpriority="high", as Shopify's
 *                          image_tag does for a theme's first sections
 *
 * Nothing else about the tag changes: its srcset, sizes and quality stay.
 */
const IMG = /<img\b([^>]*?)(\/?)>/gi

function eagerTag(tag: string, attrs: string, selfClose: string, high: boolean): string {
  let next = attrs.replace(/(^|\s)loading\s*=\s*("lazy"|'lazy'|lazy)(?=\s|$)/i, "$1loading=\"eager\"")
  if (!has(next, "loading")) next = `${next.replace(/\s+$/, "")} loading="eager"`
  if (high && !has(next, "fetchpriority")) next = `${next.replace(/\s+$/, "")} fetchpriority="high"`
  if (next === attrs) return tag
  return `<img${next.startsWith(" ") ? "" : " "}${next}${selfClose}>`
}

/** Every picture in a section at the top of the page, drawn at once. */
export function eagerMedia(html: string): string {
  if (!html || !/<img\b/i.test(html)) return html
  return html.replace(IMG, (whole, attrs: string, selfClose: string) => eagerTag(whole, attrs, selfClose, false))
}

/** The first picture in this markup, eager and asked for before the rest; null when it has none. */
export function heroMedia(html: string): string | null {
  if (!html || !/<img\b/i.test(html)) return null
  let done = false
  return html.replace(IMG, (whole, attrs: string, selfClose: string) => {
    if (done) return eagerTag(whole, attrs, selfClose, false)
    done = true
    return eagerTag(whole, attrs, selfClose, true)
  })
}
