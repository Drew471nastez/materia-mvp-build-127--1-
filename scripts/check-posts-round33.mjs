/**
 * ===========================================================================
 *  ROUND 33: THE COMMUNITY ADMIN'S POSTS, MEASURED
 * ===========================================================================
 * The owner: on Posts the "Scheduled and drafts" panel came very late and had
 * to load; switching All posts, Pinned and Removed was slow and laggy; a post
 * opened the community's feed instead of staying in the admin. The real
 * FeedSection (scripts/render-posts-round33.tsx) in headless Chromium, against
 * a stub of the API that answers every read only after a set latency:
 *
 *   FIRST    the panel's rows handed in with the page: the panel is in the
 *            same frame as the first post row, and nothing asks for it; with
 *            none handed in, its card (the frame) is in that first frame and
 *            the list under it does not move when its rows arrive; someone who
 *            may not post sees no panel and asks for nothing
 *   TABS     Pinned and Removed are asked for side by side on mount; once
 *            here, a press on a tab shows its rows in the same task as the
 *            press (before the next frame), with no skeleton, no busy state,
 *            no request; a kept list older than 15s is shown at once and read
 *            again quietly; a search asks for all three views at once (q=)
 *   VIEWER   a press on a row opens the post in a sheet from the right, in the
 *            same task, with no navigation; the post fills in (the whole text,
 *            the pictures, the comments); a picture opens the lightbox, and
 *            Escape closes the lightbox first and then the sheet; Pin in the
 *            sheet sends the moderation pin and the row under it says Pinned;
 *            a poll shows its options; at 390 the same press opens the bottom
 *            sheet instead
 *
 * Pictures go to SHOTS_DIR (.round33-shots by default); look at them, then
 * delete the folder.
 *
 *   node scripts/check-posts-round33.mjs [FIRST TABS VIEWER]
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import { FIXTURE } from "./posts-round33-fixture.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".posts-round33-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round33-shots")
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
const { ID, pid } = FIXTURE

/* Every frame, from the document's first: what of Posts is on screen and where the list card is. */
const PRELUDE = `window.__sent = []; window.__frames = [];
(function tick() {
  if (window.__pause) return void requestAnimationFrame(tick)
  const list = document.querySelector("[data-feed] > section[data-feed-show]")
  const sheet = document.querySelector("[data-side-sheet='post-viewer']")
  window.__frames.push({
    t: performance.now(),
    rows: document.querySelectorAll("[data-feed-row]").length,
    panel: !!document.querySelector("[data-scheduled-panel]"),
    frame: !!document.querySelector("[data-feed] [data-scheduled-frame]"),
    empty: !!document.querySelector("[data-scheduled-panel]") && /Nothing scheduled/.test(document.querySelector("[data-scheduled-panel]").textContent),
    listTop: list ? Math.round(list.getBoundingClientRect().top) : null,
    sheetX: sheet ? Math.round(sheet.getBoundingClientRect().left) : null,
  })
  if (window.__frames.length < 4000) requestAnimationFrame(tick)
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
    auth: { getSession: async () => ({ data: { session: { user: { id: "${FIXTURE.ME}" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-posts-round33.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.posts-round33-probe/navigation.js", "next/link": "./.posts-round33-probe/link.jsx", "next/image": "./.posts-round33-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1280, height: 860, deviceScaleFactor: 1 }

  /** The stub: every read answered after `lat` ms, in the shapes the routes answer; every request logged in window.__sent. */
  async function open(caseName, vp, lat = 600) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(PRELUDE)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
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
        let body = { ok: true }
        const admin = `/api/app/community/${ID}`
        const member = `/api/community/${ID}`
        let m
        if (path === `${admin}/posts` && method === "GET") {
          const show = qs.get("show") || "all"
          let rows = FIXTURE.rows[show] || []
          const q = (qs.get("q") || "").toLowerCase()
          if (q) rows = rows.filter((x) => `${x.title} ${x.excerpt}`.toLowerCase().includes(q))
          body = { rows, next: null }
        } else if (path === `${admin}/scheduled-posts` && method === "GET") body = FIXTURE.scheduled
        else if (path === `${admin}/moderation` && method === "POST") body = { status: "published" }
        else if ((m = path.match(new RegExp(`^${member}/posts/([^/]+)/comments$`))) && method === "GET") body = FIXTURE.comments(m[1])
        else if ((m = path.match(new RegExp(`^${member}/posts/([^/]+)$`))) && method === "GET") {
          const row = [...FIXTURE.rows.all, ...FIXTURE.rows.pinned, ...FIXTURE.rows.removed].find((x) => x.id === m[1])
          body = row ? { post: FIXTURE.post(row) } : { error: "not_found" }
        }
        const answer = () => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {})
        if (method === "GET") setTimeout(answer, lat)
        else setTimeout(answer, 80)
        return
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/${ID}/feed?case=${caseName}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    return { p, errors }
  }
  const sent = (p) => p.evaluate(() => window.__sent.slice())
  const frames = (p) => p.evaluate(() => window.__frames.slice())

  /* ── FIRST ────────────────────────────────────────────────────────────── */
  if (want("FIRST")) {
    console.log("\nFIRST: the Scheduled and drafts panel, with the page (every read answered after 800ms)")
    for (const [vp, w] of [[DESK, 1280], [PHONE, 390]]) {
      const { p, errors } = await open("server", vp, 800)
      await sleep(2200)
      const f = await frames(p)
      const first = f.findIndex((x) => x.rows > 0)
      const tops = f.slice(first).map((x) => x.listTop).filter((x) => x !== null)
      const asked = (await sent(p)).filter((x) => x.short.includes("/scheduled-posts"))
      numbers[`first-${w}`] = { firstRowsFrame: first, panelInIt: f[first]?.panel, listTops: [...new Set(tops)] }
      expect(first >= 0 && f[first].panel && f[first].empty && !f[first].frame, `${w}: the panel and its words are in the frame the first post row is in (frame ${first})`, f[first])
      expect(asked.length === 0, `${w}: nothing asks for the panel's rows (they came with the page)`, asked.length)
      expect(new Set(tops).size === 1, `${w}: the list card never moves while Pinned and Removed arrive (top ${tops[0]}px)`, [...new Set(tops)])
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.screenshot({ path: join(shots, `first-server-${w}.png`) })
      await p.close()
    }
    {
      const { p, errors } = await open("client", DESK, 800)
      await sleep(2200)
      const f = await frames(p)
      const first = f.findIndex((x) => x.rows > 0)
      const filled = f.findIndex((x) => x.empty)
      const before = f[first]?.listTop
      const after = f[filled]?.listTop
      const asked = (await sent(p)).filter((x) => x.short.includes("/scheduled-posts"))
      numbers["first-client"] = { firstRowsFrame: first, frameInIt: f[first]?.frame, filledFrame: filled, filledMs: Math.round((f[filled]?.t ?? 0) - (f[first]?.t ?? 0)), listTopBefore: before, listTopAfter: after }
      expect(first >= 0 && f[first].frame && !f[first].empty, `client read: the panel's card (its frame, no spinner) is in the first frame with rows`, f[first])
      expect(asked.length === 1 && filled > first, `client read: one request, the rows in ${numbers["first-client"].filledMs}ms later (the stub's 800ms)`, asked.length)
      expect(before === after, `client read: the list under it does not move when the rows land (${before}px then ${after}px)`, { before, after })
      expect(errors.length === 0, `client read: no page errors`, errors)
      await p.close()
    }
    {
      const { p } = await open("none", DESK, 300)
      await sleep(900)
      const has = await p.evaluate(() => !!document.querySelector("[data-scheduled-panel], [data-scheduled-frame]"))
      const asked = (await sent(p)).filter((x) => x.short.includes("/scheduled-posts"))
      expect(!has && asked.length === 0, "someone who may not post: no panel, nothing asked", { has, asked: asked.length })
      await p.close()
    }
  }

  /* ── TABS ─────────────────────────────────────────────────────────────── */
  if (want("TABS")) {
    console.log("\nTABS: All posts, Pinned and Removed (every list read answered after 600ms)")
    const { p, errors } = await open("server", DESK, 600)
    await sleep(150)
    const early = (await sent(p)).filter((x) => x.short.includes("/posts?"))
    const shows = early.map((x) => new URLSearchParams(x.short.split("?")[1]).get("show")).sort()
    const spread = early.length ? Math.round(Math.max(...early.map((x) => x.at)) - Math.min(...early.map((x) => x.at))) : null
    expect(shows.join() === "pinned,removed" && spread !== null && spread < 50, `on mount Pinned and Removed are asked for side by side (${spread}ms apart), All came with the page`, shows)
    await sleep(900)
    /* The frame log stops here: its own measuring each frame would be counted as the press's. */
    await p.evaluate(() => (window.__pause = true))
    /*
      A press on a tab, and when its rows are in the page: in the press's own task, in the microtask React flushes a press's
      update in, or in the first frame's callback (still before that frame is painted). "framesPainted" is how many frames
      were painted without them: 0 means the frame after the press already has them.
    */
    const press = async (label, want) => {
      const before = (await sent(p)).length
      const m0 = process.env.METRICS ? await p.metrics() : null
      const cdp = process.env.PROFILE ? await p.createCDPSession() : null
      if (cdp) {
        await cdp.send("Profiler.enable")
        await cdp.send("Profiler.setSamplingInterval", { interval: 100 })
        await cdp.send("Profiler.start")
      }
      const r = await p.evaluate(async (label, want) => {
        const ids = () => [...document.querySelectorAll("[data-feed-row]")].map((x) => x.getAttribute("data-feed-row"))
        const has = () => JSON.stringify(ids()) === JSON.stringify(want)
        const tab = [...document.querySelectorAll("[data-feed] [data-list-head] button")].find((b) => b.textContent.trim().startsWith(label))
        const t0 = performance.now()
        tab.click()
        let at = has() ? "in the press's task" : null
        await Promise.resolve()
        if (!at && has()) at = "in the press's microtask"
        const early = Math.round((performance.now() - t0) * 10) / 10
        const busy = document.querySelector("[data-feed] > section[data-feed-show]")?.getAttribute("aria-busy")
        const skeleton = !!document.querySelector("[data-feed] > section [data-shimmer], [data-feed] > section [data-list-loading]")
        let frames = 0
        while (!at && frames < 30) {
          await new Promise((r) => requestAnimationFrame(() => r()))
          if (has()) at = frames === 0 ? "before the first frame is painted" : `after ${frames} frames`
          frames++
        }
        const painted = at && !/after/.test(at) ? 0 : frames
        return { at, inMs: frames === 0 ? early : Math.round((performance.now() - t0) * 10) / 10, framesPainted: painted, busy, skeleton, rows: ids() }
      }, label, want)
      await sleep(400)
      if (cdp) {
        const { profile } = await cdp.send("Profiler.stop")
        const self = new Map()
        const dt = profile.timeDeltas
        const byId = new Map(profile.nodes.map((n) => [n.id, n]))
        profile.samples.forEach((id, i) => {
          const n = byId.get(id)
          const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
          self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000)
        })
        const top = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14)
        console.log("    profile", label, top.map(([k, v]) => `${k} ${v.toFixed(1)}ms`).join(" | "))
        await cdp.detach()
      }
      if (m0) { const m1 = await p.metrics(); console.log("    metrics", label, Object.fromEntries(["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"].map((k) => [k, Math.round((m1[k] - m0[k]) * 1000)]))) }
      return { ...r, asked: (await sent(p)).slice(before).filter((x) => x.short.includes("/posts?")).length }
    }
    const ids = (list) => list.map((x) => x.id)
    for (const [label, list] of [["Pinned", FIXTURE.rows.pinned], ["Removed", FIXTURE.rows.removed], ["All posts", FIXTURE.rows.all]]) {
      const r = await press(label, ids(list))
      numbers[`tab-${label}`] = r
      expect(r.framesPainted === 0 && JSON.stringify(r.rows) === JSON.stringify(ids(list)), `${label}: its ${list.length} rows are in the page ${r.at} (${r.inMs}ms after the press), no frame painted without them`, { at: r.at, inMs: r.inMs })
      expect(!r.busy && !r.skeleton && r.asked === 0, `${label}: no busy state, no skeleton, no request`, { busy: r.busy, skeleton: r.skeleton, asked: r.asked })
    }
    /* The same presses on a CPU four times slower (a mid phone): still no frame painted without the rows. */
    await p.emulateCPUThrottling(4)
    for (const [label, list] of [["Pinned", FIXTURE.rows.pinned], ["Removed", FIXTURE.rows.removed], ["All posts", FIXTURE.rows.all]]) {
      const r = await press(label, ids(list))
      numbers[`tab-${label}-4x`] = { at: r.at, inMs: r.inMs, framesPainted: r.framesPainted }
      expect(r.framesPainted === 0 && r.asked === 0, `4x CPU, ${label}: ${r.at}, ${r.inMs}ms after the press`, { at: r.at, inMs: r.inMs })
    }
    await p.emulateCPUThrottling(1)
    await p.screenshot({ path: join(shots, "tabs-1280.png") })
    console.log("  (waiting 15.5s for the kept lists to age)")
    await sleep(15_500)
    const stale = await press("Pinned", ids(FIXTURE.rows.pinned))
    await sleep(800)
    const after = await p.evaluate(() => [...document.querySelectorAll("[data-feed-row]")].map((x) => x.getAttribute("data-feed-row")))
    numbers["tab-stale"] = stale
    expect(stale.framesPainted === 0 && stale.asked === 1 && !stale.busy, `a kept list 15s old is shown at once (${stale.at}) and read again quietly (one request, no busy state)`, { at: stale.at, asked: stale.asked, busy: stale.busy })
    expect(JSON.stringify(after) === JSON.stringify(ids(FIXTURE.rows.pinned)), "and the answer leaves the rows as they are", after)
    await press("All posts", ids(FIXTURE.rows.all))
    const beforeSearch = (await sent(p)).length
    await p.type("[data-feed] [data-search] input", "desk")
    await sleep(1200)
    const searched = (await sent(p)).slice(beforeSearch).filter((x) => x.short.includes("/posts?"))
    const qs = searched.map((x) => new URLSearchParams(x.short.split("?")[1]))
    const rowsNow = await p.evaluate(() => [...document.querySelectorAll("[data-feed-row]")].map((x) => x.getAttribute("data-feed-row")))
    expect(qs.length === 3 && qs.every((u) => u.get("q") === "desk") && new Set(qs.map((u) => u.get("show"))).size === 3, `a search asks the server for all three views at once (${qs.length} requests, q=desk)`, qs.map((u) => u.toString()))
    expect(JSON.stringify(rowsNow) === JSON.stringify([pid(2)]), "and shows what the server found", rowsNow)
    const pinnedSearch = await press("Pinned", [])
    expect(pinnedSearch.asked === 0 && pinnedSearch.framesPainted === 0 && pinnedSearch.rows.length === 0, `Pinned under that search is already here too, nothing pinned matches (${pinnedSearch.at})`, pinnedSearch)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── VIEWER ───────────────────────────────────────────────────────────── */
  if (want("VIEWER")) {
    console.log("\nVIEWER: a post opened in the admin (post and comments answered after 400ms)")
    const { p, errors } = await open("server", DESK, 400)
    await sleep(1200)
    const rowSel = `[data-feed-row='${pid(2)}']`
    const rb = await p.evaluate((sel) => {
      const b = document.querySelector(sel).querySelector("[data-feed-open]").getBoundingClientRect()
      return { x: b.left + 20, y: b.top + b.height / 2 }
    }, rowSel)
    const before = (await sent(p)).length
    await p.mouse.move(rb.x, rb.y)
    await sleep(250)
    const warmed = (await sent(p)).slice(before).map((x) => x.short)
    expect(warmed.some((s) => s.endsWith(`/posts/${pid(2)}`)) && warmed.some((s) => s.endsWith(`/posts/${pid(2)}/comments`)), "a mouse resting on a row asks for its post and its comments ahead", warmed)
    const opened = await p.evaluate(async (sel) => {
      const li = document.querySelector(sel)
      const t0 = performance.now()
      li.querySelector("[data-feed-open]").click()
      /* React commits a press's update in the microtask after it, before any frame. */
      await Promise.resolve()
      const sheet = document.querySelector("[data-side-sheet='post-viewer']")
      const sync = { sheet: !!sheet, title: sheet ? /My desk this morning/.test(sheet.textContent) : false, ms: Math.round((performance.now() - t0) * 10) / 10 }
      return { sync, router: (window.__router || []).filter((x) => ["push", "replace", "link", "back"].includes(x[0])), path: location.pathname }
    }, rowSel)
    numbers["viewer-open"] = opened.sync
    expect(opened.sync.sheet && opened.sync.title, `the press opens the sheet with the post's title in the press's microtask, before any frame (${opened.sync.ms}ms)`, opened.sync)
    expect(opened.router.length === 0 && opened.path === `/app/community/${ID}/feed`, "no navigation: the router is not asked and the address is the same", opened)
    await sleep(700)
    const f = await frames(p)
    const xs = f.map((x) => x.sheetX).filter((x) => x !== null)
    const moved = [...new Set(xs)]
    numbers["viewer-slide"] = { frames: moved.length, from: xs[0], to: xs[xs.length - 1] }
    expect(xs[0] > 1000 && xs[xs.length - 1] === 640 && moved.length >= 6, `it slides in from the right over ${moved.length} frames (${xs[0]}px to ${xs[xs.length - 1]}px), the compositor's move`, numbers["viewer-slide"])
    const shown = await p.evaluate(() => {
      const s = document.querySelector("[data-side-sheet='post-viewer']")
      const b = s.getBoundingClientRect()
      return {
        box: { x: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) },
        ready: !!s.querySelector("[data-viewer-ready]"),
        body: /did not reread a single line/.test(s.textContent),
        pictures: s.querySelectorAll("[data-media-tile]").length,
        comments: s.querySelectorAll("[data-comment]").length,
        commentMenus: s.querySelectorAll("[data-comment-more]").length,
        likes: s.querySelector("[data-like-count]")?.textContent,
        dots: [...s.querySelectorAll("[data-post-more]")].filter((x) => x.getBoundingClientRect().width > 0).length,
        actions: [...s.querySelectorAll("[data-viewer-action]")].map((x) => x.getAttribute("data-viewer-action")),
        community: s.querySelector("[data-viewer-community]")?.getAttribute("href"),
      }
    })
    numbers["viewer-shown"] = shown
    expect(shown.box.x === 640 && shown.box.w === 640 && shown.box.h === 860, "a sheet on the right, the screen's full height", shown.box)
    expect(shown.ready && shown.body && shown.pictures === 2, "the post as the server has it: the whole text, both pictures", shown)
    expect(shown.comments === 2 && shown.commentMenus === 2 && shown.likes === "21", "its comments, each with its menu, and the likes", { comments: shown.comments, menus: shown.commentMenus, likes: shown.likes })
    expect(shown.dots === 0 && shown.actions.join() === "pin,move,lock,unfeature,remove", "the list's actions in a row (the card's own dots are not drawn)", shown.actions)
    expect(/^\/community\/morning-writers\/post\//.test(shown.community || ""), "View in community goes to the post in the community", shown.community)
    await p.screenshot({ path: join(shots, "viewer-1280.png") })

    await p.click("[data-side-sheet='post-viewer'] [data-media-tile]")
    await sleep(600)
    const box = await p.evaluate(() => !!document.querySelector("[data-lightbox]"))
    await p.keyboard.press("Escape")
    await sleep(600)
    const afterOne = await p.evaluate(() => ({ lightbox: !!document.querySelector("[data-lightbox]"), sheet: !!document.querySelector("[data-side-sheet-open]") }))
    expect(box && !afterOne.lightbox && afterOne.sheet, "a picture opens the lightbox; Escape closes the lightbox and leaves the sheet", { box, ...afterOne })

    const pinSent = (await sent(p)).length
    await p.click("[data-viewer-action='pin']")
    await sleep(400)
    const pinned = await p.evaluate((sel) => ({ unpin: !!document.querySelector("[data-viewer-action='unpin']"), row: !!document.querySelector(`${sel} [data-feed-pinned]`), mark: !!document.querySelector("[data-side-sheet='post-viewer'] [data-pin-mark]") }), rowSel)
    const posted = (await sent(p)).slice(pinSent).filter((x) => x.method === "POST")
    expect(posted.length === 1 && posted[0].sent?.action === "pin" && posted[0].sent?.targetId === pid(2), "Pin in the sheet sends the moderation pin", posted.map((x) => x.sent))
    expect(pinned.unpin && pinned.row && pinned.mark, "and the button reads Unpin, the post says Pinned, the row under the sheet too", pinned)

    await p.keyboard.press("Escape")
    await sleep(500)
    const closed = await p.evaluate(() => ({ root: !!document.querySelector("[data-side-sheet-root]"), router: (window.__router || []).filter((x) => ["push", "replace", "link", "back"].includes(x[0])) }))
    expect(!closed.root && closed.router.length === 0, "Escape again closes the sheet, still without navigating", closed)

    /* The same post again (kept now), on a CPU four times slower. */
    await p.emulateCPUThrottling(4)
    const slow = await p.evaluate(async (sel) => {
      const t0 = performance.now()
      document.querySelector(sel).querySelector("[data-feed-open]").click()
      await Promise.resolve()
      const ok = !!document.querySelector("[data-side-sheet='post-viewer'] [data-viewer-ready]")
      const ms = Math.round(performance.now() - t0)
      await new Promise((r) => requestAnimationFrame(() => r()))
      return { ok, ms, frame: Math.round(performance.now() - t0) }
    }, rowSel)
    await p.emulateCPUThrottling(1)
    numbers["viewer-open-4x"] = slow
    expect(slow.ok, `4x CPU: a post opened before is in its sheet, whole, ${slow.ms}ms after the press (first frame of the slide at ${slow.frame}ms)`, slow)
    await p.keyboard.press("Escape")
    await sleep(600)

    /* A poll. */
    await p.evaluate((id) => document.querySelector(`[data-feed-row='${id}'] [data-feed-open]`).click(), pid(3))
    await sleep(1100)
    const poll = await p.evaluate(() => {
      const s = document.querySelector("[data-side-sheet='post-viewer']")
      return { poll: !!s?.querySelector("[data-poll]"), options: ["Tuesday", "Thursday", "Friday"].every((w) => s?.textContent.includes(w)) }
    })
    expect(poll.poll && poll.options, "a poll shows its options and results", poll)
    await p.screenshot({ path: join(shots, "viewer-poll-1280.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()

    /* A phone. */
    const ph = await open("server", PHONE, 400)
    await sleep(1200)
    /* The row brought on screen first: below the writer and the panel it can sit under a phone's fold. */
    const tb = await ph.p.evaluate((sel) => {
      const el = document.querySelector(sel).querySelector("[data-feed-open]")
      el.scrollIntoView({ block: "center" })
      const b = el.getBoundingClientRect()
      return { x: b.left + 20, y: b.top + b.height / 2 }
    }, rowSel)
    if (process.env.DEBUG) console.log("    tap", tb, await ph.p.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? e.outerHTML.slice(0, 160) : null }, tb.x, tb.y))
    await ph.p.touchscreen.tap(tb.x, tb.y)
    if (process.env.DEBUG) { await sleep(300); console.log("    after", await ph.p.evaluate(() => ({ sheets: [...document.querySelectorAll("[data-form-sheet], [data-mobile-bottom-sheet]")].map((x) => x.outerHTML.slice(0, 120)), open: document.querySelector("[data-feed-row-open]")?.getAttribute("data-feed-row") }))) }
    await sleep(1400)
    const phone = await ph.p.evaluate(() => {
      const s = document.querySelector("[data-form-sheet='post-viewer']")
      const sheet = s?.closest("[data-mobile-bottom-sheet]") ?? s
      const b = sheet?.getBoundingClientRect()
      return {
        sheet: !!s,
        side: !!document.querySelector("[data-side-sheet]"),
        top: b ? Math.round(b.top) : null,
        body: s ? /did not reread a single line/.test(s.textContent) : false,
        actions: s ? [...s.querySelectorAll("[data-viewer-action]")].map((x) => x.getAttribute("data-viewer-action")) : [],
        router: (window.__router || []).filter((x) => ["push", "replace", "link", "back"].includes(x[0])),
        sideways: Math.round(document.documentElement.scrollWidth - window.innerWidth),
        clipped: s ? [...s.querySelectorAll("[data-viewer-action], [data-viewer-community]")].filter((x) => x.getBoundingClientRect().right > window.innerWidth || x.getBoundingClientRect().left < 0).length : null,
      }
    })
    numbers["viewer-phone"] = phone
    expect(phone.sheet && !phone.side && phone.top !== null && phone.top < 120, `390: the bottom sheet (top at ${phone.top}px), not the side sheet`, phone)
    expect(phone.body && phone.actions.length >= 4 && phone.router.length === 0 && phone.sideways <= 0, "390: the post in it, the actions, no navigation, nothing sideways", phone)
    expect(phone.clipped === 0, "390: every action and View in community on the screen (they wrap, none past the edge)", phone.clipped)
    await ph.p.screenshot({ path: join(shots, "viewer-390.png") })
    expect(ph.errors.length === 0, "390: no page errors", ph.errors)
    await ph.p.close()
  }

  await browser.close()
} finally {
  if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
}
console.log("\nNUMBERS")
for (const [k, v] of Object.entries(numbers)) console.log(`  ${k}: ${JSON.stringify(v)}`)
console.log(`\n${broken ? `${broken} FAILED` : "all passed"}  (pictures in ${shots})`)
if (broken) process.exit(1)
