/**
 * ===========================================================================
 *  THE PILL HEADER AND THE ANNOUNCEMENT BAR ABOVE IT, FILMED WHILE SCROLLING
 * ===========================================================================
 * A template whose header is a floating pill (Theme settings: Pill and glass)
 * under an announcement bar that scrolls away (Cutroom, the landing
 * template). The pill used to be position: fixed with its top written by a
 * script on every scroll frame, so it trailed the bar and the gap between
 * them shook. It is native sticky now (sections/header.liquid). This films
 * the screen's own frames (the compositor's, not the page's clock) at 1440
 * and 390, the CPU at a quarter, scrolling down and back up, and finds in
 * each frame the bar's bottom edge and the pill's top edge: the gap between
 * them must be the same in every frame while the bar shows, and the pill
 * must rest at its offset once the bar has gone.
 *
 *   node scripts/check-pill-header-sync.mjs [template-slug]    (after scripts/build-template-previews.ts)
 *
 * Reads public/theme-previews/<slug>/index.html. Assumes a dark bar and a
 * pill with a lighter edge line, as Cutroom's.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { createRequire } from "node:module"
const require = createRequire(join(process.cwd(), "package.json"))
const puppeteer = require("puppeteer-core")
const sharp = require("sharp")
const pub = join(process.cwd(), "public")
const SLUG = process.argv[2] || "landing-page"
const OUT = process.env.SHOTS || ""
const THROTTLE = Number(process.env.THROTTLE ?? 4)
if (OUT) mkdirSync(OUT, { recursive: true })
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" }
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const f = normalize(join(pub, decodeURIComponent(u.pathname)))
  if (!f.startsWith(pub) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
try {
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const p = await browser.newPage(); const phone = W < 768
    await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)))
    await p.goto(`${origin}/theme-previews/${SLUG}/index.html`, { waitUntil: "networkidle0" })
    await sleep(800)
    if (OUT) await p.screenshot({ path: join(OUT, `top-${W}.png`) })
    const c = await p.createCDPSession()
    await c.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    const frames = []
    c.on("Page.screencastFrame", (f) => { frames.push(f.data); c.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
    await c.send("Page.startScreencast", { format: "png", maxWidth: W, maxHeight: H, everyNthFrame: 1 })
    // scroll down 0 -> 200 in small wheel steps, then back up
    const steps = []
    for (let i = 0; i < 20; i++) steps.push(12)
    for (let i = 0; i < 10; i++) steps.push(-8)
    for (let i = 0; i < 15; i++) steps.push(-12)
    for (const d of steps) {
      await p.mouse.wheel({ deltaY: d })
      await sleep(30)
    }
    await sleep(800)
    await c.send("Page.stopScreencast")
    // per frame: the bar's bottom (last black row from the top) and the pill's top (its border line), at a column inside both
    const x = Math.round(W * (phone ? 0.75 : 0.62))
    const out = []
    for (const [i, d] of frames.entries()) {
      const { data, info } = await sharp(Buffer.from(d, "base64")).extract({ left: 0, top: 0, width: W, height: 220 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const rowShare = (y, x0, x1, test) => { let n = 0; for (let x = x0; x < x1; x++) { const i = (y * W + x) * 3; if (test((data[i] + data[i + 1] + data[i + 2]) / 3)) n++ } return n / (x1 - x0) }
      let bar = 0; for (let y = 0; y < info.height; y++) if (rowShare(y, 0, W, (l) => l < 6) > 0.6) bar = y + 1; else if (rowShare(y, 0, W, (l) => l >= 6 && l < 30) > 0.9) break
      let pill = -1; for (let y = 0; y < info.height; y++) if (rowShare(y, Math.round(W * 0.3), Math.round(W * 0.7), (l) => l > 34 && l < 70) > 0.8) { pill = y; break }
      out.push({ bar, pill, gap: pill - bar })
      if (OUT && process.env.SAVE) writeFileSync(join(OUT, `f-${W}-${String(i).padStart(3, "0")}.png`), Buffer.from(d, "base64"))
    }
    const gaps = out.filter((o) => o.bar > 0 && o.pill > 0).map((o) => o.gap)
    console.log(`\n${W}: ${frames.length} frames; errors ${errs.length}`)
    if (process.env.VERBOSE) console.log(out.map((o) => `${o.bar}/${o.pill}`).join(" "))
    const rests = [...new Set(out.filter((o) => o.bar === 0).map((o) => o.pill))]
    const ok = gaps.length > 0 && new Set(gaps).size === 1 && rests.length === 1 && rests[0] === gaps[0] && out.some((o) => o.bar === 0)
    console.log(`  ${ok ? "ok  " : "FAIL"}  the pill and the bar move as one: gap ${[...new Set(gaps)].join(",")}px in every frame the bar shows; at rest ${rests.join(",")}px from the top`)
    if (!ok) broken++
    if (errs.length) { broken++; console.log(`  FAIL  script errors: ${errs.slice(0, 3).join(" | ")}`) }
    await p.close()
  }
} finally { await browser.close(); server.close() }
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
