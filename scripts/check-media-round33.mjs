/**
 * ===========================================================================
 *  ROUND 33: A FEED'S VIDEOS, THE SPACES' DRAG, THE ADMIN'S PENCILS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-round33.tsx) in headless Chromium, every
 * picture through the image route as in production, answered here with real
 * JPEGs made by ffmpeg, late when a part says so:
 *
 *   MEDIA    a feed opened cold on a phone and a computer, light and dark,
 *            every frame from the first: for each video card, whether a
 *            picture is drawn in its box (the 16px still, the still, the
 *            first frame), and the play mark's opacity. A card that keeps
 *            its 16px still has a picture in its first frame; no card ever
 *            shows its play mark over an empty box while its picture is
 *            under PLAY_MARK_WAIT_MS away; the viewer's own video with no
 *            still sends its first frame once, as a JPEG, and nobody else's
 *            does. A video that will never have a frame (the play route
 *            refuses) shows the player's own dark ground and its mark.
 *   SPACES   the admin's Spaces, dragged with a mouse, a finger (a hold,
 *            then a move; near the bottom the list scrolls by itself) and
 *            the keyboard: the lifted copy follows the pointer one to one,
 *            has its shadow, the rows under it slide out of its way over
 *            several frames, the order is saved once on the drop, the press
 *            that ended a drag opens nothing, and a refused save puts the
 *            order back and says so. A swipe that is not a hold scrolls and
 *            lifts nothing.
 *   HINTS    the member side's blocks for an owner and for a member, on a
 *            computer and a phone: a pencil only for the owner; on a
 *            computer it shows only under the pointer; on a phone a small
 *            chip where it matters, and none on the community card.
 *
 *   PROBE_CSS=source node scripts/check-media-round33.mjs [MEDIA|SPACES|HINTS ...]
 *   SHOTS_DIR=/tmp/r33 to keep the pictures somewhere chosen (a temp folder otherwise, printed at the end)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const require = createRequire(join(root, "package.json"))
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-r33-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".round33-probe")
mkdirSync(stubs, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const PID = (n) => `a${n}000000-0000-4000-8000-00000000000${n}`
/* How late each answer is, by name, in ms (set per part). */
const late = new Map()

try {
  const make = (name, args) => {
    const out = join(stubs, name)
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, out])
    return readFileSync(out)
  }
  const files = {
    poster1: make("poster1.jpg", ["-f", "lavfi", "-i", "smptebars=size=1280x720", "-frames:v", "1", "-q:v", "4"]),
    poster2: make("poster2.jpg", ["-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", "-q:v", "4"]),
  }
  const clip = make("clip.webm", ["-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2", "-c:v", "libvpx", "-b:v", "400k", "-pix_fmt", "yuv420p"])
  /* The 16px still, as the server makes it (lib/communities/server/video-posters.ts blurOf). */
  const sharp = require("sharp")
  const blur = `data:image/webp;base64,${(await sharp(files.poster1).rotate().resize({ width: 16, height: 16, fit: "inside" }).webp({ quality: 50 }).toBuffer()).toString("base64")}`

  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => history.back(), refresh: () => log("refresh") }
const useLocation = (read) => {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => startTransition(() => setV(read()))
    window.addEventListener("popstate", on)
    return () => window.removeEventListener("popstate", on)
  }, [])
  return v
}
export const usePathname = () => useLocation(() => location.pathname)
export const useSearchParams = () => new URLSearchParams(useLocation(() => location.search))
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://abc.supabase.co/storage/v1/object/public/product-images/" + p } }) }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-round33.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.round33-probe/navigation.js", "next/link": "./.round33-probe/link.jsx", "next/image": "./.round33-probe/image.jsx", "next/dynamic": "./.round33-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const css = await appCss(root)
  const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (sheet, theme) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${sheet}</style><style>${theme}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  /*
    HEADLESS CHROMIUM HAS NO POINTING DEVICE: (hover: hover) is false there whatever it is told (Emulation.setEmulatedMedia
    and blink-settings both tried). The stylesheet says what each kind of device gets, so a computer's page is served the
    stylesheet with (hover: hover) and (pointer: fine) true and (hover: none) false, and a phone's the other way round.
  */
  const T = "(min-width:0px)"
  const F = "(max-width:0px)"
  const hoverAs = (on) => (css) =>
    css
      .replace(/\(\s*hover\s*:\s*hover\s*\)/g, on ? T : F)
      .replace(/\(\s*hover\s*:\s*none\s*\)/g, on ? F : T)
      .replace(/\(\s*pointer\s*:\s*fine\s*\)/g, on ? T : F)
      .replace(/\(\s*pointer\s*:\s*coarse\s*\)/g, on ? F : T)
  const deskHtml = page(hoverAs(true)(`${interFaces(root)}${css}`), hoverAs(true)(themeCss))
  const phoneHtml = page(hoverAs(false)(`${interFaces(root)}${css}`), hoverAs(false)(themeCss))

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  const pictureOf = (url) => {
    let target = url
    try {
      const u = new URL(url)
      if (u.pathname === "/_next/image") target = u.searchParams.get("url") || url
    } catch {
      return null
    }
    const m = /\/community\/(\w+)\.jpg/.exec(target)
    return m && files[m[1]] ? m[1] : null
  }

  async function open(vp, { query = "", recordFrom = null, phone = false } = {}) {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const closePage = p.close.bind(p)
    p.close = async () => {
      await closePage()
      await ctx.close()
    }
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url().split("#")[0]
      const name = pictureOf(url)
      const answer = (fn) => {
        const ms = late.get(name ?? (url.endsWith("/__clip.webm") ? "clip" : "")) ?? 0
        if (ms) setTimeout(fn, ms)
        else fn()
      }
      if (name) return answer(() => r.respond({ status: 200, contentType: "image/jpeg", body: files[name], headers: { "Cache-Control": "public, max-age=31536000", "Access-Control-Allow-Origin": "*" } }).catch(() => {}))
      if (url === `${ORIGIN}/__clip.webm`) {
        const n = clip.length
        return answer(() => r.respond({ status: 206, contentType: "video/webm", body: clip, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes 0-${n - 1}/${n}`, "Content-Length": String(n), "Access-Control-Allow-Origin": "*" } }).catch(() => {}))
      }
      if (url.startsWith(`${ORIGIN}/api/`)) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: phone ? phoneHtml : deskHtml })
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.evaluateOnNewDocument((b) => {
      window.__BLUR = b
      /* Where the pointer or the finger is, from the page's own events: what the lifted copy is measured against. */
      for (const type of ["mousemove", "touchmove", "pointermove"])
        document.addEventListener(type, (e) => (window.__pointerY = e.touches ? e.touches[0]?.clientY : e.clientY), { capture: true, passive: true })
    }, blur)
    if (recordFrom)
      await p.evaluateOnNewDocument((src) => {
        const fn = new Function(`return (${src})()`)
        window.__trace = []
        const t0 = performance.now()
        const tick = (now) => {
          try {
            window.__trace.push({ t: Math.round(now - t0), ...fn() })
          } catch (e) {
            window.__trace.push({ t: Math.round(now - t0), err: String(e) })
          }
          if (now - t0 < 4000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, recordFrom.toString())
    await p.goto(`${ORIGIN}/community/clay-studio${query ? `?${query}` : ""}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    return { p, errors }
  }

  /* ── MEDIA ─────────────────────────────────────────────────────────────── */

  /* Every frame, for each video card: its box, whether a picture is drawn in it, the play mark's opacity. */
  const cardFrame = () => {
    const out = {}
    for (const n of [1, 2, 3, 4]) {
      const id = `a${n}000000-0000-4000-8000-00000000000${n}`
      const card = document.querySelector(`[data-feed-list] [data-post="${id}"]`)
      const boxes = card ? [...card.querySelectorAll("[data-card-media], [data-post-thumb]")].filter((b) => b.getClientRects().length > 0) : []
      const box = boxes[0]
      if (!box) {
        out[n] = null
        continue
      }
      const r = box.getBoundingClientRect()
      const vis = (el) => {
        let o = 1
        for (let x = el; x && x !== box; x = x.parentElement) o *= Number(getComputedStyle(x).opacity)
        return o
      }
      const imgOk = (i) => i.complete && i.naturalWidth > 1 && !(i.currentSrc || "").startsWith("data:image/gif")
      const op = (els) => Math.max(0, ...els.map(vis))
      const blurs = [...box.querySelectorAll("img[data-video-blur]")].filter(imgOk)
      const posters = [...box.querySelectorAll("img[data-soft-img]")].filter(imgOk)
      const f = box.querySelector("[data-video-frame] video, [data-video-frame] img")
      const frames = f && (f.tagName === "VIDEO" ? f.readyState >= 2 : imgOk(f)) ? [f] : []
      const blurOn = op(blurs) > 0.5
      const posterOn = op(posters) > 0.5
      const frameOn = op(frames) > 0.5
      /* How much of a picture is drawn now, for the mark to be measured against (the two come in together). */
      const shown = Math.max(op(blurs), op(posters), op(frames))
      const none = !!box.querySelector("[data-video-none]")
      const mark = box.querySelector("[data-play-mark]")
      out[n] = { kind: box.hasAttribute("data-post-thumb") ? "thumb" : "card", inView: r.bottom > 0 && r.top < innerHeight, blur: blurOn, poster: posterOn, frame: frameOn, shown: +shown.toFixed(2), none, mark: mark ? +vis(mark).toFixed(2) : null, ground: getComputedStyle(box).backgroundColor }
    }
    return out
  }

  const summarise = (trace, n) => {
    const fr = trace.filter((f) => f[n])
    const pic = (f) => f[n].blur || f[n].poster || f[n].frame
    const first = fr.find(pic)
    const firstBox = fr[0]
    /* The mark ahead of its picture: more of the mark drawn than of the picture under it (both fade in over the same 160ms). */
    const markOnEmpty = fr.filter((f) => f[n].inView && (f[n].mark ?? 0) > f[n].shown + 0.15 && !f[n].none)
    const markAt = fr.find((f) => (f[n].mark ?? 0) > 0.5)
    return {
      boxAt: firstBox?.t ?? null,
      pictureAt: first ? first.t - firstBox.t : null,
      pictureBy: first ? (first[n].blur ? "blur" : first[n].poster ? "still" : "frame") : null,
      emptyFrames: first ? fr.filter((f) => f.t < first.t).length : fr.length,
      markOnEmpty: markOnEmpty.length,
      markAt: markAt ? markAt.t - firstBox.t : null,
      ground: firstBox?.[n].ground ?? null,
    }
  }

  async function mediaRun(label, { vp, phone, dark, query = "", posterLate = 600, clipLate = 300, shot }) {
    console.log(`\n  ${label}`)
    late.clear()
    late.set("poster1", posterLate)
    late.set("poster2", posterLate)
    late.set("clip", clipLate)
    const { p, errors } = await open(vp, { phone, query: `view=feed${dark ? "&dark=1" : ""}${query ? `&${query}` : ""}`, recordFrom: cardFrame })
    await p.waitForSelector("[data-feed-list] [data-post]", { timeout: 15000 })
    await sleep(3200)
    const trace = await p.evaluate(() => window.__trace)
    const asked = await p.evaluate(() => window.__asked)
    const sums = Object.fromEntries([1, 2, 3, 4].map((n) => [n, summarise(trace, n)]))
    for (const n of [1, 2, 3, 4]) console.log(`    post ${n}: ${JSON.stringify(sums[n])}`)
    await p.screenshot({ path: join(shots, `${shot}.png`) })
    return { p, errors, sums, asked, trace }
  }

  if (want("MEDIA")) {
    console.log("\nMEDIA: a feed's video cards, cold, frame by frame")
    for (const [vp, phone, dark, name] of [
      [PHONE, true, true, "phone, dark"],
      [PHONE, true, false, "phone, light"],
      [DESK, false, false, "computer, light (the thumbnail on the right)"],
    ]) {
      const { p, errors, sums, asked } = await mediaRun(name, { vp, phone, dark, shot: `media-${phone ? "phone" : "desk"}-${dark ? "dark" : "light"}` })
      expect(sums[1].pictureAt !== null && sums[1].emptyFrames === 0 && sums[1].pictureBy === "blur", `${name}: a video that keeps its 16px still has a picture in the first frame its box is drawn`, sums[1])
      for (const n of [1, 2, 3, 4]) expect(sums[n].markOnEmpty === 0, `${name}: post ${n}, the play mark never shows over an empty box`, sums[n])
      expect(sums[2].pictureAt !== null && sums[2].markAt !== null && Math.abs(sums[2].markAt - sums[2].pictureAt) <= 50, `${name}: a still that arrives late, the mark arrives with it`, { picture: sums[2].pictureAt, mark: sums[2].markAt })
      expect(sums[3].pictureBy === "frame" && sums[3].pictureAt !== null && sums[3].pictureAt < 1500, `${name}: a video with no still shows its first frame`, sums[3])
      const sent = asked.filter((a) => a.method === "POST" && /\/videos\/[^/]+\/poster(\?|$)/.test(a.path))
      const mine = sent.filter((a) => a.path.includes("/videos/v-mine/"))
      expect(mine.length === 1 && mine[0].type === "image/jpeg" && mine[0].size > 2000, `${name}: the viewer's own video with no still sends its first frame once, as a JPEG`, mine)
      expect(!sent.some((a) => a.path.includes("/videos/v-bare/") || a.path.includes("/videos/v-blur/")), `${name}: nobody else's video sends a frame`, sent.map((a) => a.path))
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
    {
      const name = "phone, dark, a still that is very late (2s)"
      const { p, sums } = await mediaRun(name, { vp: PHONE, phone: true, dark: true, posterLate: 2000, shot: "media-phone-dark-slow" })
      console.log(`    post 2 mark at ${sums[2].markAt}ms after its box, its still at ${sums[2].pictureAt}ms`)
      expect(sums[1].emptyFrames === 0, `${name}: the 16px still is there from the first frame whatever the still does`, sums[1])
      expect(sums[2].markOnEmpty === 0 && sums[2].markAt !== null && Math.abs(sums[2].markAt - sums[2].pictureAt) <= 50, `${name}: with no 16px still, the mark waits for the still however long it takes`, sums[2])
      await p.close()
    }
    {
      const name = "phone, dark, a video this browser will never draw a frame of"
      const { p, sums, trace } = await mediaRun(name, { vp: PHONE, phone: true, dark: true, query: "noplay=1", shot: "media-phone-dark-noplay" })
      const last = trace.filter((f) => f[3]).at(-1)?.[3]
      expect(last?.none && (last?.mark ?? 0) > 0.9, `${name}: the player's own dark ground and the mark, at once`, { last, markAt: sums[3].markAt })
      expect(sums[3].markAt !== null && sums[3].markAt < 700, `${name}: the mark does not wait out the 900ms when nothing will come`, sums[3].markAt)
      await p.close()
    }
  }

  /* ── SPACES ────────────────────────────────────────────────────────────── */

  const spacesUrl = (fail) => `view=spaces${fail ? "&fail=1" : ""}`
  const rowsSel = (phone) => (phone ? "[data-spaces-list] > li[data-space-row]" : "[data-spaces-table] tbody > tr[data-space-row]")
  const orderOf = (p, phone) => p.evaluate((sel) => [...document.querySelectorAll(sel)].map((r) => r.querySelector("[data-row-open]")?.getAttribute("aria-label")?.replace(/^Edit /, "")), rowsSel(phone))
  const rectOf = (p, phone, i) =>
    p.evaluate(
      (sel, i) => {
        const r = document.querySelectorAll(sel)[i]?.querySelector("[data-row-open]")?.getBoundingClientRect()
        return r ? { x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2, h: document.querySelectorAll(sel)[i].getBoundingClientRect().height } : null
      },
      rowsSel(phone),
      i,
    )
  const dragFrame = () => {
    const lift = document.querySelector("[data-space-lifted]")
    const lr = lift?.getBoundingClientRect()
    const phone = !!document.querySelector("[data-spaces-list] [data-lifted]")
    const sel = phone ? "[data-spaces-list] > li[data-space-row]" : "[data-spaces-table] tbody > tr[data-space-row]"
    const rows = [...document.querySelectorAll(sel)]
    const moveOf = (el) => {
      const t = getComputedStyle(phone ? el : el.querySelector("td") || el).transform
      if (!t || t === "none") return 0
      const m = t.match(/matrix\(([^)]+)\)/)
      return m ? +(+m[1].split(",")[5]).toFixed(1) : 0
    }
    return {
      lifted: lr ? +lr.top.toFixed(1) : null,
      shadow: lift ? getComputedStyle(lift).boxShadow !== "none" : false,
      moves: rows.map(moveOf),
      pointer: window.__pointerY ?? null,
      dragging: !!document.querySelector("[data-dragging]"),
      overlays: document.querySelectorAll("[data-space-lifted]").length,
      src: (() => { const e = document.querySelector("[data-lifted]"); return e ? +e.getBoundingClientRect().top.toFixed(1) : null })(),
      wrap: lift?.parentElement?.getAttribute("style")?.slice(0, 200) ?? null,
      scroll: document.querySelector("[data-scroll-pane]")?.scrollTop ?? 0,
      sheet: !!document.querySelector("[data-space-save]"),
    }
  }
  const startTrace = (p) =>
    p.evaluate((src) => {
      const fn = new Function(`return (${src})()`)
      window.__trace = []
      const t0 = performance.now()
      window.__stop = false
      const tick = (now) => {
        window.__trace.push({ t: Math.round(now - t0), ...fn() })
        if (!window.__stop) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, dragFrame.toString())
  const stopTrace = (p) => p.evaluate(() => ((window.__stop = true), window.__trace))
  const puts = (p) => p.evaluate(() => window.__asked.filter((a) => a.method === "PUT"))

  /*
    ONE TO ONE, MEASURED ON SETTLED FRAMES. A pointer event lands between two frames and the copy is drawn in the next one, so
    a frame sampled in between shows the pointer a step ahead. The copy is measured where the pointer did not move since the
    frame before (it has had its frame), from the first frame the copy moved: the pointer minus the copy's top is then the
    point it was held by, the same every time when it follows one to one. The longest frame while it is held is reported.
  */
  const follow = (trace) => {
    const held = trace.filter((f) => f.lifted !== null && f.pointer !== null)
    const startTop = held[0]?.lifted ?? 0
    const from = held.findIndex((f) => Math.abs(f.lifted - startTop) > 1)
    const gaps = []
    for (let i = Math.max(1, from + 2); from >= 0 && i < held.length; i++) if (held[i].pointer === held[i - 1].pointer) gaps.push(+(held[i].pointer - held[i].lifted).toFixed(1))
    /* The share of settled frames within 2px of the usual hold point, and the worst: a frame drawn a step late on a busy machine shows as one 7px outlier. */
    const mid = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    const within = gaps.length ? +(gaps.filter((g) => Math.abs(g - mid) <= 2).length / gaps.length).toFixed(3) : 0
    const spread = gaps.length ? +(Math.max(...gaps) - Math.min(...gaps)).toFixed(1) : null
    let longest = 0
    for (let i = 1; i < held.length; i++) longest = Math.max(longest, held[i].t - held[i - 1].t)
    return { gaps, spread, longest, within }
  }

  /* Rows that moved over several frames: at least one sibling seen part way through its move. */
  const slid = (trace, h) => trace.some((f) => f.moves.some((m) => Math.abs(m) > 3 && Math.abs(m) < h - 3))

  if (want("SPACES")) {
    console.log("\nSPACES: dragging a space into place")
    /* Computer, mouse. */
    for (const fail of [false, true]) {
      const name = `computer, mouse${fail ? ", the save refused" : ""}`
      const { p, errors } = await open(DESK, { query: spacesUrl(fail) })
      await p.waitForSelector(rowsSel(false), { timeout: 15000 })
      await sleep(400)
      const before = await orderOf(p, false)
      const a = await rectOf(p, false, 1)
      await startTrace(p)
      await p.mouse.move(a.x, a.y)
      await p.mouse.down()
      for (let k = 1; k <= 24; k++) {
        const y = a.y + (k * a.h * 3) / 24
        await p.mouse.move(a.x, y)
        await sleep(16)
      }
      await sleep(120)
      await p.mouse.up()
      await sleep(600)
      const trace = await stopTrace(p)
      const after = await orderOf(p, false)
      const saved = await puts(p)
      const held = trace.filter((f) => f.lifted !== null && f.pointer !== null)
      const { gaps, spread, longest, within } = follow(trace)
      console.log(`    ${held.length} frames lifted; pointer minus copy top, settled frames ${JSON.stringify(gaps.slice(0, 6))}..; within 2px on ${within * 100}% of settled frames, worst spread ${spread}px; longest frame while lifted ${longest}ms`)
      if (process.env.DUMP) console.log(JSON.stringify(trace.slice(0, 30).map((f) => [f.t, f.pointer, f.lifted, f.src, f.wrap])))
      expect(held.length >= 10 && held.every((f) => f.shadow), `${name}: the row is lifted (a copy with a shadow) while it is dragged`, held.length)
      expect(within >= 0.9, `${name}: the copy follows the pointer one to one (within 2px on 90% of settled frames or more)`, { within, spread })
      expect(slid(trace, a.h), `${name}: the rows under it slide out of its way over several frames`)
      expect(saved.length === 1, `${name}: the order is saved once, on the drop`, saved.map((s) => s.body))
      expect(!trace.some((f) => f.sheet) && !(await p.evaluate(() => !!document.querySelector("[data-space-save]"))), `${name}: the press that ended the drag opens nothing`)
      if (!fail) {
        const wantOrder = [before[0], before[2], before[3], before[4], before[1], ...before.slice(5)]
        expect(JSON.stringify(after) === JSON.stringify(wantOrder), `${name}: the row lands three places down`, { after: after.slice(0, 6) })
        expect(saved[0] && JSON.parse(saved[0].body).ids.slice(0, 5).join() === "s1,s3,s4,s5,s2", `${name}: the order saved is the order shown`, saved[0]?.body)
      } else {
        const toast = await p.evaluate(() => document.body.innerText.includes("The order was not saved."))
        expect(JSON.stringify(after) === JSON.stringify(before), `${name}: the order goes back to what it was`, { after: after.slice(0, 6) })
        expect(toast, `${name}: and a line says the order was not saved`)
      }
      await p.screenshot({ path: join(shots, `spaces-desk${fail ? "-fail" : ""}.png`) })
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
    /* Computer, keyboard. */
    {
      const name = "computer, keyboard"
      const { p, errors } = await open(DESK, { query: spacesUrl(false) })
      await p.waitForSelector(rowsSel(false), { timeout: 15000 })
      await sleep(400)
      /* A key first, so the focus that follows is a keyboard's (focus-visible), as a Tab would give. */
      await p.keyboard.press("Shift")
      await p.evaluate(() => document.querySelector("[data-spaces-table] [data-space-grip]")?.focus())
      await sleep(250)
      const focused = await p.evaluate(() => document.activeElement?.hasAttribute("data-space-grip") && getComputedStyle(document.activeElement).opacity)
      await p.keyboard.press("Enter")
      await sleep(250)
      await p.keyboard.press("ArrowDown")
      await sleep(250)
      await p.keyboard.press("ArrowDown")
      await sleep(250)
      await p.keyboard.press("Enter")
      await sleep(600)
      const saved = await puts(p)
      const after = await orderOf(p, false)
      expect(focused === "1", `${name}: the grip takes the keyboard's focus and shows`, focused)
      expect(saved.length === 1 && JSON.parse(saved[0].body).ids.slice(0, 3).join() === "s2,s3,s1", `${name}: Enter lifts, two arrows down, Enter drops two places down, saved once`, { saved: saved.map((s) => s.body), after: after.slice(0, 4) })
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
    /* Phone, finger. */
    {
      const name = "phone, a finger held then moved"
      const { p, errors } = await open(PHONE, { query: spacesUrl(false), phone: true })
      await p.waitForSelector(rowsSel(true), { timeout: 15000 })
      await sleep(400)
      const before = await orderOf(p, true)
      const a = await rectOf(p, true, 1)
      await startTrace(p)
      await p.touchscreen.touchStart(a.x, a.y)
      await sleep(420)
      for (let k = 1; k <= 20; k++) {
        const y = a.y + (k * a.h * 2) / 20
        await p.touchscreen.touchMove(a.x, y)
        await sleep(16)
      }
      await sleep(100)
      await p.touchscreen.touchEnd()
      await sleep(600)
      const trace = await stopTrace(p)
      const after = await orderOf(p, true)
      const saved = await puts(p)
      const held = trace.filter((f) => f.lifted !== null && f.pointer !== null)
      const { gaps, spread, longest, within } = follow(trace)
      console.log(`    ${held.length} frames lifted; settled within 2px on ${within * 100}% of settled frames, worst spread ${spread}px; longest frame while lifted ${longest}ms; order ${JSON.stringify(after.slice(0, 4))}`)
      expect(held.length >= 8 && held.every((f) => f.shadow), `${name}: after the hold the row is lifted with its shadow`, held.length)
      expect(within >= 0.9, `${name}: the copy follows the finger one to one`, { within, spread })
      expect(slid(trace, a.h), `${name}: the rows under it slide out of its way`)
      expect(saved.length === 1 && JSON.stringify(after.slice(0, 4)) === JSON.stringify([before[0], before[2], before[3], before[1]]), `${name}: saved once, two places down`, { saved: saved.map((s) => s.body) })
      expect(!(await p.evaluate(() => !!document.querySelector("[data-space-save]"))), `${name}: lifting the finger opens nothing`)
      await p.screenshot({ path: join(shots, "spaces-phone.png") })
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
    {
      const name = "phone, a quick swipe"
      const { p } = await open(PHONE, { query: spacesUrl(false), phone: true })
      await p.waitForSelector(rowsSel(true), { timeout: 15000 })
      await sleep(400)
      const a = await rectOf(p, true, 3)
      await startTrace(p)
      await p.touchscreen.touchStart(a.x, a.y)
      for (let k = 1; k <= 6; k++) {
        await p.touchscreen.touchMove(a.x, a.y - k * 12)
        await sleep(16)
      }
      await p.touchscreen.touchEnd()
      await sleep(500)
      const trace = await stopTrace(p)
      expect(!trace.some((f) => f.lifted !== null) && (await puts(p)).length === 0, `${name}: lifts nothing and saves nothing`)
      await p.close()
    }
    {
      const name = "phone, held near the bottom"
      const { p, errors } = await open(PHONE, { query: spacesUrl(false), phone: true })
      await p.waitForSelector(rowsSel(true), { timeout: 15000 })
      await sleep(400)
      const a = await rectOf(p, true, 2)
      await startTrace(p)
      await p.touchscreen.touchStart(a.x, a.y)
      await sleep(420)
      for (let k = 1; k <= 16; k++) {
        await p.touchscreen.touchMove(a.x, a.y + ((820 - a.y) * k) / 16)
        await sleep(16)
      }
      await sleep(1200)
      await p.touchscreen.touchEnd()
      await sleep(600)
      const trace = await stopTrace(p)
      const scrolled = Math.max(...trace.map((f) => f.scroll))
      console.log(`    the list scrolled ${scrolled}px by itself`)
      expect(scrolled > 100, `${name}: the list scrolls by itself while the row is held near the bottom`, scrolled)
      expect((await puts(p)).length === 1, `${name}: and the order is saved once on the drop`)
      expect(errors.length === 0, `${name}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── HINTS ─────────────────────────────────────────────────────────────── */

  if (want("HINTS")) {
    console.log("\nHINTS: the admin's pencils on the member side")
    const hints = (p) =>
      p.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll("[data-hint-block]")].map((b) => {
            const h = b.querySelector("[data-edit-hint]")
            const r = h?.getBoundingClientRect()
            return [b.getAttribute("data-hint-block"), h ? { href: h.getAttribute("href"), opacity: +getComputedStyle(h).opacity, shown: !!h.getClientRects().length && getComputedStyle(h).display !== "none", w: r ? Math.round(r.width) : 0 } : null]
          }),
        ),
      )
    const blocks = ["card", "chips", "learn", "events"]
    {
      const { p, errors } = await open(DESK, { query: "view=hints&role=admin" })
      await p.waitForSelector("[data-hint-block]", { timeout: 15000 })
      await sleep(500)
      const hover = "by stylesheet"
      const rest = await hints(p)
      console.log(`    computer (hover ${hover}), at rest: ${JSON.stringify(rest)}`)
      const hrefs = { card: "/app/community/clay-studio/settings?tab=page", chips: "/app/community/clay-studio/spaces", learn: "/app/community/clay-studio/learn", events: "/app/community/clay-studio/events" }
      for (const b of blocks) expect(rest[b]?.href === hrefs[b], `computer, owner: the ${b} block's pencil goes to ${hrefs[b]}`, rest[b]?.href)
      expect(blocks.every((b) => rest[b] && rest[b].opacity === 0), "computer, owner: no pencil shows until the pointer is on its block", rest)
      for (const b of blocks) {
        const at = await p.evaluate((b) => {
          const r = document.querySelector(`[data-hint-block="${b}"] > *`).getBoundingClientRect()
          return { x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 40) }
        }, b)
        await p.mouse.move(at.x, at.y)
        await sleep(300)
        const now = await hints(p)
        expect(now[b]?.opacity === 1 && blocks.filter((o) => o !== b).every((o) => now[o].opacity === 0), `computer, owner: the pointer on the ${b} block shows its pencil, and only its`, Object.fromEntries(blocks.map((o) => [o, now[o]?.opacity])))
        if (b === "chips") await p.screenshot({ path: join(shots, "hints-desk-chips.png") })
      }
      expect(errors.length === 0, "computer, owner: no page errors", errors)
      await p.close()
    }
    {
      const { p } = await open(DESK, { query: "view=hints&role=member" })
      await p.waitForSelector("[data-hint-block]", { timeout: 15000 })
      await sleep(400)
      const count = await p.evaluate(() => document.querySelectorAll("[data-edit-hint]").length)
      expect(count === 0, "computer, member: no pencil anywhere", count)
      await p.close()
    }
    {
      const { p } = await open(PHONE, { query: "view=hints&role=admin", phone: true })
      await p.waitForSelector("[data-hint-block]", { timeout: 15000 })
      await sleep(500)
      const hover = "by stylesheet"
      const now = await hints(p)
      console.log(`    phone (hover none ${hover}): ${JSON.stringify(now)}`)
      for (const b of ["chips", "learn", "events"]) expect(now[b]?.shown && now[b].opacity === 1 && now[b].w <= 30, `phone, owner: the ${b} block has its small pencil chip`, now[b])
      expect(now.card && !now.card.shown, "phone, owner: the community card draws none", now.card)
      await p.screenshot({ path: join(shots, "hints-phone.png"), fullPage: true })
      await p.close()
    }
    {
      const { p } = await open(PHONE, { query: "view=hints&role=member", phone: true })
      await p.waitForSelector("[data-hint-block]", { timeout: 15000 })
      await sleep(400)
      const count = await p.evaluate(() => document.querySelectorAll("[data-edit-hint]").length)
      expect(count === 0, "phone, member: no pencil anywhere", count)
      await p.close()
    }
  }

  await browser.close()
} finally {
  if (existsSync(stubs)) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\npictures in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
