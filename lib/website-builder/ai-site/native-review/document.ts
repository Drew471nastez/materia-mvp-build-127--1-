/**
 * ===========================================================================
 *  A NATIVE PAGE AS THE CRITIC'S BROWSER OPENS IT (round R, R3)
 * ===========================================================================
 * The visual critic of round O (lib/ai-builder/visual-critic) photographs a
 * page drawn from .storelib files. A page built from Storelib's NATIVE
 * sections (the classic engine, R2's JSON engine) is drawn by the live site's
 * own React renderers: ThemePage, SectionRenderer, the section renderers, the
 * theme stylesheet and the app's compiled CSS. So that is what is used, in one
 * of two ways (./render-local.tsx in Node, ./render-remote.ts on the server),
 * and both end here, as one static document:
 *
 *   NO SCRIPT. Every <script>, inline handler and javascript: address is
 *   stripped (the same stripScripts as the agent's critic), a CSP meta
 *   forbids scripts outright, and the browser has JavaScript off
 *   (visual-critic/shoot.ts). What is measured is the server's markup and
 *   its CSS: what a visitor gets before any script.
 *
 *   SETTLED, BUT ASKABLE. Animations are put at their end state by a sheet
 *   with the id `critic-settle`, so an entrance photographed mid-way does not
 *   read as an empty section. measure.ts sets that one sheet aside for a
 *   moment to ask what would loop forever under reduced motion.
 *
 *   STREAMED SECTIONS PUT BACK. A served page may hold sections React wrote
 *   out of order (a `<template id="B:n">` where the section goes, the section
 *   in `<div hidden id="S:n">` at the end, and an inline script that moves
 *   it). With scripts off nothing moves it, so UNSTREAM does, as Storelib's
 *   own DevTools expression (never the page's script).
 *
 * Pure: strings in, strings out.
 */
import { stripScripts, CRITIC_CSP } from "@/lib/ai-builder/visual-critic/document"

export const SETTLE_ID = "critic-settle"

/** Motion at its end state (the reveal never starts without JavaScript), and the snapshot stage the cover uses. */
export const SETTLE_CSS = "html,body{margin:0;padding:0}*,*::before,*::after{animation-delay:0s!important;animation-duration:0.001s!important;animation-iteration-count:1!important;transition:none!important}"

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * React's out-of-order boundaries, completed by Storelib's own expression: each `S:n` holder's children replace
 * the `B:n` template (and the boundary's pending marker becomes a finished one), as React's $RC would have.
 * Evaluated through the DevTools protocol with the page's scripts off.
 */
export const UNSTREAM = `(() => {
  let moved = 0
  for (const holder of Array.from(document.querySelectorAll('div[hidden][id^="S:"]'))) {
    const id = holder.id.slice(2)
    const slot = document.getElementById('B:' + id)
    if (!slot || !slot.parentNode) continue
    const parent = slot.parentNode
    const marker = slot.previousSibling
    if (marker && marker.nodeType === 8 && marker.data === '$?') marker.data = '$'
    while (holder.firstChild) parent.insertBefore(holder.firstChild, slot)
    parent.removeChild(slot)
    holder.remove()
    moved++
  }
  return moved
})()`

export interface NativeDocumentInput {
  /** The page's markup: ThemePage's output (local) or the served page's body (remote). */
  body: string
  /** The app's compiled stylesheet, inline. */
  css?: string
  /** Or the stylesheets by address (absolute https). */
  cssHrefs?: string[]
  /** Extra head markup that is safe (font links, the theme's inline styles), already stripped. */
  head?: string
  lang?: string
}

/** One static document, nothing in it can run. */
export function nativeCriticDocument(input: NativeDocumentInput): string {
  const links = (input.cssHrefs ?? []).filter((h) => /^https:\/\//i.test(h)).map((h) => `<link rel="stylesheet" href="${escapeAttr(h)}">`).join("")
  const css = input.css ? `<style>${input.css.replace(/<\/style/gi, "<\\/style")}</style>` : ""
  const lang = /^[a-z]{2}(-[A-Za-z]{2})?$/.test(input.lang ?? "") ? input.lang : "en"
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttr(CRITIC_CSP)}"><meta name="viewport" content="width=device-width,initial-scale=1">${links}${css}${stripScripts(input.head ?? "")}<style id="${SETTLE_ID}">${SETTLE_CSS}</style></head><body>${stripScripts(input.body)}</body></html>`
}

/**
 * A page the site served (./render-remote.ts), made into the critic's document: scripts out, the site's own
 * stylesheets and pictures addressed absolutely (the document is set as content, with no URL of its own), the
 * optimizer's responsive sources dropped (the original is drawn), and the head kept to what styles the page.
 */
export function servedToDocument(served: string, origin: string, inlined: Record<string, string> = {}): { html: string; cssHrefs: string[] } {
  const base = origin.replace(/\/+$/, "")
  const abs = (v: string) => (v.startsWith("//") ? `https:${v}` : v.startsWith("/") ? `${base}${v}` : v)
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(served)?.[1] ?? ""
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(served)
  const body = bodyMatch ? bodyMatch[1] : served
  const cssHrefs: string[] = []
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue
    const href = /href\s*=\s*"([^"]+)"/i.exec(tag)?.[1]
    if (href) cssHrefs.push(abs(href.replace(/&amp;/g, "&")))
  }
  const styles = [...head.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]).join("")
  const lang = /<html[^>]*\slang="([^"]+)"/i.exec(served)?.[1]
  const fixed = body
    .replace(/\s(src|href|poster)="(\/[^"]*)"/g, (_m, attr: string, v: string) => ` ${attr}="${abs(v)}"`)
    .replace(/\s(srcset|imagesrcset|sizes)="[^"]*"/g, "")
  /* A stylesheet the server already fetched is inline (its own relative addresses made absolute); the rest by address. */
  const css = cssHrefs.filter((h) => inlined[h] !== undefined).map((h) => inlined[h].replace(/url\(\s*(["']?)\//g, `url($1${base}/`)).join("\n")
  const linked = cssHrefs.filter((h) => inlined[h] === undefined)
  return { html: nativeCriticDocument({ body: fixed, cssHrefs: linked, head: styles, ...(css ? { css } : {}), ...(lang ? { lang } : {}) }), cssHrefs }
}
