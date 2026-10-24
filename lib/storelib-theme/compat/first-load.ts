/**
 * ===========================================================================
 *  AN IMPORTED THEME'S LIVE PAGE, READY TO DRAW SOONER
 * ===========================================================================
 * Measured on two owners' live imported sites (scripts/check-live-first-load.mjs,
 * a phone at 10 Mbps, 40ms, CPU slowed four times): the server answered in
 * 0.4s and every asset was in by 1.6s, yet DOMContentLoaded came at 6 to 14
 * seconds. A Chrome trace of the first load said where the time went: the
 * main thread, busy end to end, mostly recalculating style.
 *
 * Two things in the page Storelib writes were feeding it, and both are put
 * right here, on the finished markup of a live page (the route at
 * app/api/site-theme/site, never a preview or the builder's canvas):
 *
 * 1. THE CSS ARRIVES IN THE HEAD, IN ITS OWN ORDER. A Shopify theme writes
 *    a `<style>` (and often a section's `<link rel="stylesheet">`) inside
 *    every section: 126 of them through the body of one front page. Each one
 *    the parser meets is a new style sheet for the whole document, and every
 *    frame drawn while the page streams in recalculates style for everything
 *    above it. Gathered at the end of the head instead, in exactly the order
 *    they had (so the cascade is the same rule for rule: they already came
 *    after everything in the head, and stay after it), the page is styled
 *    once. Measured on the saved front page: DOMContentLoaded 5.9s to 5.0s,
 *    a second less of long tasks. The first paint waits for the section
 *    stylesheets too, about a tenth of a second here, which is what a page
 *    drawn without a jump costs.
 *
 *    Left where they are: anything inside a script, a template, a noscript,
 *    an SVG or MathML (not page CSS, or not live), and a `<style>` or
 *    `<link>` with an id (a theme's script may look for it by its place).
 *    At the first of those with an id, nothing after it moves either, so no
 *    two rules ever swap places.
 *
 * 2. A COUNTRY'S FLAG LOADS WHEN IT IS SEEN. The theme's country selector
 *    draws every country Storelib knows, about 250, each flag a small SVG
 *    picture (objects.ts flagImage), in a list that is closed. Each picture
 *    is a document of its own to the browser: 753 of them on one page. They
 *    are marked `loading="lazy"` here, so the closed list costs nothing and
 *    an opened one draws its flags as it scrolls. Measured on that page:
 *    DOMContentLoaded 11.2s to 8.1s.
 *
 * 4. A CLOSED COUNTRY LIST IS NOT LAID OUT. The same lists are most of the
 *    page: four of them on the owner's product page (the header, its phone
 *    copy, the top bar, the footer), 6,500 of its 7,900 elements and 966KB
 *    of its 1.96MB. Closed, they are invisible, not gone, so every layout
 *    (and every one a theme's script forces: a slider measuring its slides,
 *    a fade-in reading every picture's box) laid all of them out again.
 *    Each list holding flags is marked (`data-sl-countries`) and skipped
 *    whole (content-visibility: hidden) until it is about to be used: a
 *    pointer resting on, pressing, or a key or focus reaching anything that
 *    controls or holds it, or the theme opening it by itself (a class,
 *    style, `open`, `hidden` or aria-expanded changing on it or around it).
 *    Then it is let go for good, before the theme's own handler opens it.
 *    Every item, its handlers and its search stay exactly where the theme
 *    put them. Skipped one list at a time, not one item at a time: a box
 *    read inside a skipped item lays that item out on its own, and a
 *    theme's fade-in reading all 1,000 flags then cost 1.8s on a phone.
 *    Measured on the live product page (scripts/.shot-ab.mjs, a phone with
 *    the CPU slowed 4x, three runs): long tasks 5.4s to 4.3s, load 7.6s to
 *    6.3s after the first byte, the largest paint 3.1s to 2.2s.
 *
 * Text in, text out, and an answer this cannot read (no body) is returned as
 * it came.
 */

/** How every flag picture begins (objects.ts flagImage writes it). */
export const FLAG_SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24"><text`
/** The same, as the start of the picture's address in the page. */
export const FLAG_SRC_PREFIX = `data:image/svg+xml,${encodeURIComponent(FLAG_SVG_OPEN)}`

/** Elements whose contents are not the page's own markup: skipped whole. */
export const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "plaintext"])
/** Elements whose markup is not live, or not HTML's: nothing inside moves or changes. */
export const INERT = new Set(["template", "noscript", "svg", "math"])

export interface Tag {
  name: string
  start: number
  /** Index just past the tag's `>`. */
  end: number
  closing: boolean
  raw: string
}

/** The tag that starts at `i` (a `<`), its quoted attributes read whole so a `>` inside one does not end it. Null when it is not a tag. */
export function readTag(html: string, i: number): Tag | null {
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(i, i + 64))
  if (!m) return null
  let j = i + m[0].length
  let quote = ""
  for (; j < html.length; j++) {
    const c = html[j]
    if (quote) {
      if (c === quote) quote = ""
    } else if (c === '"' || c === "'") quote = c
    else if (c === ">") break
  }
  if (j >= html.length) return null
  return { name: m[2].toLowerCase(), start: i, end: j + 1, closing: m[1] === "/", raw: html.slice(i, j + 1) }
}

/** Where `</name>` closes, case blind, from `from`; the index past it, or the end of the text. */
export function closeOf(html: string, name: string, from: number): number {
  const re = new RegExp(`</${name}\\s*>`, "ig")
  re.lastIndex = from
  const m = re.exec(html)
  return m ? m.index + m[0].length : html.length
}

/** Past the end of an inert element that may nest (a template in a template, an svg in an svg). */
export function pastInert(html: string, name: string, from: number): number {
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, "ig")
  re.lastIndex = from
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[1]) depth--
    else if (!m[2]) depth++
    if (depth === 0) return m.index + m[0].length
  }
  return html.length
}

export const attr = (raw: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(raw)
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : new RegExp(`\\s${name}(?=[\\s/>])`, "i").test(raw) ? "" : null
}

/*
  WHAT IS LEFT IN ITS PLACE: an element that draws nothing, so the section
  keeps exactly as many elements as it had. A theme's rule that counts them
  (`:first-child`, `:nth-child(2)`, `* + *`) still matches what it matched:
  measured, a logo strip lost its full width at a desktop width when its
  `<style>` and `<link>` were simply taken out. Not an empty `<style>`: the
  browser still treats each one as a new style sheet for the whole page, and
  that kept most of the cost (DOMContentLoaded 5.4s against 5.0s). A
  `<template>` is inert and hidden, and a `<link>` with no rel loads nothing.
*/
const EMPTY_STYLE = "<template data-sl-moved></template>"
const EMPTY_LINK = "<link data-sl-moved>"

const isStylesheetLink = (raw: string): boolean => /(?:^|\s)stylesheet(?:\s|$)/i.test(attr(raw, "rel") ?? "")

/** A flag picture's tag with `loading="lazy"`, when it says nothing of its own about loading. */
function lazyFlag(raw: string): string {
  const src = attr(raw, "src")
  if (src === null || !src.startsWith(FLAG_SRC_PREFIX) || attr(raw, "loading") !== null) return raw
  return raw.replace(/^<img\b/i, '<img loading="lazy"')
}

/** Marks a list of countries (the `<ul>` or `<ol>` its flags are in), skipped while it is closed. */
export const COUNTRY_LIST_ATTR = "data-sl-countries"
/**
 * The rule that skips a marked list, and the script that lets it go when
 * it is about to be used (see 4. above). Written once, in the head.
 */
export const COUNTRY_LIST_HEAD = `<style data-sl-countries-rule>[${COUNTRY_LIST_ATTR}="closed"]{content-visibility:hidden}</style><script data-sl-countries-open>(function(){var d=document,A="${COUNTRY_LIST_ATTR}",S="["+A+'="closed"]';function go(l){if(l&&l.getAttribute(A)==="closed")l.setAttribute(A,"open")}function near(t){for(var e=t,i=0;e&&e.nodeType===1&&i<6;e=e.parentElement,i++){var c=e.getAttribute("aria-controls");if(c){var x=d.getElementById(c);if(x){if(x.matches(S))go(x);x.querySelectorAll(S).forEach(go)}}if(i>0||e.matches("form,details,[class*=localization],[class*=disclosure],[class*=country]")){var f=e.querySelectorAll(S);if(f.length&&i<5)f.forEach(go)}}}function on(e){var t=e.target;if(t&&t.nodeType===1)near(t)}["pointerdown","pointerover","touchstart","keydown","focusin"].forEach(function(n){d.addEventListener(n,on,{capture:true,passive:true})});function watch(){var m=new MutationObserver(function(r){r.forEach(function(x){var t=x.target;if(t.nodeType!==1)return;if(t.matches(S))go(t);else t.querySelectorAll(S).forEach(go)})});d.querySelectorAll(S).forEach(function(l){for(var e=l,i=0;e&&i<4;e=e.parentElement,i++)m.observe(e,{attributes:true,attributeFilter:["class","style","open","hidden","aria-expanded","aria-hidden"]})});d.querySelectorAll("[aria-controls]").forEach(function(b){var x=d.getElementById(b.getAttribute("aria-controls"));if(x&&(x.matches(S)||x.querySelector(S)))m.observe(b,{attributes:true,attributeFilter:["aria-expanded"]})})}if(d.readyState==="loading")d.addEventListener("DOMContentLoaded",watch);else watch()})();</script>`

export interface FirstLoadResult {
  html: string
  /** Style blocks and stylesheet links gathered into the head. */
  moved: number
  /** Flag pictures marked to load when seen. */
  lazyFlags: number
  /** Country lists skipped while closed. */
  countryLists?: number
  /** Earlier copies of a stylesheet linked again later, dropped (onceEachStylesheet). */
  duplicates?: number
}

/** Whether the browser asked for the address as a page to show (a link followed, typed, or fetched ahead for one), not for a script. */
export function openedAsDocument(headers: Headers): boolean {
  return headers.get("sec-fetch-dest") === "document"
}

/** The live page's markup with its body's CSS gathered at the end of its head and its flags lazy. */
export function readierFirstLoad(html: string): FirstLoadResult {
  let headEnd = -1
  let bodyAt = -1
  let i = 0
  let stop = false
  const moved: string[] = []
  /* What the page becomes: pieces of the original, with the moved CSS cut out and the flags rewritten. */
  const out: string[] = []
  let copied = 0
  let flags = 0
  let countryLists = 0
  /* The lists open around the scan, innermost last: the one a flag is in. */
  const lists: { start: number; end: number; raw: string; marked: boolean }[] = []
  const cut = (from: number, to: number, replacement = "") => {
    out.push(html.slice(copied, from), replacement)
    copied = to
  }
  while (i < html.length) {
    const lt = html.indexOf("<", i)
    if (lt < 0) break
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4)
      i = end < 0 ? html.length : end + 3
      continue
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt)
      i = end < 0 ? html.length : end + 1
      continue
    }
    const tag = readTag(html, lt)
    if (!tag) {
      i = lt + 1
      continue
    }
    i = tag.end
    if (tag.closing) {
      if (tag.name === "head" && bodyAt < 0 && headEnd < 0) headEnd = tag.start
      if (tag.name === "ul" || tag.name === "ol") lists.pop()
      continue
    }
    const selfClosed = /\/\s*>$/.test(tag.raw)
    if (tag.name === "body" && bodyAt < 0) {
      bodyAt = tag.start
      if (headEnd < 0) headEnd = tag.start
      continue
    }
    if (INERT.has(tag.name)) {
      if (!selfClosed) i = pastInert(html, tag.name, tag.end)
      continue
    }
    if (tag.name === "style") {
      const end = closeOf(html, "style", tag.end)
      i = end
      /* An empty one holds no rule to move (and is what a moved one leaves behind). */
      const empty = !/\S/.test(html.slice(tag.end, end).replace(/<\/style\s*>$/i, ""))
      if (bodyAt >= 0 && !stop && !empty) {
        if (attr(tag.raw, "id") !== null) stop = true
        else {
          moved.push(html.slice(tag.start, end))
          cut(tag.start, end, EMPTY_STYLE)
        }
      }
      continue
    }
    if (RAW_TEXT.has(tag.name)) {
      if (!selfClosed) i = closeOf(html, tag.name, tag.end)
      continue
    }
    if (bodyAt < 0) continue
    if (tag.name === "link" && isStylesheetLink(tag.raw) && !stop) {
      if (attr(tag.raw, "id") !== null) stop = true
      else {
        moved.push(tag.raw)
        cut(tag.start, tag.end, EMPTY_LINK)
      }
      continue
    }
    if ((tag.name === "ul" || tag.name === "ol") && !selfClosed) {
      lists.push({ start: tag.start, end: tag.end, raw: tag.raw, marked: false })
      continue
    }
    if (tag.name === "img") {
      const isFlag = (attr(tag.raw, "src") ?? "").startsWith(FLAG_SRC_PREFIX)
      /* The list it is in, marked once, when nothing has been cut since it opened (cuts only move forwards). */
      const list = isFlag ? lists[lists.length - 1] : undefined
      if (list && !list.marked && copied <= list.start && attr(list.raw, COUNTRY_LIST_ATTR) === null) {
        list.marked = true
        countryLists++
        cut(list.start, list.end, list.raw.replace(/^<(ul|ol)\b/i, `<$1 ${COUNTRY_LIST_ATTR}="closed"`))
      }
      const lazy = lazyFlag(tag.raw)
      if (lazy !== tag.raw) {
        flags++
        cut(tag.start, tag.end, lazy)
      }
    }
  }
  if (bodyAt < 0 || headEnd < 0) return { html, moved: 0, lazyFlags: 0, duplicates: 0 }
  out.push(html.slice(copied))
  const body = out.join("")
  /* Nothing before the head's end was cut, so the head's end is where it was. */
  const head = `${moved.join("")}${countryLists ? COUNTRY_LIST_HEAD : ""}`
  const gathered = head ? `${body.slice(0, headEnd)}${head}${body.slice(headEnd)}` : body
  const once = onceEachStylesheet(gathered)
  return { html: once.html, moved: moved.length, lazyFlags: flags, countryLists, duplicates: once.dropped }
}

/** How a stylesheet link applies: at once ("all"), once loaded ("late-all", the media="print" onload trick), or for its own media. */
function appliesAs(raw: string): string {
  const media = (attr(raw, "media") ?? "").trim().toLowerCase()
  if (media === "print" && /this\.media\s*=\s*(?:'all'|"all"|&quot;all&quot;)/.test(attr(raw, "onload") ?? "")) return "late-all"
  return media === "" || media === "all" ? "all" : `media:${media}`
}

/*
  3. ONE COPY OF EACH STYLESHEET. A theme often links the same file more
  than once (a section's own `stylesheet_tag` again for each time the
  section is used, theme.css both late and at once): measured, 6 of the 28
  stylesheet links on one owner's front page. The browser downloads it once
  but builds a style sheet for each link, and every style recalculation
  matches its rules again for each copy. A later copy of the same address
  wins over the earlier one rule for rule (the same rules, later in the
  cascade), so the earlier copy changes nothing once the later one applies:
  it is the one dropped, and only when the later copy applies as soon as it
  did (both at once, both once loaded, or a late one with a later copy that
  applies at once). Only in the head, where nothing is drawn, and never a
  link with an id or one that is disabled.
*/
export function onceEachStylesheet(html: string): { html: string; dropped: number } {
  const headEnd = html.search(/<\/head\s*>|<body\b/i)
  if (headEnd < 0) return { html, dropped: 0 }
  const links: { start: number; end: number; href: string; as: string }[] = []
  let i = 0
  while (i < headEnd) {
    const lt = html.indexOf("<", i)
    if (lt < 0 || lt >= headEnd) break
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4)
      i = end < 0 ? headEnd : end + 3
      continue
    }
    const tag = readTag(html, lt)
    if (!tag) {
      i = lt + 1
      continue
    }
    i = tag.end
    if (tag.closing) continue
    if (INERT.has(tag.name)) {
      i = pastInert(html, tag.name, tag.end)
      continue
    }
    if (RAW_TEXT.has(tag.name)) {
      i = closeOf(html, tag.name, tag.end)
      continue
    }
    if (tag.name === "link" && isStylesheetLink(tag.raw) && attr(tag.raw, "id") === null && attr(tag.raw, "disabled") === null) {
      const href = attr(tag.raw, "href")
      if (href) links.push({ start: tag.start, end: tag.end, href, as: appliesAs(tag.raw) })
    }
  }
  const drop = links.filter((l, k) => links.slice(k + 1).some((m) => m.href === l.href && (m.as === l.as || (l.as === "late-all" && m.as === "all"))))
  if (!drop.length) return { html, dropped: 0 }
  let out = ""
  let at = 0
  for (const d of drop) {
    out += html.slice(at, d.start) + EMPTY_LINK
    at = d.end
  }
  return { html: out + html.slice(at), dropped: drop.length }
}
