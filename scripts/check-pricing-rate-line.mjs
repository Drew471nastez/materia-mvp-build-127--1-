/**
 * ===========================================================================
 *  THE CARD RATE LINE AND ITS INFO CIRCLE, MEASURED
 * ===========================================================================
 * Pricing tooltip round, the owner: the rate line is one row that starts
 * with the plan's lowest rate ("Rates from 3% + $0.25"), and a small
 * info circle right after it opens the rates by kind, digital first
 * (components/marketing/pricing-lines, components/billing/plan-cards,
 * components/billing/card-rates-tip). What that claims about the page is
 * measured here:
 *
 *   - every card has exactly six lines, as before, and no second row
 *   - the rate line is one row at 390 and 1280 on every card, the circle
 *     on that same row; at 768 (three narrow cards, where every line wraps)
 *     it breaks only before the rate, the rate whole with the circle, never
 *     a circle alone on a row
 *   - the price never breaks over two rows, nothing runs past the card or
 *     the window
 *   - the circle's press area is at least 24px (44px on a touch screen)
 *   - the tip opens on hover (where a mouse hovers), on keyboard focus and
 *     on a click or tap; a second click, Escape, a press outside and a
 *     scroll away close it; a click on it never picks the plan in the
 *     onboarding
 *   - open, it is inside the window (and the card's column where the card
 *     is in view), its text reaches 4.5:1, and nothing on the page moves
 *   - it fades and rises over 150 to 180ms, and not under reduced motion
 *
 * At 390, 768 and 1280, on the marketing section (home and /pricing), the
 * onboarding step (its dark film, inside a dialog) and the upgrade page.
 * Screenshots go to $SHOTS when it is set, the open tip among them.
 *
 *   PROBE_CSS=source SHOTS=/some/dir node scripts/check-pricing-rate-line.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".rate-line-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/pricing"
export const useSearchParams = () => new URLSearchParams()
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, ...rest }) {
  return React.createElement("a", { href, ...rest }, children)
}
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, quality, placeholder, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest })
}
`)
writeFileSync(join(dir, "dynamic.jsx"), `export default function dynamic() { return function Nothing() { return null } }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-pricing-rate-line.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:next/dynamic=${join(dir, "dynamic.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", "--loader:.webp=dataurl", "--loader:.jpg=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const faces = interFaces(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${await appCss(root)}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
console.log(faces ? "Font: Inter from the production build." : "Font: no production build here; Inter is read from the machine's own fonts when it has them (the stylesheet names \"Inter\" first).")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/* The tip closes once its circle has moved more than 24px under it (components/billing/card-rates-tip SCROLL_AWAY). */
const SCROLL_AWAY_MIN = 40

/* What the motion is, read before the probe turns transitions off, with and without reduced motion. */
for (const reduce of [false, true]) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.goto(`${base}/?surface=marketing`)
  await page.waitForSelector("[data-card-rates-tip]", { timeout: 15_000 }).catch(() => {})
  const t = await page.evaluate(() => {
    const box = document.querySelector("[data-card-rates-tip] .crt-box")
    if (!box) return null
    const cs = getComputedStyle(box)
    return { props: cs.transitionProperty, dur: cs.transitionDuration, translate: cs.translate }
  })
  if (!t) problems.push(`motion${reduce ? " (reduced)" : ""}: no tip in the page`)
  else {
    const durs = t.dur.split(",").map((d) => parseFloat(d) * 1000)
    console.log(`motion${reduce ? " (reduced)" : ""}: ${t.props} over ${t.dur}, closed at translate ${t.translate}`)
    if (!reduce && (!/opacity/.test(t.props) || !/translate/.test(t.props) || durs.some((d) => d < 150 || d > 180))) problems.push(`motion: ${t.props} ${t.dur}, expected opacity and translate at 150 to 180ms`)
    if (reduce && durs.some((d) => d > 0)) problems.push(`motion (reduced): still ${t.dur}`)
  }
  await page.close()
}

for (const surface of ["marketing", "onboarding", "upgrade"]) {
  for (const width of [390, 768, 1280]) {
    const touch = width < 500
    const page = await browser.newPage()
    await page.setViewport({ width, height: touch ? 844 : 1000, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    /*
      Headless Chromium reports no pointer at all ((pointer: none), (hover: none)) and cannot be told otherwise,
      so on the desktop widths the probe answers the circle's own question, "(hover: hover) and (pointer: fine)",
      as a mouse would. The phone widths keep the touch screen's coarse pointer.
    */
    if (!touch) {
      await page.evaluateOnNewDocument(() => {
        const real = window.matchMedia.bind(window)
        window.matchMedia = (q) => (/\(hover: ?hover\)/.test(q) || /\(pointer: ?fine\)/.test(q) ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } : real(q))
      })
    }
    await page.goto(`${base}/?surface=${surface}`)
    await page.waitForSelector("[data-plan-line='rate']", { timeout: 15_000 }).catch(() => {})
    /* The cards scroll in: bring each into view, then let them settle. */
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}" })
    for (let y = 0; y < 4000; y += 400) await page.evaluate((top) => { scrollTo(0, top); document.querySelector(".app-content-scroll")?.scrollTo(0, top) }, y)
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".app-content-scroll")?.scrollTo(0, 0) })
    await wait(600)
    const m = await page.evaluate(() => {
      /*
        The rows the visible text under an element sits on: each text node's own glyph boxes, grouped by their
        middle, with the info circle counted on the row it sits on. With how full the last row is against the
        widest, for a lone word.
      */
      const textRows = (el) => {
        const rects = []
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.parentElement.closest(".sr-only, [aria-hidden='true'], [data-morph='off']")) continue
          if (!n.textContent.trim() || n.textContent === "​") continue
          const r = document.createRange()
          r.selectNodeContents(n)
          rects.push(...[...r.getClientRects()].filter((x) => x.width > 0.5))
        }
        const rows = []
        for (const r of rects.sort((a, b) => a.top - b.top)) {
          const mid = (r.top + r.bottom) / 2
          const row = rows.find((w) => Math.abs(w.mid - mid) < r.height / 2)
          if (row) row.width += r.width
          else rows.push({ mid, top: r.top, width: r.width, height: r.height })
        }
        const widest = Math.max(0, ...rows.map((w) => w.width))
        const last = rows[rows.length - 1]
        return { rows, orphan: rows.length > 1 && last.width < widest * 0.3 }
      }
      return [...document.querySelectorAll("[data-plan-card]")].map((card) => {
        const cr = card.getBoundingClientRect()
        const lineCount = card.querySelectorAll("[data-plan-line]").length
        const li = card.querySelector("[data-plan-line='rate']")
        const span = li.querySelector(":scope > span")
        const main = textRows(span)
        /* How wide the whole line is on one row, against the room the card gives it. */
        const ghost = span.cloneNode(true)
        ghost.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;width:auto"
        span.parentElement.appendChild(ghost)
        const natural = Math.ceil(ghost.getBoundingClientRect().width)
        ghost.remove()
        const room = Math.floor(li.getBoundingClientRect().right - span.getBoundingClientRect().left)
        /* The whole rate ("1.5% + $0.25") on the last row, with the circle. */
        const rateRun = li.querySelector("[data-plan-info]")?.parentElement
        const rateRows = rateRun ? textRows(rateRun).rows : []
        const btn = li.querySelector("[data-plan-info]")
        const b = btn?.getBoundingClientRect()
        const last = main.rows[main.rows.length - 1]
        const lr = li.getBoundingClientRect()
        const price = card.querySelector("[data-plan-price] > span")
        return {
          text: li.textContent.replace(/\s+/g, " ").trim(),
          lineCount,
          rows: main.rows.length,
          natural, room,
          rateWholeOnLastRow: rateRows.length === 1 && !!last && Math.abs(rateRows[0].mid - last.mid) < last.height / 2,
          orphan: main.orphan,
          hasCircle: !!btn,
          circleSize: b ? Math.round(b.width) : 0,
          circleOnLastRow: b && last ? Math.abs((b.top + b.bottom) / 2 - last.mid) < last.height / 2 : false,
          circleAlone: b && last ? b.left < (main.rows.length > 1 ? 0 : -1) || (main.rows.length > 1 && last.width < 1) : false,
          secondRow: !!li.querySelector("[data-plan-line-detail]"),
          priceRows: price ? textRows(price).rows.length : 0,
          lineRight: Math.round(lr.right), cardRight: Math.round(cr.right),
          circleRight: b ? Math.round(b.right) : 0,
        }
      })
    })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const label = `${surface} @${width}`
    if (errors.length) problems.push(`${label}: page errors ${errors.join(" | ")}`)
    if (m.length !== 3) problems.push(`${label}: ${m.length} cards, expected 3`)
    if (overflow > 0) problems.push(`${label}: the page is ${overflow}px wider than the window`)
    for (const c of m) {
      const where = `${label} ${c.text.slice(0, 36)}`
      if (c.lineCount !== 6) problems.push(`${where}: ${c.lineCount} lines, expected 6`)
      if (c.secondRow) problems.push(`${where}: a second row under the rate is back`)
      /*
        One row at 390 and 1280 on every card. At 768, three narrow cards side by side where every line on the
        card wraps, a clean break before the rate is allowed: the rate whole on the last row with the circle.
      */
      if (width !== 768 && c.rows !== 1) problems.push(`${where}: the rate line is ${c.rows} rows at ${width}, expected 1`)
      if (!c.rateWholeOnLastRow) problems.push(`${where}: the rate is not whole on the last row with the circle`)
      if (c.orphan) problems.push(`${where}: a lone word on the last row`)
      if (!c.hasCircle) problems.push(`${where}: no info circle`)
      else if (!c.circleOnLastRow) problems.push(`${where}: the info circle is not on the rate's row`)
      if (c.priceRows !== 1) problems.push(`${where}: the price breaks over ${c.priceRows} rows`)
      if (c.lineRight > c.cardRight || c.circleRight > c.cardRight) problems.push(`${where}: runs past the card`)
      console.log(`${label.padEnd(18)} ${c.text.padEnd(40)} ${c.rows} row${c.rows > 1 ? "s" : ""} (${c.natural}px in ${c.room}px), circle ${c.circleSize}px ${c.circleOnLastRow ? "on the same row" : "NOT on the row"}, price ${c.priceRows} row`)
    }
    if (SHOTS) {
      const grid = await page.$("[data-plan-cards]")
      if (grid) await grid.screenshot({ path: join(SHOTS, `${surface}-${width}.png`) })
    }

    /* ---------------------------------------------------------------- the circle and its tip, card by card */
    const cardIds = await page.$$eval("[data-plan-card]", (cs) => cs.map((c) => c.getAttribute("data-plan-card")))
    for (const id of cardIds) {
      const where = `${label} ${id}`
      const sel = `[data-plan-card='${id}'] [data-plan-info]`
      /* Bring the rate line to the middle of the window (and its card into the rail's view on a phone). */
      await page.evaluate((s) => {
        const b = document.querySelector(s)
        b.closest("[data-plan-slot]")?.scrollIntoView({ block: "nearest", inline: "start" })
        b.scrollIntoView({ block: "center", inline: "nearest" })
      }, sel)
      await wait(150)
      const state = () => page.evaluate((s) => {
        const b = document.querySelector(s)
        const t = document.getElementById(b.getAttribute("aria-controls") ?? "")
        return { expanded: b.getAttribute("aria-expanded"), open: !!t && t.hasAttribute("data-open") && getComputedStyle(t).visibility === "visible" }
      }, sel)
      const layout = () => page.evaluate(() => [...document.querySelectorAll("[data-plan-card], [data-plan-line]")].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(",") }).join("|"))

      /* The press area: the button answers 12px from its middle on every side (22px on a touch screen). */
      const hit = await page.evaluate((s, reach) => {
        const b = document.querySelector(s)
        const r = b.getBoundingClientRect()
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        const at = (dx, dy) => document.elementFromPoint(cx + dx, cy + dy)?.closest("[data-plan-info]") === b
        const ok = (d) => [[d, 0], [-d, 0], [0, d], [0, -d]].every(([x, y]) => at(x, y))
        return { ok24: ok(11.5), okTouch: ok(reach), coarse: matchMedia("(pointer: coarse)").matches, labelled: b.getAttribute("aria-label"), describedBy: !!document.getElementById(b.getAttribute("aria-describedby") ?? "") }
      }, sel, 21.5)
      if (!hit.ok24) problems.push(`${where}: the circle's press area is under 24px`)
      if (touch && hit.coarse && !hit.okTouch) problems.push(`${where}: the circle's press area is under 44px on touch`)
      if (hit.labelled !== "Card rates by product type") problems.push(`${where}: aria-label is "${hit.labelled}"`)
      if (!hit.describedBy) problems.push(`${where}: aria-describedby names no element`)

      const before = await layout()
      const pickedBefore = await page.evaluate(() => window.picked ?? 0)

      /* Hover, where a mouse hovers. */
      if (!touch) {
        await page.hover(sel)
        await wait(80)
        if (!(await state()).open) problems.push(`${where}: hover does not open it`)
        await page.mouse.move(2, 2)
        await wait(260)
        if ((await state()).open) problems.push(`${where}: it stays open after the pointer leaves`)
      }

      /* Keyboard focus. */
      await page.evaluate((s) => document.querySelector(s).blur(), sel)
      await page.keyboard.press("Shift")
      await page.evaluate((s) => document.querySelector(s).focus(), sel)
      await wait(60)
      const focusOpen = (await state()).open
      if (!focusOpen) problems.push(`${where}: keyboard focus does not open it`)
      await page.keyboard.press("Escape")
      await wait(60)
      if ((await state()).open) problems.push(`${where}: Escape does not close it (after focus)`)
      await page.evaluate((s) => document.querySelector(s).blur(), sel)

      /* A click or a tap opens it; measure it open. */
      const press = async () => { if (touch) await page.tap(sel); else await page.click(sel) }
      await press()
      await wait(80)
      const s1 = await state()
      if (!s1.open || s1.expanded !== "true") problems.push(`${where}: a ${touch ? "tap" : "click"} does not open it (open ${s1.open}, aria-expanded ${s1.expanded})`)
      const after = await layout()
      if (after !== before) problems.push(`${where}: the page moved when it opened`)
      const open = await page.evaluate((s) => {
        const b = document.querySelector(s)
        const t = document.getElementById(b.getAttribute("aria-controls"))
        const r = t.getBoundingClientRect()
        const card = b.closest("[data-plan-card]").getBoundingClientRect()
        const vw = document.documentElement.clientWidth
        const lum = (c) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const bg = lum(getComputedStyle(t.querySelector(".crt-box")).backgroundColor)
        const contrast = [...t.querySelectorAll("dt, dd, p")].map((e) => {
          const fg = lum(getComputedStyle(e).color)
          return { text: e.textContent, ratio: (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05), size: parseFloat(getComputedStyle(e).fontSize), nums: getComputedStyle(e).fontVariantNumeric }
        })
        const cardInView = card.left >= 0 && card.right <= vw
        return {
          role: t.getAttribute("role"),
          text: t.innerText.replace(/\s+/g, " ").trim(),
          rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) },
          inViewport: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= innerHeight,
          inColumn: !cardInView || (r.left >= card.left - 0.5 && r.right <= card.right + 0.5),
          side: t.dataset.side,
          contrast,
          opacity: getComputedStyle(t.querySelector(".crt-box")).opacity,
        }
      }, sel)
      if (open.role !== "tooltip") problems.push(`${where}: role is ${open.role}`)
      if (!open.inViewport) problems.push(`${where}: the tip leaves the window ${JSON.stringify(open.rect)}`)
      if (!open.inColumn) problems.push(`${where}: the tip leaves the card's column ${JSON.stringify(open.rect)}`)
      for (const c of open.contrast) if (c.ratio < 4.5) problems.push(`${where}: "${c.text}" is ${c.ratio.toFixed(2)}:1`)
      if (!open.contrast.filter((c) => /\d%/.test(c.text)).every((c) => /tabular-nums/.test(c.nums))) problems.push(`${where}: the rates are not in tabular figures`)
      console.log(`  ${id.padEnd(7)} open ${open.side} ${open.rect.width}px at ${open.rect.left}..${open.rect.right}: "${open.text}" lowest contrast ${Math.min(...open.contrast.map((c) => c.ratio)).toFixed(2)}:1, press area ${hit.ok24 ? "24px ok" : "UNDER 24px"}${touch ? `, touch ${hit.coarse ? (hit.okTouch ? "44px ok" : "UNDER 44px") : "(no coarse pointer)"}` : ""}`)
      if (SHOTS && (id === "growth" || (surface === "onboarding" && id === "free")) && (width === 390 || width === 1280 || surface === "onboarding")) {
        await page.screenshot({ path: join(SHOTS, `open-${surface}-${width}-${id}.png`) })
      }
      /* A second press closes it. */
      await press()
      await wait(80)
      if ((await state()).open) problems.push(`${where}: a second ${touch ? "tap" : "click"} does not close it`)

      /* Escape. */
      await press()
      await wait(60)
      await page.keyboard.press("Escape")
      await wait(60)
      if ((await state()).open) problems.push(`${where}: Escape does not close it`)

      /* A press outside the circle and the tip. */
      await press()
      await wait(60)
      /* Somewhere plain: not a link, a button, a card or the tip. */
      const spot = await page.evaluate(() => {
        for (let y = 8; y < innerHeight; y += 16) for (const x of [3, innerWidth - 3, innerWidth / 2]) {
          const e = document.elementFromPoint(x, y)
          if (e && !e.closest("a, button, input, [role='switch'], [role='radio'], [data-plan-card], [data-card-rates-tip]")) return { x, y }
        }
        return { x: 3, y: 3 }
      })
      if (touch) await page.touchscreen.tap(spot.x, spot.y)
      else await page.mouse.click(spot.x, spot.y)
      await wait(60)
      if ((await state()).open) problems.push(`${where}: a press outside does not close it`)

      /* A scroll away: the page (or the dialog's own scroll) moves 200px. */
      await press()
      await wait(60)
      /* Whichever scrolls (the page, or the dialog's or the app's own scroll), 200px whichever way it has room. */
      const scrolled = await page.evaluate((sel) => {
        let el = document.querySelector(sel).parentElement
        while (el && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)) el = el.parentElement
        el ??= document.scrollingElement
        const room = el.scrollHeight - el.clientHeight - el.scrollTop
        const by = room >= 200 ? 200 : -Math.min(200, el.scrollTop)
        el.scrollBy(0, by)
        return by
      }, sel)
      await wait(120)
      if (Math.abs(scrolled) < SCROLL_AWAY_MIN) console.log(`  ${id}: nothing to scroll here (${scrolled}px), scroll away not tried`)
      else if ((await state()).open) problems.push(`${where}: it stays open when scrolled ${scrolled}px away`)
      await page.keyboard.press("Escape")

      if (surface === "onboarding" && (await page.evaluate(() => window.picked ?? 0)) !== pickedBefore) problems.push(`${where}: a press on the circle picked the plan`)
    }
    await page.close()
  }
}
await browser.close()
server.close()
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("\nEvery rate line: one row at 390 and 1280, at 768 broken only before the rate with the rate and circle together; six lines on every card, the price on one row. The tip opens on hover, focus and a press, closes on a second press, Escape, outside and scroll, stays in the window and the card's column, reads at 4.5:1 and moves nothing.")
