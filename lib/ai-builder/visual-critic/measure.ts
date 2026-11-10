/**
 * ===========================================================================
 *  THE CHEAP MEASUREMENTS: WHAT THE BROWSER CAN SAY FOR CERTAIN
 * ===========================================================================
 * Before (and besides) the vision model's judgement, the drawn page is
 * measured in the browser. These are facts, not taste, so the worst of them
 * are HARD GATES that block finish like a compile error (spec 8.2):
 *
 *   overflow          the page scrolls sideways at 390 (GATE)
 *   dead-cta          a call to action in the first screen that goes nowhere:
 *                     "#", empty, javascript: (GATE)
 *   contrast          text whose contrast with what it sits on is unreadable
 *                     (under 3:1, or 2.3:1 for large text) is a GATE; under
 *                     WCAG AA (4.5:1, 3:1 large) is a defect
 *   heading-wrap      a headline that wraps into too many lines (5 at 390, 4
 *                     at 1440 for the first heading; 6 for the rest)
 *   tap-target        a link or button under 24 by 24 at 390 (WCAG 2.2 AA
 *                     2.5.8), links inside running text excepted
 *   image-broken      a picture that did not load
 *   image-missing     an <img> with no address at all
 *   no-cta            no call to action anywhere in the first screen
 *   placeholder-copy  instructions to the creator in the visitor's page
 *                     ("add your portrait", "lorem ipsum", "PHOTO: ...")
 *
 * MEASURE_SCRIPT runs in the page through the DevTools protocol (it works
 * with the page's own JavaScript switched off, which is how ./shoot.ts opens
 * it: the protocol evaluates, the page's scripts never run). It is plain
 * JavaScript in a string so no bundler rewrites it. `measuredDefects` turns
 * its numbers into Defects; it is pure, so the rules are tested without a
 * browser.
 */
import type { Defect } from "./types"

export interface MeasuredElement {
  sectionId: string | null
  sectionType: string | null
  selector: string
  text?: string
}

export interface Measurements {
  viewport: "desktop" | "mobile"
  width: number
  foldHeight: number
  /** document scrollWidth minus clientWidth: >1 is a page that scrolls sideways. */
  scrollOverflow: number
  /** The element that sticks out furthest, unclipped. */
  widest: (MeasuredElement & { over: number }) | null
  headings: (MeasuredElement & { level: number; lines: number; fontSize: number; first: boolean })[]
  smallTargets: (MeasuredElement & { w: number; h: number })[]
  contrast: (MeasuredElement & { ratio: number; large: boolean; color: string; background: string })[]
  brokenImages: (MeasuredElement & { src: string })[]
  missingImages: MeasuredElement[]
  /** Calls to action whose top is inside the first screen. */
  foldCtas: (MeasuredElement & { href: string | null; tag: string; hooked: boolean })[]
  placeholders: (MeasuredElement & { text: string })[]
  /** Round P (P5): sections drawn with height but nothing in them a visitor can read or see. */
  emptySections?: MeasuredElement[]
  pageHeight: number
}

/* Runs in the page. `__FOLD__` is replaced with the first screen's height. */
export const MEASURE_SCRIPT = `(() => {
  const FOLD = __FOLD__
  const doc = document.documentElement
  const vw = doc.clientWidth
  const out = { width: vw, foldHeight: FOLD, scrollOverflow: Math.max(0, doc.scrollWidth - doc.clientWidth), widest: null, headings: [], smallTargets: [], contrast: [], brokenImages: [], missingImages: [], foldCtas: [], placeholders: [], pageHeight: Math.ceil(doc.scrollHeight) }
  const where = (el) => {
    const s = el.closest('[data-critic-section]')
    let sel = el.tagName.toLowerCase()
    if (el.id && !/^section-/.test(el.id)) sel += '#' + el.id
    else if (typeof el.className === 'string' && el.className.trim()) sel += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
    return { sectionId: s ? s.getAttribute('data-critic-section') : null, sectionType: s ? s.getAttribute('data-critic-type') : null, selector: sel.slice(0, 80) }
  }
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return null
    const st = getComputedStyle(el)
    if (st.visibility === 'hidden' || Number(st.opacity) === 0 || st.display === 'none') return null
    for (let p = el.parentElement; p; p = p.parentElement) { const ps = getComputedStyle(p); if (Number(ps.opacity) === 0 || ps.visibility === 'hidden') return null; if (p.tagName === 'DETAILS' && !p.open && !el.closest('summary')) return null }
    return r
  }
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) return true
    }
    return false
  }
  const ownText = (el) => {
    let t = ''
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
    return t.replace(/\\s+/g, ' ').trim()
  }
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || '')
    if (!m) return null
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => {
    const f = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  /* What a piece of text sits on: the solid colours under it, composited. null when a picture or gradient is under it (not measurable here). */
  const backdrop = (el) => {
    const layers = []
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.backgroundImage && s.backgroundImage !== 'none') return null
      const c = parse(s.backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base)
    return base
  }
  /* Any sideways spill, unclipped, outside fixed layers. */
  let inSection = null
  const rank = (w) => w.cause * 100000 + w.over
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    /* Its own text spilling out of a box that fits (white-space: nowrap, a long word): the box is fine, its content is not. */
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && r.left + el.scrollWidth > vw + 1) {
      const st = getComputedStyle(el)
      if (st.overflowX === 'visible' && st.position !== 'fixed' && !clipped(el)) {
        const w = Object.assign(where(el), { over: Math.round(r.left + el.scrollWidth - vw), cause: 1 })
        if (w.sectionId) { if (!inSection || rank(w) >= rank(inSection)) inSection = w }
        else if (!out.widest || rank(w) > rank(out.widest)) out.widest = w
      }
    }
    if (r.right > vw + 1 || r.left < -1) {
      const st = getComputedStyle(el)
      if (st.position === 'fixed' || st.visibility === 'hidden' || clipped(el)) continue
      const by = Math.round(Math.max(r.right - vw, -r.left))
      /* A box that does not wrap is a cause; its siblings stretched by it are not. */
      const w = Object.assign(where(el), { over: by, cause: /nowrap|pre/.test(st.whiteSpace) || el.scrollWidth > el.clientWidth + 1 ? 1 : 0 })
      /* The furthest offender inside a section wins over a page-level box it merely widens. */
      if (w.sectionId) { if (!inSection || rank(w) >= rank(inSection)) inSection = w }
      else if (!out.widest || rank(w) > rank(out.widest)) out.widest = w
    }
  }
  if (inSection) out.widest = inSection
  if (out.widest) delete out.widest.cause
  /* Headlines and how many lines they wrap into. */
  let firstHeading = true
  for (const el of document.querySelectorAll('h1, h2, h3')) {
    const r = shown(el)
    if (!r) continue
    const st = getComputedStyle(el)
    const size = parseFloat(st.fontSize) || 16
    const lh = st.lineHeight === 'normal' ? size * 1.2 : parseFloat(st.lineHeight) || size * 1.2
    const lines = Math.max(1, Math.round(r.height / lh))
    out.headings.push(Object.assign(where(el), { level: Number(el.tagName[1]), lines, fontSize: Math.round(size), first: firstHeading, text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80) }))
    firstHeading = false
  }
  /* Tap targets: every link and button, except a link inside running text. */
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"], summary')) {
    const r = shown(el)
    if (!r) continue
    const inText = el.tagName === 'A' && el.closest('p, li > p, blockquote') && ownText(el.closest('p') || el).length > (el.textContent || '').trim().length + 10
    if (inText) continue
    if (r.width < 24 || r.height < 24) out.smallTargets.push(Object.assign(where(el), { w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40) }))
  }
  /* Contrast of text on its solid background. */
  const seenContrast = new Set()
  for (const el of document.body.querySelectorAll('*')) {
    const t = ownText(el)
    if (t.length < 2) continue
    const r = shown(el)
    if (!r) continue
    const st = getComputedStyle(el)
    const fg = parse(st.color)
    const bg = backdrop(el)
    if (!fg || !bg) continue
    const color = fg.a < 1 ? over(fg, bg) : fg
    const l1 = lum(color), l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    const size = parseFloat(st.fontSize) || 16
    const bold = Number(st.fontWeight) >= 700
    const large = size >= 24 || (bold && size >= 18.66)
    if (ratio < (large ? 3 : 4.5)) {
      const key = st.color + '|' + (el.closest('[data-critic-section]') || {}).id
      if (seenContrast.has(key)) continue
      seenContrast.add(key)
      out.contrast.push(Object.assign(where(el), { ratio: Math.round(ratio * 100) / 100, large, color: st.color, background: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')', text: t.slice(0, 50) }))
    }
  }
  /* Pictures. */
  for (const img of document.images) {
    const src = img.getAttribute('src')
    if (!src || !src.trim()) { if (shown(img) || img.getAttribute('width')) out.missingImages.push(where(img)); continue }
    if (img.complete && img.naturalWidth === 0) out.brokenImages.push(Object.assign(where(img), { src: src.slice(0, 120) }))
  }
  /* Calls to action in the first screen: buttons, and links that look like buttons or ask for something. */
  const ASK = /\\b(book|buy|shop|start|join|get|order|reserve|subscribe|sign ?up|try|contact|call|apply|enrol|enroll|schedule|claim|add to cart|learn more|see|view|explore|discover)\\b/i
  for (const el of document.querySelectorAll('a, button')) {
    const r = shown(el)
    if (!r || r.top >= FOLD || r.bottom <= 0) continue
    const st = getComputedStyle(el)
    if (el.closest('nav') && !/\\b(btn|button|cta)\\b/i.test(el.className || '')) continue
    const text = (el.textContent || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim()
    if (!text) continue
    const bg = parse(st.backgroundColor)
    const looks = el.tagName === 'BUTTON' || (bg && bg.a > 0.1) || (parseFloat(st.borderTopWidth) >= 1 && st.borderTopStyle !== 'none') || /\\b(btn|button|cta)\\b/i.test(typeof el.className === 'string' ? el.className : '') || (ASK.test(text) && text.length <= 40)
    if (!looks) continue
    const hooked = Array.from(el.attributes).some((a) => /^data-storelib-/.test(a.name)) || el.hasAttribute('aria-controls') || el.hasAttribute('popovertarget') || el.hasAttribute('commandfor') || !!el.closest('form')
    out.foldCtas.push(Object.assign(where(el), { href: el.tagName === 'A' ? el.getAttribute('href') : null, tag: el.tagName.toLowerCase(), hooked, text: text.slice(0, 50) }))
  }
  /* Instructions to the creator left in the visitor's page. */
  const PLACEHOLDER = /(\\badd (your|a|an) [a-z ]{2,30}(in|from|on) the (sidebar|editor|settings|panel)\\b|\\b(lorem ipsum|dolor sit amet)\\b|^\\s*(photo|image|picture|portrait)\\s*:\\s|\\byour (name|gym|business|logo|photo|portrait) here\\b|\\b(replace|upload) (this|your) (image|photo|picture|text)\\b|\\[(your|insert) [^\\]]{2,30}\\]|\\b(placeholder text|sample text|text goes here)\\b|\\bin your own words\\b|^(write|describe|explain|say) (a few|a short|some|here|how|what|who|where)\\b|^(your|business|company|coach'?s?) (name|title|role|logo|photo|portrait|address|email|phone number)\\.?$)/i
  for (const el of document.body.querySelectorAll('*')) {
    const t = ownText(el)
    if (t.length < 6 || !PLACEHOLDER.test(t)) continue
    if (el.closest('label, button, input, textarea, select, [placeholder]')) continue
    if (!shown(el)) continue
    out.placeholders.push(Object.assign(where(el), { text: t.slice(0, 80) }))
    if (out.placeholders.length >= 6) break
  }
  /* Sections with height and nothing in them: no words, no picture, no drawing (round P). */
  out.emptySections = []
  for (const sec of document.querySelectorAll('[data-critic-section]')) {
    const r = sec.getBoundingClientRect()
    if (r.height < 60) continue
    const words = (sec.innerText || sec.textContent || '').replace(/\s+/g, '').length
    if (words >= 2) continue
    let seen = false
    for (const m of sec.querySelectorAll('img[src], svg, video, canvas, picture, iframe')) { const mr = m.getBoundingClientRect(); if (mr.width > 8 && mr.height > 8) { seen = true; break } }
    if (!seen) for (const el of [sec, ...sec.querySelectorAll('*')]) { const bi = getComputedStyle(el).backgroundImage; if (bi && bi !== 'none') { seen = true; break } }
    if (!seen) out.emptySections.push(where(sec.firstElementChild || sec))
    if (out.emptySections.length >= 8) break
  }
  out.headings = out.headings.slice(0, 40)
  out.smallTargets = out.smallTargets.slice(0, 20)
  out.contrast = out.contrast.slice(0, 20)
  out.brokenImages = out.brokenImages.slice(0, 12)
  out.missingImages = out.missingImages.slice(0, 12)
  out.foldCtas = out.foldCtas.slice(0, 12)
  return out
})()`

export function measureScript(foldHeight: number): string {
  return MEASURE_SCRIPT.replace("__FOLD__", String(Math.round(foldHeight)))
}

/** Thresholds, exported for the tests and the docs. */
export const LIMITS = {
  /** Lines a page's first headline may wrap into (the hero), by viewport. */
  firstHeadingLines: { mobile: 5, desktop: 4 },
  /** Any other headline. */
  headingLines: { mobile: 6, desktop: 5 },
  /** WCAG 2.2 AA 2.5.8. */
  tapTarget: 24,
  /** Below these the text cannot be read: a hard gate. Below AA (4.5 / 3) is a defect. */
  unreadable: { normal: 3, large: 2.3 },
} as const

const DEAD_HREF = /^\s*(#\s*|javascript:.*)?$/i

/** The browser's numbers for one page at one width, as defects. */
export function measuredDefects(page: string, m: Measurements): Defect[] {
  const out: Defect[] = []
  const viewport = m.viewport
  const at = (e: MeasuredElement) => ({ page, ...(e.sectionId ? { sectionId: e.sectionId } : {}), ...(e.sectionType ? { sectionType: e.sectionType } : {}), selector: e.selector })
  const px = viewport === "mobile" ? "390" : "1440"

  if (viewport === "mobile" && (m.scrollOverflow > 1 || (m.widest && m.widest.over > 1))) {
    const w = m.widest
    out.push({
      ...(w ? at(w) : { page }),
      severity: "critical",
      kind: "overflow",
      viewport,
      what: w ? `${w.selector} sticks out ${w.over}px past a ${px}px wide screen${m.scrollOverflow > 1 ? `, so the page scrolls sideways by ${m.scrollOverflow}px` : ""}.` : `The page is ${m.scrollOverflow}px wider than a ${px}px screen and scrolls sideways.`,
      why: "Sideways scrolling on a phone looks broken and hides content off screen.",
      fix: "Let it wrap or shrink at narrow widths: max-width:100%, min-width:0 on flex/grid children, no fixed px widths or 100vw, clamp() font sizes, and stack columns under 640px.",
      gate: m.scrollOverflow > 1,
      source: "measure",
    })
  }

  for (const h of m.headings) {
    const limit = h.first ? LIMITS.firstHeadingLines[viewport] : LIMITS.headingLines[viewport]
    if (h.lines <= limit) continue
    out.push({
      ...at(h),
      severity: h.first ? "high" : "medium",
      kind: "heading-wrap",
      viewport,
      what: `The ${h.first ? "first headline" : `h${h.level}`} "${(h.text ?? "").slice(0, 60)}" wraps into ${h.lines} lines at ${h.fontSize}px on a ${px}px screen.`,
      why: h.first ? "A headline that long pushes the subject and the call to action out of the first screen." : "A wall of oversized headline breaks the section's rhythm.",
      fix: `Shorter words or a smaller size at this width: clamp() the font size so it stays within ${limit} lines, or tighten the copy.`,
      gate: false,
      source: "measure",
    })
  }

  if (viewport === "mobile") {
    for (const t of m.smallTargets.slice(0, 6)) {
      out.push({
        ...at(t),
        severity: "medium",
        kind: "tap-target",
        viewport,
        what: `"${(t.text ?? "").slice(0, 30) || t.selector}" is a ${t.w}x${t.h}px tap target.`,
        why: "Under 24px a thumb misses it (WCAG 2.2 target size).",
        fix: "Give it at least 44px of height with padding (min-height:44px; padding-block) or a larger hit area.",
        gate: false,
        source: "measure",
      })
    }
  }

  for (const c of m.contrast) {
    const unreadable = c.ratio < (c.large ? LIMITS.unreadable.large : LIMITS.unreadable.normal)
    out.push({
      ...at(c),
      severity: unreadable ? "critical" : "medium",
      kind: "contrast",
      viewport,
      what: `"${(c.text ?? "").slice(0, 40)}" is ${c.color} on ${c.background}: contrast ${c.ratio}:1${unreadable ? ", which cannot be read" : `, under ${c.large ? "3" : "4.5"}:1`}.`,
      why: "Low contrast text is hard or impossible to read, worst outdoors on a phone.",
      fix: "Use the site's text or inverse-text token on this background, or darken/lighten the surface, to reach at least 4.5:1 (3:1 for large text).",
      gate: unreadable,
      source: "measure",
    })
  }

  for (const b of m.brokenImages.slice(0, 6)) {
    out.push({ ...at(b), severity: "high", kind: "image-broken", viewport, what: `A picture did not load (${b.src}).`, why: "A broken picture shows an empty box or a broken icon to every visitor.", fix: "Use a picture from the creator's media or products, or a designed text-forward composition with an editable image slot that draws nothing until filled.", gate: false, source: "measure" })
  }
  for (const b of m.missingImages.slice(0, 6)) {
    /* Round P (P5): an empty picture frame is a hard gate (Andrew's grey box where the photo should be). */
    out.push({ ...at(b), severity: "high", kind: "image-missing", viewport, what: "An <img> is drawn with no picture address.", why: "Visitors see an empty frame where a picture should be.", fix: "Give the image setting a real picture (generate_image, find_photo, the creator's media), or draw the <img> only when it is set ({% if %}) and let the words carry the section.", gate: true, source: "measure" })
  }
  for (const e of (m.emptySections ?? []).slice(0, 6)) {
    out.push({ ...at(e), severity: "high", kind: "empty-section", viewport, what: "This section takes up space on the page and shows nothing: no words, no picture.", why: "An empty band reads as a broken or unfinished site.", fix: "Fill its items and words (its blocks with this site's real content) or its picture; or remove the section from the page.", gate: true, source: "measure" })
  }

  const ctas = m.foldCtas
  if (!ctas.length) {
    out.push({ page, severity: page === "home" ? "high" : "medium", kind: "no-cta", viewport, what: `No call to action in the first screen at ${px}px.`, why: "A visitor who is ready cannot see what to do next.", fix: "Put the primary action (book, buy, contact) in the hero, visible without scrolling at this width.", gate: false, source: "measure" })
  } else {
    for (const c of ctas) {
      if (c.hooked || c.tag !== "a") continue
      if (!DEAD_HREF.test(c.href ?? "")) continue
      out.push({ ...at(c), severity: "critical", kind: "dead-cta", viewport, what: `The call to action "${(c.text ?? "").slice(0, 40)}" in the first screen goes nowhere (href "${c.href ?? ""}").`, why: "The main action of the page does nothing when clicked.", fix: "Link it to a real page, product, booking or form of this site (or a storefront hook); never '#'.", gate: true, source: "measure" })
    }
  }

  for (const p of m.placeholders) {
    out.push({ ...at(p), severity: "high", kind: "placeholder-copy", viewport, what: `Instructions to the creator are printed in the visitor's page: "${p.text}".`, why: "Visitors read it as an unfinished site.", fix: "Use real content from the store, or draw nothing when the slot is empty (an editable empty state belongs in the editor only).", gate: false, source: "measure" })
  }
  return out
}

/** The same fault at both widths said once (as "both"); the gates first. */
export function mergeDefects(list: Defect[]): Defect[] {
  const key = (d: Defect) => `${d.page}|${d.kind}|${d.sectionId ?? ""}|${d.selector ?? ""}|${d.kind === "contrast" || d.kind === "image-broken" || d.kind === "placeholder-copy" || d.kind === "empty-blocks" || d.kind === "image-slot-empty" ? d.what : ""}`
  const byKey = new Map<string, Defect>()
  for (const d of list) {
    const k = key(d)
    const have = byKey.get(k)
    if (!have) byKey.set(k, d)
    else if (have.viewport !== d.viewport) byKey.set(k, { ...have, viewport: "both", gate: have.gate || d.gate })
  }
  const rank = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...byKey.values()].sort((a, b) => Number(b.gate) - Number(a.gate) || rank[a.severity] - rank[b.severity])
}
