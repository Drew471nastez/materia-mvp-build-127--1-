/**
 * ===========================================================================
 *  A POST OPENS OUT OF ITS CARD AND GOES BACK INTO IT, ON EVERY PHONE
 * ===========================================================================
 * The owner: "more smooth clean morph of the posts when opened and closed
 * ... adapted to all kinds of devices". The real community feed and the real
 * tab bar (scripts/render-community-tab-bar.tsx ?case=feed), at 320x568,
 * 375x667, 390x844, 430x932 and a 768x1024 tablet, every frame sampled at
 * 4x CPU, with a router that hears every address the page puts up the way
 * Next's does (a pushState or a replaceState from the page moves
 * usePathname, which the other probes' stubs did not do):
 *
 *   OPEN    a tap on a card: the post's page is on screen on every frame
 *           from its first to the end (it never vanishes), its first frame
 *           is the card's box, it grows without stepping back, and it ends
 *           covering the screen
 *   KEPT    through the open and the close the feed is the same nodes (its
 *           list, the card), and so are the community's top bar and the tab
 *           bar, which do not move: nothing under the post is drawn again
 *   CLOSE   the back button: the page shrinks back over several frames and
 *           its last visible frame is on the card, the address is the feed's
 *           again, and the feed has not moved under it
 *   SWIPE   (390) a pull down from the top of the post closes it the same way
 *
 *   node scripts/check-community-morph.mjs        (SHOTS_DIR keeps pictures)
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
const stubs = join(root, ".community-morph-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-morph-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

const VIEWPORTS = [
  ["phone-320", { width: 320, height: 568 }],
  ["phone-375", { width: 375, height: 667 }],
  ["phone-390", { width: 390, height: 844 }],
  ["phone-430", { width: 430, height: 932 }],
  ["tablet-768", { width: 768, height: 1024 }],
].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))

try {
  /*
    THE ROUTER HEARS THE ADDRESS. Next (app router) patches history.pushState and replaceState, so an address a page puts up
    itself (a post opened over the feed, a space chip) moves usePathname on the next render. The stub does the same: both
    are wrapped to tell usePathname's subscribers, and so is Back.
  */
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
if (!window.__probeHistory) {
  window.__probeHistory = true
  for (const k of ["pushState", "replaceState"]) {
    const real = history[k].bind(history)
    history[k] = (...a) => { const r = real(...a); window.dispatchEvent(new Event("probe:path")); return r }
  }
}
const subscribe = (cb) => { window.addEventListener("probe:path", cb); window.addEventListener("popstate", cb); return () => { window.removeEventListener("probe:path", cb); window.removeEventListener("popstate", cb) } }
const path = () => location.pathname
export const usePathname = () => useSyncExternalStore(subscribe, path, path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
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
    alias: { "@": ".", "next/navigation": "./.community-morph-probe/navigation.js", "next/link": "./.community-morph-probe/link.jsx", "next/image": "./.community-morph-probe/image.jsx" },
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

  async function open(vp) {
    const p = await browser.newPage()
    await p.setViewport({ ...vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url === `${ORIGIN}/app.js`) return void r.respond({ status: 200, contentType: "text/javascript", body: js })
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
    await p.goto(`${ORIGIN}/community/clay-studio?case=feed&signedin=1`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(1200)
    return { p, errors }
  }

  /*
    Every frame from now until `doneSrc` holds (and `tailMs` after): the post's page (its box and opacity), whether the feed's
    list, the card, the top bar and the tab bar are still the nodes tagged before, and where the bars are.
  */
  const record = (p, doneSrc, tailMs = 250, maxMs = 3000) =>
    p.evaluate(
      (doneSrc, tailMs, maxMs) =>
        new Promise((resolve) => {
          const done = new Function(`return (${doneSrc})()`)
          const out = []
          const t0 = performance.now()
          let doneAt = null
          const tick = () => {
            const page = document.querySelector("[data-post-overlay]")
            const pr = page?.getBoundingClientRect()
            const top = document.querySelector("[data-community-top]")
            const bar = document.querySelector("[data-buyer-tab-bar]")
            out.push({
              t: Math.round(performance.now() - t0),
              page: pr ? { kind: page.getAttribute("data-post-overlay"), l: +pr.left.toFixed(1), t: +pr.top.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1), o: +Number(getComputedStyle(page).opacity).toFixed(3) } : null,
              list: document.querySelector("[data-feed-list]")?.__probeTag === window.__tag,
              card: window.__card?.isConnected === true,
              top: top?.__probeTag === window.__tag ? Math.round(top.getBoundingClientRect().top) : "new",
              bar: bar?.__probeTag === window.__tag ? Math.round(bar.getBoundingClientRect().top) : "new",
              path: location.pathname,
              y: Math.round(scrollY),
            })
            if (doneAt === null && done()) doneAt = performance.now()
            if ((doneAt !== null && performance.now() - doneAt >= tailMs) || performance.now() - t0 > maxMs) resolve(out)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      doneSrc,
      tailMs,
      maxMs,
    )
  const touchTap = async (p, cdp, x, y) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] })
    await sleep(50)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  /* Arrived: a phone's page puts its white ground up; a tablet's panel (post-overlay.tsx PostPanel) says "shown". */
  const SHOWN = `() => document.querySelector("[data-post-fullscreen-ground]")?.style.opacity === "1" || document.querySelector('[data-post-overlay-phase="shown"]') !== null`
  const GONE = `() => !document.querySelector("[data-post-overlay]")`

  for (const [label, vp] of VIEWPORTS) {
    console.log(`\n${label}`)
    const { p, errors } = await open(vp)
    const cdp = await p.target().createCDPSession()
    /* The photo post, its card put in the middle of what shows between the bars. */
    const card = await p.evaluate(() => {
      const el = [...document.querySelectorAll("article[data-post]")].find((a) => /did not crack/.test(a.textContent || ""))
      if (!el) return null
      const topBar = document.querySelector("[data-community-top]")?.getBoundingClientRect().bottom ?? 0
      const r0 = el.getBoundingClientRect()
      window.scrollBy(0, r0.top - topBar - 24)
      window.__tag = Math.random()
      window.__card = el
      for (const s of ["[data-feed-list]", "[data-community-top]", "[data-buyer-tab-bar]"]) {
        const n = document.querySelector(s)
        if (n) n.__probeTag = window.__tag
      }
      return el.getAttribute("data-post")
    })
    if (!card) {
      expect(false, "the photo post is in the feed")
      await p.close()
      continue
    }
    await sleep(300)
    const startY = await p.evaluate(() => Math.round(scrollY))
    const box = await p.evaluate(() => {
      const r = window.__card.getBoundingClientRect()
      const t = (window.__card.querySelector("[data-post-excerpt]") || window.__card.querySelector("[data-post-open]") || window.__card).getBoundingClientRect()
      const band = { t: document.querySelector("[data-community-top]")?.getBoundingClientRect().bottom ?? 0, b: document.querySelector('[data-buyer-tab-bar="shown"]')?.getBoundingClientRect().top ?? innerHeight }
      return { l: r.left, t: r.top, w: r.width, h: r.height, band, tap:{ x: Math.round(t.left + Math.min(t.width / 2, 80)), y: Math.round(t.top + Math.min(t.height / 2, 12)) } }
    })

    /* ── OPEN ── */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const opening = record(p, SHOWN, 300)
    await touchTap(p, cdp, box.tap.x, box.tap.y)
    const F = await opening
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const first = F.findIndex((f) => f.page)
    const shownFrames = F.slice(first)
    const vanished = shownFrames.filter((f) => !f.page).length
    expect(first >= 0 && vanished === 0, "OPEN: the post's page is on screen on every frame from its first to the end", { first: F[first]?.t, frames: shownFrames.length, vanished })
    const visible = shownFrames.filter((f) => f.page && f.page.o > 0.02)
    const f0 = visible[0]?.page
    /* From 640px the post opens as the computer's centred panel (post-overlay.tsx PostPanel), which fades and rises in place rather than growing out of the card. */
    const morphs = f0?.kind === "phone"
    if (morphs) {
      expect(Math.abs(f0.t - box.t) <= 12 && Math.abs(f0.w - box.w) <= 12, "its first visible frame is on the card", { first: f0, card: { t: Math.round(box.t), w: Math.round(box.w) } })
      const heights = visible.map((f) => f.page.h)
      const steps = heights.filter((h, i) => i > 0 && h < heights[i - 1] - 0.5).length
      const growing = new Set(heights.map((h) => Math.round(h))).size
      expect(steps === 0 && growing >= 6, "it grows over several frames and never steps back", { distinct: growing, backSteps: steps })
      const end = visible.at(-1)?.page
      expect(!!end && Math.abs(end.t) <= 1 && Math.abs(end.l) <= 1 && Math.abs(end.w - vp.width) <= 1 && Math.abs(end.h - vp.height) <= 1 && end.o === 1, "and it ends covering the screen", end)
    } else {
      const end = visible.at(-1)?.page
      const ops = visible.map((f) => f.page.o)
      expect(f0?.kind === "panel" && !!end && end.o === 1 && end.l >= 0 && end.l + end.w <= vp.width && ops.filter((o) => o < 1).length >= 3, "a tablet: the panel comes in over several frames and rests whole on the screen", { kind: f0?.kind, end, easing: ops.filter((o) => o < 1).length })
    }
    expect(F.every((f) => f.list && f.card), "KEPT: the feed's list and the card are the same nodes on every frame of the open", { list: F.filter((f) => !f.list).length, card: F.filter((f) => !f.card).length })
    const tops = [...new Set(F.map((f) => f.top))]
    const bars = [...new Set(F.map((f) => f.bar))]
    expect(tops.length === 1 && tops[0] !== "new" && bars.length === 1 && bars[0] !== "new", "the top bar and the tab bar are the same nodes and do not move", { tops, bars })
    const path = F.at(-1).path
    expect(/^\/community\/clay-studio\/post\//.test(path), "the address is the post's", path)
    await p.screenshot({ path: join(shots, `${label}-open.png`) })
    await sleep(500)

    /* ── CLOSE (the back button) ── */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const closing = record(p, GONE, 250)
    await p.evaluate(() => document.querySelector("[data-post-overlay-close]")?.click())
    const C = await closing
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const after = await p.evaluate(() => {
      const r = window.__card.getBoundingClientRect()
      return { t: r.top, l: r.left, w: r.width, h: r.height, y: Math.round(scrollY), path: location.pathname }
    })
    const cv = C.filter((f) => f.page && f.page.o > 0.05)
    const landing = cv.at(-1)?.page
    if (morphs) {
      const shrink = new Set(cv.map((f) => Math.round(f.page.h))).size
      expect(shrink >= 6, "CLOSE: it shrinks back over several frames", shrink)
      expect(!!landing && Math.abs(landing.t - after.t) <= 24 && Math.abs(landing.w - after.w) <= 24, "its last visible frame is on the card", { last: landing, card: { t: Math.round(after.t), w: Math.round(after.w) } })
    } else {
      expect(cv.length >= 3, "CLOSE: the panel leaves over several frames", cv.length)
    }
    expect(C.every((f) => f.list && f.card), "KEPT: the feed and the card are the same nodes on every frame of the close", { list: C.filter((f) => !f.list).length, card: C.filter((f) => !f.card).length })
    const ctops = [...new Set(C.map((f) => f.top))]
    const cbars = [...new Set(C.map((f) => f.bar))]
    expect(ctops.length === 1 && ctops[0] !== "new" && cbars.length === 1 && cbars[0] !== "new", "the top bar and the tab bar stay the same nodes and do not move", { tops: ctops, bars: cbars })
    expect(after.path === "/community/clay-studio" && C.at(-1).page === null, "the post has gone and the address is the feed's", after.path)
    /* It may move by the little that brings the card clear of the bars before the post goes back into it (return-morph.ts revealForReturn), never more. */
    const moved = Math.abs(after.y - startY)
    /* revealForReturn's own rule: the card 8px (its GAP) inside the band between the bars, its top first when it is taller. */
    const G = 8
    const need = box.h > box.band.b - box.band.t - 2 * G || box.t < box.band.t + G ? Math.abs(box.t - (box.band.t + G)) : Math.max(0, box.t + box.h - (box.band.b - G))
    expect(moved <= Math.round(need) + 2, "the feed stays where it was, or moves only what puts the card between the bars", { before: startY, after: after.y, need: Math.round(need) })
    await p.screenshot({ path: join(shots, `${label}-closed.png`) })

    /* ── SWIPE (one phone) ── */
    if (label === "phone-390") {
      await sleep(400)
      const tap = await p.evaluate(() => {
        const t = (window.__card.querySelector("[data-post-excerpt]") || window.__card).getBoundingClientRect()
        return { x: Math.round(t.left + Math.min(t.width / 2, 80)), y: Math.round(t.top + Math.min(t.height / 2, 12)) }
      })
      await touchTap(p, cdp, tap.x, tap.y)
      await p.waitForFunction(new Function(`return (${SHOWN})()`), { timeout: 3000 }).catch(() => {})
      await sleep(400)
      const swiping = record(p, GONE, 250, 4000)
      const x = Math.round(vp.width / 2)
      const y = 200
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
      for (let i = 1; i <= 10; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 22 }] })
        await sleep(16)
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      const S = await swiping
      const gone = S.at(-1)
      expect(gone.page === null && gone.path === "/community/clay-studio", "SWIPE: a pull down from the top of the post closes it", { page: gone.page, path: gone.path })
      expect(S.every((f) => f.list && f.card), "and the feed under it is the same nodes all the way", { list: S.filter((f) => !f.list).length, card: S.filter((f) => !f.card).length })
    }
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\npictures: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
