/**
 * ===========================================================================
 *  ROUND 26: THE COMMUNITY ADMIN'S POSTS, MEASURED AND FILMED
 * ===========================================================================
 * The owner: the "Share something" writer opened and closed abruptly; the
 * Schedule Post modal was a second workflow; a post opened in a side panel.
 * The real FeedSection (scripts/render-posts26.tsx) in headless Chromium,
 * against a stub of the API that keeps scheduled posts in memory the way part
 * 194's routes answer them:
 *
 *   MOVE      the writer opening and closing at 1440 (mouse) and at 390 (touch,
 *             CPU 4x), light and dark: every frame's top of the Scheduled
 *             panel and of the list under it (no step bigger than a frame of
 *             the slide), and a film of each (frame sheets in SHOTS_DIR);
 *             Escape closes it and gives the caret back to the field
 *   KEEP      something written, then the page reloaded: it comes back; Escape
 *             with something written asks first
 *   SCHEDULE  the creator's zone is Europe/Warsaw (Settings) on a device on New
 *             York time: the clock, a day and 09:30, Schedule; the request
 *             carries 09:30 Warsaw; the list says Scheduled; the row opens the
 *             same writer, 10:45, Schedule (reschedule); Make it a draft; Post
 *             now (the post lands in the list); a new one deleted from the
 *             writer; a picture blocks Schedule with the reason; Save draft as
 *             the third answer to Leave
 *   POPUP     a row opens the community's own popup (no side sheet), with the
 *             admin's actions; Pin sends the pin; Escape closes it; the address
 *             stays the admin's; at 390 the community's bottom sheet
 *
 *   TABLET    820x1180, light and dark: the writer with its day and time, the popup
 *
 *   node scripts/check-posts26.mjs [MOVE KEEP SCHEDULE POPUP TABLET]
 *   ROOT=<another checkout> measures that checkout's code with this probe (a "before").
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import { FIXTURE } from "./posts-round33-fixture.mjs"

const here = process.cwd()
const root = process.env.ROOT || here
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG || "/tmp/claude-0/-home-user-DREW/4149d236-7d9f-55de-bc3e-49a9513a374e/scratchpad/pyff/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".posts26-probe")
const shots = process.env.SHOTS_DIR || join(here, ".posts26-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const numbers = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const { ID, ME, pid } = FIXTURE
const S1 = "51000000-0000-4000-8000-000000000001"
const S2 = "52000000-0000-4000-8000-000000000002"
const sid = (x) => (x === "s1" ? S1 : x === "s2" ? S2 : x)
const ZONE = "Europe/Warsaw"
const DEVICE = "America/New_York"

/* The instant a wall clock time happens in a zone (as lib/i18n/format.ts instantAt, written again here to check it). */
function instantIn(day, time, zone) {
  const [y, m, d] = day.split("-").map(Number)
  const [h, min] = time.split(":").map(Number)
  const want = Date.UTC(y, m - 1, d, h, min)
  let guess = want
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]))
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute)
    if (seen === want) break
    guess += want - seen
  }
  return new Date(guess).toISOString()
}
const dayIn = (ms, zone) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))

/* Every frame: the writer's card, the Scheduled panel and the list card, where they are. */
const PRELUDE = `window.__sent = []; window.__frames = []; window.__rec = false;
try { localStorage.setItem("storelib_timezone", ${JSON.stringify(ZONE)}) } catch {}
(function tick() {
  if (window.__rec) {
    const card = document.querySelector("[data-feed-writer] [data-composer]")
    const panel = document.querySelector("[data-feed] > section:has([data-scheduled-panel]), [data-feed] section:has([data-scheduled-panel])")
    const list = document.querySelector("[data-feed] > section[data-feed-show]")
    const r = (el) => (el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null)
    const moving = list ? list.getAnimations().filter((a) => a.playState === "running").length : 0
    window.__frames.push({ t: performance.now(), card: card ? Math.round(card.getBoundingClientRect().height) : null, panel: r(panel), list: r(list), anim: moving, state: card?.getAttribute("data-composer") ?? null })
  }
  requestAnimationFrame(tick)
})();`

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok", unsubscribe: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "${ME}" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const entry = existsSync(join(root, "scripts/render-posts26.tsx")) ? join(root, "scripts/render-posts26.tsx") : join(here, "scripts/render-posts26.tsx")
  if (!entry.startsWith(root)) writeFileSync(join(root, "scripts/render-posts26.tsx"), readFileSync(entry, "utf8"))
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-posts26.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.posts26-probe/navigation.js", "next/link": "./.posts26-probe/link.jsx", "next/image": "./.posts26-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (dark, scheduled) =>
    `<!doctype html><html${dark ? ' data-sl-dark="" style="color-scheme:dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>window.__SCHEDULED=${JSON.stringify(scheduled)}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000, timeout: 180_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  /* Part 194 in memory: the rows the routes answer, changed the way the server changes them. */
  const uuid = (n) => `5c${String(n).padStart(6, "0")}-0000-4000-8000-000000000000`
  function newStore(seed = []) {
    let n = 0
    const rows = [...seed]
    const extraPosts = []
    const spaceName = (id) => (id === S2 ? "Announcements" : id === S1 ? "General" : null)
    const view = (r) => ({ ...r, spaceName: spaceName(r.spaceId) })
    return {
      rows,
      extraPosts,
      panel: () => ({ ready: true, rows: rows.map(view), spaces: [{ id: S1, name: "General", kind: "feed", icon: "✍️" }, { id: S2, name: "Announcements", kind: "announcements", icon: null }] }),
      create(b) {
        if (b.publishAt && Date.parse(b.publishAt) < Date.now() + 60_000) return [400, { error: "Pick a time at least a minute from now, or publish it now.", field: "when" }]
        const r = { id: uuid(++n), status: b.publishAt ? "scheduled" : "draft", spaceId: b.spaceId, title: b.title, body: b.body, publishAt: b.publishAt, publishedAt: null, postId: null, error: null, authorId: ME, authorName: "Ana Popescu", mine: true, updatedAt: new Date().toISOString() }
        rows.push(r)
        return [201, { post: view(r) }]
      },
      patch(id, b) {
        const r = rows.find((x) => x.id === id)
        if (!r) return [404, { error: "not_found" }]
        Object.assign(r, { spaceId: b.spaceId ?? r.spaceId, title: b.title ?? r.title, body: b.body ?? r.body, updatedAt: new Date().toISOString() })
        if (b.publishNow) {
          const postId = `d${String(++n).padStart(7, "0")}-0000-4000-8000-000000000000`
          Object.assign(r, { status: "published", postId, publishedAt: new Date().toISOString(), publishAt: new Date().toISOString() })
          extraPosts.push({ id: postId, kind: "post", title: r.title, excerpt: r.body, spaceName: spaceName(r.spaceId), authorName: "Ana Popescu", pinned: false, locked: false, featured: false, status: "published", reactionCount: 0, commentCount: 0, createdAt: new Date().toISOString(), media: [], poll: null, spaceId: r.spaceId === S2 ? "s2" : "s1", spaceIcon: null, spaceKind: "feed", authorId: ME, authorAvatar: null })
        } else Object.assign(r, { status: b.publishAt ? "scheduled" : "draft", publishAt: b.publishAt ?? null })
        return [200, { post: view(r) }]
      },
      remove(id) {
        const i = rows.findIndex((x) => x.id === id)
        if (i < 0) return [404, { error: "not_found" }]
        rows.splice(i, 1)
        return [200, { ok: true }]
      },
    }
  }

  async function open(vp, { dark = false, seed = [], cpu = 1, lat = 120 } = {}) {
    /* Each page its own profile: a draft kept by one (KEEP) must not open the writer on the next. */
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    await p.emulateTimezone(DEVICE)
    await p.evaluateOnNewDocument(PRELUDE)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    const store = newStore(seed)
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        const method = r.method()
        const path = short.split("?")[0]
        const qs = new URLSearchParams(short.split("?")[1] || "")
        let sent = null
        try {
          sent = r.postData() ? JSON.parse(r.postData()) : null
        } catch {
          sent = r.postData()
        }
        p.evaluate((x) => window.__sent.push({ ...x, at: performance.now() }), { short, method, sent }).catch(() => {})
        let status = 200
        let body = { ok: true }
        const admin = `/api/app/community/${ID}`
        const member = `/api/community/${ID}`
        let m
        const allRows = () => [...FIXTURE.rows.all, ...FIXTURE.rows.pinned, ...FIXTURE.rows.removed, ...store.extraPosts]
        const postOf = (row) => {
          const x = FIXTURE.post(row)
          return { ...x, space: x.space ? { ...x.space, id: sid(x.space.id) } : null }
        }
        if (path === `${admin}/posts` && method === "GET") {
          const show = qs.get("show") || "all"
          body = { rows: (FIXTURE.rows[show] || []).map((x) => ({ ...x, spaceId: sid(x.spaceId) })), next: null }
        } else if (path === `${admin}/scheduled-posts` && method === "GET") body = store.panel()
        else if (path === `${admin}/scheduled-posts` && method === "POST") [status, body] = store.create(sent)
        else if ((m = path.match(new RegExp(`^${admin}/scheduled-posts/([^/]+)$`))) && method === "PATCH") [status, body] = store.patch(m[1], sent)
        else if ((m = path.match(new RegExp(`^${admin}/scheduled-posts/([^/]+)$`))) && method === "DELETE") [status, body] = store.remove(m[1])
        else if (path === `${admin}/moderation` && method === "POST") body = { status: "published" }
        else if (path === `${member}/posts` && method === "POST") {
          const row = { id: `e${String(Date.now() % 1e7).padStart(7, "0")}-0000-4000-8000-000000000000`, kind: "post", title: sent.title, excerpt: sent.body, spaceName: "General", authorName: "Ana Popescu", pinned: false, locked: false, featured: false, status: "published", reactionCount: 0, commentCount: 0, createdAt: new Date().toISOString(), media: [], poll: null, spaceId: "s1", spaceIcon: "✍️", spaceKind: "feed", authorId: ME, authorAvatar: null }
          store.extraPosts.push(row)
          body = { post: postOf(row) }
        } else if ((m = path.match(new RegExp(`^${member}/posts/([^/]+)/comments$`))) && method === "GET") body = FIXTURE.comments(m[1])
        else if ((m = path.match(new RegExp(`^${member}/posts/([^/]+)$`))) && method === "GET") {
          const row = allRows().find((x) => x.id === m[1])
          body = row ? { post: postOf(row) } : { error: "not_found" }
          if (!row) status = 404
        }
        const answer = () => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {})
        setTimeout(answer, method === "GET" ? lat : 90)
        return
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: page(dark, store.panel()) })
      if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/${ID}/feed`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    if (cpu > 1) await p.emulateCPUThrottling(cpu)
    return { p, errors, store }
  }
  const sent = (p) => p.evaluate(() => window.__sent.slice())

  /* A film of what happens while `act` runs: the compositor's own frames (screencast), then one sheet of them. */
  async function film(p, name, act, { ms = 900, cols = 6, width = 360, rate = 1 } = {}) {
    const dir = join(shots, `film-${name}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const cdp = await p.createCDPSession()
    const frames = []
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ data: f.data, t: f.metadata.timestamp })
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    if (rate !== 1) {
      await cdp.send("Animation.enable")
      await cdp.send("Animation.setPlaybackRate", { playbackRate: rate })
    }
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
    await sleep(120)
    await act()
    await sleep(ms / rate)
    await cdp.send("Page.stopScreencast")
    if (rate !== 1) await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
    await cdp.detach()
    frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64")))
    const n = frames.length
    const sheet = join(shots, `sheet-${name}.jpg`)
    /* Up to 24 frames, evenly picked, into one sheet (read left to right, top to bottom). */
    const pick = n <= 24 ? frames.map((_, i) => i) : Array.from({ length: 24 }, (_, k) => Math.round((k * (n - 1)) / 23))
    const pdir = join(dir, "pick")
    mkdirSync(pdir, { recursive: true })
    pick.forEach((i, k) => writeFileSync(join(pdir, `g${String(k).padStart(3, "0")}.jpg`), Buffer.from(frames[i].data, "base64")))
    const rows = Math.max(1, Math.ceil(pick.length / cols))
    try {
      execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(pdir, "g%03d.jpg"), "-vf", `scale=${width}:-1,pad=iw+4:ih+4:2:2:red,tile=${cols}x${rows}`, "-frames:v", "1", sheet])
    } catch (e) {
      console.log("    (no frame sheet:", String(e).slice(0, 160), ")")
    }
    return { frames: n, sheet }
  }

  /*
    The biggest move between two sampled frames, per 16.7ms of time between them. The samples are the page's own frames, so
    on a loaded machine one can come 120ms after the last while the compositor kept sliding in between: a slide shows as a
    steady few dozen px per frame, a jump as the whole height in one regular frame.
  */
  const steps = (f, key) => {
    let max = 0
    for (let i = 1; i < f.length; i++) if (f[i][key] !== null && f[i - 1][key] !== null) max = Math.max(max, Math.abs(f[i][key] - f[i - 1][key]) / Math.max(1, (f[i].t - f[i - 1].t) / 16.7))
    return Math.round(max)
  }

  /* ── MOVE ─────────────────────────────────────────────────────────────── */
  if (want("MOVE")) {
    console.log("\nMOVE: the writer opening and closing")
    for (const [vp, w, cpu] of [[DESK, 1440, 1], [PHONE, 390, 4]]) {
      for (const dark of [false, true]) {
        const tag = `${w}-${dark ? "dark" : "light"}`
        const { p, errors } = await open(vp, { dark, cpu })
        if (w === 1440) {
          /* Open by a click, every frame recorded: once at a quarter speed (the move is the compositor's, slowed so a loaded machine's dropped frames cannot hide a jump), then at full speed. */
          await p.evaluate(() => ((window.__frames = []), (window.__rec = true)))
          const o = await film(p, `open-${tag}`, () => p.click("[data-composer-open]"), { ms: 700, rate: 0.25 })
          const fo = await p.evaluate(() => ((window.__rec = false), window.__frames.slice()))
          await p.click("[data-feed-writer] [data-composer-cancel]")
          await sleep(800)
          await p.evaluate(() => ((window.__frames = []), (window.__rec = true)))
          await p.click("[data-composer-open]")
          await sleep(700)
          const fo1 = await p.evaluate(() => ((window.__rec = false), window.__frames.slice()))
          const grew = fo.length ? fo[fo.length - 1].card - fo[0].card : 0
          const focusIn = await p.evaluate(() => !!document.activeElement?.closest("[data-composer]") && document.activeElement.matches("[data-composer-title]"))
          await p.screenshot({ path: join(shots, `open-${tag}.png`) })
          await p.evaluate(() => ((window.__frames = []), (window.__rec = true)))
          /* CLOSE_BY=cancel for a checkout whose writer has no Escape in place (the base before round 26). */
          const c = await film(p, `close-${tag}`, () => (process.env.CLOSE_BY === "cancel" ? p.click("[data-feed-writer] [data-composer-cancel]") : p.keyboard.press("Escape")), { ms: 700 })
          const fc = await p.evaluate(() => ((window.__rec = false), window.__frames.slice()))
          if (process.env.DEBUG) for (const [nm, f] of [["open", fo], ["open1x", fo1], ["close", fc]]) console.log(`    ${tag} ${nm}:`, f.map((x, i) => `${i ? Math.round(x.t - f[i - 1].t) : 0}ms:${x.list}${x.anim ? "*" : ""}`).join(" "))
          const back = await p.evaluate(() => ({ state: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"), focus: document.activeElement?.hasAttribute("data-composer-open") }))
          const distinct = (f) => new Set(f.map((x) => x.list).filter((x) => x !== null)).size
          const animated = (f) => f.filter((x) => x.anim > 0).length
          numbers[`move-${tag}`] = {
            grew,
            quarterSpeed: { frames: fo.length, panelStep: steps(fo, "panel"), listStep: steps(fo, "list"), listPositions: distinct(fo), framesAnimated: animated(fo) },
            fullSpeedOpen: { frames: fo1.length, listStep: steps(fo1, "list"), listPositions: distinct(fo1), framesAnimated: animated(fo1) },
            fullSpeedClose: { frames: fc.length, listStep: steps(fc, "list"), listPositions: distinct(fc), framesAnimated: animated(fc) },
            film: [o.frames, c.frames],
          }
          const n = numbers[`move-${tag}`]
          expect(grew > 150, `${tag}: the editor grows in place (${grew}px)`, grew)
          expect(n.quarterSpeed.panelStep <= grew / 3 && n.quarterSpeed.listStep <= grew / 3 && n.quarterSpeed.listPositions >= 8, `${tag}: opening (quarter speed), the panel and the list slide down (at most ${n.quarterSpeed.listStep}px a frame of ${grew}px, ${n.quarterSpeed.listPositions} positions)`, n.quarterSpeed)
          expect(n.fullSpeedOpen.framesAnimated > 0 && n.fullSpeedOpen.listPositions >= 3 && n.fullSpeedOpen.listStep <= grew / 3, `${tag}: opening at full speed, the list is moved by an animation (at most ${n.fullSpeedOpen.listStep}px a frame, ${n.fullSpeedOpen.listPositions} positions)`, n.fullSpeedOpen)
          expect(n.fullSpeedClose.framesAnimated > 0 && n.fullSpeedClose.listPositions >= 3 && n.fullSpeedClose.listStep <= grew / 3, `${tag}: closing, the same backwards (at most ${n.fullSpeedClose.listStep}px a frame, ${n.fullSpeedClose.listPositions} positions)`, n.fullSpeedClose)
          expect(focusIn, `${tag}: the caret is in the title once it opens`, focusIn)
          expect(back.state === "closed" && back.focus, `${tag}: Escape with nothing written closes it and the field has the caret again`, back)
        } else {
          /* A phone: the sheet rises and goes down; nothing behind it moves. */
          await p.evaluate(() => document.querySelector("[data-composer-open]").scrollIntoView({ block: "center" }))
          await sleep(200)
          const b = await p.evaluate(() => {
            const r = document.querySelector("[data-composer-open]").getBoundingClientRect()
            return { x: r.left + 40, y: r.top + r.height / 2 }
          })
          await p.evaluate(() => ((window.__frames = []), (window.__rec = true)))
          const o = await film(p, `open-${tag}`, () => p.touchscreen.tap(b.x, b.y), { ms: 1300, width: 240 })
          const fo = await p.evaluate(() => ((window.__rec = false), window.__frames.slice()))
          const sheet = await p.evaluate(() => {
            const s = document.querySelector("[data-composer='sheet']")
            const box = s?.closest("[data-mobile-bottom-sheet]") ?? s
            const r = box?.getBoundingClientRect()
            return { up: !!s, top: r ? Math.round(r.top) : null, title: !!s?.querySelector("[data-composer-title]"), schedule: !!s?.querySelector("[data-composer-toolbar] [data-composer-tool='schedule']"), draft: !!s?.querySelector("[data-composer-draft]"), sideways: Math.round(document.documentElement.scrollWidth - innerWidth) }
          })
          await p.screenshot({ path: join(shots, `open-${tag}.png`) })
          await p.evaluate(() => ((window.__frames = []), (window.__rec = true)))
          const c = await film(p, `close-${tag}`, () => p.click("[data-composer='sheet'] [data-composer-cancel]"), { ms: 1300, width: 240 })
          const fc = await p.evaluate(() => ((window.__rec = false), window.__frames.slice()))
          const gone = await p.evaluate(() => !document.querySelector("[data-composer='sheet']"))
          numbers[`move-${tag}`] = { sheet, behindOpen: steps(fo, "list"), behindClose: steps(fc, "list"), film: [o.frames, c.frames] }
          expect(sheet.up && sheet.title && sheet.top !== null && sheet.top < 140, `${tag}: the sheet is up with its fields (top ${sheet.top}px)`, sheet)
          expect(sheet.schedule && sheet.draft && sheet.sideways <= 0, `${tag}: the clock in its toolbar, Save draft in the sheet, nothing sideways`, sheet)
          expect(numbers[`move-${tag}`].behindOpen === 0 && numbers[`move-${tag}`].behindClose === 0, `${tag}: nothing behind the sheet moves while it rises and goes`, numbers[`move-${tag}`])
          expect(gone, `${tag}: Cancel with nothing written puts it away`, gone)
        }
        expect(errors.length === 0, `${tag}: no page errors`, errors)
        await p.close()
      }
    }
  }

  /* ── KEEP ─────────────────────────────────────────────────────────────── */
  if (want("KEEP")) {
    console.log("\nKEEP: what was written is not lost")
    const { p, errors } = await open(DESK)
    await p.click("[data-composer-open]")
    await sleep(400)
    await p.type("[data-composer-title]", "Notes from Friday")
    await p.type("[data-composer-editor] textarea", "Three things we agreed.")
    await sleep(600)
    await p.keyboard.press("Escape")
    await sleep(400)
    const asked = await p.evaluate(() => ({ dialog: !!document.querySelector("[data-leave-dialog]"), draft: !!document.querySelector("[data-leave-draft]") }))
    expect(asked.dialog && asked.draft, "Escape with something written asks first, and offers Save draft beside Keep writing and Leave", asked)
    await p.screenshot({ path: join(shots, "keep-ask-1440.png") })
    await p.click("[data-leave-stay]")
    await sleep(300)
    /* Closing or reloading the tab with something written gets the browser's own question (beforeunload); here it is answered Leave. */
    let unload = null
    p.once("dialog", (d) => {
      unload = d.type()
      void d.accept()
    })
    await p.reload({ waitUntil: "load" })
    expect(unload === "beforeunload", "reloading with something written: the browser asks first", unload)
    await sleep(900)
    const back = await p.evaluate(() => ({ open: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"), title: document.querySelector("[data-composer-title]")?.value, restored: !!document.querySelector("[data-composer-restored]") }))
    expect(back.open === "open" && back.title === "Notes from Friday" && back.restored, "after a reload it is back, open where it was", back)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── SCHEDULE ─────────────────────────────────────────────────────────── */
  if (want("SCHEDULE")) {
    console.log(`\nSCHEDULE: one writer, the creator's zone (${ZONE}) on a device on ${DEVICE}`)
    const setInput = (p, sel, v) =>
      p.$eval(
        sel,
        (el, v) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v)
          el.dispatchEvent(new Event("input", { bubbles: true }))
        },
        v,
      )
    const pickSpace = async (p, name) => {
      await p.click("[data-composer-editor] button[data-composer-space]")
      await sleep(300)
      await p.evaluate((name) => [...document.querySelectorAll("[role=menuitem]")].find((x) => x.textContent.includes(name))?.click(), name)
      await sleep(200)
    }
    const panelRows = (p) => p.evaluate(() => [...document.querySelectorAll("[data-scheduled-row]")].map((x) => ({ status: x.getAttribute("data-scheduled-row"), id: x.getAttribute("data-scheduled-id"), text: x.textContent })))
    const tomorrow = dayIn(Date.now() + 86_400_000, ZONE)
    if (!process.env.PHONE_ONLY) {
    const { p, errors, store } = await open(DESK)

    /* A new post, scheduled. */
    await p.click("[data-composer-open]")
    await sleep(400)
    await p.type("[data-composer-title]", "Friday call notes")
    await p.type("[data-composer-editor] textarea", "Bring one page.")
    await pickSpace(p, "General")
    await p.click("[data-composer-tool='schedule']")
    await sleep(250)
    await setInput(p, "[data-composer-schedule-day]", tomorrow)
    await setInput(p, "[data-composer-schedule-time]", "09:30")
    await sleep(200)
    const zoneLine = await p.evaluate(() => ({ zone: document.querySelector("[data-composer-schedule-zone]")?.getAttribute("data-composer-schedule-zone"), text: document.querySelector("[data-composer-schedule-zone]")?.textContent, label: document.querySelector("[data-feed-writer] [data-composer-post]")?.textContent }))
    expect(zoneLine.zone === ZONE && /9:30/.test(zoneLine.text) && /Europe\/Warsaw|Europe\/ Warsaw|Warsaw/.test(zoneLine.text) && /on this device/.test(zoneLine.text) && /3:30/.test(zoneLine.text), "the day and time are Warsaw's, named, with the device's 3:30 beside it", zoneLine)
    expect(/Schedule/.test(zoneLine.label), "Post reads Schedule", zoneLine.label)
    await p.screenshot({ path: join(shots, "schedule-open-1440.png") })
    const before = (await sent(p)).length
    await p.click("[data-feed-writer] [data-composer-post]")
    await sleep(1200)
    const posted = (await sent(p)).slice(before).filter((x) => x.method === "POST" && x.short.endsWith("/scheduled-posts"))
    const wantAt = instantIn(tomorrow, "09:30", ZONE)
    numbers["schedule-new"] = { sent: posted.map((x) => x.sent), wantAt }
    expect(posted.length === 1 && posted[0].sent.publishAt === wantAt && posted[0].sent.spaceId === S1 && posted[0].sent.title === "Friday call notes", `one POST to part 194 with publishAt ${wantAt} (09:30 Warsaw), the space and the words`, posted.map((x) => x.sent))
    let rows = await panelRows(p)
    const closed = await p.evaluate(() => document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"))
    expect(closed === "closed" && rows.length === 1 && rows[0].status === "scheduled" && /9:30/.test(rows[0].text), "the writer closes; the list says Scheduled, going up at 9:30", { closed, rows })
    await p.screenshot({ path: join(shots, "schedule-listed-1440.png") })

    /* Reschedule: the row opens the same writer. */
    await p.click(`[data-scheduled-id='${rows[0].id}'] [data-row-open]`)
    await sleep(600)
    const loaded = await p.evaluate(() => ({ open: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"), item: document.querySelector("[data-composer-item]")?.getAttribute("data-composer-item"), title: document.querySelector("[data-composer-title]")?.value, time: document.querySelector("[data-composer-schedule-time]")?.value, label: document.querySelector("[data-feed-writer] [data-composer-post]")?.textContent, modal: !!document.querySelector("[data-form-sheet='scheduled-post'], [role=dialog]") }))
    expect(loaded.open === "open" && loaded.item === "scheduled" && loaded.title === "Friday call notes" && loaded.time === "09:30" && /Save/.test(loaded.label) && !loaded.modal, "the row opens the same writer in place (no modal), its words and 09:30, Save", loaded)
    await p.screenshot({ path: join(shots, "schedule-edit-1440.png") })
    await setInput(p, "[data-composer-schedule-time]", "10:45")
    await sleep(150)
    const before2 = (await sent(p)).length
    await p.click("[data-feed-writer] [data-composer-post]")
    await sleep(1200)
    const patched = (await sent(p)).slice(before2).filter((x) => x.method === "PATCH")
    expect(patched.length === 1 && patched[0].sent.publishAt === instantIn(tomorrow, "10:45", ZONE), "reschedule: one PATCH with 10:45 Warsaw", patched.map((x) => x.sent))
    rows = await panelRows(p)
    expect(rows.length === 1 && rows[0].status === "scheduled" && /10:45/.test(rows[0].text), "the list says 10:45", rows)

    /* Cancel the schedule, keep the words: a draft. */
    await p.click(`[data-scheduled-id='${rows[0].id}'] [data-row-open]`)
    await sleep(600)
    const before3 = (await sent(p)).length
    await p.click("[data-feed-writer] [data-composer-draft]")
    await sleep(1200)
    const drafted = (await sent(p)).slice(before3).filter((x) => x.method === "PATCH")
    rows = await panelRows(p)
    expect(drafted.length === 1 && drafted[0].sent.publishAt === null && rows[0]?.status === "draft", "Make it a draft: PATCH publishAt null, the list says Draft", { sent: drafted.map((x) => x.sent), rows })

    /* Post the draft now: it becomes a post in the list. */
    await p.click(`[data-scheduled-id='${rows[0].id}'] [data-row-open]`)
    await sleep(600)
    const nowLabel = await p.evaluate(() => document.querySelector("[data-feed-writer] [data-composer-post]")?.textContent)
    const before4 = (await sent(p)).length
    await p.click("[data-feed-writer] [data-composer-post]")
    await sleep(1600)
    const pub = (await sent(p)).slice(before4).filter((x) => x.method === "PATCH")
    rows = await panelRows(p)
    const inList = await p.evaluate((t) => [...document.querySelectorAll("[data-feed-row]")].some((x) => x.textContent.includes(t)), "Friday call notes")
    expect(/Post now/.test(nowLabel) && pub.length === 1 && pub[0].sent.publishNow === true, "a draft opened reads Post now and sends publishNow", { nowLabel, sent: pub.map((x) => x.sent) })
    expect(rows[0]?.status === "published" && inList, "the list says Posted and the post is in the list of posts", { rows, inList })

    /* A new one, then deleted from the writer (asked in its own line). */
    await p.click("[data-scheduled-new]")
    await sleep(600)
    const preset = await p.evaluate(() => ({ open: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"), schedule: !!document.querySelector("[data-composer-schedule]") }))
    expect(preset.open === "open" && preset.schedule, "Schedule a post opens the writer with its day and time on", preset)
    await p.type("[data-composer-title]", "Delete me")
    await p.type("[data-composer-editor] textarea", "Soon gone.")
    await pickSpace(p, "Announcements")
    await p.click("[data-feed-writer] [data-composer-post]")
    await sleep(1200)
    rows = await panelRows(p)
    const del = rows.find((r) => r.text.includes("Delete me"))
    await p.click(`[data-scheduled-id='${del.id}'] [data-row-open]`)
    await sleep(600)
    await p.click("[data-composer-item-delete]")
    await sleep(150)
    const before5 = (await sent(p)).length
    await p.click("[data-composer-item-delete-yes]")
    await sleep(1200)
    const deleted = (await sent(p)).slice(before5).filter((x) => x.method === "DELETE")
    rows = await panelRows(p)
    expect(deleted.length === 1 && !rows.some((r) => r.text.includes("Delete me")), "Delete, asked in its line: one DELETE and the row is gone", { deleted: deleted.length, rows: rows.map((r) => r.status) })

    /* A picture blocks Schedule, with the reason; posting now is still there. */
    await p.click("[data-composer-open]")
    await sleep(400)
    await p.type("[data-composer-title]", "With a picture")
    await p.type("[data-composer-editor] textarea", "See below.")
    await pickSpace(p, "General")
    await p.evaluate(() => {
      const input = document.querySelector("[data-composer-file-input]")
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" }))
      input.files = dt.files
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await sleep(300)
    await p.click("[data-composer-tool='schedule']")
    await sleep(200)
    const before6 = (await sent(p)).length
    await p.click("[data-feed-writer] [data-composer-post]")
    await sleep(500)
    const blocked = await p.evaluate(() => document.querySelector("[data-composer-schedule-error]")?.textContent ?? null)
    const nothing = (await sent(p)).slice(before6).filter((x) => x.short.includes("scheduled-posts") && x.method !== "GET")
    expect(!!blocked && /Pictures/.test(blocked) && nothing.length === 0, "a picture: Schedule says why and sends nothing", { blocked, nothing: nothing.length })
    await p.screenshot({ path: join(shots, "schedule-blocked-1440.png") })
    expect(errors.length === 0, "no page errors", errors)
    numbers["schedule-store"] = store.rows.map((r) => r.status)
    await p.close()
    }

    /* A phone, dark: the same writer as its sheet, scheduled. */
    {
      const { p, errors } = await open(PHONE, { dark: true, cpu: Number(process.env.PHONE_CPU || 4) })
      await p.evaluate(() => document.querySelector("[data-composer-open]").scrollIntoView({ block: "center" }))
      await sleep(200)
      const b = await p.evaluate(() => {
        const r = document.querySelector("[data-composer-open]").getBoundingClientRect()
        return { x: r.left + 40, y: r.top + r.height / 2 }
      })
      await p.touchscreen.tap(b.x, b.y)
      await sleep(1500)
      if (process.env.DEBUG) {
        const t0 = Date.now()
        await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
        console.log("    a frame after the rise:", Date.now() - t0, "ms", await p.evaluate(() => ({ title: !!document.querySelector("[data-composer='sheet'] [data-composer-title]"), active: document.activeElement?.outerHTML.slice(0, 80) })))
      }
      await p.type("[data-composer='sheet'] [data-composer-title]", "Phone schedule")
      if (process.env.DEBUG) console.log("    typed the title")
      await p.type("[data-composer='sheet'] textarea", "From the bus.")
      await p.tap("[data-composer='sheet'] [data-composer-tool='schedule']")
      await sleep(400)
      if (process.env.DEBUG) console.log("    after the clock:", await p.evaluate(() => { const b = document.querySelector("[data-composer='sheet'] [data-composer-tool='schedule']"); const r = b?.getBoundingClientRect(); return { pressed: b?.getAttribute("aria-pressed"), r: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width)], hit: r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.outerHTML.slice(0, 120) : null, panel: !!document.querySelector("[data-composer-schedule]") } }))
      await setInput(p, "[data-composer='sheet'] [data-composer-schedule-day]", tomorrow)
      await setInput(p, "[data-composer='sheet'] [data-composer-schedule-time]", "08:00")
      await sleep(300)
      const shown = await p.evaluate(() => {
        const s = document.querySelector("[data-composer='sheet']")
        const box = s.querySelector("[data-composer-schedule]")?.getBoundingClientRect()
        return { box: box ? { left: Math.round(box.left), right: Math.round(box.right) } : null, label: s.querySelector("[data-composer-post]")?.textContent, sideways: Math.round(document.documentElement.scrollWidth - innerWidth) }
      })
      expect(shown.box && shown.box.left >= 0 && shown.box.right <= 390 && /Schedule/.test(shown.label) && shown.sideways <= 0, "390 dark: the day and time in the sheet, inside the screen, Schedule in its top row", shown)
      await p.screenshot({ path: join(shots, "schedule-390-dark.png") })
      expect(errors.length === 0, "390: no page errors", errors)
      await p.close()
    }
  }

  /* ── POPUP ────────────────────────────────────────────────────────────── */
  if (want("POPUP")) {
    console.log("\nPOPUP: a post opened from the list in the community's own popup")
    for (const dark of [false, true]) {
      const tag = `1440-${dark ? "dark" : "light"}`
      const { p, errors } = await open(DESK, { dark, lat: 300 })
      const rowSel = `[data-feed-row='${pid(2)}'] [data-feed-open]`
      const f = await film(p, `popup-open-${tag}`, () => p.click(rowSel), { ms: 1300 })
      const shown = await p.evaluate(() => {
        const panel = document.querySelector("[data-post-overlay='panel']")
        const b = panel?.getBoundingClientRect()
        return {
          panel: !!panel,
          side: !!document.querySelector("[data-side-sheet]"),
          box: b ? { x: Math.round(b.left), w: Math.round(b.width) } : null,
          body: panel ? /did not reread a single line/.test(panel.textContent) : false,
          actions: panel ? [...panel.querySelectorAll("[data-viewer-action]")].map((x) => x.getAttribute("data-viewer-action")) : [],
          dots: panel ? [...panel.querySelectorAll("[data-post-more]")].filter((x) => x.getBoundingClientRect().width > 0).length : null,
          comments: panel ? panel.querySelectorAll("[data-comment]").length : 0,
          path: location.pathname,
          router: (window.__router || []).filter((x) => ["push", "replace", "link"].includes(x[0])),
        }
      })
      numbers[`popup-${tag}`] = { ...shown, film: f.frames }
      expect(shown.panel && !shown.side && shown.box && shown.box.w <= 760, `${tag}: the community's popup (${shown.box?.w}px wide), no side sheet`, shown.box)
      expect(shown.body && shown.comments === 2, `${tag}: the whole post and its comments`, { body: shown.body, comments: shown.comments })
      expect(shown.actions.join() === "pin,move,lock,unfeature,remove" && shown.dots === 0, `${tag}: the admin's actions in a row, the card's dots not drawn`, shown.actions)
      expect(shown.path === `/app/community/${ID}/feed` && shown.router.length === 0, `${tag}: the address stays the admin's, nothing navigated`, { path: shown.path, router: shown.router })
      await p.screenshot({ path: join(shots, `popup-${tag}.png`) })
      if (!dark) {
        const n0 = (await sent(p)).length
        await p.click("[data-post-overlay='panel'] [data-viewer-action='pin']")
        await sleep(500)
        const pinned = await p.evaluate((id) => ({ unpin: !!document.querySelector("[data-post-overlay='panel'] [data-viewer-action='unpin']"), mark: !!document.querySelector("[data-post-overlay='panel'] [data-pin-mark]"), row: !!document.querySelector(`[data-feed-row='${id}'] [data-feed-pinned]`) }), pid(2))
        const pinSent = (await sent(p)).slice(n0).filter((x) => x.method === "POST")
        expect(pinSent.length === 1 && pinSent[0].sent.action === "pin" && pinned.unpin && pinned.mark && pinned.row, "Pin in the popup: one moderation pin, the popup and the row say Pinned", { pinned, sent: pinSent.map((x) => x.sent) })
        const ann = await p.evaluate((id) => !!document.querySelector(`[data-feed-row='${id}'] [data-feed-announcement]`), pid(1))
        expect(ann, "an announcement says so on its row", ann)
      }
      const c = await film(p, `popup-close-${tag}`, () => p.keyboard.press("Escape"), { ms: 700 })
      const gone = await p.evaluate(() => ({ panel: !!document.querySelector("[data-post-overlay-root]"), path: location.pathname }))
      expect(!gone.panel && gone.path === `/app/community/${ID}/feed`, `${tag}: Escape closes it, the address is the list's`, gone)
      numbers[`popup-${tag}`].closeFilm = c.frames
      expect(errors.length === 0, `${tag}: no page errors`, errors)
      await p.close()
    }
    for (const dark of [false, true]) {
      const tag = `390-${dark ? "dark" : "light"}`
      const { p, errors } = await open(PHONE, { dark, cpu: 4, lat: 300 })
      const tb = await p.evaluate((id) => {
        const el = document.querySelector(`[data-feed-row='${id}'] [data-feed-open]`)
        el.scrollIntoView({ block: "center" })
        const b = el.getBoundingClientRect()
        return { x: b.left + 20, y: b.top + b.height / 2 }
      }, pid(2))
      await sleep(200)
      const f = await film(p, `popup-open-${tag}`, () => p.touchscreen.tap(tb.x, tb.y), { ms: 2000, width: 240 })
      const shown = await p.evaluate(() => {
        const sheet = document.querySelector("[data-post-sheet], [data-mobile-bottom-sheet]:has([data-viewer-actions])")
        const actions = document.querySelector("[data-viewer-actions]")
        const b = sheet?.getBoundingClientRect()
        return {
          sheet: !!sheet,
          top: b ? Math.round(b.top) : null,
          side: !!document.querySelector("[data-side-sheet], [data-form-sheet='post-viewer']"),
          actions: actions ? [...actions.querySelectorAll("[data-viewer-action]")].map((x) => x.getAttribute("data-viewer-action")) : [],
          clipped: actions ? [...actions.querySelectorAll("[data-viewer-action], [data-viewer-community]")].filter((x) => x.getBoundingClientRect().right > innerWidth + 0.5 || x.getBoundingClientRect().left < 0).length : null,
          sideways: Math.round(document.documentElement.scrollWidth - innerWidth),
        }
      })
      numbers[`popup-${tag}`] = { ...shown, film: f.frames }
      expect(shown.sheet && !shown.side && shown.top !== null && shown.top < 200, `${tag}: the community's bottom sheet (top ${shown.top}px)`, shown)
      expect(shown.actions.length >= 4 && shown.clipped === 0 && shown.sideways <= 0, `${tag}: the actions wrap inside the screen, nothing sideways`, shown)
      await p.screenshot({ path: join(shots, `popup-${tag}.png`) })
      expect(errors.length === 0, `${tag}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── TABLET ───────────────────────────────────────────────────────────── */
  if (want("TABLET")) {
    console.log("\nTABLET: 820x1180, light and dark")
    const TAB = { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
    for (const dark of [false, true]) {
      const tag = `820-${dark ? "dark" : "light"}`
      const { p, errors } = await open(TAB, { dark })
      await p.tap("[data-composer-open]")
      await sleep(700)
      await p.tap("[data-composer-tool='schedule']")
      await sleep(300)
      const w = await p.evaluate(() => {
        const box = document.querySelector("[data-composer-schedule]")?.getBoundingClientRect()
        return { inPlace: document.querySelector("[data-feed-writer] [data-composer]")?.getAttribute("data-composer"), box: box ? { l: Math.round(box.left), r: Math.round(box.right) } : null, sideways: Math.round(document.documentElement.scrollWidth - innerWidth) }
      })
      expect(w.inPlace === "open" && w.box && w.box.r <= 820 && w.sideways <= 0, `${tag}: the writer opens in place with the day and time inside the screen`, w)
      await p.screenshot({ path: join(shots, `tablet-writer-${tag}.png`) })
      await p.tap("[data-feed-writer] [data-composer-cancel]")
      await sleep(700)
      await p.evaluate((id) => document.querySelector(`[data-feed-row='${id}'] [data-feed-open]`).click(), pid(2))
      await sleep(1500)
      const o = await p.evaluate(() => ({ panel: !!document.querySelector("[data-post-overlay='panel']"), actions: document.querySelectorAll("[data-viewer-action]").length, sideways: Math.round(document.documentElement.scrollWidth - innerWidth) }))
      expect(o.panel && o.actions >= 4 && o.sideways <= 0, `${tag}: a post opens in the community's popup with the actions`, o)
      await p.screenshot({ path: join(shots, `tablet-popup-${tag}.png`) })
      expect(errors.length === 0, `${tag}: no page errors`, errors)
      await p.close()
    }
  }

  await browser.close()
  writeFileSync(join(shots, "numbers.json"), JSON.stringify(numbers, null, 2))
} finally {
  if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
  if (root !== here && process.env.ROOT && existsSync(join(root, "scripts/render-posts26.tsx")) && !process.env.KEEP_STUBS) {
    /* A "before" checkout keeps nothing of this probe. */
    try {
      rmSync(join(root, "scripts/render-posts26.tsx"))
    } catch {}
  }
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}`)
console.log(JSON.stringify(numbers))
if (broken) process.exitCode = 1
