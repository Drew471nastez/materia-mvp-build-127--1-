/**
 * ===========================================================================
 *  THE BELL, MEASURED
 * ===========================================================================
 * The real NotificationBell (components/notifications/notification-bell.tsx)
 * in a bar shaped like the platform header (scripts/render-notification-bell.tsx),
 * at 1440x900 and on a 390x844 phone, photographed:
 *
 *   BADGE      the unread count from /api/notifications/inbox?summary=1, 99+
 *              past 99, and +1 the moment realtime delivers a row
 *   POPOVER    on a computer: under the bell, its right edge on the bell's,
 *              inside the window, 420px wide; it fades and drops in over
 *              about 200ms (sampled frame by frame at 4x CPU throttle)
 *   SHEET      on a phone: the whole screen, Close in reach, the page behind
 *              does not scroll, every control at least 40px tall
 *   ROWS       photo, the actor in bold, what happened, when, a preview, a
 *              dot while unread; more load at the end of the list
 *   FILTER     All, Communities, Following, Purchases: the menu, and the
 *              request it makes
 *   READ       a row marks itself read and opens its page; Mark all as read
 *              clears every dot and the badge
 *   EMPTY      "Nothing new"
 *
 * and everywhere: nothing scrolls sideways, no page error.
 *
 *   PROBE_CSS=source node scripts/check-notification-bell.mjs
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
const stubs = join(root, ".notification-bell-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-bell-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const USER = "00000000-0000-4000-a000-000000000002"

/* ── Fixtures ─────────────────────────────────────────────────────────── */
const NOW = Date.now()
const H = 3_600_000
const face = (a, b, letter) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="60" font-family="Arial" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`)}`
const people = {
  mara: { name: "Mara Pop", avatarUrl: face("#c08457", "#7c4a2d", "M") },
  daniel: { name: "Daniel Reyes", avatarUrl: face("#5b7c99", "#2f4858", "D") },
  ana: { name: "Ana Silva", avatarUrl: null },
  priya: { name: "Priya Raman", avatarUrl: face("#8a9a5b", "#4b5a2a", "P") },
  jonas: { name: "Jonas Weber", avatarUrl: face("#a3a3a3", "#4b5563", "J") },
}
let seq = 0
const row = (o) => ({ id: `00000000-0000-4000-b000-${String(++seq).padStart(12, "0")}`, from: "user", kind: "system", source: "system", body: null, url: "/explore", read: false, actor: null, image: null, community: null, ...o })
const FIRST = [
  row({ kind: "followed_new_product", source: "following", actor: people.mara, title: "Mara Pop published a new product", body: "Film presets for spring light", url: "/mara/film-presets", createdAt: new Date(NOW - 2 * H).toISOString() }),
  row({ from: "community", kind: "comment", source: "communities", actor: people.daniel, title: "Daniel Reyes commented on your post", body: "This is exactly what I needed for Saturday's shoot", url: "/community/studio-notes/post/1", community: { name: "Studio Notes", slug: "studio-notes" }, createdAt: new Date(NOW - 4 * H).toISOString() }),
  row({ kind: "new_follower", source: "following", actor: people.ana, title: "Ana Silva started following you", url: "/@ana", createdAt: new Date(NOW - 5 * H).toISOString() }),
  row({ kind: "membership_post", source: "purchases", actor: people.mara, title: "Mara Pop posted in Inner circle", body: "March notes: what changed in my editing, and the two presets I stopped using", url: "/account/library/memberships/1", createdAt: new Date(NOW - 26 * H).toISOString() }),
  row({ from: "community", kind: "reply", source: "communities", actor: people.priya, title: "Priya Raman replied to your comment", body: "Try the warm one on skin tones first", url: "/community/studio-notes/post/2", community: { name: "Studio Notes", slug: "studio-notes" }, read: true, createdAt: new Date(NOW - 50 * H).toISOString() }),
  row({ kind: "purchased_creator_new_product", source: "purchases", actor: people.jonas, title: "Jonas Weber published a new product", body: "Lightroom course: colour from scratch", url: "/jonas/colour-course", read: true, createdAt: new Date(NOW - 75 * H).toISOString() }),
  row({ kind: "followed_new_community", source: "following", actor: people.mara, title: "Mara Pop started a community", body: "Studio Notes", url: "/community/studio-notes", read: true, createdAt: new Date(NOW - 98 * H).toISOString() }),
  row({ from: "community", kind: "level_up", source: "communities", title: "You reached level 3: Contributor", body: "In Studio Notes.", url: "/community/studio-notes/leaderboard", image: face("#1a1a2e", "#3b3f5c", "S"), community: { name: "Studio Notes", slug: "studio-notes" }, read: true, createdAt: new Date(NOW - 120 * H).toISOString() }),
]
for (let i = 0; i < 12; i++) FIRST.push(row({ from: "community", kind: "reaction", source: "communities", actor: [people.daniel, people.priya, people.ana][i % 3], title: `${[people.daniel, people.priya, people.ana][i % 3].name} liked your post`, body: "Golden hour, no reflector", url: "/community/studio-notes/post/3", community: { name: "Studio Notes", slug: "studio-notes" }, read: true, createdAt: new Date(NOW - (130 + i * 6) * H).toISOString() }))
const SECOND = Array.from({ length: 6 }, (_, i) => row({ from: "community", kind: "reaction", source: "communities", actor: people.priya, title: "Priya Raman liked your comment", body: null, url: "/community/studio-notes/post/4", read: true, createdAt: new Date(NOW - (220 + i * 10) * H).toISOString() }))
const UNREAD = 12

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  /* A signed in session, setAuth recorded, and each channel's handler kept so the probe can deliver a row. */
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: "${USER}" }, access_token: "t" } } }) },
    realtime: { setAuth: async () => { (window.__setAuth = (window.__setAuth || 0) + 1) } },
    channel(name) {
      const ch = {
        on(type, filter, cb) { (window.__rt ||= []).push({ name, type, filter, cb, joinedAfterAuth: (window.__setAuth || 0) > 0 }); return ch },
        subscribe() { return ch },
      }
      return ch
    },
    removeChannel() {},
  }
}
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-notification-bell.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.notification-bell-probe/navigation.js", "next/link": "./.notification-bell-probe/link.jsx" },
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

  async function open(vp, opts = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const calls = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    let unread = opts.unread ?? UNREAD
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        calls.push({ url: short, method: r.method(), body: r.postData() || null })
        let body = {}
        const q = new URL(url).searchParams
        if (short.startsWith("/api/notifications/inbox") && q.get("summary") === "1") body = { unread }
        else if (short.startsWith("/api/notifications/inbox")) {
          const f = q.get("filter") || "all"
          if (opts.empty) body = { items: [], unread: 0, nextCursor: null, available: true }
          else if (q.get("cursor")) body = { items: SECOND, unread, nextCursor: null, available: true }
          else {
            const items = f === "all" ? FIRST : FIRST.filter((i) => i.source === f)
            body = { items, unread, nextCursor: f === "all" ? "next-page" : null, available: true }
          }
        } else if (short.startsWith("/api/notifications/read")) {
          const sent = JSON.parse(r.postData() || "{}")
          if (sent.all) unread = 0
          else if (Array.isArray(sent.ids)) unread = Math.max(0, unread - sent.ids.length)
          body = { ok: true, unread }
        }
        return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) }), opts.slow ?? 60)
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/explore${opts.dark ? "?tone=dark" : ""}`, { waitUntil: "load" })
    await sleep(350)
    return { p, errors, calls }
  }
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`) })
  const sideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
  const rect = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null }, sel)
  const smallTargets = (p, scope) =>
    p.evaluate((sc) => {
      const out = []
      for (const el of document.querySelectorAll(`${sc} button, ${sc} a`)) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
        if (r.height < 40) out.push({ text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
      }
      return out
    }, scope)

  /* ── A computer ───────────────────────────────────────────────────── */
  console.log("\ndesktop-1440")
  {
    const vp = { width: 1440, height: 900, deviceScaleFactor: 1 }
    const { p, errors, calls } = await open(vp)
    const badge = await p.$eval("[data-bell-badge]", (e) => e.textContent).catch(() => null)
    expect(badge === "12", "BADGE: the unread count from the summary", badge)
    const rt = await p.evaluate(() => (window.__rt || []).map((c) => ({ table: c.filter.table, filter: c.filter.filter, after: c.joinedAfterAuth })))
    expect(rt.length === 2 && rt.every((c) => c.after && c.filter === `user_id=eq.${"00000000-0000-4000-a000-000000000002"}`) && rt.map((c) => c.table).sort().join() === "community_notifications,user_notifications", "realtime: both tables, the person's own rows, joined after setAuth", rt)
    await p.evaluate(() => (window.__rt || []).find((c) => c.filter.table === "user_notifications").cb({ new: { read_at: null } }))
    await sleep(60)
    expect((await p.$eval("[data-bell-badge]", (e) => e.textContent)) === "13", "a row delivered by realtime counts up the badge at once")
    await shot(p, "desktop-bell-closed")

    /* Open, sampled frame by frame at 4x CPU throttle. */
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await p.evaluate(() => {
      window.__frames = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector("[data-notification-panel]")
        if (el) { const cs = getComputedStyle(el); window.__frames.push({ t: Math.round(performance.now() - t0), o: Number(cs.opacity), tr: cs.translate !== "none" ? cs.translate : cs.transform }) }
        if (performance.now() - t0 < 700) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      document.querySelector("[data-notification-bell]").click()
    })
    await sleep(900)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const frames = await p.evaluate(() => window.__frames)
    const firstSeen = frames[0]
    const settled = frames.find((f) => f.o >= 0.999)
    expect(!!firstSeen && firstSeen.o < 0.9, "POPOVER: it fades in rather than appearing at once", firstSeen)
    expect(!!settled && settled.t - firstSeen.t <= 450, "and settles within the enter time at 4x throttle", settled && { from: firstSeen.t, to: settled.t, frames: frames.length })
    await sleep(200)
    const bell = await rect(p, "[data-notification-bell]")
    const pop = await rect(p, "[data-notification-panel=popover]")
    expect(!!pop && pop.w === 420, "420px wide", pop)
    expect(!!pop && pop.y >= bell.bottom + 4 && pop.y <= bell.bottom + 12, "just under the bell", { bell, pop })
    expect(!!pop && Math.abs(pop.right - (bell.right + 4)) <= 2 && pop.right <= 1440 - 16, "its right edge on the bell's, inside the 16px gutter", { bellRight: bell.right, popRight: pop.right })
    expect(!!pop && pop.bottom <= 900 - 16, "inside the window", pop)
    const parts = await p.evaluate(() => {
      const panel = document.querySelector("[data-notification-panel]")
      const rows = [...panel.querySelectorAll("[data-notification-row]")]
      const first = rows[0]
      const bold = first?.querySelector(".font-semibold")
      return {
        title: panel.querySelector("h2")?.textContent,
        markAll: !!panel.querySelector("[data-mark-all-read]"),
        filter: panel.querySelector("[data-bell-filter]")?.textContent,
        rows: rows.length,
        dots: panel.querySelectorAll("[data-unread-dot]").length,
        unreadRows: rows.filter((r) => r.getAttribute("data-notification-row") === "unread").length,
        boldName: bold?.textContent,
        boldWeight: bold ? getComputedStyle(bold).fontWeight : null,
        firstText: first?.textContent,
        img: !!first?.querySelector("img"),
        marks: panel.querySelectorAll("[data-community-mark]").length,
        communityRows: rows.filter((r) => /Studio Notes/.test(r.querySelector("[data-community-mark]")?.getAttribute("title") || "")).length,
        violet: [...panel.querySelectorAll("*")].filter((e) => /139, 92, 246|124, 58, 237/.test(getComputedStyle(e).backgroundColor)).length,
      }
    })
    expect(parts.title === "Notifications" && parts.markAll && parts.filter === "All", "Notifications, Mark all as read, All", parts)
    expect(parts.rows === FIRST.length && parts.dots === 4 && parts.unreadRows === 4, "ROWS: every row of the page, a dot on each unread one", { rows: parts.rows, dots: parts.dots })
    expect(parts.boldName === "Mara Pop" && Number(parts.boldWeight) >= 600, "the actor in bold", parts.boldName)
    expect(/published a new product\u00a0·\u00a02h/.test(parts.firstText || "") && /Film presets for spring light/.test(parts.firstText || ""), "what happened, when, and the preview", parts.firstText)
    expect(parts.violet === 0, "no violet fill", parts.violet)
    expect(parts.marks === 14 && parts.communityRows === 14, "a community row with a person carries its community on the photo's corner", { marks: parts.marks })
    expect((await sideScroll(p)).scroll <= 1440, "nothing scrolls sideways")
    await shot(p, "desktop-popover")

    /* More at the end of the list. */
    await p.evaluate(() => { const l = document.querySelector("[data-bell-list]"); l.scrollTop = l.scrollHeight })
    await sleep(400)
    const more = calls.filter((c) => c.url.includes("cursor=next-page"))
    const rowsAfter = await p.$$eval("[data-notification-row]", (r) => r.length)
    expect(more.length === 1 && rowsAfter === FIRST.length + SECOND.length, "more rows load at the end of the list", { asked: more.length, rows: rowsAfter })
    await p.evaluate(() => { document.querySelector("[data-bell-list]").scrollTop = 0 })

    /* The filter. */
    await p.click("[data-bell-filter]")
    await sleep(150)
    const options = await p.$$eval("[data-bell-filter-menu] [role=option]", (o) => o.map((x) => x.textContent))
    expect(options.join() === "All,Communities,Following,Purchases", "FILTER: All, Communities, Following, Purchases", options)
    await shot(p, "desktop-filter-menu")
    const followingBtn = (await p.$$("[data-bell-filter-menu] [role=option]"))[2]
    await followingBtn.click()
    await sleep(300)
    const following = await p.evaluate(() => ({ label: document.querySelector("[data-bell-filter]")?.textContent, rows: [...document.querySelectorAll("[data-notification-row]")].map((r) => r.textContent) }))
    expect(calls.some((c) => c.url === "/api/notifications/inbox?filter=following") && following.label === "Following" && following.rows.length === FIRST.filter((i) => i.source === "following").length, "Following asks for its rows and shows only them", following)
    await shot(p, "desktop-following")
    await p.click("[data-bell-filter]")
    await sleep(100)
    await (await p.$$("[data-bell-filter-menu] [role=option]"))[0].click()
    await sleep(300)

    /* A row: read on the way, and its page opens. */
    await p.click("[data-notification-row=unread]")
    await sleep(300)
    const posted = calls.filter((c) => c.method === "POST" && c.url === "/api/notifications/read").map((c) => JSON.parse(c.body))
    const nav = await p.evaluate(() => window.__router || [])
    expect(posted.some((b) => b.seen === true), "opening the bell records that it was seen", posted)
    expect(posted.some((b) => Array.isArray(b.ids) && b.ids[0] === FIRST[0].id), "READ: the row is marked read", posted)
    expect(nav.some(([k, h]) => k === "link" && h === FIRST[0].url), "and its page opens", nav)
    expect((await p.$("[data-notification-panel]")) === null, "the list closes behind it")
    /* Opening the list read the server's count again (12: the realtime row was the stub's, never the server's), so one less is 11. */
    expect((await p.$eval("[data-bell-badge]", (e) => e.textContent)) === "11", "the badge is one less than the server's count", await p.$eval("[data-bell-badge]", (e) => e.textContent))

    /* Mark all as read. */
    await p.click("[data-notification-bell]")
    await sleep(400)
    await p.click("[data-mark-all-read]")
    await sleep(300)
    const after = await p.evaluate(() => ({ dots: document.querySelectorAll("[data-unread-dot]").length, badge: document.querySelector("[data-bell-badge]")?.textContent ?? null, markAll: !!document.querySelector("[data-mark-all-read]") }))
    expect(after.dots === 0 && after.badge === null && !after.markAll, "Mark all as read clears every dot and the badge", after)
    expect(calls.some((c) => c.method === "POST" && c.body && JSON.parse(c.body).all === true), "and tells the server: all")
    await shot(p, "desktop-all-read")

    /* Escape closes and gives the bell its focus back. */
    await p.keyboard.press("Escape")
    await sleep(300)
    const focus = await p.evaluate(() => ({ open: !!document.querySelector("[data-notification-panel]"), focused: document.activeElement?.hasAttribute("data-notification-bell") }))
    expect(!focus.open && focus.focused, "Escape closes it and the bell has the focus again", focus)
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  /* 99+, and the dark marketing header. */
  {
    const { p, errors } = await open({ width: 1440, height: 900, deviceScaleFactor: 1 }, { unread: 150, dark: true })
    expect((await p.$eval("[data-bell-badge]", (e) => e.textContent)) === "99+", "BADGE: 99+ past 99")
    const color = await p.$eval("[data-notification-bell]", (e) => getComputedStyle(e).color)
    expect(/255, 255, 255|oklab\(0\.99/.test(color), "on the dark header the bell takes the header's light icon colour", color)
    await shot(p, "desktop-dark-99")
    await p.click("[data-notification-bell]")
    await sleep(450)
    await shot(p, "desktop-dark-popover")
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  /* Empty. */
  {
    const { p } = await open({ width: 1440, height: 900, deviceScaleFactor: 1 }, { unread: 0, empty: true })
    expect((await p.$("[data-bell-badge]")) === null, "no badge at 0")
    await p.click("[data-notification-bell]")
    await sleep(450)
    const empty = await p.evaluate(() => ({ text: document.querySelector("[data-bell-empty]")?.textContent, markAll: !!document.querySelector("[data-mark-all-read]") }))
    expect(empty.text === "Nothing new" && !empty.markAll, "EMPTY: Nothing new, and no Mark all as read", empty)
    await shot(p, "desktop-empty")
    await p.close()
  }

  /* ── A phone ──────────────────────────────────────────────────────── */
  console.log("\nphone-390")
  {
    const vp = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    const { p, errors } = await open(vp)
    const bell = await rect(p, "[data-notification-bell]")
    expect(!!bell && bell.h >= 40 && bell.w >= 40, "the bell is a 42px target", bell)
    await shot(p, "phone-bell-closed")
    await p.tap("[data-notification-bell]")
    await sleep(500)
    const sheet = await rect(p, "[data-notification-panel=sheet]")
    expect(!!sheet && sheet.x === 0 && sheet.y === 0 && sheet.w === 390 && sheet.h === 844, "SHEET: the whole screen", sheet)
    const lock = await p.evaluate(() => document.body.style.overflow)
    expect(lock === "hidden", "the page behind it does not scroll", lock)
    const small = await smallTargets(p, "[data-notification-panel]")
    expect(small.length === 0, "every control at least 40px tall", small)
    expect((await sideScroll(p)).scroll <= 390, "nothing scrolls sideways")
    const head = await p.evaluate(() => {
      const panel = document.querySelector("[data-notification-panel]")
      const r = (s) => { const b = panel.querySelector(s)?.getBoundingClientRect(); return b ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : null }
      return { title: r("h2"), mark: r("[data-mark-all-read]"), filter: r("[data-bell-filter]"), close: r("button[aria-label=Close]") }
    })
    const inside = Object.values(head).every((r) => r && r.right <= 390 && r.left >= 0)
    const rowOne = Math.abs(head.title.top + head.title.bottom - head.close.top - head.close.bottom) < 4 && head.title.right <= head.close.left + 1
    const rowTwo = head.filter.top >= head.close.bottom - 1 && Math.abs(head.filter.top - head.mark.top) < 2 && head.filter.right <= head.mark.left + 1
    expect(inside && rowOne && rowTwo, "the title and Close on one row, the filter and Mark all as read under them, nothing cut", head)
    const title = await p.$eval("[data-notification-panel] h2", (e) => ({ full: e.scrollWidth <= e.clientWidth, text: e.textContent }))
    expect(title.full, "the title is whole", title)
    await shot(p, "phone-sheet")
    await p.tap("[data-bell-filter]")
    await sleep(200)
    await shot(p, "phone-filter-menu")
    await (await p.$$("[data-bell-filter-menu] [role=option]"))[3].tap()
    await sleep(350)
    const rows = await p.$$eval("[data-notification-row]", (r) => r.length)
    expect(rows === FIRST.filter((i) => i.source === "purchases").length, "Purchases on a phone", rows)
    await shot(p, "phone-purchases")
    await p.tap("button[aria-label=Close]")
    await sleep(400)
    const closed = await p.evaluate(() => ({ open: !!document.querySelector("[data-notification-panel]"), lock: document.body.style.overflow }))
    expect(!closed.open && closed.lock !== "hidden", "Close: gone, and the page scrolls again", closed)
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }
  {
    const { p } = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { unread: 0, empty: true })
    await p.tap("[data-notification-bell]")
    await sleep(500)
    await shot(p, "phone-empty")
    expect((await p.$eval("[data-bell-empty]", (e) => e.textContent)) === "Nothing new", "EMPTY on a phone")
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
