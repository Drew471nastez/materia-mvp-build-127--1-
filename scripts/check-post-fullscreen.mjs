/**
 * ===========================================================================
 *  A POST ON A PHONE: THE CARD GROWS INTO THE SCREEN (round 19)
 * ===========================================================================
 * The real feed (scripts/render-community-shell.tsx ?case=feed) on a 390px
 * phone. A tap on a post's card opens components/community/member/
 * post-fullscreen.tsx; every frame of the open is sampled and pictures are
 * taken on the way (SHOTS_DIR):
 *
 *   MORPH      the first frame is clipped to the card's box, and the clip
 *              opens over several frames to the whole screen
 *   PAGE       open, it covers the screen, with the back button at the top
 *              and the comment box floating at the foot (data-comments-composer="float")
 *   BLUR       the blur under the status bar is clear at rest and comes in
 *              with the scroll, softly (85% at most, all the way by 80px)
 *   GROUND     open, a white ground is behind the page (no feed behind a
 *              keyboard); a swipe takes it away so the feed shows
 *   FADES      the page comes in over the card at the start of the open and
 *              gives way to it at the end of the close (no snap)
 *   BACK       the back button closes it back into the card, over several
 *              frames, and it leaves the page
 *   SWIPE      a finger pulling down from the top takes the page with it,
 *              and let go far enough it closes
 *   STILL      the feed under it has not scrolled through any of it
 *
 *   node scripts/check-post-fullscreen.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".post-fullscreen-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-post-fullscreen-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h, o) => { log("prefetch", h); window.__onPrefetch && window.__onPrefetch(h) }, back: () => log("back"), refresh: () => log("refresh") }
const subscribe = (cb) => { window.addEventListener("probe:path", cb); window.addEventListener("popstate", cb); return () => { window.removeEventListener("probe:path", cb); window.removeEventListener("popstate", cb) } }
const path = () => location.pathname
export const usePathname = () => useSyncExternalStore(subscribe, path, path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.__navigate && window.__navigate(href) } } }, children) })
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-shell.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.post-fullscreen-probe/navigation.js", "next/link": "./.post-fullscreen-probe/link.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, process.env.DEBUG ? 3000 : 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    /* The post read again after the open: not answered here, so the card's own copy stays (as when the network is slow). */
    if (url.startsWith(`${ORIGIN}/api/`) && /\/posts\/[^/?]+(\?|$)/.test(url)) return void r.respond({ status: 404, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/api/`)) {
      const body = /\/comments/.test(url) ? { comments: [], nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: "Ana Pop", avatarUrl: null } } : { ok: true, unread: 0, items: [], conversations: [], communities: [] }
      return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    }
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}/community/clay-studio?case=feed`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1500)
  const cdp = await p.target().createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })

  /* A post's words, the part of a card a thumb opens it from. */
  const at = await p.evaluate(() => {
    const card = document.querySelectorAll("[data-community-feed] article[data-post]")[1]
    card.scrollIntoView({ block: "center" })
    const title = card.querySelector("[data-post-open]") || card
    const r = title.getBoundingClientRect()
    return { x: Math.round(r.left + Math.min(r.width / 2, 60)), y: Math.round(r.top + r.height / 2) }
  })
  await sleep(300)
  const feedY = await p.evaluate(() => window.scrollY)
  const sample = () =>
    p.evaluate(() => {
      window.__f = []
      window.__run = true
      const tick = () => {
        const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
        window.__f.push(page ? { clip: getComputedStyle(page).clipPath, t: getComputedStyle(page).transform, op: getComputedStyle(page).opacity } : null)
        if (window.__run) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  const stop = () => p.evaluate(() => { window.__run = false; return window.__f })

  await sample()
  await p.mouse.click(at.x, at.y)
  await sleep(120)
  await p.screenshot({ path: join(shots, "1-opening.png") })
  await sleep(600)
  const opening = (await stop()).filter(Boolean)
  const clips = opening.map((f) => f.clip)
  const firstInset = clips[0] || ""
  expect(/inset\(/.test(firstInset) && !/inset\(0px( 0px)*( round 0px)?\)/.test(firstInset), "MORPH: the first frame is clipped to the card's box", firstInset)
  expect(new Set(clips).size >= 4, "and the clip opens over several frames", { distinct: new Set(clips).size })
  const opsIn = opening.map((f) => Number(f.op))
  expect(opsIn[0] < 0.5 && opsIn.some((o) => o > 0.05 && o < 0.95) && opsIn.at(-1) === 1, "FADES: the page comes in over the card", opsIn.slice(0, 8).map((o) => o.toFixed(2)))
  await p.screenshot({ path: join(shots, "2-open.png") })
  const open = await p.evaluate(() => {
    const page = document.querySelector("[data-post-fullscreen] [role=dialog]").getBoundingClientRect()
    const back = document.querySelector("[data-post-fullscreen] [data-post-overlay-close]")?.getBoundingClientRect()
    const box = document.querySelector("[data-post-fullscreen] [data-comments-composer]")
    return { page: [page.left, page.top, page.width, page.height].map(Math.round), back: back ? Math.round(back.top) : null, composer: box?.getAttribute("data-comments-composer") ?? null, composerBottom: box ? Math.round(box.getBoundingClientRect().bottom) : null, blur: getComputedStyle(document.querySelector("[data-post-fullscreen-blur]")).opacity }
  })
  expect(open.page[0] === 0 && open.page[1] === 0 && open.page[2] === 390 && open.page[3] === 844, "PAGE: it covers the whole screen", open.page)
  expect(open.back !== null && open.back < 80, "with the back button at the top", open.back)
  expect(open.composer === "float" && open.composerBottom !== null && open.composerBottom > 760, "and the comment box floating at the foot", open)
  expect(open.blur === "0", "BLUR: clear at rest", open.blur)
  const ground = await p.evaluate(() => getComputedStyle(document.querySelector("[data-post-fullscreen-ground]")).opacity)
  expect(ground === "1", "GROUND: open, a white ground is behind the page", ground)
  await p.evaluate(() => { document.querySelector("[data-post-fullscreen] [data-post-overlay-scroll]").scrollTop = 220 })
  await sleep(150)
  const blurIn = await p.evaluate(() => ({ opacity: Number(getComputedStyle(document.querySelector("[data-post-fullscreen-blur]")).opacity), scrolled: document.querySelector("[data-post-fullscreen] [data-post-overlay-scroll]").scrollTop }))
  expect(blurIn.scrolled > 0 && Math.abs(blurIn.opacity - Math.min(1, blurIn.scrolled / 80) * 0.85) < 0.02, "and comes in with the scroll, softly (85% at most, all the way by 80px)", blurIn)
  await p.screenshot({ path: join(shots, "3-scrolled.png") })
  await p.evaluate(() => { document.querySelector("[data-post-fullscreen] [data-post-overlay-scroll]").scrollTop = 0 })

  await sample()
  await p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-post-overlay-close]").click())
  await sleep(140)
  await p.screenshot({ path: join(shots, "4-closing.png") })
  await sleep(900)
  const closing = (await stop()).filter(Boolean)
  const gone = await p.evaluate(() => !document.querySelector("[data-post-fullscreen]"))
  expect(new Set(closing.map((f) => f.clip)).size >= 4, "BACK: it goes back into the card over several frames", { distinct: new Set(closing.map((f) => f.clip)).size })
  const opsOut = closing.map((f) => Number(f.op))
  expect(opsOut.some((o) => o > 0.05 && o < 0.95) && opsOut.at(-1) < 0.1, "and gives way to the card at the end, by a fade", opsOut.slice(-8).map((o) => o.toFixed(2)))
  expect(gone, "and leaves the page", gone)

  /* Open again, and pull it down from the top. */
  await p.mouse.click(at.x, at.y)
  await sleep(800)
  await touch("touchStart", 200, 300)
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", 200, 300 + i * 18)
    await sleep(16)
  }
  const dragged = await p.evaluate(() => getComputedStyle(document.querySelector("[data-post-fullscreen] [role=dialog]")).transform)
  const groundDragged = await p.evaluate(() => getComputedStyle(document.querySelector("[data-post-fullscreen-ground]")).opacity)
  expect(groundDragged === "0", "and a swipe takes the ground away, so the feed shows behind", groundDragged)
  await p.screenshot({ path: join(shots, "5-swiping.png") })
  await touch("touchEnd", 0, 0)
  await sleep(900)
  const swipedAway = await p.evaluate(() => !document.querySelector("[data-post-fullscreen]"))
  expect(/matrix\(1, 0, 0, 1, 0, (\d+)/.test(dragged) && Number(dragged.match(/, (\d+(\.\d+)?)\)$/)?.[1]) > 150, "SWIPE: the page follows the finger down", dragged)
  expect(swipedAway, "and let go far enough, it closes", swipedAway)
  const after = await p.evaluate(() => window.scrollY)
  expect(Math.abs(after - feedY) < 2, "STILL: the feed under it has not moved", { before: feedY, after })
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
