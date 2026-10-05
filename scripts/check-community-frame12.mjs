/**
 * ===========================================================================
 *  THE COMMUNITY FRAME, ROUND 12: MEASURED, FRAME BY FRAME
 * ===========================================================================
 * The real frame (scripts/render-community-shell.tsx) with the probe's own
 * next/navigation stub, as in check-community-frame11.mjs.
 *
 *   SEARCH     390: the phone's community search is opaque white on every
 *              frame of its arrival and of Cancel, its field sits lower and
 *              has a hairline and a shadow, Cancel takes it away smoothly,
 *              and a post result carries no dot before its title
 *   PLACES     1440 and 390 at 4x CPU: a place that arrives fades in and
 *              rises a few px over several frames (never a cut), the bar and
 *              the columns never move; the first page of a visit does not
 *   NAVIGATOR  390: the current community's row is a white card with a
 *              hairline and a shadow, its name in ink (no veil)
 *   SPINNER    the community's loader is the app's ActivitySpinner: the
 *              same element, 26px, one turn a second
 *   MENU       1440 and 390: the "..." menu has the real picture beside the
 *              name and the short community list on both
 *   BADGE      the bell's and Messages' counts are red with white figures
 *   ABOUT      1024, 1280, 1440 and 390: About for a member and for a
 *              visitor sit in the same columns as the feed (the bar's row,
 *              the left column, the middle and the right)
 *   GALLERY    the frame and the thumbs have a hairline and a shadow; the
 *              pictures are asked for at sensible sizes, the first first
 *   LEAVE      the leave dialog asks why: six reasons, a note, all optional,
 *              and what was chosen is what is sent
 *   JOIN       a free join: Joining, then You're in with a check that draws
 *              itself, the button never changing size
 *   ICONS      every space chip carries its icon, the word named ones their
 *              kind's
 *   LOCATION   member rows say where people are from; the country filter
 *
 *   PROBE_CSS=source node scripts/check-community-frame12.mjs [section ...]
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
/* About's gallery is the product gallery's Swiper, whose stylesheet its component imports (left out of the bundle here). */
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".community-frame12-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-frame12-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  /*
    NEXT'S ROUTER FOLLOWS history.pushState (app router, since 14.1): a page that moves the address itself is followed by
    usePathname. The stub does the same, so the feed's own pushState redraws what reads the path, as it does for real.
  */
  writeFileSync(join(stubs, "navigation.js"), `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h, o) => { log("prefetch", h); window.__onPrefetch && window.__onPrefetch(h) }, back: () => log("back"), refresh: () => log("refresh") }
if (!window.__pushPatched) {
  window.__pushPatched = true
  const push = history.pushState.bind(history)
  history.pushState = (s, u, url) => { push(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
}
/* The router's state moves in a transition (ACTION_RESTORE for a pushState, a navigation for a link), never as an urgent update. */
export const usePathname = () => {
  const [p, setP] = useState(location.pathname)
  useEffect(() => {
    const on = () => startTransition(() => setP(location.pathname))
    window.addEventListener("probe:path", on)
    window.addEventListener("popstate", on)
    on()
    return () => { window.removeEventListener("probe:path", on); window.removeEventListener("popstate", on) }
  }, [])
  return p
}
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.__navigate && window.__navigate(href) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
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
    alias: { "@": ".", "next/navigation": "./.community-frame12-probe/navigation.js", "next/link": "./.community-frame12-probe/link.jsx", "next/image": "./.community-frame12-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  /* A real scrollbar on the computer (no --hide-scrollbars): a page that is shorter than the window must not move the frame. */
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  const NOTE = { id: "n1", from: "community", kind: "comment", source: "community", title: "Priya Raman commented on your post", body: "Lovely foot on that bowl.", url: "/community/clay-studio/post/p1", read: false, createdAt: new Date(Date.now() - 3_600_000).toISOString(), actor: { name: "Priya Raman", avatarUrl: null }, image: null, community: { name: "Clay Studio", slug: "clay-studio" } }
  async function open(path, vp, { notes = [], joinMs = 450 } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", async (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        let body = {}
        if (short.endsWith("/presence")) body = { ok: true, ready: true }
        else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: PLACES }
        else if (short.startsWith("/api/notifications")) body = { unread: notes.filter((n) => !n.read).length, items: notes, nextCursor: null, available: true }
        else if (short.includes("/dms")) body = { ready: true, unread: 2, conversations: [] }
        else if (short.includes("/search?index")) body = { index: INDEX }
        else if (short.includes("/search?q")) body = { results: { q: "glaze", posts: INDEX.posts.map(({ text, lastActivityAt, ...p }) => p), members: [], spaces: INDEX.spaces, lessons: [], events: [] } }
        else if (short.includes("/people/")) body = { person: CARD }
        else if (short.includes("/members?")) body = { members: [], nextCursor: null }
        else if (short.endsWith("/join") || short.endsWith("/leave")) {
          ;(globalThis.__posts ||= []).push({ url: short, body: r.postData() || "" })
          await sleep(joinMs)
          body = short.endsWith("/join") ? { state: "member" } : { state: "left" }
        }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(600)
    return { p, errors }
  }
  const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] })
  const centre = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width, h: b.height }
    }, sel)


  /* The navigator's list: this community first (the current row), then another, then a course. */
  const PLACES = [
    { kind: "community", id: "c0000000-0000-4000-8000-000000000001", slug: "clay-studio", title: "Clay Studio", imageUrl: null },
    { kind: "community", id: "c2", slug: "night-runners", title: "Night Runners", imageUrl: null },
    { kind: "course", id: "co-1", title: "Trimming feet that look made", imageUrl: null },
  ]
  /* What the search knows before a key is pressed: posts (one unread by any measure), a member, a space. */
  const INDEX = {
    at: Date.now(),
    spaces: [{ id: "s-glaze", slug: "glaze-lab", name: "Glaze lab", description: null, kind: "feed", icon: null }],
    posts: [
      { id: "p-glaze-1", title: "Celadon over a dark body", snippet: "Two coats, cone 6, slow cool.", text: "Two coats, cone 6, slow cool. The pooling in the rings is what I was after.", createdAt: new Date(Date.now() - 3_600_000).toISOString(), lastActivityAt: new Date().toISOString(), space: { slug: "glaze-lab", name: "Glaze lab", icon: null, kind: "feed" }, author: { name: "Priya Raman", avatarUrl: null } },
      { id: "p-glaze-2", title: null, snippet: "Does anyone sieve their glaze twice?", text: "Does anyone sieve their glaze twice? Mine still has lumps after 80 mesh.", createdAt: new Date(Date.now() - 86_400_000).toISOString(), space: { slug: "glaze-lab", name: "Glaze lab", icon: null, kind: "feed" }, author: { name: "Jonas Berg", avatarUrl: null } },
    ],
    members: [{ id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin", href: "/@priya" }],
    lessons: [],
    events: [],
  }
  const CARD = { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, href: "/@jonasb", bio: "Weekend potter.", location: "Porto, Portugal", role: "member", level: 3, levelName: "Contributor", activeAt: new Date().toISOString(), communities: { count: 2, inCommon: 1 }, owns: 0, following: false, isSelf: false, canMessage: true }
  const throttle = async (p, rate = 4) => { const c = await p.target().createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate }); return c }
  /* Every frame's computed style of one element until stopped: the probe's eyes on motion. */
  const record = (p, sel, fields) =>
    p.evaluate(
      (sel, fields) => {
        window.__rec = []
        window.__recOn = true
        const tick = () => {
          const el = document.querySelector(sel)
          const row = { t: Math.round(performance.now()) }
          if (el) {
            const cs = getComputedStyle(el)
            const b = el.getBoundingClientRect()
            for (const f of fields) row[f] = f === "top" ? Math.round(b.top * 10) / 10 : f === "left" ? Math.round(b.left * 10) / 10 : cs[f]
          } else row.missing = true
          window.__rec.push(row)
          if (window.__recOn) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      sel,
      fields,
    )
  const stop = (p) => p.evaluate(() => { window.__recOn = false; return window.__rec })

  /* ── SEARCH ──────────────────────────────────────────────────────────── */
  if (want("SEARCH")) {
    console.log("\nSEARCH: the phone's community search at 390, 4x CPU")
    const { p, errors } = await open("/community/clay-studio?case=feed", PHONE)
    await sleep(900)
    await throttle(p)
    await record(p, "[data-community-search-screen]", ["opacity", "backgroundColor"])
    await p.evaluate(() => window.__openCommunitySearch("clay-studio"))
    await sleep(700)
    const opening = await stop(p)
    const shown = opening.filter((r) => !r.missing)
    expect(shown.length >= 5 && shown.every((r) => r.opacity === "1" && r.backgroundColor === "rgb(255, 255, 255)"), "opening: the screen is opaque white on every frame (nothing of the page through it)", { frames: shown.length, ops: [...new Set(shown.map((r) => r.opacity))] })
    const head = await p.evaluate(() => {
      const field = document.querySelector("[data-community-search-field]")
      const b = field.getBoundingClientRect()
      const cs = getComputedStyle(field)
      return { top: Math.round(b.top), shadow: cs.boxShadow, border: cs.borderTopWidth + " " + cs.borderTopColor, bg: cs.backgroundColor }
    })
    expect(head.top >= 14 && head.shadow !== "none" && head.border.startsWith("1px") && head.bg === "rgb(255, 255, 255)", "the field sits a little lower, white on a hairline with a soft shadow", head)
    await p.type("[data-community-search-input]", "glaze")
    await sleep(900)
    const res = await p.evaluate(() => {
      const posts = [...document.querySelectorAll('[data-search-group="posts"] [data-search-option]')]
      /* Anything small and round before a title: the unread dot's shape. */
      const dots = posts.flatMap((o) => [...o.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.width <= 10 && b.height <= 10 && cs.borderRadius !== "0px" && cs.backgroundColor !== "rgba(0, 0, 0, 0)" }))
      return { posts: posts.length, dots: dots.length, unread: document.querySelectorAll("[data-community-search-screen] [data-unread-dot]").length }
    })
    expect(res.posts >= 1 && res.dots === 0 && res.unread === 0, "post results: no dot before a title", res)
    await p.screenshot({ path: join(shots, "search-390.png") })
    await record(p, "[data-community-search-screen]", ["opacity", "transform", "translate"])
    await p.tap("[data-community-search-close]")
    await sleep(600)
    const closing = (await stop(p)).filter((r) => !r.missing)
    const ops = closing.map((r) => +Number(r.opacity).toFixed(2)).filter((o, i, a) => i === 0 || o !== a[i - 1])
    const gone = await p.evaluate(() => !document.querySelector("[data-community-search-screen]"))
    expect(ops.length >= 3 && ops[0] === 1 && gone, "Cancel: the screen fades and sinks over several frames, then goes", { ops, gone })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── PLACES ──────────────────────────────────────────────────────────── */
  if (want("PLACES")) {
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      console.log(`\nPLACES: ${name}, 4x CPU, moving between the places`)
      const { p, errors } = await open("/community/clay-studio?case=nav&latency=250", vp)
      await sleep(1500)
      const first = await p.evaluate(() => getComputedStyle(document.querySelector("[data-community-body] > *")).animationName)
      expect(first === "none" || first === "fade-in", "the first page of the visit has no second landing", first)
      await throttle(p)
      for (const place of ["Classroom", "Members", "About", "Community"]) {
        await p.evaluate(() => {
          window.__land = []
          window.__landOn = true
          /* The landing as it is attached to the page that arrives (what the compositor then runs, whatever the page's thread is doing). */
          window.__inserted = []
          window.__mo?.disconnect()
          window.__mo = new MutationObserver((list) => {
            for (const m of list) for (const n of m.addedNodes) {
              if (!(n instanceof HTMLElement)) continue
              const a = n.getAnimations().find((x) => x.animationName === "community-place-in")
              window.__inserted.push({ spinner: n.hasAttribute("data-place-spinner"), anim: a ? Math.round(a.effect.getTiming().duration) : null })
            }
          })
          window.__mo.observe(document.querySelector("[data-community-body]"), { childList: true })
          const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return Math.round(b.left * 10) / 10 + "/" + Math.round(b.width * 10) / 10 }
          const tick = () => {
            const kid = document.querySelector("[data-community-body] > *")
            const cs = kid ? getComputedStyle(kid) : null
            window.__land.push({ t: performance.now(), path: location.pathname, op: cs ? +Number(cs.opacity).toFixed(2) : null, tr: cs ? cs.translate : null, spinner: !!document.querySelector("[data-place-spinner]"), bar: r("[data-community-top-row]"), left: r("[data-community-left]") })
            if (window.__landOn) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        const wall = await p.evaluate((n) => !!document.querySelector(`[data-wall-places] [data-community-nav="${n}"]`)?.offsetWidth, place)
        const sel = wall ? `[data-wall-places] [data-community-nav="${place}"]` : `[data-community-tabs] [data-community-nav="${place}"]`
        if (vp === PHONE) await p.tap(sel)
        else await p.click(sel)
        await sleep(1400)
        const f = await p.evaluate(() => { window.__landOn = false; return window.__land })
        const arrived = f.filter((x) => !x.spinner && x.op !== null)
        const at = arrived.findIndex((x, i) => i > 0 && (x.op < 1 || (x.tr && x.tr !== "none" && x.tr !== "0px")))
        const run = at >= 0 ? arrived.slice(at) : []
        const end = run.findIndex((x) => x.op === 1 && (!x.tr || x.tr === "none" || x.tr === "0px"))
        const motion = run.slice(0, end + 1)
        const ys = motion.map((x) => parseFloat(String(x.tr).split(" ")[1] || "0")).filter((y) => !Number.isNaN(y))
        const opsSeq = motion.map((x) => x.op)
        const inserted = await p.evaluate(() => window.__inserted)
        const landed = inserted.filter((x) => !x.spinner)
        expect(landed.length >= 1 && landed.every((x) => x.anim === 260), `${place}: the page that arrives carries the 260ms landing`, inserted)
        /* Sampled from the page's thread: a heavy page (About at 4x CPU) can hold that thread through the start, so the frames are a lower bound. */
        expect(motion.length === 0 || (Math.max(...ys) <= 6 && opsSeq.every((o, i) => i === 0 || o >= opsSeq[i - 1] - 0.01)), `${place}: what was sampled only rises and brightens (${motion.length} frames)`, { frames: motion.length, ys: ys.slice(0, 8), ops: opsSeq.slice(0, 8) })
        /* The landing's own length (the compositor runs it; a busy page thread only delays the frames sampled here). */
        const timing = await p.evaluate(() => { const a = document.querySelector("[data-community-body] > *")?.getAnimations?.().find((x) => x.animationName === "community-place-in"); return a ? { duration: a.effect.getTiming().duration, state: a.playState } : null })
        const ms = motion.length ? Math.round(motion.at(-1).t - motion[0].t) : 0
        console.log(`        ${place}: ${ms}ms of sampled frames, the animation ${JSON.stringify(timing)}`)
        expect(new Set(f.map((x) => x.bar)).size === 1 && new Set(f.map((x) => x.left)).size === 1, `${place}: the bar and the left column never move`, { bar: [...new Set(f.map((x) => x.bar))], left: [...new Set(f.map((x) => x.left))] })
      }
      await p.screenshot({ path: join(shots, `places-${name}.png`) })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
    /* A space chip switched in place is not a move: nothing rises. */
    const { p } = await open("/community/clay-studio?case=feed", DESK)
    await sleep(1500)
    await p.click('[data-space-chip="glaze-lab"]')
    await sleep(60)
    const anim = await p.evaluate(() => getComputedStyle(document.querySelector("[data-community-body] > *")).animationName)
    expect(anim !== "community-place-in", "a space switched in place does not land again", anim)
    await p.close()
  }

  /* ── NAVIGATOR ───────────────────────────────────────────────────────── */
  if (want("NAVIGATOR")) {
    console.log("\nNAVIGATOR: the current community's row at 390 and 1440")
    for (const [vp, name] of [[PHONE, "390"], [DESK, "1440"]]) {
      const { p, errors } = await open("/community/clay-studio?case=feed", vp)
      await sleep(2600)
      if (vp === PHONE) await p.tap("[data-community-top] [data-place-navigator-trigger]")
      else await p.click("[data-community-top] [data-place-navigator-trigger]")
      await sleep(800)
      const panel = vp === PHONE ? '[data-place-navigator-panel="sheet"]' : '[data-place-navigator-panel="popover"]'
      const m = await p.evaluate((panel) => {
        const row = document.querySelector(`${panel} [data-navigator-row][data-current]`)
        if (!row) return null
        const cs = getComputedStyle(row)
        const title = getComputedStyle(row.querySelector("[data-navigator-title]"))
        const other = document.querySelector(`${panel} [data-navigator-row][data-navigator-kind]:not([data-current]) [data-navigator-title]`)
        return { bg: cs.backgroundColor, shadow: cs.boxShadow, title: title.color, other: other ? getComputedStyle(other).color : null, opacity: cs.opacity }
      }, panel)
      expect(!!m && m.bg === "rgb(255, 255, 255)" && m.shadow !== "none" && m.title === "rgb(26, 26, 46)" && m.title === m.other && m.opacity === "1", `${name}: the current row is a white card with depth and its name in ink, like the others (no veil)`, m)
      await p.screenshot({ path: join(shots, `navigator-${name}.png`) })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── SPINNER ─────────────────────────────────────────────────────────── */
  if (want("SPINNER")) {
    console.log("\nSPINNER: a place that is slow to come shows the app's own spinner")
    const { p, errors } = await open("/community/clay-studio?case=nav&latency=9000&cold=members&idle=0", PHONE)
    await sleep(600)
    await p.evaluate(() => window.__navigate("/community/clay-studio/members"))
    await sleep(900)
    const g = await p.evaluate(() => {
      const s = document.querySelector("[data-place-spinner] [data-activity-spinner]")
      if (!s) return null
      const cs = getComputedStyle(s)
      /* Its layout size (a turning box's bounding rect is the rotated one). */
      return { cls: s.className, name: cs.animationName, duration: cs.animationDuration, timing: cs.animationTimingFunction, size: s.offsetWidth, spokes: s.querySelectorAll("rect").length }
    })
    expect(!!g && g.cls.includes("activity-spinner") && g.name === "activity-spin" && g.duration === "1s" && g.timing === "linear" && g.size === 26 && g.spokes === 8, "the /app spinner itself: activity-spinner, 26px, eight spokes, one linear turn a second", g)
    await p.screenshot({ path: join(shots, "spinner-390.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── MENU ────────────────────────────────────────────────────────────── */
  if (want("MENU")) {
    console.log("\nMENU: the \"...\" menu, the picture and the short list")
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      for (const staff of [false, true]) {
        const { p, errors } = await open(`/community/clay-studio?case=feed${staff ? "&staff=1" : ""}`, vp)
        const phone = vp === PHONE
        if (phone) await p.tap("[data-community-account] > button[data-account-more]")
        else await p.click("[data-community-account] [data-header-account] button[data-account-more]")
        await sleep(phone ? 800 : 400)
        const scope = phone ? "[data-account-sheet-body]" : "[data-account-menu]"
        const m = await p.evaluate((scope) => {
          const root = document.querySelector(scope)
          const who = root?.closest("[data-account-menu]") ? root.querySelector("[data-account-who]") : document.querySelector("[data-account-sheet-body] [data-account-who]")
          const img = who?.querySelector("img")
          return { rows: [...root.querySelectorAll("[data-account-item]")].map((r) => r.getAttribute("data-account-item")), avatar: img ? { src: img.getAttribute("src")?.slice(0, 22), w: Math.round(img.getBoundingClientRect().width) } : null }
        }, scope)
        /* Round 13: Membership, the member's own page here, after Saved posts. */
        const wantRows = ["invite", "saved", "membership", "profile", "settings", ...(staff ? ["dashboard"] : []), "log-out"]
        expect(JSON.stringify(m.rows) === JSON.stringify(wantRows), `${name}${staff ? ", a seller" : ""}: only the essentials, in order`, m.rows)
        expect(!!m.avatar && m.avatar.w >= 30, `${name}: the real picture beside the name`, m.avatar)
        await p.screenshot({ path: join(shots, `menu-${name}${staff ? "-seller" : ""}.png`) })
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
    }
  }

  /* ── BADGE ───────────────────────────────────────────────────────────── */
  if (want("BADGE")) {
    console.log("\nBADGE: the counts are red")
    const NOTE = { id: "n1", from: "community", kind: "comment", source: "community", title: "Priya Raman commented on your post", body: "Lovely foot.", url: "/community/clay-studio/post/p1", read: false, createdAt: new Date().toISOString(), actor: { name: "Priya Raman", avatarUrl: null }, image: null, community: { name: "Clay Studio", slug: "clay-studio" } }
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      const { p, errors } = await open("/community/clay-studio?case=feed", vp, { notes: [NOTE, { ...NOTE, id: "n2" }, { ...NOTE, id: "n3" }] })
      await p.waitForSelector("[data-community-top] [data-bell-badge]", { timeout: 8000 }).catch(() => {})
      await sleep(400)
      const m = await p.evaluate(() => {
        const look = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); return { bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius, text: e.textContent } }
        return { bell: look("[data-community-top] [data-bell-badge]"), messages: look("[data-community-messages-button] [data-count-badge]") }
      })
      const red = (b) => !!b && b.bg === "rgb(239, 68, 68)" && b.color === "rgb(255, 255, 255)"
      expect(red(m.bell) && (vp === PHONE ? m.messages === null || red(m.messages) : red(m.messages)), `${name}: the bell's and Messages' counts are red with white figures`, m)
      const box = await p.evaluate(() => { const b = document.querySelector("[data-community-top-actions]").getBoundingClientRect(); return { x: b.left - 8, y: b.top, width: b.width + 16, height: b.height } })
      await p.screenshot({ path: join(shots, `badges-${name}.png`), clip: box })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── ABOUT ───────────────────────────────────────────────────────────── */
  if (want("ABOUT")) {
    console.log("\nABOUT: the same columns as every other page")
    const geo = (p) =>
      p.evaluate(() => {
        const r = (sel) => { const e = document.querySelector(sel); if (!e || !e.offsetWidth) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)] }
        return { bar: r("[data-community-top-row]"), left: r("[data-community-left]"), main: r("[data-community-main]"), sheet: r("[data-community-sheet]"), side: r("[data-join-card]"), right: r("[data-community-right]"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
      })
    for (const width of [1440, 1280, 1024, 390]) {
      const vp = width === 390 ? PHONE : { width, height: 900, deviceScaleFactor: 1 }
      const got = {}
      for (const c of ["feed", "about-member", "about"]) {
        const { p, errors } = await open(`/community/clay-studio${c === "feed" ? "" : "/about"}?case=${c}`, vp)
        await sleep(700)
        got[c] = await geo(p)
        await p.screenshot({ path: join(shots, `about-${width}-${c}.png`) })
        expect(errors.length === 0, `${width} ${c}: no page errors`, errors)
        await p.close()
      }
      const f = got.feed
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
      expect(same(got["about-member"].bar, f.bar) && same(got.about.bar, f.bar), `${width}: the bar's row is the same for the feed, a member's About and a visitor's`, { feed: f.bar, member: got["about-member"].bar, visitor: got.about.bar })
      if (width >= 1024) {
        expect(same(got["about-member"].left, f.left) && same(got.about.left, f.left), `${width}: the left column is the same`, { feed: f.left, member: got["about-member"].left, visitor: got.about.left })
        expect(got["about-member"].sheet?.[0] === f.main[0] && got.about.sheet?.[0] === f.main[0], `${width}: About's sheet starts where the feed's middle column does`, { feed: f.main, member: got["about-member"].sheet, visitor: got.about.sheet })
      }
      if (width >= 1280) {
        expect(same(got["about-member"].side, f.right) && same(got.about.side, f.right), `${width}: About's side card is the feed's right column, exactly`, { right: f.right, member: got["about-member"].side, visitor: got.about.side })
        expect(got.about.sheet[1] === f.main[1], `${width}: and the sheet is the middle column's width`, { main: f.main, sheet: got.about.sheet })
      }
      expect(Object.values(got).every((g) => g.overflow <= 0), `${width}: no sideways overflow`, Object.fromEntries(Object.entries(got).map(([k, g]) => [k, g.overflow])))
    }
  }

  /* ── GALLERY ─────────────────────────────────────────────────────────── */
  if (want("GALLERY")) {
    console.log("\nGALLERY: depth and picture sizes")
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      const { p, errors } = await open("/community/clay-studio/about?case=about", vp)
      await sleep(900)
      const m = await p.evaluate(() => {
        const main = document.querySelector("[data-gallery-main]")
        const hair = main.querySelector("[data-gallery-hairline]")
        const thumb = document.querySelector("[data-gallery-thumb]")
        const imgs = [...main.querySelectorAll("img")]
        return {
          shadow: getComputedStyle(main).boxShadow,
          hairline: hair ? getComputedStyle(hair).boxShadow : null,
          thumb: thumb ? getComputedStyle(thumb).boxShadow : null,
          first: imgs[0] ? { sizes: imgs[0].getAttribute("sizes"), srcset: !!imgs[0].getAttribute("srcset"), priority: imgs[0].getAttribute("fetchpriority"), loading: imgs[0].getAttribute("loading") } : null,
          lazy: imgs.filter((i) => i.getAttribute("loading") === "lazy").length,
          count: imgs.length,
        }
      })
      expect(m.shadow !== "none" && !!m.hairline && m.hairline.includes("inset") && m.thumb !== "none", `${name}: the frame has a hairline and a soft shadow, the thumbs a shadow`, { shadow: m.shadow, hairline: m.hairline, thumb: m.thumb })
      expect(!!m.first && m.first.priority === "high" && m.first.loading === "eager" && m.lazy >= 1, `${name}: the first picture first, the far ones lazy`, m)
      const box = await p.evaluate(() => { const b = document.querySelector("[data-community-gallery]").getBoundingClientRect(); return { x: Math.max(0, b.left - 12), y: b.top - 12 + scrollY, width: b.width + 24, height: b.height + 24 } })
      await p.screenshot({ path: join(shots, `gallery-${name}.png`), clip: box })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── LEAVE ───────────────────────────────────────────────────────────── */
  if (want("LEAVE")) {
    console.log("\nLEAVE: asking why")
    for (const [vp, name] of [[PHONE, "390"], [DESK, "1440"]]) {
      const { p, errors } = await open("/community/clay-studio/about?case=about-member", vp)
      await sleep(700)
      await p.evaluate(() => document.querySelector("[data-membership-leave]").scrollIntoView({ block: "center" }))
      await sleep(200)
      await p.click("[data-membership-leave]")
      await sleep(700)
      const reasons = await p.evaluate(() => [...document.querySelectorAll("[data-leave-reason]")].map((r) => r.getAttribute("data-leave-reason")))
      expect(JSON.stringify(reasons) === JSON.stringify(["not_for_me", "too_busy", "too_expensive", "content", "people", "other"]), `${name}: the six reasons, none chosen`, reasons)
      await p.click('[data-leave-reason="too_busy"]')
      await p.type("[data-leave-note]", "Back in spring.")
      await sleep(250)
      const small = await p.evaluate(() => [...document.querySelectorAll("[data-leave-dialog] button, [data-leave-dialog] textarea")].map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 40))
      expect(small.length === 0, `${name}: every control at least 40px tall`, small)
      await p.screenshot({ path: join(shots, `leave-${name}.png`) })
      await p.click("[data-leave-confirm]")
      await sleep(900)
      const sent = await p.evaluate(() => null)
      void sent
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
    /* What was sent: read on the probe's side of the network. */
    const posts = globalThis.__posts || []
    const leave = posts.filter((x) => x.url.endsWith("/leave"))
    const bodies = leave.map((x) => JSON.parse(x.body || "{}"))
    expect(leave.length === 2 && bodies.every((b) => b.reason === "too_busy" && b.note === "Back in spring."), "the reason and the note go with the leave", bodies)
    /* Before part 98: no question. */
    const { p } = await open("/community/clay-studio/about?case=about-member&ask=0", DESK)
    await sleep(600)
    await p.click("[data-membership-leave]")
    await sleep(600)
    const plain = await p.evaluate(() => ({ dialog: !!document.querySelector("[data-leave-dialog]"), reasons: document.querySelectorAll("[data-leave-reason]").length }))
    expect(plain.dialog && plain.reasons === 0, "before part 98 the dialog asks nothing", plain)
    await p.close()
  }

  /* ── JOIN ────────────────────────────────────────────────────────────── */
  if (want("JOIN")) {
    console.log("\nJOIN: a free join, frame by frame at 4x CPU")
    for (const [vp, name] of [[PHONE, "390"], [{ width: 1440, height: 900, deviceScaleFactor: 1 }, "1440"]]) {
      const { p, errors } = await open("/community/night-runners/about?case=about-free", vp, { joinMs: 700 })
      await sleep(700)
      await throttle(p)
      const sel = vp === PHONE ? "[data-join-bar] button[data-join-phase]" : "[data-join-card] button[data-join-phase]"
      await p.evaluate((sel) => {
        window.__jf = []
        window.__jfOn = true
        const tick = () => {
          const b = document.querySelector(sel)
          const path = b?.querySelector("[data-join-check] path")
          if (b) { const r = b.getBoundingClientRect(); window.__jf.push({ phase: b.getAttribute("data-join-phase"), w: Math.round(r.width), h: Math.round(r.height), dash: path ? getComputedStyle(path).strokeDashoffset : null, bg: getComputedStyle(b).backgroundColor }) }
          if (window.__jfOn) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, sel)
      if (vp === PHONE) await p.tap(sel)
      else await p.click(sel)
      await sleep(250)
      await p.screenshot({ path: join(shots, `join-${name}-joining.png`) })
      await sleep(800)
      await p.screenshot({ path: join(shots, `join-${name}-in.png`) })
      const f = await p.evaluate(() => { window.__jfOn = false; return window.__jf })
      const phases = f.map((x) => x.phase).filter((v, i, a) => i === 0 || v !== a[i - 1])
      const dashes = f.filter((x) => x.phase === "joined" && x.dash !== null).map((x) => parseFloat(x.dash)).filter((v, i, a) => i === 0 || v !== a[i - 1])
      expect(JSON.stringify(phases) === JSON.stringify(["idle", "joining", "joined"]), `${name}: idle, Joining, You're in`, phases)
      expect(dashes.length >= 3 && dashes[0] > 10 && dashes.at(-1) === 0, `${name}: the check draws itself over several frames`, dashes.slice(0, 10))
      /* Its size never changes; its ground only darkens under the finger (the press) and is the same ink before and after. */
      expect(new Set(f.map((x) => `${x.w}x${x.h}`)).size === 1 && f[0].bg === f.at(-1).bg, `${name}: the button keeps its size the whole way (no bump), and its ink`, { sizes: [...new Set(f.map((x) => `${x.w}x${x.h}`))], first: f[0].bg, last: f.at(-1).bg })
      const flag = await p.evaluate(() => sessionStorage.getItem("storelib:community-joined"))
      expect(flag === "night-runners", `${name}: the member's frame is told to say welcome`, flag)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── ICONS ───────────────────────────────────────────────────────────── */
  if (want("ICONS")) {
    console.log("\nICONS: every chip has its space's icon")
    for (const [vp, name] of [[PHONE, "390"], [DESK, "1440"]]) {
      const { p, errors } = await open("/community/clay-studio?case=feed", vp)
      await sleep(700)
      const chips = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-space-chip]")].map((c) => [c.getAttribute("data-space-chip"), c.querySelector("[data-space-glyph]")?.textContent ?? null])))
      expect(chips.general === "💬" && chips.announcements === "📣" && chips.critique === "🏺" && chips["glaze-lab"] === "💬" && chips["kiln-room"] === "⚡" && chips.all === null, `${name}: the admin's emoji, else the kind's, as the dashboard shows them`, chips)
      const box = await p.evaluate(() => { const b = document.querySelector("[data-space-chips]").getBoundingClientRect(); return { x: Math.max(0, b.left - 4), y: b.top - 6, width: Math.min(b.width + 8, innerWidth), height: b.height + 12 } })
      await p.screenshot({ path: join(shots, `chips-${name}.png`), clip: box })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── LOCATION ────────────────────────────────────────────────────────── */
  if (want("LOCATION")) {
    console.log("\nLOCATION: where members are from")
    for (const [vp, name] of [[PHONE, "390"], [DESK, "1440"]]) {
      const { p, errors } = await open("/community/clay-studio/members?case=members", vp)
      await sleep(900)
      const m = await p.evaluate(() => ({
        rows: [...document.querySelectorAll("[data-member-location]")].map((e) => ({ text: e.textContent.trim(), color: getComputedStyle(e).color })),
        select: !!document.querySelector("[data-member-country] select"),
        options: document.querySelectorAll("[data-member-country] option").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }))
      expect(m.rows.length === 4 && m.rows.some((r) => r.text === "Lisbon, Portugal") && m.rows.every((r) => !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(r.text)), `${name}: member rows say "City, Country" in quiet text, no flags`, m.rows)
      expect(m.select && m.options > 200 && m.overflow <= 0, `${name}: the country filter lists every country by name`, { select: m.select, options: m.options, overflow: m.overflow })
      await p.select("[data-member-country] select", "PT")
      await sleep(600)
      const asked = await p.evaluate(() => (performance.getEntriesByType("resource") || []).map((e) => e.name).filter((n) => n.includes("/members?")).at(-1) || null)
      expect(!!asked && asked.includes("country=PT"), `${name}: choosing a country asks the directory for it`, asked)
      await p.screenshot({ path: join(shots, `members-${name}.png`) })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

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
