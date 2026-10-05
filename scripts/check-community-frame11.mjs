/**
 * ===========================================================================
 *  THE COMMUNITY FRAME, ROUND 11: MEASURED, FRAME BY FRAME
 * ===========================================================================
 * The real frame (scripts/render-community-shell.tsx), with the probe's own
 * next/navigation stub following history.pushState as Next's router does
 * (the feed moves the address itself when a space chip switches the list).
 *
 *   PILLS     a 390px phone at 4x CPU and a slow server (900ms a list):
 *             a finger on a space chip darkens it on the next frame; the
 *             chip is chosen on the frame after the finger lifts and the
 *             list (read ahead) is on screen on the frame after that, and
 *             eases in over several frames; ten quick taps on ten chips,
 *             none lost (each chosen in turn, the last one's list shown)
 *   BELL      the phone's notifications sheet with one notification is at
 *             least half the screen, the row at its top
 *   MENU      the "..." menu: Invite people, Saved posts, Profile,
 *             Settings, Dashboard (a seller) and Log out, nothing else, at
 *             390 (the sheet) and 1440 (the dropdown)
 *   SPINNER   the place spinner turns on the compositor: with the page's
 *             thread blocked for 600ms the frames the compositor sends
 *             still show it turning
 *   ENTER     a community entered from Explore: the spinner, then the page
 *             easing in by opacity over several frames
 *   PULL      pull to refresh on the feed at 390: spokes appear one by one
 *             with the pull, spin while refreshing, and the spinner's box
 *             never overlaps the content's, measured on every frame
 *   PLACES    1440: moving between Community, Classroom, Calendar, Members
 *             and About never changes the bar's width or the columns' x on
 *             any frame (no scrollbar coming and going)
 *   EMPTY     the classroom, the calendar and the members with nothing in
 *             them, at 390 and 1440 (pictures)
 *   ICONS     the places list's icons (a picture)
 *
 *   PROBE_CSS=source node scripts/check-community-frame11.mjs [section ...]
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
const stubs = join(root, ".community-frame11-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-frame11-")), "shots")
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
    alias: { "@": ".", "next/navigation": "./.community-frame11-probe/navigation.js", "next/link": "./.community-frame11-probe/link.jsx", "next/image": "./.community-frame11-probe/image.jsx" },
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  const NOTE = { id: "n1", from: "community", kind: "comment", source: "community", title: "Priya Raman commented on your post", body: "Lovely foot on that bowl.", url: "/community/clay-studio/post/p1", read: false, createdAt: new Date(Date.now() - 3_600_000).toISOString(), actor: { name: "Priya Raman", avatarUrl: null }, image: null, community: { name: "Clay Studio", slug: "clay-studio" } }
  async function open(path, vp, { notes = [] } = {}) {
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
        else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
        else if (short.startsWith("/api/notifications")) body = { unread: notes.filter((n) => !n.read).length, items: notes, nextCursor: null, available: true }
        else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
        else if (short.includes("/search")) body = { index: { at: Date.now(), spaces: [], posts: [], members: [], lessons: [], events: [] } }
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

  /* ── PILLS ───────────────────────────────────────────────────────────── */
  if (want("PILLS")) {
    console.log("\nPILLS: phone 390, 4x CPU, a slow server (900ms a list)")
    const { p, errors } = await open("/community/clay-studio?case=feed", PHONE)
    await p.evaluate(() => { window.__feedLatency = 900 })
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    /* Every space's first page read ahead on idle, one at a time: wait for it. */
    const t0 = Date.now()
    await p.waitForFunction(() => (window.__feedSpans || []).filter((s) => s.end).length >= 4, { timeout: 20_000 }).catch(() => {})
    console.log(`        read ahead: ${await p.evaluate(() => window.__feedSpans.filter((s) => s.end).length)} lists in ${Date.now() - t0}ms`)
    await p.evaluate(() => {
      window.__lt = []
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask" }) } catch {}
      window.__taps = []
      /* The browser's own measure of a tap (Event Timing, what INP is made of): from the finger to the next frame painted after the page handled it. */
      window.__ev = []
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ev.push({ type: e.name, start: e.startTime, end: e.processingEnd, paint: e.startTime + e.duration }))).observe({ type: "event", durationThreshold: 16, buffered: false }) } catch {}
      /* When the list on screen changed (its key on the feed), in the page's clock. */
      new MutationObserver(() => { const t = window.__taps.at(-1); if (t && !t.list) t.list = performance.now() }).observe(document.querySelector("[data-community-feed]"), { attributes: true, attributeFilter: ["data-feed-key"] })
      document.addEventListener("pointerdown", (e) => { const c = e.target.closest?.("[data-space-chip]"); window.__taps.push({ chip: c ? c.getAttribute("data-space-chip") : String(e.target.tagName), down: performance.now(), up: 0, click: 0 }) }, true)
      document.addEventListener("pointerup", (e) => { const c = e.target.closest?.("[data-space-chip]"); const t = window.__taps.at(-1); if (c && t) t.up = performance.now() }, true)
      document.addEventListener("click", (e) => { const c = e.target.closest?.("[data-space-chip]"); const t = window.__taps.at(-1); if (c && t) t.click = performance.now() }, true)
      /* When React put the chosen chip in the page (its commit), apart from when a frame showed it. */
      new MutationObserver(() => { const t = window.__taps.at(-1); const on = document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip"); if (t && on === t.chip && !t.commit) t.commit = performance.now() }).observe(document.querySelector("[data-space-chips]"), { attributes: true, subtree: true, attributeFilter: ["aria-current"] })
      window.__rec = () => {
        window.__frames = []
        window.__recOn = true
        /* Read after the frame is painted (a task posted from the frame's callback), so what is recorded is what was on screen, whatever order the page's own frame callbacks ran in. */
        const hop = new MessageChannel()
        hop.port1.onmessage = () => sample()
        const tick = () => {
          hop.port2.postMessage(0)
          if (window.__recOn) requestAnimationFrame(tick)
        }
        const sample = () => {
          const now = performance.now()
          const list = document.querySelector("[data-feed-list]")
          const feed = document.querySelector("[data-community-feed]")
          window.__frames.push({
            t: now,
            pressed: [...document.querySelectorAll("[data-space-chip][data-pressed]")].map((c) => c.getAttribute("data-space-chip")),
            chosen: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip") ?? null,
            feed: feed?.getAttribute("data-community-feed") ?? null,
            waiting: feed?.hasAttribute("data-feed-waiting") ?? false,
            spinner: !!document.querySelector("[data-place-spinner]"),
            opacity: list ? +Number(getComputedStyle(list).opacity).toFixed(2) : null,
            first: list?.querySelector("[data-post-card], article")?.textContent?.slice(0, 24) ?? null,
          })
        }
        requestAnimationFrame(tick)
      }
    })
    const chipAt = async (slug) => {
      await p.evaluate((slug) => document.querySelector(`[data-space-chip="${slug}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" }), slug)
      return centre(p, `[data-space-chip="${slug}"]`)
    }
    const expectFeed = (slug) => (slug === "all" ? "all" : `space:${slug}`)

    /* ONE TAP, read frame by frame. */
    const one = async (slug) => {
      const at = await chipAt(slug)
      await p.evaluate(() => window.__rec())
      await sleep(50)
      await touch(cdp, "touchStart", at.x, at.y)
      await sleep(70)
      await touch(cdp, "touchEnd", at.x, at.y)
      await sleep(700)
      const { frames, taps, ev } = await p.evaluate(() => { window.__recOn = false; return { frames: window.__frames, taps: window.__taps, ev: window.__ev } })
      const tap = taps.at(-1)
      const click = ev.filter((e) => e.type === "click" && e.start >= tap.down - 5).at(0)
      const after = (t) => frames.findIndex((f) => f.t > t)
      const downAt = after(tap.down)
      const upAt = after(tap.up || tap.down)
      const pressF = frames.findIndex((f, i) => i >= downAt && f.pressed.includes(slug))
      const chosenF = frames.findIndex((f, i) => i >= upAt && f.chosen === slug)
      const listF = frames.findIndex((f, i) => i >= upAt && f.feed === expectFeed(slug) && !f.waiting && f.opacity !== null)
      const ops = frames.slice(listF).map((f) => f.opacity)
      const fade = ops.filter((o, i) => i === 0 || o !== ops[i - 1])
      return {
        pressFrames: pressF - downAt + 1,
        chosenFrames: chosenF - upAt + 1,
        chosenMs: chosenF >= 0 ? Math.round(frames[chosenF].t - tap.up) : null,
        split: { click: Math.round(tap.click - tap.up), commit: Math.round((tap.commit || 0) - tap.click), paint: click ? Math.round(click.paint - tap.click) : null, list: tap.list ? Math.round(tap.list - (click ? click.paint : tap.commit)) : null },
        listFrames: listF - upAt + 1,
        listMs: listF >= 0 ? Math.round(frames[listF].t - tap.up) : null,
        fade,
        spinner: frames.some((f) => f.spinner),
        gaps: Math.max(...frames.slice(Math.max(0, upAt - 1), listF + 3).map((f, i, a) => (i ? Math.round(f.t - a[i - 1].t) : 0))),
      }
    }
    const runs = []
    for (const slug of ["critique", "glaze-lab", "all", "general"]) {
      const r = await one(slug)
      runs.push(r)
      console.log(`        ${slug.padEnd(10)} press ${r.pressFrames} frame(s), chosen ${r.chosenFrames} (${r.chosenMs}ms after lift), list ${r.listFrames} (${r.listMs}ms), longest frame ${r.gaps}ms, click>chip committed ${r.split.commit}ms, click>painted ${r.split.paint ?? "<16"}ms, list committed ${r.split.list}ms after that paint, fade ${JSON.stringify(r.fade)}${r.spinner ? ", SPINNER" : ""}`)
    }
    expect(runs.every((r) => r.pressFrames === 1), "a finger on a chip darkens it on the very next frame", runs.map((r) => r.pressFrames))
    /*
      THE BROWSER'S OWN CLOCK DECIDES (Event Timing: a click's duration runs to the next frame painted after it). This machine is
      shared, so the probe's own frame sampler can be starved; the medians of four taps are what is asserted, every tap is printed.
    */
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const painted = runs.map((r) => r.split.paint ?? 16)
    const listAfter = runs.map((r) => r.split.list ?? 999)
    expect(median(painted) <= 50 && runs.every((r) => r.split.commit <= 40), "the chosen chip is painted on the frame after the click (React's part: a row of chips)", { painted, committed: runs.map((r) => r.split.commit) })
    expect(median(listAfter) <= 50 && runs.every((r) => !r.spinner), "the list read ahead follows on the next frame, no spinner", { listAfter })
    const touchAction = await p.evaluate(() => [...document.querySelectorAll("[data-space-chip]")].map((c) => getComputedStyle(c).touchAction))
    expect(touchAction.every((t) => t === "manipulation"), "every chip is touch-action: manipulation (a quick second tap is a tap, not a double tap to zoom on iOS)", [...new Set(touchAction)])
    expect(runs.every((r) => r.fade.length >= 3 && r.fade[0] < 1 && r.fade.at(-1) === 1), "and it eases in over several frames (a crossfade, not a cut)", runs.map((r) => r.fade))
    await p.screenshot({ path: join(shots, "pills-phone.png") })

    /* TEN QUICK TAPS, about 9 a second. */
    await p.evaluate(() => { document.querySelector("[data-space-chips-track]").scrollLeft = 0 })
    await sleep(300)
    /* The chips wholly on screen at the row's start, tapped in a pattern that never repeats the one just chosen. */
    const inView = await p.evaluate(() => [...document.querySelectorAll("[data-space-chip]")].filter((c) => { const b = c.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth - 24 }).map((c) => c.getAttribute("data-space-chip")))
    const seq = Array.from({ length: 10 }, (_, i) => inView[(i * 2 + 1) % inView.length === (i ? ((i - 1) * 2 + 1) % inView.length : -1) ? (i + 1) % inView.length : (i * 2 + 1) % inView.length])
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) seq[i] = inView[(inView.indexOf(seq[i]) + 1) % inView.length]
    const visible = inView
    await p.evaluate(() => { window.__taps = []; window.__rec() })
    for (const s of seq) {
      /* Where the chip is now (the row may have moved to show a chosen chip). */
      const at = await centre(p, `[data-space-chip="${s}"]`)
      await touch(cdp, "touchStart", at.x, at.y)
      await sleep(40)
      await touch(cdp, "touchEnd", at.x, at.y)
      await sleep(70)
    }
    await sleep(1200)
    const quick = await p.evaluate(() => { window.__recOn = false; return { frames: window.__frames, taps: window.__taps, lt: window.__lt } })
    const chosenRun = quick.frames.map((f) => f.chosen).filter((c, i, a) => i === 0 || c !== a[i - 1])
    const clicked = quick.taps.filter((t) => t.click).length
    const last = quick.frames.at(-1)
    /* Every tap shows: the sequence of chosen chips contains the taps in order. */
    let k = 0
    for (const c of chosenRun) if (c === seq[k]) k++
    expect(clicked === seq.length, "ten quick taps: ten clicks reach the chips", { clicked, taps: quick.taps.length, visibleAtStart: visible })
    expect(k === seq.length, "each tap chose its chip, in order (none lost)", { chosenRun })
    expect(last.chosen === seq.at(-1) && last.feed === expectFeed(seq.at(-1)) && !last.waiting && last.opacity === 1, "the last tap's list is on screen at the end", last)
    const slowFrames = quick.frames.map((f, i, a) => (i ? Math.round(f.t - a[i - 1].t) : 0))
    console.log(`        ten taps: longest frame ${Math.max(...slowFrames)}ms, frames over 50ms: ${slowFrames.filter((d) => d > 50).length}, long tasks ${JSON.stringify(quick.lt.slice(-12))}`)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── BELL ────────────────────────────────────────────────────────────── */
  if (want("BELL")) {
    console.log("\nBELL: the community bell's sheet on a 390px phone, one notification")
    const { p, errors } = await open("/community/clay-studio?case=feed", PHONE, { notes: [NOTE] })
    await sleep(600)
    await p.tap("[data-community-top] [data-notification-bell]")
    await p.waitForSelector('[data-notification-panel="sheet"][data-state="open"]', { timeout: 8000 })
    await sleep(700)
    const m = await p.evaluate(() => {
      const panel = document.querySelector('[data-notification-panel="sheet"]')
      let sheet = panel
      while (sheet && !sheet.querySelector(":scope > [data-sheet-handle]")) sheet = sheet.parentElement
      const s = sheet.getBoundingClientRect()
      const row = panel.querySelector("li")?.getBoundingClientRect()
      const head = document.querySelector("[data-bell-sheet-header]").getBoundingClientRect()
      return { vh: innerHeight, sheet: Math.round(s.height), top: Math.round(s.top), rowTop: row ? Math.round(row.top) : null, headBottom: Math.round(head.bottom), rows: panel.querySelectorAll("li").length }
    })
    expect(m.rows === 1 && m.sheet >= m.vh * 0.49 && m.sheet <= m.vh * 0.6, "one notification: the sheet is about half the screen, not a sliver", m)
    expect(m.rowTop !== null && m.rowTop - m.headBottom >= 0 && m.rowTop - m.headBottom <= 6, "and the row sits at the top of it, right under the header", m)
    await sleep(900)
    await p.screenshot({ path: join(shots, "bell-sheet-390.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── MENU ────────────────────────────────────────────────────────────── */
  if (want("MENU")) {
    console.log("\nMENU: the bar's \"...\" menu")
    const rowsOf = (p, sel) => p.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-account-item]`)].map((r) => r.getAttribute("data-account-item")), sel)
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      for (const staff of [false, true]) {
        const { p, errors } = await open(`/community/clay-studio?case=feed${staff ? "&staff=1" : ""}`, vp)
        const phone = vp === PHONE
        if (phone) await p.tap("[data-community-account] > button[data-account-more]")
        else await p.click("[data-community-account] [data-header-account] button[data-account-more]")
        await sleep(phone ? 700 : 350)
        const rows = await rowsOf(p, phone ? "[data-account-sheet-body]" : "[data-account-menu]")
        const wantRows = ["invite", "saved", "profile", "settings", ...(staff ? ["dashboard"] : []), "log-out"]
        expect(JSON.stringify(rows) === JSON.stringify(wantRows), `${name}${staff ? ", a seller" : ""}: only the essentials, in order`, rows)
        await p.screenshot({ path: join(shots, `menu-${name}${staff ? "-seller" : ""}.png`) })
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
    }
  }

  /* ── SPINNER ─────────────────────────────────────────────────────────── */
  if (want("SPINNER") || want("ENTER")) {
    console.log("\nSPINNER and ENTER: a community landing, and a place that is slow to come")
    const errors = []
    /* A fresh page, sampled from its very first frames (the script runs before the frame mounts). */
    const q = await browser.newPage()
    await q.setViewport(DESK)
    await q.evaluateOnNewDocument(() => {
      window.__land = []
      const tick = () => {
        const l = document.querySelector("[data-community-left]")
        const m = document.querySelector("[data-community-main]")
        if (l && m) window.__land.push([+Number(getComputedStyle(l).opacity).toFixed(2), +Number(getComputedStyle(m).opacity).toFixed(2)])
        if (window.__land.length < 40) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await q.setRequestInterception(true)
    q.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return r.respond({ status: 200, contentType: "application/json", body: url.includes("presence") ? '{"ok":true,"ready":true}' : url.includes("/notifications") ? '{"unread":0,"items":[],"nextCursor":null,"available":true}' : "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await q.goto(`${ORIGIN}/community/clay-studio?case=feed`, { waitUntil: "load" })
    await sleep(1200)
    const landed = await q.evaluate(() => window.__land)
    const lefts = landed.map(([l]) => l).filter((o, i, a) => i === 0 || o !== a[i - 1])
    const mains = landed.map(([, m]) => m).filter((o, i, a) => i === 0 || o !== a[i - 1])
    expect(lefts.length >= 4 && lefts[0] < 0.5 && lefts.at(-1) === 1, "ENTER: the side columns come in by opacity over several frames", lefts)
    expect(mains.length >= 4 && mains[0] <= lefts[0] && mains.at(-1) === 1, "and the middle a beat after them", mains)
    await q.close()

    /* SPINNER: a place that is not here yet (9s away): the spinner, then the page's thread blocked while the compositor's frames are watched. */
    const r = await browser.newPage()
    r.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await r.setViewport(PHONE)
    await r.setRequestInterception(true)
    r.on("request", (req) => {
      const url = req.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return req.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return req.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return req.continue()
      return req.respond({ status: 204, body: "" })
    })
    await r.goto(`${ORIGIN}/community/clay-studio?case=nav&latency=9000&cold=members&idle=0`, { waitUntil: "load" })
    await sleep(600)
    await r.evaluate(() => window.__navigate("/community/clay-studio/members"))
    await sleep(900)
    const glyph = await r.evaluate(() => {
      const g = document.querySelector("[data-place-spinner] [data-place-spinner-glyph]")
      if (!g) return null
      const cs = getComputedStyle(g)
      return { name: cs.animationName, timing: cs.animationTimingFunction, tag: g.tagName, duration: cs.animationDuration }
    })
    expect(!!glyph && glyph.name === "spin" && glyph.timing === "linear", "the spinner turns continuously (linear, not a spoke at a time)", glyph)
    const rcdp = await r.target().createCDPSession()
    const frames = []
    rcdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: Date.now(), data: f.data })
      void rcdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    await rcdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 })
    await sleep(300)
    const t0 = Date.now()
    /* The page's thread busy for 700ms: nothing it draws can change in that time. */
    await r.evaluate(() => { const s = performance.now(); while (performance.now() - s < 700) {} })
    const t1 = Date.now()
    await sleep(200)
    await rcdp.send("Page.stopScreencast")
    const during = frames.filter((f) => f.t > t0 + 50 && f.t < t1 - 30)
    const distinct = new Set(during.map((f) => f.data)).size
    expect(during.length >= 6 && distinct >= 6, "on the compositor: with the page's thread blocked for 700ms it keeps turning (distinct frames)", { frames: during.length, distinct })
    await r.screenshot({ path: join(shots, "spinner-390.png") })
    expect(errors.length === 0, "no page errors", errors)
    await r.close()
  }

  /* ── PLACES ──────────────────────────────────────────────────────────── */
  if (want("PLACES")) {
    console.log("\nPLACES: 1440 with a real scrollbar, every place in turn, every frame measured")
    const { p, errors } = await open("/community/clay-studio?case=nav&latency=250", DESK)
    await sleep(1500)
    await p.evaluate(() => {
      window.__geo = []
      window.__geoOn = true
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left * 10) / 10, Math.round(b.width * 10) / 10] }
      const tick = () => {
        window.__geo.push({ gutter: getComputedStyle(document.documentElement).scrollbarGutter, ov: getComputedStyle(document.documentElement).overflowY + "/" + getComputedStyle(document.body).overflowY, path: location.pathname, about: !!document.querySelector("[data-community-place=about]") || !document.querySelector("[data-community-left]")?.offsetWidth, client: document.documentElement.clientWidth, bar: r("[data-community-top-row]"), name: r("[data-community-identity]"), left: r("[data-community-left]"), main: r("[data-community-main]"), barH: Math.round(document.querySelector("[data-community-top]").getBoundingClientRect().height) })
        if (window.__geoOn) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const order = ["Classroom", "Calendar", "Members", "About", "Leaderboards", "Community", "About", "Members"]
    for (const name of order) {
      const wall = await p.evaluate((name) => !!document.querySelector(`[data-wall-places] [data-community-nav="${name}"]`)?.offsetWidth, name)
      await p.click(wall ? `[data-wall-places] [data-community-nav="${name}"]` : `[data-community-tabs] [data-community-nav="${name}"]`)
      await sleep(700)
      await p.screenshot({ path: join(shots, `place-1440-${name.toLowerCase()}.png`) })
    }
    const geo = await p.evaluate(() => { window.__geoOn = false; return window.__geo })
    const uniq = (k) => [...new Set(geo.map((g) => JSON.stringify(g[k])))]
    const getComputedStyleGutter = [...new Set(geo.map((g) => `${g.client} ${g.gutter} ${g.ov}`))]
    const paths = [...new Set(geo.map((g) => g.path))]
    expect(paths.length >= 6, "every place was on screen", paths)
    /* Chrome reports the root's clientWidth without a stable gutter while nothing overflows, so the layout itself is what is measured: where the bar's centred row starts. */
    console.log(`        root clientWidth seen: ${uniq("client").join(", ")} (scrollbar-gutter ${geo[0].gutter})`)
    expect(uniq("bar").length === 1 && uniq("name").length === 1 && uniq("barH").length === 1, "the bar's row, the community's name and the bar's height are the same on every frame", { bar: uniq("bar"), name: uniq("name"), h: uniq("barH") })
    expect(uniq("left").length === 1, "the left column (card and places) never moves or goes", uniq("left"))
    const mains = geo.filter((g) => !g.about).map((g) => JSON.stringify(g.main))
    expect(new Set(mains).size === 1, "the middle column starts on the same line on every other place", [...new Set(mains)])
    console.log(`        ${geo.length} frames, scrollbar room kept: ${1440 - geo[0].client}px`)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── EMPTY and ICONS (pictures) ──────────────────────────────────────── */
  if (want("EMPTY") || want("ICONS")) {
    console.log("\nEMPTY: the classroom, the calendar and the members with nothing in them")
    for (const [vp, name] of [[PHONE, "390"], [DESK, "1440"]]) {
      for (const [c, staff] of [["classroom-empty", true], ["classroom-empty", false], ["events-empty", true], ["events", false], ["members-empty", false]]) {
        const { p, errors } = await open(`/community/clay-studio/${c.startsWith("classroom") ? "classroom" : c.startsWith("events") ? "events" : "members"}?case=${c}${staff ? "&staff=1" : ""}`, vp)
        await sleep(400)
        const m = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, empty: !!document.querySelector("[data-classroom-empty],[data-events-empty],[data-member-empty],[data-member-list],[data-event-list]"), action: document.querySelector("[data-place-empty-action]")?.textContent ?? null, small: [...document.querySelectorAll("[data-community-body] a, [data-community-body] button")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 36 }).map((e) => e.textContent.trim().slice(0, 20)) }))
        expect(m.overflow <= 0 && m.empty, `${name} ${c}${staff ? " (staff)" : ""}: drawn, no sideways overflow`, m)
        await p.screenshot({ path: join(shots, `empty-${name}-${c}${staff ? "-staff" : ""}.png`) })
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
    }
    const { p } = await open("/community/clay-studio/members?case=members", { ...DESK, deviceScaleFactor: 2 })
    await sleep(1500)
    const box = await p.evaluate(() => { const b = document.querySelector("[data-wall-places]").getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height } })
    await p.screenshot({ path: join(shots, "icons-places.png"), clip: box })
    await p.close()
  }

  /* ── PULL ────────────────────────────────────────────────────────────── */
  if (want("PULL")) {
    console.log("\nPULL: pull to refresh on the feed at 390, every frame measured")
    const { p, errors } = await open("/community/clay-studio?case=feed&pull=1", PHONE)
    const cdp = await p.target().createCDPSession()
    await p.evaluate(() => {
      window.__feedLatency = 900
      window.__pull = []
      window.__pullOn = true
      const tick = () => {
        const ind = document.querySelector("[data-ptr-indicator]")
        const content = document.querySelector("[data-pull-content]")
        const spin = document.querySelector("[data-ptr-spin]")
        const a = ind.getBoundingClientRect()
        const c = content.getBoundingClientRect()
        const root = document.querySelector("[data-pull-to-refresh]").getBoundingClientRect()
        const spokes = [...document.querySelectorAll("[data-ptr-spoke]")].map((l) => +Number(l.style.opacity || 0).toFixed(2))
        window.__pull.push({ t: performance.now(), top: +(a.top - root.top).toFixed(1), bottom: +(a.bottom - root.top).toFixed(1), h: +a.height.toFixed(1), opacity: +Number(getComputedStyle(ind).opacity).toFixed(2), gap: +(c.top - root.top).toFixed(1), shown: spokes.filter((o) => o > 0.05).length, spinning: getComputedStyle(spin).animationName !== "none" })
        if (window.__pullOn) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const x = 200
    let y = 420
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] })
    for (let i = 0; i < 26; i++) {
      y += 7
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] })
      await sleep(16)
    }
    await sleep(120)
    await p.screenshot({ path: join(shots, "pull-390-pulled.png") })
    const pulledAt = await p.evaluate(() => window.__pull.length)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(350)
    await p.screenshot({ path: join(shots, "pull-390-refreshing.png") })
    await sleep(2200)
    const f = await p.evaluate(() => { window.__pullOn = false; return window.__pull })
    const visible = f.filter((r) => r.opacity > 0.02 && r.h > 0.5)
    const overlaps = visible.filter((r) => r.top < -0.5 || r.bottom > r.gap + 0.5)
    const pulling = f.slice(0, pulledAt).filter((r) => r.gap > 0)
    const counts = pulling.map((r) => r.shown).filter((n, i, a) => i === 0 || n !== a[i - 1])
    expect(pulling.length > 5 && Math.max(...pulling.map((r) => r.gap)) >= 48, "the content follows the finger down", { frames: pulling.length, gap: Math.max(...pulling.map((r) => r.gap)) })
    expect(counts.length >= 5 && counts.every((n, i) => i === 0 || n > counts[i - 1]) && counts.at(-1) === 8, "the spokes appear one by one with the pull, up to all eight", counts)
    const spun = f.slice(pulledAt).filter((r) => r.spinning && r.opacity > 0.5)
    expect(spun.length >= 10 && spun.some((r) => r.gap >= 40), "let go past the line: it holds a spinner's room open and turns while refreshing", { frames: spun.length, gap: spun[0]?.gap })
    expect(overlaps.length === 0, "on every frame (pull, refresh, spring home) the spinner sits inside its own room, never over the content", { frames: visible.length, overlaps: overlaps.slice(0, 4) })
    const end = f.at(-1)
    expect(end.gap === 0 && end.opacity === 0, "and the page is home at the end, the spinner gone", end)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
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
