/**
 * The small labels a theme paints with a fill of their own (a cart or
 * wishlist count bubble, a sale or sold out badge, a "new" tag, a count
 * pill), each measured in the page: its own text against its own fill, as a
 * contrast ratio. Colours are read through a canvas, so oklch() and color()
 * values measure the same as rgb(). Answers
 * [{ ratio, text, el, fg, bg }, ...] for every one drawn.
 *
 * A string, because it runs in Chromium (page.evaluate), not here.
 */
export const BADGE_JS = String.raw`(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true })
  const px = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 } }
  const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const RE = /(badge|bubble|count|pill|tag|label|sold|sale|new|discount)/i
  const out = []
  for (const el of document.querySelectorAll("body *")) {
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className)
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim()
    if (!own || el.closest("script,style,noscript,template,svg")) continue
    let box = null
    for (let n = el, i = 0; n && i < 3; n = n.parentElement, i++) { const s = getComputedStyle(n); const c = px(s.backgroundColor); if (c.a > 0.85 && s.backgroundImage === "none") { box = { n, c }; break } if (s.backgroundImage !== "none") break }
    if (!box) continue
    const names = [el, box.n].map((n) => String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className) + " " + n.tagName).join(" ")
    if (!RE.test(names)) continue
    const r = box.n.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (r.width < 6 || r.height < 6 || r.width > 260 || r.height > 60 || cs.visibility === "hidden" || cs.display === "none") continue
    let hid = false; for (let n = el; n; n = n.parentElement) { const s = getComputedStyle(n); if (+s.opacity < 0.3 || s.display === "none" || s.visibility === "hidden") { hid = true; break } }
    if (hid || el.closest("[hidden],[aria-hidden='true'],.visually-hidden")) continue
    const fg = px(cs.color); if (fg.a < 0.3) continue
    const a = lum(fg), b = lum(box.c); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    out.push({ ratio: +ratio.toFixed(2), text: own.slice(0, 16), el: el.tagName.toLowerCase() + "." + String(cls).slice(0, 50), fg: cs.color, bg: getComputedStyle(box.n).backgroundColor })
  }
  return out
})()`
