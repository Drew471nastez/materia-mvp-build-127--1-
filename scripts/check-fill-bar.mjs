/**
 * ===========================================================================
 *  ONE BAR, MEASURED
 * ===========================================================================
 * The owner: "Standardize all progress and fill bars across the platform ...
 * One shared component or style system: height, radius, fill, animation,
 * track colour, typography, light and dark, semantics, accessibility. Avoid
 * animation that resets unnecessarily when components rerender."
 *
 * Mounts the real components/ui/fill-bar in headless Chromium and measures:
 *
 *   HEIGHT      4, 6 and 8px, exactly what the module says they are
 *   RADIUS      fully round, track and fill alike
 *   COLOUR      one track colour on a surface, the picture's own wash over
 *               a picture, and one colour per tone
 *   WIDTH       the share of the track the value is, the floor keeping a job
 *               that has begun visible, a value above the maximum stopping
 *               at full, nought drawing nothing
 *   MEANING     an announced bar carries role, minimum, maximum, value and
 *               a name; a quiet one is hidden from a screen reader instead
 *   MOTION      a transition on the width alone, and THE POINT OF THE ROUND:
 *               a component drawn again and again with the same value never
 *               moves. Measured by redrawing it twelve times and watching
 *               the fill's width the whole way.
 *   STILL       with reduced motion asked for, no transition at all
 *
 *   node scripts/check-fill-bar.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const dir = join(root, ".fill-bar-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-fill-bar-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LOOK = () => {
  const read = (name) => {
    const box = document.querySelector(`[data-case="${name}"]`)
    const track = box?.querySelector("[data-fill-bar]")
    if (!track) return null
    const fill = track.firstElementChild
    const t = getComputedStyle(track)
    const f = getComputedStyle(fill)
    const tr = track.getBoundingClientRect()
    const fr = fill.getBoundingClientRect()
    return {
      size: track.getAttribute("data-fill-bar"),
      height: Math.round(tr.height),
      radius: t.borderRadius,
      fillRadius: f.borderRadius,
      track: t.backgroundColor,
      fill: f.backgroundColor || f.background,
      share: tr.width ? Math.round((fr.width / tr.width) * 1000) / 10 : 0,
      role: track.getAttribute("role"),
      hidden: track.getAttribute("aria-hidden"),
      now: track.getAttribute("aria-valuenow"),
      min: track.getAttribute("aria-valuemin"),
      max: track.getAttribute("aria-valuemax"),
      label: track.getAttribute("aria-label"),
      transition: f.transitionProperty,
      ms: f.transitionDuration,
    }
  }
  return Object.fromEntries(["thin", "regular", "thick", "violet", "positive", "warning", "quiet", "counted", "floor", "over", "zero", "dark-media", "light-media", "redrawn", "remounted"].map((n) => [n, read(n)]))
}

let server
let browser
try {
  const css = await appCss(root)
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-fill-bar.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "bar.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(join(dir, "bar.js"))
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script src="/bar.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.split("?")[0] === "/bar.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  for (const [label, vp] of [["desktop-1280", { width: 1280, height: 900 }], ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.goto(`${origin}/`, { waitUntil: "load" })
    await sleep(600)
    const b = await p.evaluate(LOOK)

    console.log(`\n${label}: the measurements the module says it has`)
    expect(errors.length === 0, "it draws without an error", errors)
    expect(b.thin.height === 4 && b.regular.height === 6 && b.thick.height === 8, "thin 4px, regular 6px, thick 8px", { thin: b.thin.height, regular: b.regular.height, thick: b.thick.height })
    /* Tailwind's rounded-full is a radius larger than any bar, which a browser reports as its own huge number: round enough is half the height or more. */
    const round = (x) => parseFloat(x.radius) >= x.height / 2 && parseFloat(x.fillRadius) >= x.height / 2
    expect([b.thin, b.regular, b.thick].every(round), "track and fill fully round", [b.regular.radius, b.regular.fillRadius])
    expect(b.thin.track === b.regular.track && b.regular.track === b.thick.track, "one track colour on a surface", b.regular.track)
    expect(b.regular.track === "rgb(238, 240, 242)", "and it is #eef0f2", b.regular.track)
    expect(b.regular.fill === "rgb(26, 26, 46)" && b.violet.fill === "rgb(139, 92, 246)", "ink and violet are the app's own two", { ink: b.regular.fill, violet: b.violet.fill })
    /* A browser writes a part transparent colour as rgba or as oklab depending on how it was declared, so read what it means: a dark wash at a tenth, a light one at a quarter. */
    const wash = (c) => {
      const m = /([\d.]+)\s*\)$/.exec(c)
      return { alpha: m ? Number(m[1]) : 1, dark: /rgba\(0, 0, 0|oklab\(0 /.test(c), light: /rgba\(255, 255, 255|oklab\(0\.99/.test(c) }
    }
    const dw = wash(b["dark-media"].track)
    const lw = wash(b["light-media"].track)
    expect(dw.dark && dw.alpha === 0.1 && lw.light && lw.alpha === 0.25, "over a picture the track is the picture's own wash", { dark: b["dark-media"].track, light: b["light-media"].track })

    console.log(`\n${label}: the width is the figure`)
    expect(Math.abs(b.regular.share - 30) < 0.6, "30 of 100 is 30% of the track", b.regular.share)
    expect(Math.abs(b.counted.share - 58.3) < 0.6, "7 of 12 is 58.3%", b.counted.share)
    expect(Math.abs(b.floor.share - 8) < 0.6, "a job that has begun but sent nothing is its floor, not empty", b.floor.share)
    expect(b.over.share === 100, "more than the maximum stops at full", b.over.share)
    expect(b.zero.share === 0, "and nought is nothing", b.zero.share)

    console.log(`\n${label}: what a screen reader is told`)
    expect(b.counted.role === "progressbar" && b.counted.min === "0" && b.counted.max === "12" && b.counted.now === "7" && b.counted.label === "7 of 12 lessons", "an announced bar says how far it is, in its own units", b.counted)
    expect(b.quiet.role === null && b.quiet.hidden === "true", "a bar beside a number already on screen is hidden instead of saying it twice", { role: b.quiet.role, hidden: b.quiet.hidden })
    expect(b.over.now === "100", "and the value announced is never past the maximum", b.over.now)

    console.log(`\n${label}: it moves only when the figure does`)
    expect(b.regular.transition === "width" && b.regular.ms === "0.3s", "a transition on the width alone, 300ms", { property: b.regular.transition, ms: b.regular.ms })
    /* Drawn again every 80ms with the same value: the fill's width must not move at all. */
    const widths = []
    for (let i = 0; i < 12; i++) {
      widths.push(await p.evaluate(() => Math.round(document.querySelector('[data-case="redrawn"] [data-fill-bar]').firstElementChild.getBoundingClientRect().width * 100) / 100))
      await sleep(90)
    }
    expect(new Set(widths).size === 1, "redrawn twelve times with the same value, the fill never moves", widths)
    /*
      And thrown away and made again, which is what re-keying a list does to a row: still nothing moves. This
      one records the behaviour rather than guarding it; what catches a fill that would start over is the check
      above, that the fill is a transition on the width and not an animation.
    */
    const remade = []
    for (let i = 0; i < 12; i++) {
      remade.push(await p.evaluate(() => Math.round(document.querySelector('[data-case="remounted"] [data-fill-bar]').firstElementChild.getBoundingClientRect().width * 100) / 100))
      await sleep(70)
    }
    expect(new Set(remade).size === 1, "made again twelve times over, the fill never starts over", remade)
    await p.evaluate(() => window.setBarValue(80))
    await sleep(500)
    const after = await p.evaluate(() => Math.round(document.querySelector('[data-case="redrawn"] [data-fill-bar]').firstElementChild.getBoundingClientRect().width * 100) / 100)
    expect(after > widths[0] * 1.5, "and it does move when the value does", { before: widths[0], after })
    await p.screenshot({ path: join(shots, `${label}.png`), fullPage: true })
    await ctx.close()
  }

  console.log("\nreduced motion: the width is simply set")
  {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport({ width: 1280, height: 900 })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.goto(`${origin}/`, { waitUntil: "load" })
    await sleep(500)
    const still = await p.evaluate(() => {
      const f = document.querySelector('[data-case="regular"] [data-fill-bar]').firstElementChild
      const s = getComputedStyle(f)
      return { property: s.transitionProperty, ms: s.transitionDuration }
    })
    expect(still.property === "none" || still.ms === "0s", "no transition at all", still)
    await ctx.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
