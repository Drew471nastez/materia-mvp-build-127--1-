/**
 * ===========================================================================
 *  A POST AND A PICTURE GO BACK TO A CARD IN FULL VIEW, ON A PHONE
 * ===========================================================================
 * The real community feed (scripts/render-community-shell.tsx ?case=feed)
 * with the real tab bar after it (scripts/render-community-tab-bar.tsx), on
 * a 390x844 phone, every frame sampled:
 *
 *   POST      a photo post whose card sits mostly under the tab bar is
 *             opened and closed with the back button. Round 15: the post is
 *             pushed in from the right and goes back out to the right
 *             (components/community/member/post-motion.ts), never landing
 *             on its card, so the feed is left exactly where it was (it used
 *             to be moved to bring the card clear of the bars); no frame of
 *             the way back is over the tab bar
 *   VIEWER    a picture in the opened post grows out of its tile and goes
 *             back into it by translate and scale only: no frame of either
 *             way animates clip-path (which WebKit repaints on the main
 *             thread), the copy that flies is cropped like the tile, never
 *             squashed, and it lands on the tile
 *   CLEAN     no page errors
 *
 *   node scripts/check-community-return.mjs          (SHOTS_DIR keeps pictures)
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
const stubs = join(root, ".community-return-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-return-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
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
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-tab-bar.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-return-probe/navigation.js", "next/link": "./.community-return-probe/link.jsx", "next/image": "./.community-return-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => { errors.push(String(e).slice(0, 300)); if (process.env.DEBUG) console.log("PAGEERROR", String(e.stack || e).slice(0, 1500)) })
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url === `${ORIGIN}/app.js`) return void r.respond({ status: 200, contentType: "text/javascript", body: js })
    /* The post read again after the open: not answered, so the card's own copy stays (as on a slow network). */
    if (url.startsWith(`${ORIGIN}/api/`) && /\/posts\/[^/?]+(\?|$)/.test(url)) return void r.respond({ status: 404, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/api/`)) {
      const short = url.replace(ORIGIN, "")
      let body = {}
      if (short.endsWith("/presence")) body = { ok: true, ready: true }
      else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
      else if (short.startsWith("/api/notifications/inbox")) body = { unread: 0, items: [], nextCursor: null }
      else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
      else if (short.includes("/comments")) body = { comments: [], nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: "Ana Pop", avatarUrl: null } }
      else if (short.includes("/posts?")) body = { pinned: [], posts: [], nextCursor: null }
      return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    }
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}/community/clay-studio?case=feed`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1500)

  /* Every frame until `done`: the rects `read` returns, sampled in the page. */
  const sample = (readSrc, doneSrc, ms = 1600) =>
    p.evaluate(
      (readSrc, doneSrc, ms) =>
        new Promise((resolve) => {
          const read = new Function(`return (${readSrc})()`)
          const done = new Function(`return (${doneSrc})()`)
          const out = []
          const t0 = performance.now()
          const tick = () => {
            out.push(read())
            if (done() || performance.now() - t0 > ms) resolve(out)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      readSrc,
      doneSrc,
      ms,
    )
  /* A press on the post's words, where a thumb opens it. */
  const tapCard = async () => {
    const at = await p.evaluate(() => {
      const card = [...document.querySelectorAll("article")].find((a) => /did not crack/.test(a.textContent || ""))
      const t = (card.querySelector("[data-post-open]") || card).getBoundingClientRect()
      return { x: Math.round(t.left + Math.min(t.width / 2, 60)), y: Math.round(t.top + Math.min(t.height / 2, 30)) }
    })
    await p.mouse.click(at.x, at.y)
  }
  const band = () =>
    p.evaluate(() => {
      const top = document.querySelector("[data-community-top]")?.getBoundingClientRect().bottom ?? 0
      const bar = document.querySelector('[data-buyer-tab-bar="shown"]')?.getBoundingClientRect().top ?? innerHeight
      return { top: Math.round(top), bottom: Math.round(bar) }
    })

  console.log("\nPOST: a card half under the tab bar")
  const b0 = await band()
  expect(b0.bottom < 844, "the tab bar is on the page", b0)
  /* The photo post's card, put so most of it is under the bar. */
  await p.evaluate((bottom) => {
    const card = [...document.querySelectorAll("article")].find((a) => /did not crack/.test(a.textContent || ""))
    const r = card.getBoundingClientRect()
    window.scrollBy(0, r.top - (bottom - 70))
  }, b0.bottom)
  await sleep(250)
  const before = await p.evaluate(() => {
    const card = [...document.querySelectorAll("article")].find((a) => /did not crack/.test(a.textContent || ""))
    const r = card.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), scroll: Math.round(scrollY) }
  })
  expect(before.bottom > b0.bottom + 40, "the card starts mostly under the tab bar", { card: before, band: b0 })
  await tapCard()
  await p.waitForFunction(() => !!document.querySelector("[data-post-fullscreen] [role=dialog]"), { timeout: 3000 }).catch(() => {})
  await sleep(900)
  await p.screenshot({ path: join(shots, "post-open.png") })
  await p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-post-overlay-close]")?.click())
  const closeFrames = await sample(
    `() => { const d = document.querySelector("[data-post-fullscreen] [role=dialog]"); if (!d) return null; const r = d.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, o: Number(getComputedStyle(d).opacity) } }`,
    `() => !document.querySelector("[data-post-fullscreen]")`,
  )
  const after = await p.evaluate(() => {
    const card = [...document.querySelectorAll("article")].find((a) => /did not crack/.test(a.textContent || ""))
    const r = card.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), scroll: Math.round(scrollY) }
  })
  const b1 = await band()
  expect(after.scroll === before.scroll && after.top === before.top, "after the close the feed is exactly where it was: nothing moved it to meet the card", { before, after })
  const seen = closeFrames.filter(Boolean).filter((f) => f.o > 0.05)
  const overBar = seen.filter((f) => f.bottom > b1.bottom + 2)
  expect(seen.length > 0 && overBar.length === 0, "no frame of the way back is over the tab bar (the page ends at its top)", { overBar: overBar.slice(0, 3), bar: b1.bottom, frames: closeFrames.length })
  expect(closeFrames.length >= 8, "the way back is drawn over several frames", closeFrames.length)
  await p.screenshot({ path: join(shots, "post-closed.png") })

  console.log("\nVIEWER: a picture out of its tile and back")
  await tapCard()
  await p.waitForFunction(() => !!document.querySelector("[data-post-fullscreen] [role=dialog]"), { timeout: 3000 }).catch(() => {})
  await sleep(900)
  const hasTile = await p.evaluate(() => !!document.querySelector('[data-post-fullscreen] [data-media-tile="image"]'))
  expect(hasTile, "the opened post shows its picture as a tile")
  /* Catch every animation the open and the close start, and what they move. */
  await p.evaluate(() => {
    window.__anims = []
    const orig = Element.prototype.animate
    Element.prototype.animate = function (frames, opts) {
      const list = Array.isArray(frames) ? frames : []
      window.__anims.push({ el: this.getAttribute("data-cover-morph") !== null ? "flyer" : this.tagName, props: [...new Set(list.flatMap((f) => Object.keys(f)))] })
      return orig.call(this, frames, opts)
    }
  })
  const tileAt = await p.evaluate(() => {
    const r = document.querySelector('[data-post-fullscreen] [data-media-tile="image"]').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 120)) }
  })
  await p.mouse.click(tileAt.x, tileAt.y)
  const openFrames = await sample(
    `() => { const f = document.querySelector("[data-cover-morph]"); if (!f) return null; const r = f.getBoundingClientRect(); const img = f.querySelector("img").getBoundingClientRect(); return { w: r.width, h: r.height, iw: img.width, ih: img.height } }`,
    `() => document.querySelector("[data-lightbox-phase]")?.getAttribute("data-lightbox-phase") === "open"`,
  )
  await sleep(300)
  await p.screenshot({ path: join(shots, "viewer-open.png") })
  const flying = openFrames.filter(Boolean)
  expect(flying.length >= 6, "the picture grows out of the tile over several frames, as a copy that flies", flying.length)
  /* The picture inside the box keeps the picture's own proportions on every frame: cropped, never squashed. */
  const ratio0 = flying.length ? flying[flying.length - 1].iw / flying[flying.length - 1].ih : 0
  const squashed = flying.filter((f) => Math.abs(f.iw / f.ih - ratio0) > 0.03 * ratio0)
  expect(squashed.length === 0, "the flying picture is never squashed", squashed.slice(0, 3))
  const tile = await p.evaluate(() => {
    const r = document.querySelector('[data-post-fullscreen] [data-media-tile="image"]').getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
  await p.evaluate(() => document.querySelector("[data-lightbox-close]").click())
  const outFrames = await sample(
    `() => { const f = document.querySelector("[data-cover-morph]"); if (!f) return null; const r = f.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } }`,
    `() => !document.querySelector("[data-lightbox]")`,
  )
  const out = outFrames.filter(Boolean)
  const end = out[out.length - 1]
  expect(out.length >= 6, "the picture goes back over several frames", out.length)
  expect(!!end && Math.abs(end.left - tile.left) < 3 && Math.abs(end.top - tile.top) < 3 && Math.abs(end.width - tile.width) < 3 && Math.abs(end.height - tile.height) < 3, "and lands on its tile", { end, tile })
  const anims = await p.evaluate(() => window.__anims)
  const clipped = anims.filter((a) => a.props.includes("clipPath") || a.props.includes("clip-path"))
  expect(clipped.length === 0, "no animation of the open or the close moves clip-path", clipped)
  expect(anims.some((a) => a.el === "flyer"), "the copy that flies is moved by translate and scale", anims.filter((a) => a.el === "flyer"))

  console.log("\nCLEAN")
  expect(errors.length === 0, "no page errors", errors)
  console.log(`\npictures: ${shots}`)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
