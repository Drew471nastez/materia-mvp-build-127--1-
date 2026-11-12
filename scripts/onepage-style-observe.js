/*
 * Injected into every frame before the page runs (scripts/check-onepage-style-stability.mjs). Each animation frame
 * from the first one a box exists in, it reads what the browser is about to paint for every button, social icon and
 * product card on the page: the fill, the words, the border, the icon's colour. A box's first reading is its first
 * paint; anything that differs later, with no pointer on the page, is a flash.
 */
;(function () {
  if (window.__styleObs) return
  const SEL = ".op-btn, [data-product-cta], [data-op-social-icon], [data-email-form] button[type=submit], [data-onepage-contact] button[type=submit], [data-app-block] a, [data-app-block] button"
  const obs = { t0: performance.now(), frames: 0, boxes: new Map(), changes: [], stopped: false, seq: 0 }
  window.__styleObs = obs
  const key = (el) => {
    if (!el.__sk) {
      const block = el.closest("[data-op-block], [data-block-id]")
      const id = block ? block.getAttribute("data-op-block") || block.getAttribute("data-block-id") || "" : ""
      el.__sk = `${id}|${el.getAttribute("data-op-social-icon") || (el.hasAttribute("data-product-cta") ? "cta" : "")}|${el.tagName.toLowerCase()}|${obs.seq++}`
    }
    return el.__sk
  }
  const read = (el) => {
    const cs = getComputedStyle(el)
    const label = el.querySelector(".op-label") || el
    const ls = label === el ? cs : getComputedStyle(label)
    const svg = el.querySelector("svg")
    const ss = svg ? getComputedStyle(svg) : null
    const path = svg ? svg.querySelector("path") : null
    const ps = path ? getComputedStyle(path) : null
    return [cs.backgroundColor, cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 80), cs.color, cs.borderTopColor, ls.color, ls.webkitTextFillColor, ss ? ss.color : "", ps ? ps.fill : ""].join(" ; ")
  }
  /* Entrances: which ran, and any block seen whole that then went (a flash). */
  obs.anims = {}
  obs.flashes = []
  const seenWhole = new WeakSet()
  for (const type of ["animationstart", "animationend"])
    document.addEventListener(type, (e) => { const k = `${type}:${e.animationName}`; obs.anims[k] = (obs.anims[k] || 0) + 1 }, true)
  const tick = () => {
    if (obs.stopped) return
    obs.frames++
    for (const el of document.querySelectorAll("[data-op-block], [data-link-pair], [data-product-pair]")) {
      const r = el.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= innerHeight || r.width < 1) continue
      let o = 1
      for (let a = el; a && a !== document.body; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity)
      if (o >= 0.99) seenWhole.add(el)
      else if (o < 0.5 && seenWhole.has(el) && obs.flashes.length < 50) obs.flashes.push(`${el.getAttribute("data-op-block") || "pair"} at ${Math.round(performance.now() - obs.t0)}ms`)
    }
    const t = Math.round(performance.now() - obs.t0)
    for (const el of document.querySelectorAll(SEL)) {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const k = key(el)
      const v = read(el)
      const box = obs.boxes.get(k)
      if (!box) obs.boxes.set(k, { first: v, last: v, at: t, el })
      else if (box.last !== v) {
        if (!obs.paused) obs.changes.push({ k, t, from: box.last, to: v })
        box.last = v
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()
