/**
 * ===========================================================================
 *  WHAT A SWEEP LOOKS FOR ON ANY PAGE, AT ANY WIDTH
 * ===========================================================================
 * Shared by scripts/check-buyer-sweep.mjs (the live pages) and any probe
 * that wants the same generic read of a rendered screen. `measure` runs in
 * the page and answers, for the width it is at:
 *
 *   overflow   the document wider than the window, and which visible
 *              elements stick out past the right edge (a sideways scroller
 *              of their own, a sheet parked off screen and anything hidden
 *              are not counted)
 *   small      on a phone, visible controls under 36px tall (a link inside
 *              a sentence, or in a footer's list, is text, not a control,
 *              and is not counted)
 *   clipped    text cut off without an ellipsis or a line clamp saying so
 *   covered    controls sitting under a fixed bar at the bottom of the
 *              screen once the page is scrolled to its end
 *   copy       em dashes and the owner's banned words in the visible text
 *
 * It only reports. The probe decides what is a defect.
 */
export const MEASURE = `(() => {
  const W = innerWidth
  const phone = W < 640
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) return false
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false
      if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert")) return false
    }
    return true
  }
  const scrollsSideways = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return true
      if (cs.position === "fixed" && n.getBoundingClientRect().left >= W - 1) return true
    }
    return false
  }
  const label = (el) => {
    const id = el.id ? "#" + el.id : ""
    const data = [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => "[" + a.name + "]").slice(0, 2).join("")
    const text = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40)
    return el.tagName.toLowerCase() + id + data + (text ? ' "' + text + '"' : "")
  }
  const all = [...document.querySelectorAll("body *")]
  const overflow = document.documentElement.scrollWidth - W
  const sticking = []
  for (const el of all) {
    if (sticking.length > 6) break
    const r = el.getBoundingClientRect()
    if (r.right > W + 1 && r.width > 0 && visible(el) && !scrollsSideways(el)) {
      const parent = el.parentElement && el.parentElement.getBoundingClientRect()
      if (parent && parent.right > W + 1 && sticking.some((s) => s.el === el.parentElement)) continue
      sticking.push({ el, what: label(el), right: Math.round(r.right) })
    }
  }
  const controls = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox]")].filter(visible)
  const small = phone
    ? controls
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.height >= 35.5) return false
          if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, span, label, h1, h2, h3, h4, dd, td, figcaption")) return false
          if (el.tagName === "INPUT" && /^(checkbox|radio)$/.test(el.type)) return false
          /* A footer's list of text links is text, spaced as the footer's own rules have it. */
          if (el.closest("footer")) return false
          return true
        })
        .map((el) => label(el) + " " + Math.round(el.getBoundingClientRect().height) + "px")
    : []
  const clipped = all
    .filter((el) => {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false
      const cs = getComputedStyle(el)
      if (!/(hidden|clip)/.test(cs.overflowX) || cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") return false
      return el.scrollWidth > el.clientWidth + 2 && visible(el)
    })
    .slice(0, 6)
    .map(label)
  const bars = all.filter((el) => { const cs = getComputedStyle(el); if (cs.position !== "fixed") return false; const r = el.getBoundingClientRect(); return r.bottom >= innerHeight - 2 && r.top > innerHeight * 0.6 && r.width > W * 0.6 && visible(el) })
  const text = document.body.innerText || ""
  const banned = (text.match(/\\b(unlock\\w*|elevate\\w*|seamless\\w*|powerful\\w*|effortless\\w*|supercharge\\w*|transform\\w*)\\b/gi) || []).slice(0, 5)
  const dashes = (text.match(/.{0,24}\\u2014.{0,24}/g) || []).slice(0, 5)
  return { width: W, overflow, sticking: sticking.map((s) => s.what + " right=" + s.right), small: [...new Set(small)].slice(0, 12), clipped, bars: bars.map(label).slice(0, 3), barTop: bars.length ? Math.round(Math.min(...bars.map((b) => b.getBoundingClientRect().top))) : null, banned, dashes }
})()`

/** At the end of the page: controls that are under a fixed bottom bar. */
/** The cookie notice answered first, so its bar is not read as the page's own. */
export const ANSWER_COOKIES = `(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^(reject all|only necessary|necessary only|accept all|decline|got it)$/i.test((x.textContent || "").trim()))
  if (b) b.click()
  return !!b
})()`

export const COVERED = `(() => {
  scrollTo(0, document.documentElement.scrollHeight)
  const bars = [...document.querySelectorAll("body *")].filter((el) => { const cs = getComputedStyle(el); if (cs.position !== "fixed" || cs.visibility === "hidden" || cs.display === "none") return false; const r = el.getBoundingClientRect(); return r.bottom >= innerHeight - 2 && r.top > innerHeight * 0.6 && r.width > innerWidth * 0.6 })
  if (!bars.length) return []
  const top = Math.min(...bars.map((b) => b.getBoundingClientRect().top))
  return [...document.querySelectorAll("button, a[href], input, select, textarea")]
    .filter((el) => !bars.some((b) => b.contains(el)) && !el.closest("[data-app-sheet], [role=dialog]"))
    .filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.height > 0 && r.bottom > top + 2 && r.top < innerHeight && cs.visibility !== "hidden" && cs.display !== "none" })
    .slice(0, 6)
    .map((el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40))
})()`

/** The six widths the owner reviews at. */
export const SWEEP_WIDTHS = [360, 390, 430, 768, 1024, 1280]
export const sweepViewport = (w) => (w < 768 ? { width: w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: w, height: w >= 1024 ? 900 : 1024, deviceScaleFactor: 1 })

/**
 * Every screen at every width, read with MEASURE and COVERED. `open(name, viewport)`
 * answers a puppeteer page with the screen on it (and its `errors`, when the
 * probe collects them). Answers the problems as lines, empty when there are none.
 */
export async function sweepScreens(screens, open, { shots, allowSmall = () => false } = {}) {
  const problems = []
  for (const name of screens) {
    for (const w of SWEEP_WIDTHS) {
      const page = await open(name, sweepViewport(w))
      await new Promise((r) => setTimeout(r, 250))
      const m = await page.evaluate(MEASURE)
      const covered = await page.evaluate(COVERED)
      if (shots) await page.screenshot({ path: `${shots}/sweep-${name}-${w}.png`, fullPage: true }).catch(() => {})
      const at = `${name} @${w}`
      if (m.overflow > 0) problems.push(`${at}: ${m.overflow}px wider than the window (${m.sticking.join("; ")})`)
      const small = m.small.filter((s) => !allowSmall(s))
      if (small.length) problems.push(`${at}: controls under 36px: ${small.join("; ")}`)
      if (m.clipped.length) problems.push(`${at}: text cut off: ${m.clipped.join("; ")}`)
      if (covered.length) problems.push(`${at}: under a fixed bottom bar at the end of the page: ${covered.join("; ")}`)
      if (m.banned.length) problems.push(`${at}: banned words: ${m.banned.join(", ")}`)
      if (m.dashes.length) problems.push(`${at}: em dashes: ${m.dashes.join(" | ")}`)
      if (page.errors?.length) problems.push(`${at}: page errors: ${page.errors.join(" | ")}`)
      await page.close()
    }
  }
  return problems
}
