/**
 * ===========================================================================
 *  THE LIGHT AND DARK SWITCH'S KNOB, FRAME BY FRAME, AS IT IS PAINTED
 * ===========================================================================
 * The owner: the switch's circle glitches when it is turned on and off, in
 * the phone's account sheet and in the menu. The page changes look under a
 * View Transition (lib/appearance/client.ts swap), so what a person sees is
 * not the live element but the browser's composite of a still of the old page
 * and the new page. Reading the knob's box from the DOM would always say it
 * slid; this reads the pixels.
 *
 * scripts/render-theme-switch.tsx draws the real account sheet at 390px and
 * the real account menu at 1280px. The knob is tinted pure red (inline,
 * !important, so the still and the live page carry the same red), every
 * animation on the page is slowed ten times (CDP Animation.setPlaybackRate,
 * which slows the transition's fade and the knob's own transition alike),
 * the row is pressed, and the switch is photographed again and again until
 * it settles. In each picture:
 *
 *   x       the knob's centre, the red weighted column by column
 *   width   how many columns are red at all: one knob is its own width, a
 *           still of the old knob beside the live one is two
 *
 * It fails when the knob is held at its start in more than one picture
 * while the page fades, when x ever steps backwards, when a picture paints
 * the knob somewhere its transition (read from the DOM around the picture)
 * never was, when two knobs show
 * at once, or when it does not end at the other end. Both ways: off to on, then on to off.
 *
 *   node scripts/check-theme-switch.mjs [sheet menu]
 *   BASE=<commit> node scripts/check-theme-switch.mjs   (the switch, swap and dark sheet as that commit had them; the commit before this probe shows the glitch)
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SLOW = 10
const SCALE = 2
const only = new Set(process.argv.slice(2))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".theme-switch-probe")
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* BASE=<commit>: the files this fix touches, as that commit has them, so the same probe shows what the owner saw. */
const BASE_FILES = ["components/platform/appearance-switch.tsx", "lib/appearance/client.ts", "components/ui/switch-style.ts"]
const atHead = (f) => execFileSync("git", ["show", `${process.env.BASE}:${f}`], { cwd: root, encoding: "utf8" })

mkdirSync(stubs, { recursive: true })
try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export const isNativePlatform = () => false
export const capacitorStorage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }
export function createClient() {
  const q = new Proxy(function () {}, { get(_, k) { return k === "then" ? (r) => r({ data: [], error: null }) : () => q }, apply() { return q } })
  const ch = { on() { return ch }, subscribe() { return ch } }
  return { channel: () => ch, removeChannel() {}, from: () => q, rpc: () => q, auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }
}
`)

  const base = Boolean(process.env.BASE)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-theme-switch.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.theme-switch-probe/navigation.js", "next/link": "./.theme-switch-probe/link.jsx", "next/image": "./.theme-switch-probe/image.jsx" },
    plugins: [
      { name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } },
      {
        name: "base",
        setup(b) {
          if (!base) return
          b.onLoad({ filter: /\.(tsx?|jsx?)$/ }, (a) => {
            const rel = a.path.slice(root.length + 1)
            return BASE_FILES.includes(rel) ? { contents: atHead(rel), loader: rel.endsWith(".tsx") ? "tsx" : "ts", resolveDir: join(root, rel, "..") } : undefined
          })
        },
      },
    ],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
  })
  /* The stylesheet: BASE adds the committed switch's classes, which the sources no longer carry. */
  let sheet = null
  if (base) {
    sheet = join(stubs, "globals.css")
    const classes = BASE_FILES.map(atHead).join(" ").match(/"[^"\n]*"/g).join(" ").replace(/["\\]/g, " ")
    writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source inline(${JSON.stringify(classes)});\n`)
  }
  const css = await appCss(root, sheet)
  const themeCss = base ? atHead("app/theme-dark.css") : readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = (mode) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style><style>${themeCss}</style>` +
    `<style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
    `<script>window.__mode=${JSON.stringify(mode)};window.__err=[];addEventListener("error",e=>__err.push(String(e.message)))</script><script>${js}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-color-profile=srgb"], headless: true })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  /** Where the red is in one picture of the switch: its weighted centre and how many columns carry it. */
  async function knobIn(png, cssWidth) {
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
    const cols = new Array(info.width).fill(0)
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels
        cols[x] += Math.max(0, data[i] - Math.max(data[i + 1], data[i + 2]))
      }
    }
    const peak = Math.max(...cols)
    let sum = 0
    let at = 0
    for (let x = 0; x < cols.length; x++) {
      sum += cols[x]
      at += x * cols[x]
    }
    const lit = cols.filter((v) => v > peak * 0.25).length
    /* The picture's pixels per CSS pixel (the clip is in CSS pixels, the picture may be at the screen's density). */
    const px = info.width / cssWidth
    return { x: sum ? at / sum / px : NaN, width: lit / px, mass: sum }
  }

  /** In the page: the live knob's centre from the switch's left edge, and whether the swap is running. */
  const liveKnob = () => {
    const sw = document.querySelector('[data-account-item="appearance"] [data-appearance-switch]')
    const r = sw.getBoundingClientRect()
    const k = sw.querySelector("span").getBoundingClientRect()
    return { x: k.left + k.width / 2 - r.left, swap: document.documentElement.hasAttribute("data-theme-swap") }
  }

  async function probe(mode, viewport) {
    console.log(`\n${mode === "sheet" ? "The account sheet on a phone" : "The account menu on a computer"} (${viewport.width}px)${base ? `, at ${process.env.BASE}` : ""}`)
    const page = await browser.newPage()
    await page.emulate({ viewport: { ...viewport, deviceScaleFactor: SCALE }, userAgent: viewport.isMobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" : undefined })
    const file = join(stubs, `${mode}.html`)
    writeFileSync(file, html(mode))
    /* A themed address (lib/appearance/site-appearance themedPath): the switch shows on /explore. */
    await page.setRequestInterception(true)
    page.on("request", (r) => (r.url().startsWith("https://storelib.test/") ? r.respond({ status: 200, contentType: "text/html", body: readFileSync(file, "utf8") }) : r.url().includes("/api/") ? r.respond({ status: 204, body: "" }) : r.continue()))
    await page.goto("https://storelib.test/explore")
    if (mode === "menu") {
      await page.waitForSelector("[data-header-avatar]", { timeout: 15000 })
      await page.click("[data-header-avatar]")
    }
    const row = await page.waitForSelector('[data-account-item="appearance"]', { visible: true, timeout: 15000 }).catch(async () => {
      throw new Error("No switch: " + JSON.stringify(await page.evaluate(() => ({ err: window.__err, body: document.body.innerHTML.slice(0, 300) }))))
    })
    await wait(900)
    const vt = await page.evaluate(() => typeof document.startViewTransition === "function")
    expect(vt, "the browser draws the swap as a View Transition, as phones with iOS 18 and Chrome do", vt)
    const cdp = await page.createCDPSession()
    await cdp.send("Animation.enable")

    for (const dir of ["off to on", "on to off"]) {
      /* The knob in red, before and through the still, and the switch's own box (it does not move). */
      const box = await page.evaluate(() => {
        const sw = document.querySelector('[data-account-item="appearance"] [data-appearance-switch]')
        const knob = sw.querySelector("span")
        knob.style.setProperty("background-color", "rgb(255,0,0)", "important")
        knob.style.setProperty("box-shadow", "none", "important")
        const r = sw.getBoundingClientRect()
        const k = knob.getBoundingClientRect()
        return { x: r.left, y: r.top, width: r.width, height: r.height, knobW: k.width, knobX: k.left + k.width / 2 - r.left }
      })
      await wait(100)
      const clip = { x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4, scale: 1 }
      let shots = []
      /* A machine that stalls on the first transition's capture leaves a handful of pictures: press it back and again. */
      for (let attempt = 0; attempt < 3; attempt++) {
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / SLOW })
        /* A first picture before the press: the first capture of a page is slow, and must not eat the move. */
        /* It is also where the knob rests before the press, the start every later picture is measured from. */
        const before = await cdp.send("Page.captureScreenshot", { format: "png", clip })
        shots = [{ t: 0, png: Buffer.from(before.data, "base64"), swap: false }]
        const t0 = Date.now()
        await row.click()
        while (Date.now() - t0 < 300 * SLOW) {
          /* Where the live knob is (its transition, read from the DOM) just before and just after the picture. */
          const a = await page.evaluate(liveKnob)
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false })
          const b = await page.evaluate(liveKnob)
          shots.push({ t: (Date.now() - t0) / SLOW, png: Buffer.from(data, "base64"), swap: b.swap, live: [Math.min(a.x, b.x), Math.max(a.x, b.x)] })
        }
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
        await wait(300)
        if (shots.length >= 15) break
        console.log(`    (only ${shots.length} pictures; pressed back and again)`)
        await row.click()
        await wait(800)
      }
      const dark = await page.evaluate(() => document.documentElement.hasAttribute("data-sl-dark"))
      const frames = []
      for (const s of shots) frames.push({ t: Math.round(s.t), swap: s.swap, live: s.live, ...(await knobIn(s.png, clip.width)) })
      const xs = frames.map((f) => +(f.x - 2).toFixed(1))
      const from = xs[0]
      const to = xs[xs.length - 1]
      const travel = Math.abs(to - from)
      const sign = Math.sign(to - from)
      const steps = xs.slice(1).map((x, k) => (x - xs[k]) * sign)
      const back = Math.min(0, ...steps)
      const jump = Math.max(...steps)
      const wide = Math.max(...frames.map((f) => f.width))
      /* Pictures after the press, during the swap, in which the knob still sits at its start (a still holds it there). */
      const held = frames.filter((f, k) => k > 0 && f.swap && Math.abs(xs[k] - from) <= 0.5).length
      console.log(`  ${dir}: ${frames.length} pictures over ${frames[frames.length - 1].t}ms of the move; knob x (px into the track): ${xs.map((x) => x.toFixed(1)).join(" ")}`)
      console.log(`    widest red: ${wide.toFixed(1)}px for a ${box.knobW}px knob; swap seen in ${frames.filter((f) => f.swap).length} pictures`)
      expect(dark === (dir === "off to on"), "the page took the other look", dark)
      expect(frames.some((f) => f.swap), "the swap ran as a View Transition while it was photographed")
      expect(travel >= box.knobW * 0.9, "it went the whole way, end to end", { from, to })
      expect(held <= 1, "the knob starts moving at once, not held at its start while the page fades", held)
      expect(back >= -0.6, "it never steps backwards", +back.toFixed(2))
      /*
        No jump: what is painted is where the knob's own transition has it. A capture's moment is somewhere between the
        two DOM reads around it, so the painted centre must fall between them (a pixel of antialiasing either side). A
        still on top, or a knob that skipped ahead, paints somewhere the transition never was.
      */
      const off = frames.map((f, k) => (f.live ? Math.max(0, f.live[0] - 1 - xs[k], xs[k] - f.live[1] - 1) : 0))
      const worst = Math.max(...off)
      console.log(`    painted vs its transition: worst ${worst.toFixed(1)}px off; largest step between pictures ${jump.toFixed(1)}px`)
      expect(worst <= 1, "no jump: every picture paints the knob where its transition has it", +worst.toFixed(1))
      expect(wide <= box.knobW + 2, "one knob at a time: no still of the old one beside it", { wide: +wide.toFixed(1), knob: box.knobW })
      expect(frames[frames.length - 1].t >= 220, "photographed past the end of the move")
    }
    await page.close()
  }

  if (want("sheet")) await probe("sheet", { width: 390, height: 844, isMobile: true, hasTouch: true })
  if (want("menu")) await probe("menu", { width: 1280, height: 860 })
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
