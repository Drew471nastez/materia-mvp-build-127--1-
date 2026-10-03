/**
 * ===========================================================================
 *  A LINK TO A SECTION, MEASURED FRAME BY FRAME
 * ===========================================================================
 * "Clicking a link to a section on the same page scrolls smoothly, with an
 * easing that feels like big company sites, offset by the sticky header
 * height (measured, not hard coded), respects prefers-reduced-motion,
 * updates the URL hash without a jump."
 *
 * A real page (scripts/render-anchor-motion.tsx: the real ThemePage, a
 * sticky header, seven sections, a footer), served at "/". For each case the
 * scroll position is sampled on every animation frame from the click until
 * it has settled, and reported:
 *
 *   duration   first frame that moved to the last
 *   frames     how many frames that took, and the longest gap between two
 *   path       whether it ever went backwards, and the biggest single step
 *   landing    the section's top minus the header's bottom, after it settled
 *              (must be within 1px)
 *   address    the hash afterwards
 *
 * Cases: header links on a computer (down, further down, back up), the menu
 * drawer on a phone (closes, then scrolls), reduced motion, an address that
 * arrives with a hash, and the builder's canvas at both widths.
 *
 *   node scripts/check-anchor-scroll.mjs
 */
import { reporter, sleep, startProbe } from "./anchor-motion-probe.mjs"

const { check, finish } = reporter()
const probe = await startProbe()

const SAMPLER = `(() => {
  const sc = document.getElementById("wb-preview-root")
  const y = () => (sc ? sc.scrollTop : window.scrollY)
  window.__samples = [{ t: performance.now(), y: y() }]
  window.__sampling = true
  const tick = (ts) => { window.__samples.push({ t: ts, y: y() }); if (window.__sampling) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})()`

const LANDING = (anchor) => `(() => {
  const root = document.querySelector("[data-storelib-theme]")
  const header = root.querySelector(":scope > [data-section][data-chrome]")
  const target = root.querySelector('[data-anchor="${anchor}"]')
  const sc = document.getElementById("wb-preview-root")
  const hb = Math.max(header.getBoundingClientRect().bottom, sc ? sc.getBoundingClientRect().top : 0)
  return {
    error: +(target.getBoundingClientRect().top - hb).toFixed(2),
    headerBottom: +header.getBoundingClientRect().bottom.toFixed(1),
    hash: location.hash,
    y: sc ? sc.scrollTop : window.scrollY,
    /* The last section can sit lower than the header only because the page ends: nothing below it to scroll. */
    atEnd: (sc ? sc.scrollHeight - sc.clientHeight - sc.scrollTop : document.documentElement.scrollHeight - innerHeight - scrollY) <= 1,
    offsetVar: root.style.getPropertyValue("--sl-anchor-offset"),
  }
})()`

/** Sample from now until nothing has moved for `quiet` ms. */
async function measure(page, act, anchor, { quiet = 700, max = 4000 } = {}) {
  await page.evaluate(SAMPLER)
  const clickedAt = await page.evaluate(() => performance.now())
  await act()
  const t0 = Date.now()
  let last = -1
  let still = 0
  while (Date.now() - t0 < max) {
    await sleep(100)
    const n = await page.evaluate(() => { const s = window.__samples; return s[s.length - 1].y })
    still = n === last ? still + 100 : 0
    last = n
    if (still >= quiet) break
  }
  const samples = await page.evaluate(() => { window.__sampling = false; return window.__samples })
  /* The reveal on the section it landed on finishes before the landing is read. */
  await sleep(700)
  const landing = await page.evaluate(LANDING(anchor))
  const moves = []
  for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i].y - samples[i - 1].y) > 0.01) moves.push(i)
  if (!moves.length) return { moved: false, landing, frames: 0, duration: 0 }
  const first = moves[0]
  const lastMove = moves[moves.length - 1]
  const span = samples.slice(first - 1, lastMove + 1)
  const deltas = span.slice(1).map((s, i) => s.y - span[i].y)
  const gaps = span.slice(1).map((s, i) => s.t - span[i].t)
  const sign = Math.sign(deltas.find((d) => d !== 0) ?? 0)
  return {
    moved: true,
    landing,
    startDelay: Math.round(samples[first - 1].t - clickedAt),
    duration: Math.round(samples[lastMove].t - samples[first - 1].t),
    frames: lastMove - first + 1,
    longestGap: Math.round(Math.max(...gaps)),
    biggestStep: Math.round(Math.max(...deltas.map(Math.abs))),
    backwards: deltas.some((d) => Math.sign(d) === -sign && Math.abs(d) > 0.5),
    distance: Math.round(span[span.length - 1].y - span[0].y),
    /* Gentle at both ends: the first and last steps are small next to the biggest. */
    easeIn: Math.round(Math.abs(deltas[0])),
    easeOut: Math.round(Math.abs(deltas[deltas.length - 1])),
  }
}

const show = (r) => r.moved
  ? `${r.distance}px in ${r.duration}ms, ${r.frames} frames, longest gap ${r.longestGap}ms, steps ${r.easeIn}/${r.biggestStep}/${r.easeOut}px, landing ${r.landing.error}px, hash ${r.landing.hash}`
  : `did not move, landing ${r.landing.error}px, hash ${r.landing.hash}`

const clickLink = (page, selector) => async () => {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 5000 })
  await el.click()
}

// ── A computer: the header's links ──────────────────────────────────────────
console.log("\nA computer, 1280 x 800: the header's links")
{
  const page = await probe.open("/", { width: 1280, height: 800 })
  const offset = await page.evaluate(LANDING("section-pricing"))
  check("the header's height is measured onto the page root", offset.offsetVar === `${Math.round(offset.headerBottom)}px`, `--sl-anchor-offset ${offset.offsetVar}, header bottom ${offset.headerBottom}px`)

  const header = '[data-storelib-theme] > [data-section][data-chrome]'
  const a = await measure(page, clickLink(page, `${header} a[href="/#pricing"]`), "section-pricing")
  console.log(`        "/#pricing" (saved with id pricing): ${show(a)}`)
  check('"/#pricing" scrolls down to the section saved as pricing', a.moved && a.distance > 300)
  check("and lands under the header, within 1px", Math.abs(a.landing.error) <= 1, `${a.landing.error}px`)
  check("on the frame clock, never backwards", a.moved && !a.backwards && a.longestGap < 40, `longest gap ${a.longestGap}ms`)
  check("eased: it starts and ends gently", a.moved && a.easeIn < a.biggestStep / 2 && a.easeOut < a.biggestStep / 2, `${a.easeIn}/${a.biggestStep}/${a.easeOut}px`)
  check("in the time a big site takes, under a second", a.duration >= 300 && a.duration <= 1100, `${a.duration}ms`)
  check("the address says #pricing, and the page did not reload", a.landing.hash === "#pricing" && (await page.evaluate(() => window.__ready === true)))

  const b = await measure(page, clickLink(page, `${header} a[href="/#section-faq-x1"]`), "section-faq-x1")
  console.log(`        "/#section-faq-x1" (what the picker stores): ${show(b)}`)
  check("a picked section link lands within 1px", b.moved && Math.abs(b.landing.error) <= 1, `${b.landing.error}px`)

  const c = await measure(page, clickLink(page, `${header} a[href="#cta"]`), "section-cta-z9")
  console.log(`        "#cta" (by the section's type): ${show(c)}`)
  check("a custom anchor finds its section by type, and lands within 1px or at the end of the page",
    c.moved && (Math.abs(c.landing.error) <= 1 || (c.landing.atEnd && c.landing.error > 0)), `${c.landing.error}px${c.landing.atEnd ? ", page end" : ""}`)

  const d = await measure(page, clickLink(page, `${header} a[href="/#pricing"]`), "section-pricing")
  console.log(`        back up to "/#pricing": ${show(d)}`)
  check("back up lands within 1px too", d.moved && d.distance < 0 && Math.abs(d.landing.error) <= 1, `${d.landing.error}px`)
  await page.close()
}

// ── A phone: the menu drawer ────────────────────────────────────────────────
console.log("\nA phone, 390 x 844: the menu drawer closes, then the page scrolls")
{
  const page = await probe.open("/", { width: 390, height: 844, phone: true })
  await (await page.waitForSelector('button[aria-label="Open menu"]', { visible: true })).click()
  await sleep(500)
  const r = await measure(page, clickLink(page, '[role="dialog"][aria-label="Menu"] a[href="/#pricing"]'), "section-pricing", { quiet: 800 })
  const drawerOpen = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Menu"]')?.getAttribute("aria-hidden") !== "true")
  console.log(`        drawer "Pricing": starts ${r.startDelay}ms after the tap, ${show(r)}`)
  check("the drawer is closed", !drawerOpen)
  check("the scroll starts after the drawer has gone (its close is 260ms)", r.moved && r.startDelay >= 240, `${r.startDelay}ms`)
  check("and lands under the header within 1px", r.moved && Math.abs(r.landing.error) <= 1, `${r.landing.error}px`)
  check("smoothly, never backwards", r.moved && !r.backwards && r.frames > 10, `${r.frames} frames`)
  check("with the address updated", r.landing.hash === "#pricing")
  await page.close()
}

// ── Reduced motion ──────────────────────────────────────────────────────────
console.log("\nReduced motion: the same landing, no travel")
{
  const page = await probe.open("/", { width: 1280, height: 800, reduced: true })
  const r = await measure(page, clickLink(page, '[data-storelib-theme] > [data-section][data-chrome] a[href="/#section-faq-x1"]'), "section-faq-x1")
  console.log(`        ${show(r)}`)
  check("one jump, no animation", r.moved && r.frames <= 2, `${r.frames} frames`)
  check("landing within 1px", Math.abs(r.landing.error) <= 1, `${r.landing.error}px`)
  await page.close()
}

// ── An address with a hash ──────────────────────────────────────────────────
console.log("\nAn address that arrives with a hash lands on its section")
for (const [w, h, phone] of [[1280, 800, false], [390, 844, true]]) {
  const page = await probe.open("/#pricing", { width: w, height: h, phone })
  await sleep(900)
  const l = await page.evaluate(LANDING("section-pricing"))
  console.log(`        ${w}px: scrolled to ${Math.round(l.y)}px, landing ${l.error}px`)
  check(`${w}px: "/#pricing" on arrival lands within 1px`, l.y > 200 && Math.abs(l.error) <= 1, `${l.error}px`)
  await page.close()
}

// ── The builder's canvas ────────────────────────────────────────────────────
console.log("\nThe builder's canvas: the same scroll inside the card")
for (const [w, h] of [[1000, 700], [390, 700]]) {
  const page = await probe.open(`/?mode=canvas&w=${w}&h=${h}`, { width: w + 80, height: h + 80 })
  const r = await measure(page, () => page.evaluate(() => window.__scrollToHash("#section-faq-x1")), "section-faq-x1")
  console.log(`        ${w}px card: ${show(r)}`)
  check(`${w}px card: scrolls the card, not the window`, r.moved && (await page.evaluate(() => window.scrollY)) === 0)
  check(`${w}px card: lands under the canvas header within 1px`, Math.abs(r.landing.error) <= 1, `${r.landing.error}px`)
  check(`${w}px card: the same curve, never backwards`, r.moved && !r.backwards && r.easeIn < r.biggestStep / 2)
  check(`${w}px card: the canvas has no address to change`, r.landing.hash === "")
  await page.close()
}

await probe.close()
finish()
