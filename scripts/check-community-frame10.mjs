/**
 * ===========================================================================
 *  THE COMMUNITY FRAME, ROUND 10: THE TABS UNDER A FINGER, AND THE SEARCH
 * ===========================================================================
 * The real frame (scripts/render-community-shell.tsx, ?case=nav: the frame
 * drawn once with the places swapped inside it, as the app router does), at
 * 4x CPU:
 *
 *   FLING        on a 390px phone the row of section tabs is thrown with a
 *                real touch throw (CDP touch events, then the browser's fling):
 *                its scrollLeft, sampled every frame, only ever moves one
 *                way (nothing snaps it back or fights the glide) and keeps
 *                moving after the finger has left (momentum)
 *   FOLLOW       a place chosen while the row is still gliding is not
 *                scrolled to until the row is still; then the row glides
 *                (several frames, not a jump) until the tab is wholly in view
 *   PRESS        a finger on a tab dims it on the next frame, before any
 *                click; a finger on a space chip darkens it the same way
 *   SEARCH       a computer's field and a phone's screen, with the index
 *                preloaded on idle and a slow server (700ms): two letters
 *                answer from the index within two frames; the ranking
 *                cases (every word in any order, accents, title over body,
 *                a word's start over its middle, lessons and events); the
 *                words marked in bold; the server's answer then takes over;
 *                the phone's screen rises over several frames and, on
 *                Cancel, fades back down over several frames before it goes
 *
 *   PROBE_CSS=source node scripts/check-community-frame10.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
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
const stubs = join(root, ".community-frame10-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-frame10-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const DAY = 86_400_000

/* What the search knows before a key is pressed, as GET /search?index=1 answers it. */
const iso = (ms) => new Date(Date.now() - ms).toISOString()
const INDEX = {
  at: Date.now(),
  spaces: [
    { id: "s-general", slug: "general", name: "General", kind: "feed", description: "Anything about the studio." },
    { id: "s-glaze", slug: "glaze-lab", name: "Glaze lab", kind: "feed", description: "Recipes, tests and failures." },
    { id: "s-crit", slug: "critique", name: "Critique", kind: "feed", description: "Post a piece, get honest notes." },
  ],
  posts: [
    { id: "p-body", title: "Shelf heights", snippet: "", text: "A glaze tip that saved me a whole batch: test tiles on the same shelf.", createdAt: iso(2 * DAY), space: { slug: "general", name: "General" }, author: { name: "Priya Raman", avatarUrl: null } },
    { id: "p-title", title: "Glaze tip: sieve twice", snippet: "", text: "Two passes through 80 mesh and the lumps are gone.", createdAt: iso(20 * DAY), space: { slug: "glaze-lab", name: "Glaze lab" }, author: { name: "Jonas Berg", avatarUrl: null } },
    { id: "p-mid", title: "Overglazed again", snippet: "", text: "Too thick on the rim.", createdAt: iso(1 * DAY), space: { slug: "critique", name: "Critique" }, author: { name: "Leo Martins", avatarUrl: null } },
  ],
  members: [
    { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, href: "/@jonasb", role: null },
    { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, href: "/@priya", role: "admin" },
  ],
  lessons: [
    { id: "course:co-1", kind: "course", title: "Trimming feet that look made", course: null, href: "/community/clay-studio/classroom/co-1" },
    { id: "lesson:l-1", kind: "lesson", title: "Glaze chemistry, part one", course: "Glazes without fear", href: "/community/clay-studio/classroom/co-2?lesson=l-1" },
  ],
  events: [{ id: "e-1", title: "Café crawl and kiln tour", startsAt: new Date(Date.now() + 3 * DAY).toISOString(), href: "/community/clay-studio/events/e-1" }],
}

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
    alias: { "@": ".", "next/navigation": "./.community-frame10-probe/navigation.js", "next/link": "./.community-frame10-probe/link.jsx" },
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
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const asks = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", async (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        let body = {}
        if (short.endsWith("/presence")) body = { ok: true, ready: true }
        else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
        else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null }
        else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
        else if (/\/search\?index=1/.test(short)) {
          asks.push("index")
          body = { index: INDEX }
        } else if (/\/search\?q=/.test(short)) {
          const q = decodeURIComponent(short.split("q=")[1] || "")
          asks.push(`q:${q}`)
          await sleep(700)
          /* The server's answer: marked so the probe can tell it from the index's. */
          body = { results: { q, spaces: [], posts: [{ id: "p-server", title: "From the server", snippet: `About ${q}`, createdAt: iso(DAY), space: null, author: null }], members: [], lessons: [], events: [] } }
        }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    return { p, errors, asks }
  }

  /* Every frame's scrollLeft of the tabs' row, until stopped. */
  const sampleRow = (p) =>
    p.evaluate(() => {
      const t = document.querySelector("[data-community-tabs-track]")
      window.__rowSamples = []
      window.__rowRun = true
      const tick = () => {
        window.__rowSamples.push([Math.round(performance.now()), t.scrollLeft])
        if (window.__rowRun) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  const stopRow = (p) => p.evaluate(() => { window.__rowRun = false; return window.__rowSamples })
  /* A real throw: a finger down, moved quickly sideways over a few frames, let go (Chromium then glides the rest with its own fling). */
  const swipe = async (cdp, x, y, dx, steps = 8) => {
    let at = x
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at, y, radiusX: 6, radiusY: 6, force: 1 }] })
    for (let i = 0; i < steps; i++) {
      at += dx / steps
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(at), y, radiusX: 6, radiusY: 6, force: 1 }] })
      await sleep(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  const reversals = (xs) => {
    let dir = 0
    let n = 0
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i][1] - xs[i - 1][1]
      if (Math.abs(d) < 0.5) continue
      const s = Math.sign(d)
      if (dir && s !== dir) n++
      dir = s
    }
    return n
  }

  /* ── PHONE: THE ROW OF TABS ────────────────────────────────────────── */
  console.log("\nphone 390 at 4x CPU: the row of section tabs")
  {
    const { p, errors } = await open("/community/clay-studio?case=nav&latency=500", PHONE)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const row = await p.evaluate(() => { const t = document.querySelector("[data-community-tabs-track]"); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, room: t.scrollWidth - t.clientWidth, left: t.scrollLeft } })
    expect(row.room > 100 && row.left === 0, "the row is wider than the screen and starts at its start", row)

    /* FLING: thrown left, then let go. */
    await sampleRow(p)
    const t0 = await p.evaluate(() => performance.now())
    await swipe(cdp, Math.round(row.x + 150), Math.round(row.y), -150)
    const released = await p.evaluate(() => performance.now())
    await sleep(1200)
    const fling = await stopRow(p)
    const after = fling.filter(([t]) => t > released)
    const moved = after.length > 1 && after.at(-1)[1] - after[0][1] > 4
    const xs = fling.map(([, x]) => Math.round(x))
    expect(reversals(fling) === 0, "FLING: every frame's position moves one way, never back (no snap, no fight)", { reversals: reversals(fling), path: xs.filter((x, i) => i === 0 || x !== xs[i - 1]).slice(0, 30) })
    expect(moved, "and the row keeps gliding after the finger has left (momentum)", { atRelease: after[0]?.[1], end: after.at(-1)?.[1], gestureMs: Math.round(released - t0) })
    console.log(`        fling: ${xs.filter((x, i) => i === 0 || x !== xs[i - 1]).length} distinct positions, from ${xs[0]} to ${xs.at(-1)}, ${Math.round(after.at(-1)?.[1] - after[0]?.[1])}px after release`)
    await p.screenshot({ path: join(shots, "phone-tabs-flung.png") })

    /* FOLLOW: back to the start, then a place far right chosen WHILE the row glides back the other way. */
    await p.evaluate(() => { document.querySelector("[data-community-tabs-track]").scrollLeft = 0 })
    await sleep(300)
    await sampleRow(p)
    /* The place changes while the finger is still moving the row. */
    const gesture = swipe(cdp, Math.round(row.x + 150), Math.round(row.y), -70, 8)
    await sleep(60)
    await p.evaluate(() => window.__navigate("/community/clay-studio/about"))
    await gesture
    await sleep(1400)
    const follow = await stopRow(p)
    const tab = await p.evaluate(() => {
      const t = document.querySelector("[data-community-tabs-track]")
      const on = t.querySelector('[data-on="true"]')
      const a = on.getBoundingClientRect()
      const r = t.getBoundingClientRect()
      return { tab: on.getAttribute("data-community-nav"), inView: a.left >= r.left - 0.5 && a.right <= r.right + 0.5, left: t.scrollLeft }
    })
    const fx = follow.map(([, x]) => Math.round(x))
    const distinct = fx.filter((x, i) => i === 0 || x !== fx[i - 1])
    expect(tab.tab === "About" && tab.inView, "FOLLOW: About, chosen during the throw, ends wholly in view", tab)
    expect(reversals(follow) === 0, "the follow waits for the throw to settle: the row never jerks back", { reversals: reversals(follow), path: distinct.slice(0, 30) })
    await p.screenshot({ path: join(shots, "phone-tabs-follow.png") })

    /* A tab half off the right edge: chosen with a tap, the row glides to it over several frames. */
    await p.evaluate(() => window.__navigate("/community/clay-studio"))
    await sleep(200)
    await p.evaluate(() => { document.querySelector("[data-community-tabs-track]").scrollLeft = 0 })
    await sleep(400)
    const edge = await p.evaluate(() => {
      const t = document.querySelector("[data-community-tabs-track]")
      const r = t.getBoundingClientRect()
      const half = [...t.querySelectorAll("[data-community-nav]")].find((a) => { const b = a.getBoundingClientRect(); return b.left < r.right - 10 && b.right > r.right })
      if (!half) return null
      const b = half.getBoundingClientRect()
      return { name: half.getAttribute("data-community-nav"), x: Math.round(Math.max(b.left + 8, Math.min(b.left + b.width / 2, r.right - 12))), y: Math.round(b.top + b.height / 2) }
    })
    expect(!!edge, "a tab sits half off the right edge", edge)
    if (edge) {
      /* PRESS: the finger down, the next frame: the tab is dimmed before any click. */
      await p.evaluate(() => { window.__clicks = 0; document.addEventListener("click", () => window.__clicks++, { capture: true, once: true }) })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: edge.x, y: edge.y, radiusX: 6, radiusY: 6, force: 1 }] })
      const press = await p.evaluate((name) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve({ opacity: Number(getComputedStyle(document.querySelector(`[data-community-tabs] [data-community-nav="${name}"]`)).opacity), clicks: window.__clicks })))), edge.name)
      expect(press.opacity < 0.8 && press.clicks === 0, "PRESS: the tab is dimmed while the finger is down, before any click", press)
      await sampleRow(p)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      const marked = await p.evaluate((name) => new Promise((resolve) => { let f = 0; const tick = () => { f++; const on = document.querySelector(`[data-community-tabs] [data-community-nav="${name}"]`).getAttribute("data-on") === "true"; if (on || f > 30) resolve({ frames: f, on }); else requestAnimationFrame(tick) }; requestAnimationFrame(tick) }), edge.name)
      expect(marked.on && marked.frames <= 3, "the tab is marked within a few frames of the tap", marked)
      await sleep(900)
      const glide = await stopRow(p)
      const gx = glide.map(([, x]) => Math.round(x))
      const steps = gx.filter((x, i) => i === 0 || x !== gx[i - 1])
      const inView = await p.evaluate((name) => { const t = document.querySelector("[data-community-tabs-track]"); const a = document.querySelector(`[data-community-tabs] [data-community-nav="${name}"]`).getBoundingClientRect(); const r = t.getBoundingClientRect(); return a.left >= r.left - 0.5 && a.right <= r.right + 0.5 }, edge.name)
      expect(steps.length >= 4 && reversals(glide) === 0 && inView, "the row glides to it over several frames (not a jump) until it is wholly in view", { steps: steps.slice(0, 20), inView })
    }

    /* A space chip: the finger down darkens it on the next frame. */
    await p.evaluate(() => window.__navigate("/community/clay-studio"))
    await sleep(500)
    const chip = await p.evaluate(() => { const c = document.querySelector('[data-space-chip="general"]'); const b = c.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), bg: getComputedStyle(c).backgroundColor } })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: chip.x, y: chip.y, radiusX: 6, radiusY: 6, force: 1 }] })
    const pressed = await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(getComputedStyle(document.querySelector('[data-space-chip="general"]')).backgroundColor)))))
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    expect(pressed !== chip.bg, "PRESS: a space chip darkens under the finger on the next frame", { rest: chip.bg, pressed })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── SEARCH ────────────────────────────────────────────────────────── */
  const typeAndTime = (p, sel, text) =>
    p.evaluate(
      (sel, text) =>
        new Promise((resolve) => {
          const input = document.querySelector(sel)
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
          set.call(input, text)
          const t0 = performance.now()
          input.dispatchEvent(new Event("input", { bubbles: true }))
          let frames = 0
          const tick = () => {
            frames++
            const box = document.querySelector("[data-search-results]")
            if (box || frames > 120) resolve({ frames, ms: Math.round(performance.now() - t0), source: box?.getAttribute("data-search-source") ?? null })
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      sel,
      text,
    )
  const listed = (p) =>
    p.evaluate(() => ({
      groups: [...document.querySelectorAll("[data-search-group]")].map((g) => g.getAttribute("data-search-group")),
      options: [...document.querySelectorAll("[data-search-option]")].map((o) => o.querySelector(".min-w-0.flex-1 > span")?.textContent?.trim() || o.textContent.trim()),
      marks: [...document.querySelectorAll("[data-search-results] mark")].map((m) => m.textContent),
      source: document.querySelector("[data-search-results]")?.getAttribute("data-search-source") ?? null,
    }))
  const CASES = [
    ["glaze tip", "every word, a title first", (r) => r.options[0] === "Glaze tip: sieve twice" && r.options[1] === "Shelf heights"],
    ["tip glaze", "the words in any order", (r) => r.options[0] === "Glaze tip: sieve twice" && r.options[1] === "Shelf heights"],
    ["cafe", "without accents: Café", (r) => r.groups.includes("events") && r.marks.includes("Café")],
    ["trim", "a course by a word's start", (r) => r.groups.includes("lessons") && r.options.includes("Trimming feet that look made") && r.marks.includes("Trim")],
    ["glaze", "a word's start before its middle: Glaze lab before Overglazed", (r) => r.options.indexOf("Glaze lab") >= 0 && r.options.indexOf("Overglazed again") > -1 && r.options.indexOf("Glaze tip: sieve twice") < r.options.indexOf("Overglazed again")],
    ["jonas", "a member by name", (r) => r.groups.includes("members") && r.marks.includes("Jonas")],
  ]

  console.log("\ncomputer 1440 at 4x CPU, a slow server (700ms): the search field")
  {
    const { p, errors, asks } = await open("/community/clay-studio?case=feed", DESK)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await p.waitForFunction(() => true)
    await sleep(800)
    expect(asks.filter((a) => a === "index").length === 1, "the index is read once, when the frame is idle", asks)
    await p.focus("[data-community-search=field] input")
    const first = await typeAndTime(p, "[data-community-search=field] input", "gl")
    expect(first.source === "index" && first.frames <= 2, "two letters: results from the index within two frames", first)
    await p.screenshot({ path: join(shots, "desktop-search-index.png") })
    for (const [q, what, ok] of CASES) {
      await typeAndTime(p, "[data-community-search=field] input", q)
      await sleep(30)
      const r = await listed(p)
      expect(r.source === "index" && ok(r), `RANK "${q}": ${what}`, r)
    }
    await sleep(1000)
    const server = await listed(p)
    expect(server.source === "server" && server.options[0] === "From the server", "the server's answer takes over when it comes", server)
    const keys = asks.filter((a) => a.startsWith("q:"))
    expect(keys.length <= 3, "the server is asked once the typing pauses, not per key", keys)
    await p.screenshot({ path: join(shots, "desktop-search-server.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  console.log("\nphone 390 at 4x CPU: the search screen opens and closes smoothly")
  {
    const { p, errors } = await open("/community/clay-studio?case=feed", PHONE)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await sleep(800)
    const opening = await p.evaluate(
      () =>
        new Promise((resolve) => {
          const seen = []
          window.__openCommunitySearch("clay-studio")
          const t0 = performance.now()
          const tick = () => {
            const s = document.querySelector("[data-community-search-screen]")
            if (s) seen.push(+Number(getComputedStyle(s).opacity).toFixed(2))
            if (performance.now() - t0 < 400) requestAnimationFrame(tick)
            else resolve({ seen, focused: document.activeElement?.hasAttribute("data-community-search-input") })
          }
          requestAnimationFrame(tick)
        }),
    )
    const rising = opening.seen.filter((o, i) => i === 0 || o !== opening.seen[i - 1])
    expect(rising.length >= 3 && rising[0] < 0.6 && opening.seen.at(-1) === 1 && opening.focused, "OPEN: the screen rises in over several frames, the field focused", { opacities: rising, focused: opening.focused })
    const typed = await typeAndTime(p, "[data-community-search-screen] input", "glaze tip")
    const r = await listed(p)
    expect(typed.source === "index" && typed.frames <= 2 && r.options[0] === "Glaze tip: sieve twice", "the first results from the index within two frames", { typed, first: r.options[0] })
    await p.screenshot({ path: join(shots, "phone-search-index.png") })
    const closing = await p.evaluate(
      () =>
        new Promise((resolve) => {
          const seen = []
          document.querySelector("[data-community-search-close]").click()
          const t0 = performance.now()
          const tick = () => {
            const s = document.querySelector("[data-community-search-screen]")
            seen.push(s ? +Number(getComputedStyle(s).opacity).toFixed(2) : null)
            if (s && performance.now() - t0 < 1000) requestAnimationFrame(tick)
            else resolve({ seen, ms: Math.round(performance.now() - t0) })
          }
          requestAnimationFrame(tick)
        }),
    )
    const fading = closing.seen.filter((o) => o !== null)
    expect(fading.length >= 3 && fading.some((o) => o > 0.2 && o < 0.95) && closing.seen.at(-1) === null && closing.ms < 600, "CANCEL: the screen fades down over several frames, then goes", closing)
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
