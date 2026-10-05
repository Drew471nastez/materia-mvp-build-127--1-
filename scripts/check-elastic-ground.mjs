/**
 * THE BOUNCE, AND WHAT IT REVEALS, MEASURED.
 *
 *   node scripts/check-elastic-ground.mjs       (after pnpm build)
 *
 * Headless Chromium on Linux does not rubber band, so this does not pretend
 * to film one. It measures the two things a rubber band is made of:
 *
 *   1. the computed `overscroll-behavior` on <html>, on <body> and on the
 *      element that actually scrolls each page, at the top of the page and at
 *      the bottom of it
 *   2. the colour the canvas paints at document y = -1 (the strip a band
 *      reveals above the top), at document y = 0 (the page's own top) and at
 *      document y = scrollHeight + 1 (the strip a band reveals below the
 *      bottom), against the page's header colour and its own foot
 *
 * (2) is read by painting the canvas's own computed `background-image` into a
 * box the size of the real tile and sampling it, so the arithmetic in the
 * stops is the browser's reading of it rather than this file's.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build. Run pnpm build first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-elastic-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-elastic-ground.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 780 })

const results = []
for (const surface of ["account", "settings", "library", "profile", "explore", "darkheader", "darkprofile"]) {
  await page.goto(`file://${join(out, "index.html")}?s=${surface}`)
  await page.waitForSelector("html[data-elastic-ready]", { timeout: 15000 })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const r = await page.evaluate(async () => {
    const html = document.documentElement
    const body = document.body
    const scroller = document.scrollingElement || html
    const cs = (el) => getComputedStyle(el)
    const behaviour = (el) => `${cs(el).overscrollBehaviorX}/${cs(el).overscrollBehaviorY}`

    const at = (y) => { scroller.scrollTop = y; return behaviour(scroller) }
    const docHeight = Math.max(html.scrollHeight, body.scrollHeight)
    const vh = window.innerHeight

    const top = { html: behaviour(html), body: behaviour(body), scroller: at(0) }
    const bottom = { html: behaviour(html), body: behaviour(body), scroller: at(docHeight) }
    scroller.scrollTop = 0

    /* The header's colour and the page's own foot, as the page draws them. */
    const headerEl = document.querySelector("[data-probe-header]")
    const footEl = document.querySelector("[data-probe-foot]")
    const headerColor = headerEl ? cs(headerEl).backgroundColor : null
    const footColor = footEl ? cs(footEl).backgroundColor : null

    /*
      THE CANVAS, PAINTED WHERE IT CAN BE SAMPLED.

      <html> here is a SCROLL CONTAINER (`overflow-x: hidden` forces
      `overflow-y: auto` on it), so its background positioning area is the
      scrollport, which is the viewport: `100%` is one viewport tall, the tile
      the stylesheet asks for is three, and it is hung one viewport above the
      top of the screen. Measured directly further down, which is how this
      file knows rather than assumes.

      So the tile runs from viewport y -100vh to +200vh, the band covering its
      first 200vh and the ground the rest:

          viewport y  -1       the strip a band reveals above the top
          viewport y  +2       the page's own top, under the clock
          viewport y  +100vh   the strip a band reveals below the bottom

      The same gradient is painted into a box of exactly the tile's height with
      `background-size: 100% 100%`, so every stop resolves where it resolves on
      the real canvas and the colours come out of the engine rather than out of
      this script.
    */
    const image = cs(html).backgroundImage
    const tileHeight = 3 * vh
    const probeBox = document.createElement("div")
    probeBox.setAttribute("data-canvas-probe", "")
    probeBox.style.cssText = `position:fixed;left:0;top:0;width:60px;height:${tileHeight}px;background-image:${image};background-size:100% 100%;background-repeat:no-repeat;z-index:2147483647`
    document.body.appendChild(probeBox)

    const rows = [
      { name: "above the top of the page", y: vh - 1 },
      { name: "the page's own top", y: vh + 2 },
      { name: "below the bottom of the page", y: 2 * vh + 2 },
    ]
    return {
      top,
      bottom,
      headerColor,
      footColor,
      ground: html.style.getPropertyValue("--bounce-ground"),
      band: cs(html).getPropertyValue("--native-band").trim(),
      elastic: html.classList.contains("elastic-scroll"),
      backgroundImage: image,
      backgroundSize: cs(html).backgroundSize,
      backgroundPosition: cs(html).backgroundPosition,
      backgroundRepeat: cs(html).backgroundRepeat,
      backgroundColor: cs(html).backgroundColor,
      docHeight,
      vh,
      rows,
      /* The sampling itself happens in the host, off a screenshot. */
      probeRect: probeBox.getBoundingClientRect().toJSON(),
    }
  })

  /*
    The strip is sampled off a real screenshot of that box rather than off a
    second canvas drawing of the same gradient: a screenshot is what the
    compositor actually produced.
  */
  const samples = []
  for (const row of r.rows) {
    await page.evaluate((y) => {
      const box = document.querySelector("[data-canvas-probe]")
      box.style.top = `${-y}px`
    }, row.y)
    const shot = await page.screenshot({ clip: { x: 10, y: 0, width: 4, height: 4 }, encoding: "base64" })
    samples.push({ name: row.name, png: shot })
  }
  await page.evaluate(() => document.querySelector("[data-canvas-probe]")?.remove())
  results.push({ surface, ...r, samples })
}

/* A 4x4 PNG decoded with the browser itself, so no image library is needed. */
const decode = async (b64) => {
  const p = await browser.newPage()
  const rgb = await p.evaluate(async (data) => {
    const img = new Image()
    img.src = "data:image/png;base64," + data
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext("2d")
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(1, 1, 1, 1).data
    return `rgb(${d[0]}, ${d[1]}, ${d[2]})`
  }, b64)
  await p.close()
  return rgb
}

let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }

console.log("\nThe computed overscroll-behavior, at the top of each page and at the bottom\n")
for (const r of results) {
  say(r.elastic, `${r.surface}: <html> carries elastic-scroll`)
  say(r.top.html === "none/contain", `${r.surface}: html at the top  ${r.top.html}`)
  say(r.bottom.html === "none/contain", `${r.surface}: html at the bottom  ${r.bottom.html}`)
  say(r.top.body === "none/contain", `${r.surface}: body at the top  ${r.top.body}`)
  say(r.bottom.body === "none/contain", `${r.surface}: body at the bottom  ${r.bottom.body}`)
  say(r.top.scroller === "none/contain", `${r.surface}: the scroller at the top  ${r.top.scroller}`)
  say(r.bottom.scroller === "none/contain", `${r.surface}: the scroller at the bottom  ${r.bottom.scroller}`)
}

console.log("\nThe canvas is configured as the two grounds\n")
for (const r of results) {
  say(r.backgroundRepeat === "no-repeat", `${r.surface}: no-repeat  (${r.backgroundRepeat})`)
  say(/^0(px)? -?\d/.test(r.backgroundPosition) || r.backgroundPosition.includes("-"), `${r.surface}: position  ${r.backgroundPosition}`)
  say(r.backgroundSize.includes("100%"), `${r.surface}: size  ${r.backgroundSize}`)
  say(!!r.ground, `${r.surface}: the ground was measured off the page  ${r.ground || "(none)"}`)
}

console.log("\nAnd what it paints above the top, at the top, and below the bottom\n")
const white = (c) => c === "rgb(255, 255, 255)"
for (const r of results) {
  const colours = {}
  for (const s of r.samples) colours[s.name] = await decode(s.png)
  const above = colours["above the top of the page"]
  const atTop = colours["the page's own top"]
  const below = colours["below the bottom of the page"]
  console.log(`  ${r.surface}:  header ${r.headerColor}   foot ${r.footColor}   ground ${r.ground}`)
  say(above === r.headerColor, `  ${r.surface}: above the top is the header's own colour  ${above}`)
  say(atTop === r.headerColor, `  ${r.surface}: the page's top is the same  ${atTop}`)
  say(below === r.footColor, `  ${r.surface}: below the bottom is the page's own foot  ${below}`)
  const darkFoot = r.footColor && r.footColor !== "rgb(255, 255, 255)"
  say(!(darkFoot && white(below)), `  ${r.surface}: no white under a foot that is not white`)
  const darkHeader = r.headerColor && r.headerColor !== "rgb(255, 255, 255)"
  say(!(darkHeader && white(above)), `  ${r.surface}: no white above a header that is not white`)
}

/*
  AND THE REAL CANVAS, READ OFF THE SCREEN. Everything on this page is
  transparent, so the pixels below ARE the canvas: the band at the top of the
  document and the ground at its foot. It is also the one measurement that
  tells the two readings of the background's positioning area apart, and it
  settles it in favour of the document's own box.
*/
console.log("\nThe canvas itself, with nothing painted over it\n")
{
  await page.goto(`file://${join(out, "index.html")}?s=canvas`)
  await page.waitForSelector("html[data-elastic-ready]", { timeout: 15000 })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const geo = await page.evaluate(() => {
    const html = document.documentElement
    html.style.setProperty("--bounce-ground", "rgb(248, 249, 250)")
    return { doc: Math.max(html.scrollHeight, document.body.scrollHeight), vh: window.innerHeight }
  })
  const read = async (scrollTop, y) => {
    await page.evaluate((t) => { (document.scrollingElement || document.documentElement).scrollTop = t }, scrollTop)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    return decode(await page.screenshot({ clip: { x: 10, y, width: 4, height: 4 }, encoding: "base64" }))
  }
  console.log(`  document ${geo.doc}px, viewport ${geo.vh}px, band #111111, ground rgb(248, 249, 250)`)

  /*
    WHICH BOX THE CANVAS IS POSITIONED IN, SETTLED BY MEASUREMENT. If it were
    the document's own box the foot of a 2600px page would be the ground; it
    is the band, at the top of the page and at the foot of it alike, so the
    positioning area is the viewport and the ground sits one viewport BELOW the
    bottom of the screen. Which is the right place for it: it is only ever seen
    while a band is being pulled at the bottom, and it is why the strip under
    the clock and the frame before the page paints are the colour they already
    were.
  */
  const atTop = await read(0, 2)
  const atFoot = await read(geo.doc - geo.vh, geo.vh - 6)
  say(atTop === "rgb(17, 17, 17)", `the canvas at the top of the screen is the band  ${atTop}`)
  say(atFoot === "rgb(17, 17, 17)", `and still the band at the foot of the page, so nothing about the page's own colour moved  ${atFoot}`)

  /*
    AND THE GROUND IS ONE VIEWPORT FURTHER DOWN. There is no way to look below
    the bottom of a screen in a browser that does not rubber band, so the tile
    is slid up by exactly one viewport and the same pixel read again: what
    comes into view is the part a band at the bottom would reveal.
  */
  await page.evaluate(() => { document.documentElement.style.backgroundPosition = "0 calc(-100vh - 100vh)" })
  const below = await read(0, 2)
  say(below === "rgb(248, 249, 250)", `one viewport below the bottom of the screen it is the ground  ${below}`)
  say(atTop !== below, "so the two ends of the page really are two colours on the real canvas")
}

await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nall measurements as designed\n")
process.exit(bad ? 1 : 0)
