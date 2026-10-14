/**
 * ===========================================================================
 *  THE OPENED POST'S PICTURE ON A COMPUTER, FRAME BY FRAME (round 13)
 * ===========================================================================
 * The owner: "the media first shows gray and then the image/video appears".
 * The real feed (scripts/render-community-post-media13.tsx) at 1440x900, its
 * pictures on Supabase storage so each one goes through the image route as in
 * production. The probe answers the route with real PNGs at the width asked
 * for: the feed's files (q=75) at once, the opened post's full size files
 * (q=88, and a video's own poster) FULL_MS late, like a cold optimizer.
 *
 * For one picture, two pictures and a video alone, the card is pressed (at
 * once, and after the mouse has rested on it) and every frame of the panel is
 * sampled: what its media box shows.
 *
 *   full    the full size file, loaded and drawn
 *   still   the feed's own copy (data-media-still / data-video-still)
 *   empty   neither: only the box's own background (its colour is noted)
 *
 * The claim: never an empty frame while the panel is on screen; the full file
 * comes in once whole; Escape still closes the post. Screenshots go to
 * SHOTS_DIR (printed at the end): look at them.
 *
 *   node scripts/check-community-post-media13.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const FULL_MS = Number(process.env.FULL_MS || 450)
const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".post-media13-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-post-media13-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "next-navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "next-link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) e.preventDefault() } }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "supabase-client.js"), `export const isNativePlatform = () => false
export function createClient() { const ch = { on() { return ch }, subscribe() { return ch }, send: async () => "ok" }; return { realtime: { setAuth: async () => {} }, channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) } } }
`)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-post-media13.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.js") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
        b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

/* A picture per name, the colour telling the files apart: the feed's copy is lighter, so a screenshot shows which is on screen. */
const COLOURS = { one: "#3f7d6b", "two-a": "#7a4f8c", "two-b": "#b0643c", poster: "#2f5d8a" }
const cache = new Map()
async function png(name, w, feed) {
  const key = `${name}:${w}:${feed}`
  if (!cache.has(key)) {
    const h = Math.round((w * 2) / 3)
    const base = COLOURS[name] || "#555555"
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${base}"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${h * 0.2}" fill="#ffffff" opacity="${feed ? 0.35 : 0.8}"/></svg>`
    cache.set(key, await sharp(Buffer.from(svg)).png().toBuffer())
  }
  return cache.get(key)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function open() {
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    const route = /\/_next\/image\?url=([^&]+)&w=(\d+)&q=(\d+)/.exec(u)
    const direct = /^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/community\/([\w-]+)\.jpg/.exec(u)
    if (route || direct) {
      const name = route ? /community%2F([\w-]+)\.jpg/.exec(route[1])?.[1] : direct[1]
      const feed = !!route && route[3] === "75"
      if (!feed) await sleep(FULL_MS)
      return r.respond({ status: 200, contentType: "image/png", body: await png(name, route ? Number(route[2]) : 1600, feed) })
    }
    if (/\/comments/.test(u)) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ comments: [], nextCursor: null, total: 0 }) })
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, contentType: "application/json", body: "{}" })
  })
  await p.goto(ORIGIN + "/community/studio-notes", { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-post]")
  /* The feed's pictures on screen, decoded. */
  await p.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("[data-post-thumb] img, [data-card-media] img")].filter((i) => i.getBoundingClientRect().width > 0)
    return imgs.length >= 3 && imgs.every((i) => i.complete && i.naturalWidth > 1 && getComputedStyle(i).opacity === "1")
  }, { timeout: 15000 })
  return { p, errors }
}

/* Every frame from the press until the full file is on screen (or 1.5s): what each media box in the panel shows. */
const SAMPLER = () => {
  const out = []
  const t0 = performance.now()
  window.__frames = out
  const visible = (el) => !!el && el.complete && el.naturalWidth > 1 && Number(getComputedStyle(el).opacity) > 0.02
  const tick = () => {
    const panel = document.querySelector("[data-post-overlay='panel']")
    if (panel) {
      const boxes = [...panel.querySelectorAll("[data-media-tile], [data-storelib-video]")]
      const panelOpacity = Number(getComputedStyle(panel).opacity)
      const shows = boxes.map((b) => {
        const full = b.querySelector("img[data-soft-img], img[data-video-poster]")
        const still = b.querySelector("img[data-media-still], img[data-video-still]")
        if (full && visible(full) && Number(getComputedStyle(full).opacity) > 0.98) return "full"
        if (full && visible(full)) return visible(still) ? "full-over-still" : "full-fading"
        if (visible(still)) return "still"
        return `empty:${getComputedStyle(b).backgroundColor}`
      })
      out.push({ t: Math.round(performance.now() - t0), panelOpacity: Math.round(panelOpacity * 100) / 100, shows })
    }
    if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const CASES = [
  ["one picture", "p-one"],
  ["two pictures", "p-two"],
  ["a video alone", "p-video"],
]
const summary = []
for (const [label, id] of CASES) {
  for (const rest of [0, 300]) {
    const { p, errors } = await open()
    const card = await p.$(`[data-post="${id}"] h2`)
    const box = await card.boundingBox()
    await p.mouse.move(box.x + 20, box.y + box.height / 2)
    if (rest) await sleep(rest)
    await p.evaluate(SAMPLER)
    await p.mouse.down()
    await sleep(60)
    await p.mouse.up()
    await sleep(80)
    await p.screenshot({ path: join(shots, `${id}-rest${rest}-80ms.png`) })
    await sleep(1500)
    const frames = await p.evaluate(() => window.__frames)
    const seen = frames.filter((f) => f.panelOpacity > 0.05)
    const empty = seen.filter((f) => f.shows.some((s) => s.startsWith("empty")))
    const firstFull = seen.find((f) => f.shows.every((s) => s === "full"))
    const tag = `${label}, pressed ${rest ? `after a ${rest}ms rest` : "at once"}`
    expect(seen.length > 5, `${tag}: the panel was sampled`, seen.length)
    expect(empty.length === 0, `${tag}: no frame shows an empty box`, empty.length ? { frames: empty.length, first: empty[0] } : 0)
    expect(!!firstFull, `${tag}: the full file is drawn`, firstFull ? firstFull.t : null)
    summary.push({ case: tag, framesSeen: seen.length, emptyFrames: empty.length, emptyColour: empty[0]?.shows.find((s) => s.startsWith("empty"))?.slice(6) ?? null, stillFrames: seen.filter((f) => f.shows.some((s) => s === "still")).length, fullAtMs: firstFull?.t ?? null })
    await p.screenshot({ path: join(shots, `${id}-rest${rest}-settled.png`) })
    await p.keyboard.press("Escape")
    await sleep(500)
    expect(!(await p.$("[data-post-overlay='panel']")), `${tag}: Escape closes the post`)
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await p.close()
  }
}

await browser.close()
console.log("\n" + summary.map((s) => JSON.stringify(s)).join("\n"))
console.log(`\nShots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
