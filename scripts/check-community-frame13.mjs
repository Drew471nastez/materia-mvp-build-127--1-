/**
 * ===========================================================================
 *  THE COMMUNITY FRAME AND ABOUT, ROUND 13: MEASURED, AND LOOKED AT
 * ===========================================================================
 * The real frame (scripts/render-community-shell.tsx) with the probe's own
 * next/navigation stub, as in check-community-frame12.mjs.
 *
 *   ABOUT      1440 and 390: one cover (a gallery that is only the cover is
 *              not drawn beside the left card's), no "Active this week", no
 *              row of figures and no facts line under the name; the facts
 *              are one quiet list (the side card on a computer, the sheet
 *              on a phone); Who runs it on a phone: View profile at the
 *              row's right, the creator's line under the whole row
 *   GALLERY    390 at 4x CPU: a swipe's frames (no long frame while the
 *              picture glides) and the neighbours decoded ahead
 *   EMPTY      the bell's list with nothing in it: a calm, specific title
 *              and line under a quiet tile, per filter, never "Nothing new"
 *   STACK      every face in a stack is exactly round (its box as wide as
 *              tall), overlaps the one before by 8px and wears a 2px white
 *              ring; the "+n" chip too
 *   SCROLLBAR  1440: the page's bar is thin and light grey; 390: none
 *   ACTIVE     the Most active card has Polaris depth (a shadow, a hairline)
 *   TAB        three unread: the title is "(3) Clay Studio" and the icon has
 *              the red dot; all read: both are back as they were
 *   MEMBERSHIP 1440 and 390: "Membership" in the "..." menu; the page has
 *              the plan, Manage subscription for a paying member, the four
 *              levels (a press saves at once), Leave for a free member
 *   CONTRIB    a profile's contributions: the line (level, points, posts),
 *              Edit beside the person's own posts, none beside another's
 *   WARM       leaving the community asks for its home again (in full)
 *
 *   PROBE_CSS=source node scripts/check-community-frame13.mjs [section ...]
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
const stubs = join(root, ".community-frame13-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-frame13-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

/* The community's tab icon, served at its own address so the canvas may read it (the dot is drawn on it). */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#1a1a2e"/><path d="M19 43 L32 20 L45 43 Z" fill="#f4efe6"/></svg>`

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
    alias: { "@": ".", "next/navigation": "./.community-frame13-probe/navigation.js", "next/link": "./.community-frame13-probe/link.jsx", "next/image": "./.community-frame13-probe/image.jsx" },
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clay Studio</title><link rel="icon" href="/community/clay-studio/tab-icon.svg" type="image/svg+xml"><style>${fonts}${css}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
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
        else if (short.startsWith("/api/community/") && short.endsWith("/me")) {
          ;(globalThis.__posts ||= []).push({ url: short, body: r.postData() || "" })
          body = { ok: true }
        } else if (short.startsWith("/api/notifications/read")) {
          for (const n of notes) n.read = true
          body = { unread: 0 }
        } else if (short.startsWith("/api/notifications")) body = { unread: notes.filter((n) => !n.read).length, items: notes, nextCursor: null, available: true }
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
      if (url.startsWith(`${ORIGIN}/`) && url.includes("tab-icon.svg")) return r.respond({ status: 200, contentType: "image/svg+xml", body: ICON })
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

  /* ── ABOUT ───────────────────────────────────────────────────────────── */
  if (want("ABOUT")) {
    console.log("\nABOUT: one cover, a quiet facts list, Who runs it")
    const look = (p) =>
      p.evaluate(() => {
        const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"
        const text = document.querySelector("[data-community-sales]")?.innerText || ""
        const covers = [...document.querySelectorAll("[data-wall-cover], [data-community-gallery]")].filter(vis).length
        const factsIn = (sel) => { const box = document.querySelector(sel); return vis(box) ? [...box.querySelectorAll("[data-fact]")].map((f) => f.getAttribute("data-fact") + "=" + f.querySelector("dd").textContent.trim()) : null }
        const row = document.querySelector("[data-creator-row]")
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
        return {
          covers,
          activeWeek: /Active this week/i.test(text),
          statsPanel: vis(document.querySelector("[data-community-sheet] [data-community-stats]")),
          infoLine: vis(document.querySelector("[data-community-info]")),
          side: factsIn("[data-join-card-facts]"),
          sheet: factsIn("[data-about-facts-sheet]"),
          creator: row ? { row: r(row), button: r(row.querySelector("[data-creator-page]")), bio: r(row.querySelector("[data-creator-bio]")), avatar: r(row.querySelector("a, span")) } : null,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      for (const c of ["about", "about-member"]) {
        const { p, errors } = await open(`/community/clay-studio/about?case=${c}&cover=only&extras=1`, vp)
        await sleep(700)
        const m = await look(p)
        const phone = vp === PHONE
        expect(m.covers === 1, `${name} ${c}: the cover is drawn once (gallery that is only the cover is left out beside the card)`, m.covers)
        expect(!m.activeWeek && !m.statsPanel && !m.infoLine, `${name} ${c}: no "Active this week", no row of figures, no facts line under the name`, { activeWeek: m.activeWeek, statsPanel: m.statsPanel, infoLine: m.infoLine })
        const facts = phone ? m.sheet : m.side
        const keys = (facts || []).map((f) => f.split("=")[0]).join()
        expect(keys === "members,posts,courses,visibility,since,creator", `${name} ${c}: the facts as one list in the ${phone ? "sheet" : "side card"}`, facts)
        expect(phone ? m.side === null : m.sheet === null, `${name} ${c}: and only there`, { side: m.side, sheet: m.sheet })
        expect(m.overflow <= 0, `${name} ${c}: no sideways overflow`, m.overflow)
        if (phone && m.creator) {
          const { row, button, bio } = m.creator
          expect(!!button && button.r <= row.r + 1 && button.t < (bio?.t ?? 1e9) && button.h >= 40, `${name}: View profile at the row's right end, beside the name, a 40px target`, { row, button })
          expect(!!bio && bio.l <= row.l + 1 && bio.w >= row.w - 2, `${name}: the creator's line under the whole row, its full width`, { row, bio })
        }
        await p.screenshot({ path: join(shots, `about-${name}-${c}.png`), fullPage: phone })
        if (!phone) {
          const side = await p.evaluate(() => { const b = document.querySelector("[data-join-card]").getBoundingClientRect(); return { x: b.left - 12, y: Math.max(0, b.top - 12), width: b.width + 24, height: Math.min(900, b.height + 24) } })
          await p.screenshot({ path: join(shots, `about-side-${c}.png`), clip: side })
        } else {
          const at = await p.evaluate(() => { const e = document.querySelector("[data-community-creator-card]"); const b = e.getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top + scrollY - 8), width: innerWidth, height: b.height + 16 } })
          await sleep(200)
          await p.screenshot({ path: join(shots, `about-creator-390-${c}.png`), clip: at })
        }
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
    }
    /* A gallery the creator chose is still drawn on a computer (one picture of the cover among others is theirs to choose). */
    const { p } = await open("/community/clay-studio/about?case=about&extras=1", DESK)
    await sleep(700)
    const g = await p.evaluate(() => document.querySelector("[data-community-gallery]")?.getClientRects().length > 0)
    expect(g, "1440: a chosen gallery is drawn", g)
    await p.close()
  }

  /* ── GALLERY ─────────────────────────────────────────────────────────── */
  if (want("GALLERY")) {
    console.log("\nGALLERY: a swipe at 4x CPU, neighbours decoded ahead")
    const { p, errors } = await open("/community/clay-studio/about?case=about", PHONE)
    await sleep(1200)
    const ahead = await p.evaluate(() => [...document.querySelectorAll("[data-gallery-slide]")].slice(0, 3).map((s) => { const img = s.querySelector("img"); return img ? { loading: img.loading, done: img.complete } : null }))
    expect(ahead[1] && ahead[1].loading === "eager" && ahead[1].done, "the next picture is fetched and ready before the first swipe", ahead)
    const cdp = await throttle(p)
    const box = await centre(p, "[data-gallery-main]")
    await p.evaluate(() => {
      window.__frames = []
      window.__fOn = true
      let last = performance.now()
      const tick = (t) => { window.__frames.push(Math.round((t - last) * 10) / 10); last = t; if (window.__fOn) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    const y = box.y
    await touch(cdp, "touchStart", box.x + 120, y)
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, "touchMove", box.x + 120 - i * 30, y)
      await sleep(16)
    }
    await touch(cdp, "touchEnd", 0, 0)
    await sleep(900)
    const frames = await p.evaluate(() => { window.__fOn = false; return window.__frames.slice(1) })
    const at = await p.evaluate(() => document.querySelector("[data-gallery-main]").getAttribute("data-gallery-index"))
    const sorted = [...frames].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const worst = sorted[sorted.length - 1]
    expect(at === "1", "the swipe moved to the next picture", at)
    expect(p95 <= 50 && worst <= 120, "no long frame while it glides (95th percentile and the worst, ms, at 4x CPU)", { frames: frames.length, p95, worst })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await sleep(500)
    const next = await p.evaluate(() => { const s = document.querySelectorAll("[data-gallery-slide]")[2]; const img = s?.querySelector("img"); return img ? { loading: img.loading, done: img.complete } : null })
    expect(!next || next.loading === "eager", "after it, the one beyond is asked for ahead", next)
    await p.screenshot({ path: join(shots, "gallery-390-after-swipe.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── EMPTY ───────────────────────────────────────────────────────────── */
  if (want("EMPTY")) {
    console.log("\nEMPTY: the bell's empty list")
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      const { p, errors } = await open("/community/clay-studio?case=feed", vp, { notes: [] })
      await sleep(400)
      const bell = "[data-community-top] [data-bell-trigger], [data-community-top] button[aria-label^='Notifications']"
      if (vp === PHONE) await p.tap(bell)
      else await p.click(bell)
      await sleep(1600)
      const m = await p.evaluate(() => {
        const e = [...document.querySelectorAll("[data-bell-empty]")].find((x) => x.getClientRects().length)
        if (!e) return null
        const icon = e.querySelector("[data-bell-empty-icon]")
        const cs = icon ? getComputedStyle(icon) : null
        return { text: e.innerText.replace(/\s+/g, " ").trim(), shadow: cs?.boxShadow, border: cs ? cs.borderTopWidth + " " + cs.borderTopColor : null, bg: cs?.backgroundColor }
      })
      expect(!!m && !/Nothing new/i.test(m.text) && /No notifications yet/.test(m.text) && /show up here/.test(m.text), `${name}: a calm, specific title and line`, m?.text)
      expect(!!m && m.shadow !== "none" && m.border.startsWith("1px") && m.bg === "rgb(255, 255, 255)", `${name}: the bell sits on a white tile with a hairline and a soft shadow`, m)
      await p.screenshot({ path: join(shots, `bell-empty-${name}.png`) })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── STACK ───────────────────────────────────────────────────────────── */
  if (want("STACK")) {
    console.log("\nSTACK: even rings on every face")
    const { p, errors } = await open("/community/clay-studio?case=feed", DESK)
    await sleep(600)
    const m = await p.evaluate(() => {
      const stack = document.querySelector("[data-wall-faces] [data-avatar-stack]")
      const faces = [...stack.children].map((f) => { const b = f.getBoundingClientRect(); return { l: b.left, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, shadow: getComputedStyle(f).boxShadow } })
      const more = document.querySelector("[data-wall-more]")
      const mb = more?.getBoundingClientRect()
      return { faces, overlaps: faces.slice(1).map((f, i) => Math.round((faces[i].l + faces[i].w - f.l) * 10) / 10), more: more ? { h: mb.height, shadow: getComputedStyle(more).boxShadow, overlap: Math.round(faces.at(-1).l + faces.at(-1).w - mb.left) } : null }
    })
    expect(m.faces.length >= 3 && m.faces.every((f) => f.w === f.h), "every face's box is exactly round (as wide as tall)", m.faces.map((f) => `${f.w}x${f.h}`))
    expect(m.overlaps.every((o) => o === 8), "each overlaps the one before by 8px", m.overlaps)
    expect(m.faces.every((f) => /rgb\(255, 255, 255\) 0px 0px 0px 2px/.test(f.shadow)), "each wears a 2px white ring", m.faces[0].shadow)
    expect(!!m.more && m.more.overlap === 8 && /0px 0px 0px 2px/.test(m.more.shadow), "the +n chip too", m.more)
    const clip = await p.evaluate(() => { const b = document.querySelector("[data-wall-faces]").getBoundingClientRect(); return { x: b.left - 6, y: b.top - 6, width: b.width + 12, height: b.height + 12 } })
    await p.screenshot({ path: join(shots, "stack-1440.png"), clip })
    await p.screenshot({ path: join(shots, "stack-1440-zoom.png"), clip: { ...clip, scale: 4 } })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── SCROLLBAR ───────────────────────────────────────────────────────── */
  if (want("SCROLLBAR")) {
    console.log("\nSCROLLBAR: slim and light grey with a pointer, none on a phone")
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      const { p } = await open("/community/clay-studio?case=feed", vp)
      if (vp === DESK) {
        /*
          Headless Chromium matches neither (hover: hover) nor (pointer: fine), whatever it is told, so the rule is read from the
          stylesheet itself: a pointer screen's media rule that makes the page's bar thin and light grey on a clear track. Then the
          same declarations are applied here, as a mouse screen would, and the bar is looked at.
        */
        const rule = await p.evaluate(() => {
          const found = []
          const walk = (rules, media) => {
            for (const r of rules) {
              if (r.media && r.cssRules) walk(r.cssRules, r.media.mediaText)
              else if (!r.selectorText && r.cssRules) walk(r.cssRules, media)
              else if (r.selectorText && /(^|,)\s*html\s*(,|$)/.test(r.selectorText) && r.style.scrollbarWidth) found.push({ media, sel: r.selectorText.replace(/\s+/g, " "), width: r.style.scrollbarWidth, color: r.style.scrollbarColor })
            }
          }
          for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, "") } catch {} }
          return found
        })
        const pointer = rule.find((r) => /hover: hover/.test(r.media) && /pointer: fine/.test(r.media))
        expect(!!pointer && pointer.width === "thin" && /156, 163, 175/.test(pointer.color) && /transparent/.test(pointer.color) && /data-post-overlay-scroll/.test(pointer.sel), `${name}: with a pointer, the page's bar (and the post panel's) is thin, light grey on a clear track`, pointer)
        await p.addStyleTag({ content: `html{scrollbar-width:${pointer?.width};scrollbar-color:${pointer?.color}}` })
        await sleep(200)
        await p.screenshot({ path: join(shots, "scrollbar-1440.png") })
      } else {
        const m = await p.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)
        expect(m === "none", `${name}: no bar on a touch screen`, m)
      }
      await p.close()
    }
  }

  /* ── ACTIVE ──────────────────────────────────────────────────────────── */
  if (want("ACTIVE")) {
    console.log("\nACTIVE: the Most active card's depth")
    const { p, errors } = await open("/community/clay-studio?case=feed&wall=activity", DESK)
    await sleep(600)
    const m = await p.evaluate(() => { const e = document.querySelector("[data-wall-contributors]"); const cs = getComputedStyle(e); const rank = getComputedStyle(e.querySelector("[data-wall-rank]")); return { shadow: cs.boxShadow, border: cs.borderTopWidth + " " + cs.borderTopColor, rankShadow: rank.boxShadow, rankBg: rank.backgroundColor } })
    expect(m.shadow !== "none" && m.shadow.split("rgba").length >= 3 && m.border.startsWith("1px"), "a hairline and a soft shadow under it", m)
    expect(m.rankShadow !== "none" && m.rankBg === "rgb(255, 255, 255)", "each rank a small white tile with a 1px shadow", m)
    const clip = await p.evaluate(() => { const b = document.querySelector("[data-wall-contributors]").getBoundingClientRect(); return { x: b.left - 16, y: b.top - 16, width: b.width + 32, height: b.height + 32 } })
    await p.screenshot({ path: join(shots, "most-active-1440.png"), clip })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── TAB ─────────────────────────────────────────────────────────────── */
  if (want("TAB")) {
    console.log("\nTAB: the title's count and the icon's dot")
    const NOTE = { id: "n1", from: "community", kind: "comment", source: "community", title: "Priya Raman commented on your post", body: "Lovely foot.", url: "/community/clay-studio/post/p1", read: false, createdAt: new Date().toISOString(), actor: { name: "Priya Raman", avatarUrl: null }, image: null, community: { name: "Clay Studio", slug: "clay-studio" } }
    const notes = [NOTE, { ...NOTE, id: "n2" }, { ...NOTE, id: "n3" }]
    const { p, errors } = await open("/community/clay-studio?case=feed", DESK, { notes })
    await p.waitForFunction(() => document.title.startsWith("(3) "), { timeout: 8000 }).catch(() => {})
    await sleep(500)
    const on = await p.evaluate(() => ({ title: document.title, icon: document.querySelector('link[rel~="icon"]').href.slice(0, 22) }))
    expect(on.title === "(3) Clay Studio", "three unread: the title is \"(3) Clay Studio\"", on.title)
    expect(on.icon.startsWith("data:image/png"), "and the icon carries the red dot (a drawn picture)", on.icon)
    const dot = await p.evaluate(async () => {
      const img = new Image()
      img.src = document.querySelector('link[rel~="icon"]').href
      await img.decode()
      const c = document.createElement("canvas")
      c.width = 64
      c.height = 64
      const ctx = c.getContext("2d")
      ctx.drawImage(img, 0, 0)
      const [r, g, b] = ctx.getImageData(49, 15, 1, 1).data
      return { r, g, b }
    })
    expect(dot.r > 200 && dot.g < 110 && dot.b < 110, "the dot is red, at the icon's top right", dot)
    /* Next writes the title again on a move between pages: the count goes back in front. */
    await p.evaluate(() => { document.title = "Members · Clay Studio" })
    await sleep(100)
    expect((await p.evaluate(() => document.title)) === "(3) Members · Clay Studio", "a new title from the page keeps the count in front", await p.evaluate(() => document.title))
    /* Mark all as read: the count and the dot go. */
    await p.click("[data-community-top] [data-bell-trigger], [data-community-top] button[aria-label^='Notifications']")
    await sleep(700)
    const mark = await p.$("[data-mark-all-read]")
    if (mark) await mark.click()
    else await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Mark all as read/.test(b.textContent))?.click())
    await sleep(800)
    const off = await p.evaluate(() => ({ title: document.title, icon: document.querySelector('link[rel~="icon"]').getAttribute("href") }))
    expect(off.title === "Members · Clay Studio" && off.icon === "/community/clay-studio/tab-icon.svg", "all read: the title and the icon are back as they were", off)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── MEMBERSHIP ──────────────────────────────────────────────────────── */
  if (want("MEMBERSHIP")) {
    console.log("\nMEMBERSHIP: the menu row and the page")
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      const phone = vp === PHONE
      {
        const { p, errors } = await open("/community/clay-studio?case=feed", vp)
        if (phone) await p.tap("[data-community-account] > button[data-account-more]")
        else await p.click("[data-community-account] [data-header-account] button[data-account-more]")
        await sleep(phone ? 800 : 400)
        const scope = phone ? "[data-account-sheet-body]" : "[data-account-menu]"
        const rows = await p.evaluate((scope) => [...document.querySelector(scope).querySelectorAll("[data-account-item]")].map((r) => r.getAttribute("data-account-item") + (r.getAttribute("href") ? "=" + r.getAttribute("href") : "")), scope)
        expect(rows.includes("membership=/community/clay-studio/membership") && rows.indexOf("membership=/community/clay-studio/membership") === 2, `${name}: "Membership" in the "..." menu, after Saved posts`, rows)
        await p.screenshot({ path: join(shots, `membership-menu-${name}.png`) })
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
      for (const c of ["membership", "membership-free"]) {
        const { p, errors } = await open(`/community/clay-studio/membership?case=${c}`, vp)
        await sleep(600)
        const m = await p.evaluate(() => ({
          facts: [...document.querySelectorAll("[data-membership-fact]")].map((f) => f.getAttribute("data-membership-fact") + "=" + f.querySelector("dd").textContent.trim()),
          manage: document.querySelector("[data-membership-manage]")?.getAttribute("href") ?? null,
          leave: !!document.querySelector("[data-membership-leave]"),
          cancelFirst: !!document.querySelector("[data-membership-cancel-first]"),
          levels: [...document.querySelectorAll("[data-notify-choice]")].map((b) => b.getAttribute("data-notify-choice") + (b.getAttribute("aria-checked") === "true" ? "*" : "")),
          small: [...document.querySelectorAll("[data-membership-page] a, [data-membership-page] button")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 40).map((e) => e.textContent.trim().slice(0, 30)),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }))
        const paying = c === "membership"
        expect(m.facts.some((f) => f.startsWith("plan=")) && m.facts.some((f) => f.startsWith("since=")), `${name} ${c}: role, plan and since`, m.facts)
        if (paying) expect(m.manage === "/account/library/memberships/ms-1" && m.cancelFirst && !m.leave, `${name}: a paying member manages (and cancels) the plan; leaving says cancel first`, m)
        else expect(!m.manage && m.leave, `${name}: a free member can leave`, m)
        expect(m.levels.join() === "all,important*,mentions,none", `${name} ${c}: the four levels, the member's marked`, m.levels)
        expect(phone ? m.small.length === 0 : true, `${name} ${c}: every control is a 40px target`, m.small)
        expect(m.overflow <= 0, `${name} ${c}: no sideways overflow`, m.overflow)
        await p.screenshot({ path: join(shots, `membership-${name}-${c}.png`), fullPage: true })
        if (!paying) {
          globalThis.__posts = []
          await (phone ? p.tap('[data-notify-choice="mentions"]') : p.click('[data-notify-choice="mentions"]'))
          await sleep(500)
          const sent = (globalThis.__posts || []).find((x) => x.url.endsWith("/me"))
          const checked = await p.evaluate(() => document.querySelector('[data-notify-choice="mentions"]').getAttribute("aria-checked"))
          expect(!!sent && JSON.parse(sent.body).notifyLevel === "mentions" && checked === "true", `${name}: a press saves the level at once`, { sent, checked })
          await (phone ? p.tap("[data-membership-leave]") : p.click("[data-membership-leave]"))
          await sleep(700)
          const dialog = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getClientRects().length > 0 && /What made you leave/.test(d.textContent)))
          expect(dialog, `${name}: Leave opens the confirm that asks why`, dialog)
          await p.screenshot({ path: join(shots, `membership-leave-${name}.png`) })
        }
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
    }
  }

  /* ── CONTRIB ─────────────────────────────────────────────────────────── */
  if (want("CONTRIB")) {
    console.log("\nCONTRIB: a profile's contributions")
    for (const [vp, name] of [[DESK, "1440"], [PHONE, "390"]]) {
      const { p, errors } = await open("/@samc?case=contrib", vp)
      await sleep(500)
      const m = await p.evaluate(() => [...document.querySelectorAll("[data-shared-community]")].map((s) => ({
        slug: s.getAttribute("data-shared-community"),
        line: s.querySelector("[data-shared-contribution]")?.textContent ?? null,
        edits: [...s.querySelectorAll("[data-shared-edit]")].map((a) => a.getAttribute("href")),
        editH: [...s.querySelectorAll("[data-shared-edit]")].map((a) => Math.round(a.getBoundingClientRect().height)),
        posts: [...s.querySelectorAll("[data-shared-post] > a:first-child")].map((a) => a.getAttribute("href")),
      })))
      const own = m.find((s) => s.slug === "clay-studio")
      const other = m.find((s) => s.slug === "night-runners")
      expect(own?.line === "Level 3 · 84 points · 12 posts" && other?.line === "3 posts", `${name}: what they gave each community, real figures only`, m.map((s) => s.line))
      expect(own?.edits.join() === "/community/clay-studio/post/p1?edit=1,/community/clay-studio/post/p2?edit=1" && own.editH.every((h) => h >= 40), `${name}: Edit beside each of their own posts, opening its editor, 40px`, own)
      expect(other?.edits.length === 0 && other.posts.join() === "/community/clay-studio/post/p9", `${name}: none beside another's; each post opens the post`, other)
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow <= 0, `${name}: no sideways overflow`, overflow)
      await p.screenshot({ path: join(shots, `contrib-${name}.png`), fullPage: true })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  /* ── WARM ────────────────────────────────────────────────────────────── */
  if (want("WARM")) {
    console.log("\nWARM: leaving the community keeps its home warm")
    const { p, errors } = await open("/community/clay-studio?case=feed", DESK)
    await sleep(2600)
    await p.evaluate(() => { window.__router = [] })
    /* The frame goes (a page outside the community): the probe unmounts the root, as leaving does. */
    await p.evaluate(() => { const root = document.getElementById("app"); window.__unmount ? window.__unmount() : root.replaceChildren() })
    await sleep(300)
    const asked = await p.evaluate(() => (window.__router || []).filter((r) => r[0] === "prefetch").map((r) => r[1]))
    expect(asked.includes("/community/clay-studio"), "the community's home is asked for again as the frame goes", asked)
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
