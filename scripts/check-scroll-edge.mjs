/**
 * ===========================================================================
 *  DEPTH AT THE CUT OF A FROZEN COLUMN, MEASURED, AT 390 AND 1280
 * ===========================================================================
 * "In the line there, vertical, in the rows, make sure there is some kind of
 * depth at the cut there, fully." The Emails subscribers table on a phone:
 * the Status badges ran flat into the frozen Email column with nothing to
 * say the row carried on under it.
 *
 * The real ScrollEdge (components/app/scroll-edge.tsx) around the emails and
 * the orders table shapes (scripts/render-scroll-edge.tsx), with the real
 * stylesheet. What is read:
 *
 *   AT REST              no shadow at the edge; the right edge shaded when
 *                        the table is wider than its card
 *   SCROLLED             the shadow is up, at the frozen column's measured
 *                        right side (header and every row agree), and runs
 *                        from the top of the header to the bottom of the last
 *                        row: every device pixel row along it is darker than
 *                        the same pixel with the shadow off, no seams
 *   FADES                on opacity, 0 to 1 in about 160ms, never back
 *   AT THE END           the right shade is gone
 *   OPAQUE               the frozen cells' own pixels are the row's colour
 *                        (white, selected, hovered), never a badge beneath
 *   CHEAP                a 40 step swipe changes the frame's attributes at
 *                        most twice, and nothing else
 *
 *   node scripts/check-scroll-edge.mjs
 *   EDGE_SHOTS=<dir> node scripts/check-scroll-edge.mjs   (and pictures)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".edge-probe")
mkdirSync(dir, { recursive: true })
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-scroll-edge.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const report = {}

/** Decode a PNG screenshot into RGB rows, in the page (a canvas does it). */
async function pixels(page, clip) {
  const b64 = await page.screenshot({ clip, encoding: "base64" })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    return { w: c.width, h: c.height, data: Array.from(g.getImageData(0, 0, c.width, c.height).data) }
  }, b64)
}
const lum = (img, x, y) => {
  const i = (y * img.w + x) * 4
  return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
}
const rgb = (img, x, y) => {
  const i = (y * img.w + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.setContent(html, { waitUntil: "load" })
  await wait(300)
  const dpr = viewport.deviceScaleFactor
  report[label] = { errors }

  for (const table of ["emails", "orders"]) {
    const at = `at ${label}, ${table}:`
    const sel = `[data-table="${table}"] [data-scroll-edge-frame]`
    const state = () => page.evaluate((sel) => {
      const frame = document.querySelector(sel)
      const scroller = frame.firstElementChild
      const before = getComputedStyle(frame, "::before")
      const after = getComputedStyle(frame, "::after")
      return {
        start: frame.dataset.start,
        end: frame.dataset.end,
        overflow: scroller.scrollWidth - scroller.clientWidth,
        scrollLeft: scroller.scrollLeft,
        beforeOpacity: Number(before.opacity),
        afterOpacity: Number(after.opacity),
        transition: before.transition,
      }
    }, sel)
    const rest = await state()
    const r = { rest }
    report[label][table] = r
    if (rest.beforeOpacity !== 0) problems.push(`${at} the edge shadow is up at rest (${rest.beforeOpacity})`)
    if (rest.overflow > 1 && (rest.end !== "true" || rest.afterOpacity !== 1)) problems.push(`${at} the table is ${rest.overflow}px wider than its card and the right edge is not shaded`)
    if (rest.overflow <= 1 && (rest.end !== "false" || rest.afterOpacity !== 0)) problems.push(`${at} the table fits and the right edge is shaded anyway`)
    if (rest.overflow <= 1) { r.fits = true; continue }

    /* The fade in, frame by frame, from the first scroll. */
    const fade = await page.evaluate(async (sel) => {
      const frame = document.querySelector(sel)
      const scroller = frame.firstElementChild
      const t0 = performance.now()
      scroller.scrollLeft = 40
      const seen = []
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        seen.push({ t: performance.now() - t0, o: Number(getComputedStyle(frame, "::before").opacity) })
      }
      return seen
    }, sel)
    const firstUp = fade.find((f) => f.o > 0.01)
    const full = fade.find((f) => f.o >= 0.999)
    let back = 0
    for (let k = 1; k < fade.length; k++) if (fade[k].o < fade[k - 1].o - 0.001) back++
    r.fadeIn = { startsMs: firstUp ? Math.round(firstUp.t) : null, fullMs: full ? Math.round(full.t) : null, backwards: back }
    if (!full) problems.push(`${at} the shadow never reached full strength after a scroll`)
    else if (full.t - (firstUp?.t ?? 0) < 90 || full.t > 320) problems.push(`${at} the shadow faded in over ${Math.round(full.t - (firstUp?.t ?? 0))}ms, not about 160`)
    if (back) problems.push(`${at} the shadow's fade went backwards ${back} times`)
    if (!/opacity 0\.16s/.test(rest.transition)) problems.push(`${at} the shadow transitions ${rest.transition}, not opacity over 160ms`)

    /* Scroll so the badges are under the frozen column. */
    await page.evaluate((sel) => { document.querySelector(sel).firstElementChild.scrollLeft = 150 }, sel)
    await wait(300)
    const geo = await page.evaluate((sel) => {
      const frame = document.querySelector(sel)
      const scroller = frame.firstElementChild
      const box = frame.getBoundingClientRect()
      const cells = [...scroller.querySelectorAll("[data-scroll-edge]")]
      const thead = scroller.querySelector("thead").getBoundingClientRect()
      const tbody = scroller.querySelector("tbody").getBoundingClientRect()
      const before = getComputedStyle(frame, "::before")
      const rows = [...scroller.querySelectorAll("tbody tr")].map((tr) => {
        const cell = tr.querySelector("[data-scroll-edge]")
        const c = cell.getBoundingClientRect()
        return { y: c.top + c.height / 2, bg: getComputedStyle(cell).backgroundColor }
      })
      return {
        frame: { x: box.left, y: box.top, w: box.width, h: box.height },
        edgeX: parseFloat(frame.style.getPropertyValue("--scroll-edge-x")),
        cellRights: [...new Set(cells.map((c) => Math.round((c.getBoundingClientRect().right - box.left) * 100) / 100))],
        shadow: { left: parseFloat(before.left), top: parseFloat(before.top), height: parseFloat(before.height), width: parseFloat(before.width), opacity: Number(before.opacity) },
        headerTop: thead.top - box.top,
        lastRowBottom: tbody.bottom - box.top,
        rows,
        start: frame.dataset.start,
      }
    }, sel)
    r.scrolled = {
      edgeX: geo.edgeX,
      cellRights: geo.cellRights,
      shadow: geo.shadow,
      headerTop: Math.round(geo.headerTop * 100) / 100,
      lastRowBottom: Math.round(geo.lastRowBottom * 100) / 100,
    }
    if (geo.start !== "true" || geo.shadow.opacity !== 1) problems.push(`${at} scrolled, and the shadow is at ${geo.shadow.opacity}`)
    if (geo.cellRights.length !== 1) problems.push(`${at} the frozen cells do not share one right edge: ${geo.cellRights.join(", ")}`)
    if (Math.abs(geo.shadow.left - geo.cellRights[0]) > 0.5) problems.push(`${at} the shadow starts at ${geo.shadow.left}, the column ends at ${geo.cellRights[0]}`)
    if (Math.abs(geo.shadow.top - geo.headerTop) > 0.5) problems.push(`${at} the shadow starts at ${geo.shadow.top}, below the header's top ${geo.headerTop}`)
    if (Math.abs(geo.shadow.top + geo.shadow.height - geo.lastRowBottom) > 0.5) problems.push(`${at} the shadow ends at ${geo.shadow.top + geo.shadow.height}, not at the last row's bottom ${geo.lastRowBottom}`)

    /* Pixels: with the shadow, and the same frame with it off. */
    const clip = { x: geo.frame.x, y: geo.frame.y, width: geo.frame.w, height: geo.frame.h }
    const on = await pixels(page, clip)
    await page.evaluate((sel) => {
      const f = document.querySelector(sel)
      f.style.setProperty("--probe-off", "1")
      const s = document.createElement("style")
      s.id = "probe-off"
      s.textContent = `${sel}::before{transition:none!important;opacity:0!important}`
      document.head.appendChild(s)
    }, sel)
    await wait(60)
    const off = await pixels(page, clip)
    await page.evaluate(() => document.getElementById("probe-off").remove())
    const x1 = Math.round((geo.edgeX + 1.5) * dpr)
    const x6 = Math.round((geo.edgeX + 6) * dpr)
    const y0 = Math.ceil(geo.headerTop * dpr)
    const y1 = Math.floor(geo.lastRowBottom * dpr) - 1
    /* How much of the shadow's colour (about rgb 25) each pixel took on:
       the darkening over what darkening was possible. A pixel of text that
       is already nearly that dark can show no more, and is counted apart. */
    const SHADE = 25
    let seams = 0
    let underInk = 0
    const seamRows = []
    let minAlpha = Infinity
    let maxAlpha = 0
    let minAlpha6 = Infinity
    for (let y = y0; y <= y1; y++) {
      const base = lum(off, x1, y)
      if (base < 90) { underInk++; continue }
      const a = (base - lum(on, x1, y)) / (base - SHADE)
      const base6 = lum(off, x6, y)
      const a6 = base6 < 90 ? Infinity : (base6 - lum(on, x6, y)) / (base6 - SHADE)
      if (a < 0.03) { seams++; seamRows.push([y, Math.round(base), Math.round(lum(on, x1, y))]) }
      minAlpha = Math.min(minAlpha, a)
      maxAlpha = Math.max(maxAlpha, a)
      minAlpha6 = Math.min(minAlpha6, a6)
    }
    const r3 = (n) => Math.round(n * 1000) / 1000
    r.pixels = { deviceRows: y1 - y0 + 1, rowsUnderInk: underInk, rowsWithoutShadow: seams, seamRows: seamRows.slice(0, 6), shadeAt1_5px: [r3(minAlpha), r3(maxAlpha)], minShadeAt6px: r3(minAlpha6) }
    if (seams) problems.push(`${at} ${seams} of ${y1 - y0 + 1} device pixel rows along the edge have no shadow: the line has seams`)
    if (minAlpha6 <= 0.005) problems.push(`${at} 6px out from the edge the shadow is gone on some rows (${r3(minAlpha6)})`)
    if (maxAlpha > 0.25) problems.push(`${at} the edge takes ${r3(maxAlpha)} of the shadow colour: heavier than a soft shadow`)

    /* Opaque: the frozen cell's own pixels, 3px inside its edge, are its row colour. */
    const inside = Math.round((geo.edgeX - 3) * dpr)
    const opaque = geo.rows.map((row) => {
      const y = Math.round((row.y - geo.frame.y) * dpr)
      return { want: row.bg, got: `rgb(${rgb(off, inside, y).join(", ")})` }
    })
    r.opaque = opaque
    for (const o of opaque) {
      const want = o.want.match(/\d+/g).map(Number)
      const got = o.got.match(/\d+/g).map(Number)
      if (want.some((v, k) => Math.abs(v - got[k]) > 2)) problems.push(`${at} a frozen cell shows ${o.got} where its row is ${o.want}: something shows through it`)
    }

    /* A swipe: forty steps, and how often the frame's attributes change. */
    r.swipe = await page.evaluate(async (sel) => {
      const frame = document.querySelector(sel)
      const scroller = frame.firstElementChild
      scroller.scrollLeft = 0
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      let changes = 0
      const mo = new MutationObserver((l) => { changes += l.length })
      mo.observe(frame, { attributes: true })
      const max = scroller.scrollWidth - scroller.clientWidth
      for (let i = 1; i <= 40; i++) {
        scroller.scrollLeft = (max * i) / 40
        await new Promise((r) => requestAnimationFrame(r))
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      mo.disconnect()
      return { attributeChanges: changes, end: frame.dataset.end, start: frame.dataset.start }
    }, sel)
    await wait(260)
    r.atEnd = await state()
    if (r.swipe.attributeChanges > 2) problems.push(`${at} a swipe changed the frame's attributes ${r.swipe.attributeChanges} times, not at most twice`)
    if (r.atEnd.end !== "false" || r.atEnd.afterOpacity !== 0) problems.push(`${at} at the end of the table the right edge is still shaded (${r.atEnd.afterOpacity})`)
    if (r.atEnd.beforeOpacity !== 1) problems.push(`${at} at the end of the table the frozen column's shadow is ${r.atEnd.beforeOpacity}`)

    if (process.env.EDGE_SHOTS) {
      await page.evaluate((sel) => { document.querySelector(sel).firstElementChild.scrollLeft = 150 }, sel)
      await wait(260)
      await page.screenshot({ path: join(process.env.EDGE_SHOTS, `${label}-${table}.png`), clip })
    }
  }
  if (errors.length) problems.push(`at ${label}: the page threw ${errors[0]}`)
  await page.close()
}

/* Hovered: the frozen cell takes the row's hover colour with it. A phone
   has no hover, so this reading is a 390 wide window that has one. */
{
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  /* Headless reports no hover, and emulating the media feature does not
     reach Tailwind's `@media (hover: hover)`, so for this page the query is
     read as true. */
  const cdp = await page.createCDPSession()
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  await page.setContent(html.replaceAll("@media (hover: hover)", "@media all"), { waitUntil: "load" })
  await wait(200)
  report.hover = {}
  for (const table of ["emails", "orders"]) {
    const sel = `[data-table="${table}"] [data-scroll-edge-frame]`
    for (const n of [1, 2]) {
      /* The row is forced into :hover through the inspector, which is what a
         pointer resting on it does; headless has no pointer to rest. */
      await page.evaluate((sel) => { document.querySelector(sel).firstElementChild.scrollLeft = 150 }, sel)
      const { root } = await cdp.send("DOM.getDocument")
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `${sel} tbody tr:nth-child(${n})` })
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] })
      await wait(40)
      const h = await page.evaluate((sel, n) => {
        const tr = document.querySelector(sel).querySelector(`tbody tr:nth-child(${n})`)
        /* What the row actually shows: the first painted background from a
           plain cell up. A phone has no hover (Tailwind's hover: is behind
           @media (hover: hover)), so there the row is see-through over the
           card's white, and the frozen cell must be that white. */
        const painted = (el) => {
          for (let n = el; n; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor
            if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg
          }
          return "rgb(255, 255, 255)"
        }
        return { frozen: getComputedStyle(tr.querySelector("[data-scroll-edge]")).backgroundColor, row: painted(tr.children[tr.children.length - 2]) }
      }, sel, n)
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
      report.hover[`${table} row ${n}`] = h
      if (h.frozen !== h.row) problems.push(`hovered, the ${table} table's frozen cell in row ${n} is ${h.frozen} and the row ${h.row}`)
      if (h.frozen === "rgba(0, 0, 0, 0)") problems.push(`hovered, the ${table} table's frozen cell in row ${n} is see through`)
    }
  }
  await page.close()
}

await browser.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: no shadow at rest; scrolled, one continuous soft line down the frozen column's edge, header to last row; the right edge shaded while there is more; frozen cells opaque")
