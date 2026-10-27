/**
 * ===========================================================================
 *  MATERIA'S SECTION LINKS IN STORELIB'S CANVAS (round 25, against b6cabaa)
 * ===========================================================================
 * The theme's same page links (`/#section-benefits_bar_b3YbxP`) are handled
 * by the theme itself (shopify/assets/section-links.js, registered early by
 * snippets/section-link-capture.storelib). This builds the canvas the way
 * components/website-builder/compat/compat-canvas.tsx does (CANVAS_HEAD and
 * CANVAS_SHOWN first in <head>, the theme's head after it, CANVAS_BRIDGE at
 * the end of <body>), in a frame sandboxed as the editor's is (no origin),
 * with the theme's own files at MATERIA_REF (default b6cabaa) from a clone
 * of Drew471nastez/materia at MATERIA_DIR, and presses with the real input
 * pipeline (DevTools mouse and touch). It records what the bridge tells the
 * builder and every frame of the canvas's scroll:
 *
 *   - a section link scrolls the canvas to its section, below the sticky
 *     header, and the builder is told nothing (no pick, no navigate): no
 *     selection or route change can cancel the scroll;
 *   - with the website's canonical (the canvas now gives it, canonicalHost)
 *     and with the old relative one alike; a phone's tap too;
 *   - reduced motion: there at once, no frames in between;
 *   - a link to another page is still the builder's (navigate);
 *   - a press on a section that is not a link still selects it (pick);
 *   - a drag that starts on a section link scrolls nothing.
 *
 *   MATERIA_DIR=/home/user/drew471nastez/materia node scripts/check-materia-section-links.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const MATERIA = process.env.MATERIA_DIR ?? "/home/user/drew471nastez/materia"
const REF = process.env.MATERIA_REF ?? "b6cabaa"
const fromTheme = (path) => execFileSync("git", ["-C", MATERIA, "show", `${REF}:${path}`], { encoding: "utf8" })
const linksJs = fromTheme("shopify/assets/section-links.js")
const capture = fromTheme("snippets/section-link-capture.storelib").replace(/<\/?template[^>]*>/g, "")

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The platform's own canvas pieces, as the editor injects them. */
const dir = mkdtempSync(join(root, ".materia-links-"))
let pieces
try {
  writeFileSync(join(dir, "entry.ts"), `export { CANVAS_BRIDGE, CANVAS_HEAD } from "${join(root, "lib/storelib-theme/compat/canvas-bridge.ts")}"\nexport { CANVAS_SHOWN } from "${join(root, "lib/storelib-theme/compat/canvas-network.ts")}"\n`)
  execFileSync("pnpm", ["exec", "esbuild", join(dir, "entry.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${join(dir, "pieces.cjs")}`, "--log-level=error", `--alias:@=${root}`], { stdio: "inherit" })
  const { createRequire } = await import("node:module")
  pieces = createRequire(import.meta.url)(join(dir, "pieces.cjs"))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

/* A page of Materia's shape: a sticky header with section links, tall sections drawn as the renderer draws them (theme.ts: shopify-section-<instance id>). */
function canvasDoc(canonical) {
  const sec = (id, h, inner = "") => `<div id="shopify-section-${id}" class="shopify-section" data-section-id="${id}" data-section-type="${id.replace(/_[A-Za-z0-9]+$/, "")}"><section style="height:${h}px;background:#${(id.length * 997).toString(16).slice(0, 6).padEnd(6, "e")}">${inner}<h2>${id}</h2></section></div>`
  const themeHead = `<link rel="canonical" href="${canonical}">${capture}<script src="data:text/javascript;base64,${Buffer.from(linksJs).toString("base64")}" defer></script>`
  const body = `<div id="shopify-section-header" class="shopify-section shopify-section-group-header-group" style="position:sticky;top:0;z-index:5"><header class="header" style="position:sticky;top:0;height:72px;background:#fff;display:flex;gap:16px;align-items:center;padding:0 16px">
      <a id="to-benefits" href="/#section-benefits_bar_b3YbxP">Benefits</a>
      <a id="to-showcase" href="/#shopify-section-product_showcase_yGRpEr">Showcase</a>
      <a id="to-other" href="/collections/all">Shop all</a>
    </header></div>
    ${sec("slideshow_dETpFq", 900)}${sec("product_showcase_yGRpEr", 700)}${sec("marquee_bar_jp8byW", 600)}${sec("benefits_bar_b3YbxP", 500)}${sec("image_and_video_text_Xh6Ef8", 1600)}`
  const head = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${pieces.CANVAS_HEAD}${pieces.CANVAS_SHOWN}${themeHead}<style>body{margin:0;font-family:sans-serif}</style></head>`
  return `<!doctype html><html>${head}<body>${body}<script>window.__slSite="https://andrewrullz.storelib.com";window.__slInspect=true;${pieces.CANVAS_BRIDGE}</script></body></html>`
}

const parent = (doc) => `<!doctype html><html><body style="margin:0"><iframe id="canvas" sandbox="allow-scripts allow-forms allow-popups" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
<script>
  window.__posted = [];
  addEventListener("message", (e) => { if (e.data && e.data.storelib) window.__posted.push(e.data.type + (e.data.sectionId ? ":" + e.data.sectionId : "") + (e.data.href ? ":" + e.data.href : "")) });
  document.getElementById("canvas").srcdoc = ${JSON.stringify(doc).replace(/<\/(script)/gi, "<\\/$1")};
</script></body></html>`

let page = ""
const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(page) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/`
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })

async function open({ canonical, viewport, reduced = false }) {
  page = parent(canvasDoc(canonical))
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
  await p.goto(base)
  await sleep(900)
  const frame = p.frames().find((f) => f !== p.mainFrame() && f.parentFrame() === p.mainFrame())
  return { p, frame, errors }
}
/* Where the canvas is scrolled, every frame for `ms`, read inside the frame. */
const watch = (frame, ms) => frame.evaluate((ms) => new Promise((done) => { const ys = []; const t0 = performance.now(); const tick = () => { ys.push(Math.round(scrollY)); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(ys) }; requestAnimationFrame(tick) }), ms)
const centre = async (frame, sel) => frame.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
const targetTop = (frame, id) => frame.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().top), id)

const CANONICALS = [["the website's canonical (round 25: canonicalHost)", "https://andrewrullz.storelib.com/"], ["the old relative canonical", "/"]]
for (const [label, canonical] of CANONICALS) {
  for (const [name, viewport, touch] of [["computer 1366", { width: 1366, height: 860 }, false], ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
    console.log(`\n${name}, ${label}`)
    const { p, frame, errors } = await open({ canonical, viewport })
    await p.evaluate(() => { window.__posted = [] })
    const at = await centre(frame, "#to-benefits")
    const seen = watch(frame, 1400)
    if (touch) await p.touchscreen.tap(at.x, at.y)
    else await p.mouse.click(at.x, at.y)
    const ys = await seen
    const top = await targetTop(frame, "shopify-section-benefits_bar_b3YbxP")
    const posted = await p.evaluate(() => window.__posted)
    const oneWay = ys.every((y, i) => i === 0 || y >= ys[i - 1])
    expect(top >= 72 && top <= 72 + 24, "a section link brings its section in, just below the sticky header", { top, from: ys[0], to: ys.at(-1) })
    expect(oneWay && ys.at(-1) > 0, "scrolling one way, never cancelled or pulled back", { frames: ys.length, oneWay })
    expect(!posted.some((m) => /^(pick|navigate|taken)/.test(m)), "and the builder is told nothing: no pick, no navigate", posted)
    /* An imported template-prefixed id, as the theme's own links write them. */
    await p.evaluate(() => { window.__posted = [] })
    const at2 = await centre(frame, "#to-showcase")
    if (touch) await p.touchscreen.tap(at2.x, at2.y)
    else await p.mouse.click(at2.x, at2.y)
    await sleep(1200)
    const top2 = await targetTop(frame, "shopify-section-product_showcase_yGRpEr")
    expect(top2 >= 72 && top2 <= 96 && !(await p.evaluate(() => window.__posted)).some((m) => /^(pick|navigate)/.test(m)), "a link written with the shopify-section- prefix too", top2)
    /* A link to another page stays the builder's. */
    await p.evaluate(() => { window.__posted = [] })
    const at3 = await centre(frame, "#to-other")
    if (touch) await p.touchscreen.tap(at3.x, at3.y)
    else await p.mouse.click(at3.x, at3.y)
    await sleep(300)
    const other = await p.evaluate(() => window.__posted)
    expect(other.some((m) => m.startsWith("navigate:/collections/all")), "a link to another page is still the builder's to open", other)
    /* A press on a section that is not a link still selects it. */
    await frame.evaluate(() => window.scrollTo(0, 0))
    await sleep(200)
    await p.evaluate(() => { window.__posted = [] })
    const at4 = await centre(frame, "#shopify-section-slideshow_dETpFq h2")
    if (touch) await p.touchscreen.tap(at4.x, at4.y)
    else await p.mouse.click(at4.x, at4.y)
    await sleep(300)
    const picked = await p.evaluate(() => window.__posted)
    expect(picked.some((m) => m === "pick:slideshow_dETpFq"), "a press on a section that is not a link still selects it", picked)
    expect(errors.length === 0, "no errors in the page", errors)
    await p.close()
  }
}

console.log("\nreduced motion, computer")
{
  const { p, frame } = await open({ canonical: "https://andrewrullz.storelib.com/", viewport: { width: 1366, height: 860 }, reduced: true })
  const at = await centre(frame, "#to-benefits")
  const seen = watch(frame, 600)
  await p.mouse.click(at.x, at.y)
  const ys = await seen
  const moving = new Set(ys.filter((y) => y !== ys[0] && y !== ys.at(-1))).size
  expect(moving === 0 && ys.at(-1) > 0, "there at once, with no frames in between", { from: ys[0], to: ys.at(-1), between: moving })
  await p.close()
}

console.log("\na drag that starts on a section link, computer")
{
  const { p, frame } = await open({ canonical: "https://andrewrullz.storelib.com/", viewport: { width: 1366, height: 860 } })
  const at = await centre(frame, "#to-benefits")
  const seen = watch(frame, 900)
  await p.mouse.move(at.x, at.y)
  await p.mouse.down()
  await p.mouse.move(at.x + 60, at.y + 40, { steps: 6 })
  await p.mouse.up()
  const ys = await seen
  expect(ys.every((y) => y === ys[0]), "scrolls nothing", { from: ys[0], to: ys.at(-1) })
  await p.close()
}

await browser.close()
server.close()
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}`)
process.exit(broken ? 1 : 0)
