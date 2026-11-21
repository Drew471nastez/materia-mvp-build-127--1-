/**
 * Words too close in colour to what is behind them, measured in the page:
 * each element's own text against the nearest plain background under it, as
 * a contrast ratio. Text over a picture (a background image, or a picture or
 * overlay laid across its box) is counted and left to the eye. Answers
 * { checked, overPicture, faint: ["2.8 \"Get the course\" a.button", ...] }
 * for everything under 3 to 1, the least a large or bold label needs.
 *
 * A string, because it runs in Chromium (page.evaluate), not here.
 */
export const FAINT_TEXT_JS = String.raw`(() => {
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] } }
  const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const out = []; let n0 = 0, pic = 0
  for (const el of document.querySelectorAll("body *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim()
    if (own.length < 2 || el.closest("script,style,noscript,template,svg,select,option")) continue
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (r.width < 4 || r.height < 4 || cs.visibility === "hidden" || cs.display === "none") continue
    if (el.closest("[hidden],[aria-hidden='true'],.visually-hidden,.sr-only")) continue
    const fg = rgb(cs.color); if (!fg || fg.a < 0.3) continue
    let bg = null, picture = false, hid = false
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (Number(s.opacity) < 0.5 || s.visibility === "hidden" || s.display === "none") { hid = true; break }
      if (s.backgroundImage !== "none") { picture = true; break }
      if ([...n.children].some((c) => { const k = getComputedStyle(c); return k.position === "absolute" && c !== el && !c.contains(el) && c.getBoundingClientRect().width >= n.getBoundingClientRect().width * 0.9 && c.getBoundingClientRect().height >= n.getBoundingClientRect().height * 0.9 && (c.matches("img,video,picture") || c.querySelector("img,video") || k.backgroundColor !== "rgba(0, 0, 0, 0)") })) { picture = true; break }
      const c = rgb(s.backgroundColor); if (c && c.a > 0.9) { bg = c; break }
    }
    if (hid) continue
    n0++
    if (picture) { pic++; continue }
    const back = bg || { r: 255, g: 255, b: 255 }
    const a = lum(fg), b = lum(back); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    if (ratio < 3.0) out.push(ratio.toFixed(1) + ' "' + own.slice(0, 30) + '" ' + el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40))
  }
  return { checked: n0, overPicture: pic, faint: [...new Set(out)].slice(0, 14) }
})()`
