/**
 * Round AR5: what a probe runs inside the page to read every visible text
 * node's contrast against what is really painted under it. Shared by
 * scripts/check-onepage-contrast-ar5.mjs and check-onepage-settings-ar5.mjs.
 *
 * Under each text node it asks the browser for the stack of elements at the
 * middle of the words (document.elementsFromPoint, with pointer events
 * turned on for everything while it measures), and lays their backgrounds
 * one over the other from the words down until one is opaque. A colour of
 * any kind (rgb, color-mix, oklab) is read by painting it into a 1x1 canvas.
 * A gradient counts as each of its colours (the words must read on all of
 * them). A photo or video that is not the wallpaper puts the words "on a
 * photo": counted, not measured, because no rule can read a picture. The
 * wallpaper's own photo or video is measured as the colour the theme names
 * for it, which is what lib/onepage/contrast assumes too; the report says so.
 */
export const MEASURE = String.raw`(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const cache = new Map()
  const rgba = (str) => {
    if (cache.has(str)) return cache.get(str)
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgba(0,0,0,0)"; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    const v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
    cache.set(str, v); return v
  }
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 })
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  const L = (c) => 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const hex = (c) => "#" + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")
  const COLOR_RE = /rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]{3,8}\b/gi
  const pe = document.createElement("style"); pe.textContent = "*{pointer-events:auto!important}"; document.head.appendChild(pe)
  const shown = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false
    }
    return true
  }
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  const out = { checked: 0, onPhoto: 0, fails: [], worst: 21 }
  const walker = document.createTreeWalker(document.getElementById("app"), NodeFilter.SHOW_TEXT)
  const seen = new Set()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim()
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue
    const el = n.parentElement
    if (!el || el.closest("svg, script, style, [aria-hidden=true] [data-skip-contrast], iframe, noscript, [data-op-qr]")) continue
    const range = document.createRange(); range.selectNodeContents(n)
    const rect = [...range.getClientRects()].find((r) => r.width > 1 && r.height > 1)
    if (!rect || !shown(el)) continue
    if (rect.right < 0 || rect.left > innerWidth || rect.bottom < 0) continue
    const s = getComputedStyle(el)
    if (s.color === "transparent" || el.closest("input, textarea")) continue
    const key = el
    if (seen.has(key)) continue
    seen.add(key)
    const x = Math.min(innerWidth - 1, Math.max(0, rect.left + Math.min(rect.width / 2, 24)))
    const y = rect.top + rect.height / 2
    const stack = document.elementsFromPoint(x, y)
    const layers = []
    let photo = false
    let grounds = null
    for (const e of stack) {
      if (e === document.documentElement || e === document.body) continue
      const es = getComputedStyle(e)
      if (e.tagName === "IMG" || e.tagName === "VIDEO" || e.tagName === "CANVAS" || e.tagName === "IFRAME" || (/url\(/.test(es.backgroundImage) && !e.hasAttribute("data-wallpaper-pattern") && !e.hasAttribute("data-wallpaper-noise"))) {
        /* The wallpaper's own photo or video: measured as the colour the theme names under it (the page box below). */
        if (e.closest("[data-wallpaper-photo], [data-wallpaper-video], [data-wallpaper-still]")) continue
        if (e.contains(el)) { /* a picture behind its own words, as a background of an ancestor */ }
        photo = true; break
      }
      if (e.closest("[data-wallpaper-pattern], [data-wallpaper-noise], [data-wallpaper-effect], [data-wallpaper-drift]")) continue
      const grad = /gradient\(/.test(es.backgroundImage) ? es.backgroundImage.match(COLOR_RE) : null
      const bg = rgba(es.backgroundColor)
      const eo = Number(es.opacity)
      if (grad && grad.length) {
        grounds = grad.map((c) => { const g = rgba(c); return g.a < 1 && bg.a > 0 ? over(g, { ...bg, a: 1 }) : g })
        if (grounds.every((g) => g.a >= 0.99)) break
      }
      if (bg.a > 0) {
        layers.push({ ...bg, a: bg.a * (eo < 1 ? eo : 1) })
        if (bg.a >= 0.99 && eo >= 0.99) break
      }
    }
    if (photo) { out.onPhoto++; continue }
    let bases = (grounds || [{ r: 255, g: 255, b: 255, a: 1 }]).map((g) => (g.a < 1 ? over(g, { r: 255, g: 255, b: 255, a: 1 }) : g))
    for (let i = layers.length - 1; i >= 0; i--) bases = bases.map((b) => over(layers[i], b))
    let ink = rgba(s.color)
    const o = opacityOf(el)
    if (o < 1) ink = { ...ink, a: ink.a * o }
    const size = parseFloat(s.fontSize)
    const bold = Number(s.fontWeight) >= 700
    const large = size >= 24 || (size >= 18.66 && bold)
    const min = large ? 3 : 4.5
    const worst = Math.min(...bases.map((b) => ratio(ink.a < 1 ? over(ink, b) : ink, b)))
    out.checked++
    out.worst = Math.min(out.worst, worst)
    if (worst < min - 0.005) {
      const block = el.closest("[data-block-id], [data-op-block], [data-onepage-block]")
      out.fails.push({ text: text.slice(0, 40), ratio: Math.round(worst * 100) / 100, min, ink: hex(ink.a < 1 ? over(ink, bases[0]) : ink), ground: hex(bases[0]), block: block ? (block.getAttribute("data-block-id") || block.getAttribute("data-op-block") || block.getAttribute("data-onepage-block")) : el.className.toString().slice(0, 60) })
    }
  }
  pe.remove()
  out.worst = Math.round(out.worst * 100) / 100
  return out
})()`
