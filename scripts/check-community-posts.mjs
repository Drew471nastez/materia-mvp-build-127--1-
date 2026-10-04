/**
 * ===========================================================================
 *  ROUND 7'S POSTS, MEASURED
 * ===========================================================================
 * The real member components (scripts/render-community-posts.tsx) with
 * fixtures, at 1440x900 and on a 390x844 phone, each photographed:
 *
 *   CARDS      one thumbnail on the right (96px on a computer, 72px on a
 *              phone), the level badge, the faces, "New comment", the dot
 *   COMPOSER   closed is one field; opened in place (computer) or as a
 *              screen of its own (phone); Post waits for a title, words and
 *              a space; every kind of attachment: a file, a picture, a link,
 *              a video by address, a video from the device, a poll, an emoji,
 *              a GIF; the POST carries each; GIFs not connected is quiet
 *   LEAVING    Cancel, a link elsewhere, and Back ask "You haven't finished
 *              your post yet. Leave without posting?"; Keep writing keeps it
 *   OPENING    a card opens its post over the feed at the post's address,
 *              frame by frame at 4x CPU; Escape (or a swipe down on a phone)
 *              closes it and the address goes back
 *   LIGHTBOX   a tile opens it; arrows and a swipe move; two fingers zoom;
 *              Escape closes
 *   MESSAGES   two members on two pages: one writes, the other's badge
 *              lights and the message arrives through the realtime stub;
 *              the answer arrives back
 *
 * and everywhere: nothing scrolls sideways, no page error, phone controls
 * at least 40px tall.
 *
 *   PROBE_CSS=source node scripts/check-community-posts.mjs
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
const stubs = join(root, ".community-posts-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-posts-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const svg = (a, b, w = 400, h = 300) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="${b}"/></svg>`)}`

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
/* Realtime the probe can drive: every channel's handlers are kept, and window.__emit(table, row, event) sends a row to the matching ones. */
writeFileSync(join(stubs, "supabase-client.js"), `const handlers = []
window.__emit = (table, row, eventType = "INSERT") => {
  let n = 0
  for (const h of handlers) {
    if (h.gone || h.filter.table !== table) continue
    const m = /^(\\w+)=eq\\.(.+)$/.exec(h.filter.filter || "")
    if (m && String(row[m[1]]) !== m[2]) continue
    n++
    h.cb({ eventType, new: row })
  }
  return n
}
window.__channels = handlers
/* The Storelib header's menu (the community bar reuses it) asks this too. */
export const isNativePlatform = () => false
export function createClient() {
  return {
    realtime: { setAuth: async () => { window.__authed = (window.__authed || 0) + 1 } },
    channel(name) {
      const mine = []
      const ch = {
        name,
        on(type, filter, cb) { const h = { name, type, filter, cb, gone: false, authed: !!window.__authed }; mine.push(h); handlers.push(h); return ch },
        subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return ch },
        _gone() { mine.forEach((h) => (h.gone = true)) },
      }
      return ch
    },
    removeChannel(ch) { ch && ch._gone && ch._gone() },
    storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "${svg("#cfd8e3", "#7d93ad", 1200, 800)}" } }) } } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  }
}
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-posts.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.community-posts-probe/navigation.js", "next/link": "./.community-posts-probe/link.jsx" },
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
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] })

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]

const GIFS = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, url: svg(["#f4d7c8", "#d6e6d2", "#dfe3f3"][i % 3], "#ffffff"), still: svg("#eeeeee", "#cccccc"), w: 200, h: 150 + (i % 2) * 40, title: `gif ${i}` }))

/* Member messages, shared by every page the probe opens: one conversation store, as the server would keep it. */
const dmStore = { conversations: new Map(), messages: [], pages: new Map() }
const NAMES = { "u-me": { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator" }, "u-jonas": { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: "member" } }

async function open(name, path, vp, opts = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await p.setRequestInterception(true)
  const as = new URL(`${ORIGIN}${path}`).searchParams.get("as") || "u-me"
  if (opts.dm) dmStore.pages.set(as, p)
  p.on("request", (r) => {
    const url = r.url()
    const method = r.method()
    const reply = (body, status = 200, wait = 0) => setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }), wait)
    if (url.startsWith(`${ORIGIN}/upload/`)) {
      calls.push({ url: url.replace(ORIGIN, ""), method })
      return reply({}, 200, 60)
    }
    if (url.startsWith(`${ORIGIN}/api/`)) {
      const short = url.replace(ORIGIN, "")
      const body = r.postData() || null
      calls.push({ url: short, method, body })
      const sent = body ? JSON.parse(body) : {}
      if (short.includes("/gifs")) return reply(opts.gifsOff ? { connected: false, gifs: [], next: null } : { connected: true, gifs: GIFS, next: null })
      if (short.includes("/files")) {
        if (sent.action === "prepare") return reply({ ticket: { fileId: "33333333-0000-4000-8000-000000000001", url: `${ORIGIN}/upload/file`, token: "t", name: sent.fileName, maxBytes: 52428800 } })
        return reply({ file: { type: "file", assetId: "33333333-0000-4000-8000-000000000001", name: sent.name, size: 1234, store: "community" } }, 200, 80)
      }
      if (short.includes("/videos")) {
        if (sent.action === "prepare") return reply({ ticket: { videoId: "44444444-0000-4000-8000-000000000001", provider: "storage", method: "storage", url: `${ORIGIN}/upload/video`, path: "x", token: "t", headers: {} } })
        return reply({ video: { id: "44444444-0000-4000-8000-000000000001", provider: "storage", status: "ready", durationSeconds: 3, width: 640, height: 360, sizeBytes: 1000, thumbnailUrl: null, hasCaptions: false, error: null, createdAt: new Date().toISOString() } })
      }
      if (short.includes("/link-preview")) return reply({ preview: sent.url?.includes("youtube") ? { url: sent.url, title: "Critique night recording", image: null, site: "youtube.com" } : { url: sent.url, title: "A talk about naming things", image: svg("#f1e9da", "#d9c3a0", 600, 400), site: "example.com" } }, 200, 120)
      if (/\/posts\/[^/]+\/comments/.test(short)) return reply({ comments: [], nextCursor: null, commentsEnabled: true, me: { name: "Sam Carter", avatarUrl: null } }, 200, 150)
      if (/\/posts\/p-[a-z]+$/.test(short) && method === "GET") return reply({ error: "not_found" }, 404)
      if (short.endsWith("/posts") && method === "POST") return reply({ post: { id: "p-new", communityId: CID, space: { id: sent.spaceId, slug: "general", name: "General" }, kind: "post", title: sent.title, body: "", bodyText: sent.body, media: sent.media, pinned: false, featured: false, locked: false, status: "published", author: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: null, role: "moderator", level: 3 }, reactionCount: 0, commentCount: 0, reacted: false, bookmarked: false, poll: null, createdAt: new Date().toISOString(), editedAt: null, lastActivityAt: new Date().toISOString(), canEdit: true, canModerate: true, recentCommenters: [], lastCommentAt: null, showLevel: true } }, 201)
      if (short.includes("/members?")) return reply({ members: [{ userId: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: "member", status: "active", level: 3, points: 0 }], nextCursor: null })
      if (short.includes("/dms")) return dmAnswer(as, short, method, sent, reply)
      if (short.includes("/presence")) return reply({ online: 5 })
      return reply({})
    }
    /* The page itself for a navigation; anything else the page asks of the site (a prefetch, an optimizer address) is not a whole page to decode. */
    if (url.startsWith(`${ORIGIN}/`)) {
      if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html })
      calls.push({ url: url.replace(ORIGIN, ""), method, other: true })
      return r.respond({ status: 404, body: "" })
    }
    if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
    return r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}case=${name}`, { waitUntil: "load" })
  await sleep(500)
  return { p, errors, calls }
}

function dmAnswer(as, short, method, sent, reply) {
  const other = as === "u-me" ? "u-jonas" : "u-me"
  const view = (c) => {
    const last = dmStore.messages.filter((m) => m.conversationId === c.id).at(-1)
    const read = c.read[as]
    return { id: c.id, other: NAMES[other], lastBody: last?.body ?? "", lastAt: last?.createdAt ?? null, lastFromMe: last?.author === as, unread: !!last && last.author !== as && (!read || read < last.createdAt) }
  }
  const m = /\/dms(?:\/([^/?]+))?(\/read)?(?:\?(.*))?$/.exec(short)
  const id = m?.[1]
  if (!id && method === "GET") {
    const list = [...dmStore.conversations.values()].filter((c) => dmStore.messages.some((x) => x.conversationId === c.id)).map(view)
    return reply({ ready: true, conversations: list, unread: list.filter((c) => c.unread).length })
  }
  if (!id && method === "POST") {
    let c = [...dmStore.conversations.values()][0]
    if (!c) {
      c = { id: "55555555-0000-4000-8000-000000000001", read: {} }
      dmStore.conversations.set(c.id, c)
    }
    return reply({ conversation: { id: c.id, other: NAMES[other] } })
  }
  const c = dmStore.conversations.get(id)
  if (!c) return reply({ error: "not_found" }, 404)
  if (m[2]) {
    c.read[as] = new Date().toISOString()
    return reply({ ok: true })
  }
  if (method === "GET") {
    const after = new URLSearchParams(m[3] || "").get("after")
    const rows = dmStore.messages.filter((x) => x.conversationId === id && (!after || x.createdAt > after))
    return reply({ messages: rows.map((x) => ({ id: x.id, conversationId: id, body: x.body, mine: x.author === as, createdAt: x.createdAt, editedAt: null })), hasMore: false })
  }
  const msg = { id: `66666666-0000-4000-8000-${String(dmStore.messages.length + 1).padStart(12, "0")}`, conversationId: id, author: as, body: sent.body, createdAt: new Date().toISOString() }
  dmStore.messages.push(msg)
  reply({ message: { id: msg.id, conversationId: id, body: msg.body, mine: true, createdAt: msg.createdAt, editedAt: null } }, 201)
  /* The database's realtime: the row to every page whose member is in the conversation, the conversation's row too. */
  setTimeout(async () => {
    for (const [, page] of dmStore.pages) {
      await page.evaluate((row, conv) => {
        window.__emit("community_direct_messages", row, "INSERT")
        window.__emit("community_conversations", conv, "UPDATE")
      }, { id: msg.id, conversation_id: id, community_id: CID, status: "published" }, { id, community_id: CID }).catch(() => {})
    }
  }, 40)
}

/** A press that waits for its target to be visible, falling back to a DOM click when puppeteer finds no point to press. */
async function press(p, sel) {
  const el = await p.waitForSelector(sel, { visible: true, timeout: 5000 })
  try {
    await el.click()
  } catch {
    await el.evaluate((e) => e.click())
  }
}

const shot = (p, name, fullPage = false) => p.screenshot({ path: join(shots, `${name}.png`), fullPage })
const sideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
const smallTargets = (p, scope = "body") =>
  p.evaluate((scope) => {
    const out = []
    for (const el of document.querySelector(scope)?.querySelectorAll("button, a[data-post-open], [data-like], [data-comment-button], input:not([type=hidden]):not([type=checkbox]):not([type=file])") ?? []) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const st = getComputedStyle(el)
      if (st.visibility === "hidden" || st.display === "none") continue
      if (el.closest("[data-post-thumb], [data-commenters]")) continue
      if (r.height < 40 && el.tagName !== "INPUT" && !el.matches("a[data-post-open]")) out.push({ text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
    }
    return out
  }, scope)

/**
 * Frames from a press until the moving thing settles, at 4x CPU. Two
 * numbers: how long until the first frame with the new thing on screen
 * (React drawing it: `mount`), and the gaps between frames WHILE it moves
 * (from that frame for `windowMs`, the length of the move and two frames
 * of start: `max`, and how many went past 34ms, two frames). What happens
 * after the move has ended (the comments arriving) is not the move.
 */
async function frames(p, cdp, act, settled, ms = 700, appears = null, windowMs = 320) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await p.evaluate((appears) => {
    window.__stamps = []
    window.__mountAt = null
    window.__t0 = performance.now()
    if (appears) {
      const seen = () => {
        if (window.__mountAt === null && document.querySelector(appears)) window.__mountAt = performance.now()
      }
      window.__mo = new MutationObserver(seen)
      window.__mo.observe(document.body, { childList: true, subtree: true, attributes: true })
    }
    const loop = (t) => {
      window.__stamps.push(t)
      if (window.__stamps.length < 500) window.__raf = requestAnimationFrame(loop)
    }
    window.__raf = requestAnimationFrame(loop)
  }, appears)
  const t0 = Date.now()
  await act()
  await p.waitForFunction(settled, { timeout: 4000 }).catch(() => {})
  const took = Date.now() - t0
  await sleep(ms)
  const out = await p.evaluate((windowMs) => {
    cancelAnimationFrame(window.__raf)
    window.__mo?.disconnect()
    const start = window.__mountAt ?? window.__t0
    const st = window.__stamps.filter((t) => t <= start + windowMs)
    const from = window.__mountAt === null ? 1 : Math.max(1, st.findIndex((t) => t > window.__mountAt) + 1)
    const gaps = st.slice(from).map((t, i) => t - st[from + i - 1])
    const firstPaint = window.__mountAt === null ? null : st.find((t) => t > window.__mountAt)
    const long = gaps.map((g, i) => [Math.round(st[from + i] - window.__t0), Math.round(g)]).filter(([, g]) => g > 34)
    return { mount: firstPaint ? Math.round(firstPaint - window.__t0) : null, max: Math.round(Math.max(0, ...gaps)), over34: gaps.filter((x) => x > 34).length, count: gaps.length, long }
  }, windowMs)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  return { ...out, settleMs: took }
}

try {
  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.DM_ONLY && (!process.env.ONLY || l.startsWith(process.env.ONLY)))) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)

    /* ── CARDS ────────────────────────────────────────────────────── */
    {
      const { p, errors } = await open("feed", "/community/studio-notes", vp)
      await shot(p, `${label}-feed`)
      const card = await p.evaluate(() => {
        const out = {}
        for (const el of document.querySelectorAll("[data-post]")) {
          const thumb = el.querySelector("[data-post-thumb]")
          const title = el.querySelector("h2")
          const t = thumb?.getBoundingClientRect()
          const c = el.getBoundingClientRect()
          out[el.getAttribute("data-post")] = {
            thumb: thumb ? { w: Math.round(t.width), h: Math.round(t.height), kind: thumb.getAttribute("data-post-thumb"), right: Math.round(c.right - t.right), rightOfTitle: t.left >= title.getBoundingClientRect().right - 1 } : null,
            unread: !!el.querySelector("[data-unread-dot]"),
            level: el.querySelector("[data-level-badge]")?.textContent ?? null,
            faces: el.querySelectorAll("[data-commenters] > *").length,
            fresh: el.querySelector("[data-new-comment]")?.textContent ?? null,
            excerptLines: (() => {
              const e = el.querySelector("[data-post-excerpt]")
              return e ? Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) : 0
            })(),
          }
        }
        return out
      })
      if (!card["p-intro"]) throw new Error(`the feed did not draw: ${JSON.stringify(errors)}`)
      const size = phone ? 72 : 96
      expect(card["p-intro"].thumb?.w === size && card["p-intro"].thumb?.h === size, `the card's one thumbnail is ${size}px`, card["p-intro"].thumb)
      expect(card["p-intro"].thumb?.rightOfTitle && card["p-intro"].thumb.right <= 24, "it sits on the right, beside the title and the words", card["p-intro"].thumb)
      expect(card["p-video"].thumb?.kind === "video" && card["p-gif"].thumb?.kind === "gif" && card["p-link"].thumb?.kind === "link" && card["p-text"].thumb === null, "a video by address shows its picture, a GIF its still, a link its picture, text nothing", Object.fromEntries(Object.entries(card).map(([k, v]) => [k, v.thumb?.kind ?? null])))
      expect(card["p-intro"].level === "2" && card["p-video"].level === "6", "the author's level sits on their picture", [card["p-intro"].level, card["p-video"].level])
      const faces = await p.evaluate(() => [...document.querySelectorAll('[data-post="p-intro"] [data-commenters] > *')].filter((e) => e.getBoundingClientRect().width > 0).length)
      expect(faces === (phone ? 2 : 3) && card["p-video"].faces === 2, phone ? "up to three commenters' faces, two on a 390px phone" : "up to three commenters' faces", [faces, card["p-video"].faces])
      expect(/^New comment \d+h ago$/.test(card["p-video"].fresh ?? "") && card["p-gif"].fresh === null, "\"New comment 3h ago\" only for one in the last week", [card["p-video"].fresh, card["p-gif"].fresh])
      const cut = await p.evaluate(() => [...document.querySelectorAll("[data-new-comment]")].filter((e) => e.scrollWidth > e.clientWidth + 1).length)
      expect(cut === 0, "and it is never cut short", cut)
      expect(card["p-intro"].unread && card["p-video"].unread && !card["p-gif"].unread && !card["p-link"].unread, "the dot: new to me, not opened, not mine", Object.fromEntries(Object.entries(card).map(([k, v]) => [k, v.unread])))
      expect(card["p-intro"].excerptLines <= 2 && card["p-intro"].excerptLines >= 1, "two lines of the words at most", card["p-intro"].excerptLines)
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      if (phone) {
        const small = await smallTargets(p, "[data-feed-list]")
        expect(small.length === 0, "every control on a card is at least 40px tall", small.slice(0, 6))
      }
      const el = await p.$('[data-post="p-intro"]')
      await el.screenshot({ path: join(shots, `${label}-card.png`) })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── COMPOSER: every attachment kind, and the POST ─────────────── */
    {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      const closedKids = await p.evaluate(() => [...document.querySelectorAll('[data-composer="closed"] button')].map((b) => b.textContent.trim()))
      expect(closedKids.length === 1 && /Share something/.test(closedKids[0]), "closed, the composer is one field", closedKids)
      await p.click("[data-composer-open]")
      await sleep(450)
      const mode = await p.evaluate(() => document.querySelector("[data-composer=sheet]") ? "sheet" : document.querySelector("[data-composer=open]") ? "open" : "none")
      expect(mode === (phone ? "sheet" : "open"), phone ? "a phone gets a screen of its own" : "a computer edits in place", mode)
      if (phone) {
        const sheetBox = await p.evaluate(() => {
          const r = document.querySelector("[data-composer=sheet]").getBoundingClientRect()
          return { top: Math.round(r.top), h: Math.round(r.height) }
        })
        expect(sheetBox.top === 0 && sheetBox.h === 844, "the screen covers the phone", sheetBox)
      }
      const disabled = () => p.$eval("[data-composer-post]", (b) => b.disabled)
      expect(await disabled(), "Post waits while it is empty")
      await p.type("[data-composer-title]", "Testing every attachment")
      expect(await disabled(), "a title alone is not enough")
      await p.type('[aria-label="Post"]', "Words for the post. ")
      expect(await disabled(), "nor a title and words without a space")
      await p.click("[data-composer-space]")
      await sleep(350)
      const spaceItem = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet] button, button')].find((b) => b.textContent.trim() === "General" && b.closest('[role="menu"], [role="dialog"]')))
      await spaceItem.asElement()?.click()
      await sleep(400)
      expect(!(await disabled()), "title, words and a space: Post is ready")

      /* A file and a picture through the paperclip. */
      const input = await p.$("[data-composer-file-input]")
      const pdf = join(stubs, "Plan.pdf")
      writeFileSync(pdf, "%PDF-1.4\n%probe\n")
      const png = join(stubs, "photo.png")
      writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJgYGBAQAvRgP9C/2bSAAAAABJRU5ErkJggg==", "base64"))
      await input.uploadFile(pdf, png)
      await p.waitForFunction(() => document.querySelectorAll('[data-attachment][data-ready="true"]').length >= 2, { timeout: 8000 }).catch(() => {})
      const kinds1 = await p.$$eval("[data-attachment]", (els) => els.map((e) => e.getAttribute("data-attachment")))
      expect(kinds1.includes("file") && kinds1.includes("image"), "a file and a picture are attached", kinds1)
      expect(calls.some((c) => c.url.endsWith("/files") && /"prepare"/.test(c.body)) && calls.some((c) => c.url === "/upload/file" && c.method === "PUT") && calls.some((c) => c.url.endsWith("/files") && /"complete"/.test(c.body)), "the file is asked for, sent and checked through the community's route")

      /* A link with its card. */
      await p.click('[data-composer-tool="link"]')
      await p.type("[data-composer-link-field] input", "example.com/talk")
      await p.keyboard.press("Enter")
      await p.waitForSelector("[data-link-card]", { timeout: 4000 }).catch(() => {})
      expect(!!(await p.$("[data-link-card]")), "a link brings its card")

      /* A video by address. */
      await p.click('[data-composer-tool="video"]')
      await sleep(200)
      await p.type('[data-composer-link-field="video"] input', "https://youtu.be/dQw4w9WgXcQ")
      await p.keyboard.press("Enter")
      await sleep(300)
      expect(!!(await p.$('[data-attachment="embed"]')), "a YouTube address becomes the video")

      /* A video from the device. */
      const vid = join(stubs, "clip.mp4")
      writeFileSync(vid, Buffer.alloc(2048, 1))
      await p.click('[data-composer-tool="video"]')
      await sleep(200)
      const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 3000 }), p.click("[data-composer-video-upload]")])
      expect(!!chooser, "Upload opens the device's file picker inside the press")
      await chooser.accept([vid])
      await p.waitForFunction(() => !!document.querySelector('[data-attachment="video"][data-ready="true"]'), { timeout: 20000 }).catch(() => {})
      expect(!!(await p.$('[data-attachment="video"]')) && calls.some((c) => c.url.endsWith("/videos") && /"complete"/.test(c.body)), "a video from the device goes through the community's video route")

      /* A poll. */
      await p.click('[data-composer-tool="poll"]')
      await p.type('[aria-label="Poll question"]', "Which one?")
      await p.type('[aria-label="Choice 1"]', "This")
      await p.type('[aria-label="Choice 2"]', "That")
      expect(!!(await p.$("[data-composer-poll-editor]")), "a poll has its editor")

      /* An emoji, where the caret was. */
      await p.click('[aria-label="Post"]')
      await p.click("[data-emoji-trigger]")
      await sleep(500)
      await p.evaluate(() => document.querySelector("[data-emoji]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
      await sleep(300)
      if (phone) {
        await p.keyboard.press("Escape").catch(() => {})
        await sleep(300)
      } else {
        await p.keyboard.press("Escape").catch(() => {})
      }
      const bodyText = await p.$eval('[aria-label="Post"]', (t) => t.value)
      expect(/\p{Extended_Pictographic}/u.test(bodyText), "an emoji goes into the words", bodyText.slice(-6))

      /* A GIF. */
      await sleep(300)
      await p.click("[data-composer-gif]")
      await p.waitForSelector("[data-gif]", { timeout: 4000 }).catch(() => {})
      await shot(p, `${label}-gif-picker`)
      await p.click("[data-gif]")
      await sleep(400)
      expect(!!(await p.$('[data-attachment="gif"]')), "a GIF is attached")
      await shot(p, `${label}-composer-full`, !phone)

      await p.click("[data-composer-post]")
      await sleep(600)
      const sent = calls.filter((c) => c.url.endsWith("/posts") && c.method === "POST").map((c) => JSON.parse(c.body))[0]
      const types = (sent?.media ?? []).map((m) => m.type).sort()
      expect(sent?.title === "Testing every attachment" && /Words for the post/.test(sent?.body ?? "") && !!sent?.spaceId, "the POST carries the title, the words and the space", sent && { title: sent.title, spaceId: sent.spaceId })
      expect(["embed", "file", "gif", "image", "link", "video"].every((t) => types.includes(t)) && !!sent?.poll, "and every kind of attachment, and the poll", types)
      const after = await p.evaluate(() => ({ closed: !!document.querySelector('[data-composer="closed"]'), first: document.querySelector("[data-post]")?.getAttribute("data-post") }))
      expect(after.closed && after.first === "p-new", "posted: the composer closes and the post is first", after)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── GIFS NOT CONNECTED ───────────────────────────────────────── */
    {
      const { p } = await open("feed", "/community/studio-notes", vp, { gifsOff: true })
      await p.click("[data-composer-open]")
      await sleep(600)
      const off = await p.$eval("[data-composer-gif]", (b) => ({ state: b.getAttribute("data-composer-gif"), opacity: getComputedStyle(b).opacity }))
      expect(off.state === "off" && Number(off.opacity) < 0.8, "without the key the GIF button is quieter", off)
      await p.click("[data-composer-gif]")
      await sleep(400)
      expect(!!(await p.$("[data-gif-off]")), "and opening it says GIFs are not connected")
      await shot(p, `${label}-gif-off`)
      await p.close()
    }

    /* ── LEAVING WITH SOMETHING WRITTEN ───────────────────────────── */
    {
      const { p } = await open("feed", "/community/studio-notes", vp)
      await p.click("[data-composer-open]")
      await sleep(450)
      await p.type("[data-composer-title]", "Half a thought")
      await sleep(450)
      await p.click("[data-composer-cancel]")
      await sleep(350)
      const q = await p.evaluate(() => document.querySelector("[data-leave-dialog]")?.closest('[role="dialog"]')?.textContent ?? "")
      expect(/You haven't finished your post yet\. Leave without posting\?/.test(q) && /Keep writing/.test(q) && /Leave/.test(q), "Cancel asks the question in Storelib's dialog", q.slice(0, 90))
      await shot(p, `${label}-leave`)
      await p.click("[data-leave-stay]")
      await sleep(300)
      expect(await p.$eval("[data-composer-title]", (i) => i.value) === "Half a thought", "Keep writing keeps it")
      if (!phone) {
        /* A link to another page is held too. */
        await p.evaluate(() => {
          const a = document.createElement("a")
          a.href = "/community/studio-notes/members"
          a.textContent = "Members"
          a.id = "away"
          document.body.appendChild(a)
        })
        await p.click("#away")
        await sleep(350)
        expect(!!(await p.$("[data-leave-dialog]")), "a link to another page asks first")
        await p.click("[data-leave-go]")
        await sleep(300)
        const r = await p.evaluate(() => ({ router: window.__router ?? [], closed: !!document.querySelector('[data-composer="closed"]'), draft: Object.keys(localStorage).filter((k) => k.startsWith("storelib:community-draft")).length }))
        expect(r.router.some(([k, h]) => k === "push" && h === "/community/studio-notes/members") && r.closed && r.draft === 0, "Leave goes there, closes the editor and drops the draft", r)
      } else {
        /* Back on a phone. */
        await p.evaluate(() => history.back())
        await sleep(400)
        expect(!!(await p.$("[data-leave-dialog]")), "Back on a phone asks first")
        await p.click("[data-leave-go]")
        await sleep(500)
        expect(!!(await p.$('[data-composer="closed"]')) && !(await p.$('[data-composer="sheet"]')), "Leave closes the screen")
      }
      await p.close()
    }

    /* ── OPENING A POST OVER THE FEED ─────────────────────────────── */
    {
      const { p, errors, calls } = await open("feed", "/community/studio-notes", vp)
      const cdp = await p.target().createCDPSession()
      const before = await p.evaluate(() => location.pathname)
      const target = `[data-post="${process.env.OPEN_POST || "p-video"}"] [data-post-excerpt]`
      const opening = await frames(
        p,
        cdp,
        async () => {
          if (phone) await p.tap(target)
          else await p.click(target)
        },
        () => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown",
        450,
        "[data-post-overlay]",
        280,
      )
      const opened = await p.evaluate(() => ({ path: location.pathname, overlay: document.querySelector("[data-post-overlay]")?.getAttribute("data-post-overlay"), router: (window.__router ?? []).filter(([k]) => k === "push" || k === "link") }))
      expect(opened.overlay === (phone ? "phone" : "panel"), phone ? "a phone opens the post as a screen" : "a computer opens the post over the feed", opened.overlay)
      expect(opened.path === "/community/studio-notes/post/p-video" && opened.router.length === 0, "the address is the post's own, with no page load", opened)
      const runs = [opening]
      await sleep(300)
      expect(calls.some((c) => /\/posts\/p-video\/comments$/.test(c.url)), "the comments are read for the opened post")
      await shot(p, `${label}-post-open`)
      if (!phone) {
        const panel = await p.evaluate(() => {
          const r = document.querySelector('[data-post-overlay="panel"]').getBoundingClientRect()
          return { w: Math.round(r.width), left: Math.round(r.left), top: Math.round(r.top) }
        })
        expect(panel.w === 760 && Math.abs(panel.left - (1440 - 760) / 2) <= 1, "a 760px panel in the middle", panel)
      }
      const closing = await frames(
        p,
        cdp,
        async () => {
          if (phone) {
            /* A swipe down on the screen's bar. */
            const bar = await p.$("[data-post-overlay-bar]")
            const b = await bar.boundingBox()
            const x = b.x + b.width / 2
            const y = b.y + b.height / 2
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
            for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 25 }] })
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
          } else await p.keyboard.press("Escape")
        },
        () => !document.querySelector("[data-post-overlay]"),
        300,
        null,
        /* The close moves for 180ms; the frame that then takes it off the page comes after the move. */
        180,
      )
      const closed = await p.evaluate(() => ({ path: location.pathname, overlay: !!document.querySelector("[data-post-overlay]"), seen: !!document.querySelector('[data-post="p-video"] [data-unread-dot]') }))
      expect(!closed.overlay && closed.path === before, phone ? "a swipe down closes it and the address goes back" : "Escape closes it and the address goes back", closed)
      expect(closing.over34 === 0 && closing.max <= 34, "closing at 4x CPU: no frame over two frames' time", closing)
      expect(!closed.seen, "opened, the post is no longer new: its dot is gone")
      /*
        Two more opens, measured the same way, so one noisy frame on a
        shared machine does not decide it: the middle run must be clean.
      */
      for (let i = 0; i < 2; i++) {
        await sleep(400)
        runs.push(
          await frames(p, cdp, () => (phone ? p.tap(target) : p.click(target)), () => document.querySelector("[data-post-overlay-phase]")?.getAttribute("data-post-overlay-phase") === "shown", 450, "[data-post-overlay]", 280),
        )
        await p.keyboard.press("Escape")
        await sleep(500)
      }
      const middle = [...runs].sort((x, y) => x.max - y.max)[1]
      const mounts = runs.map((r) => r.mount).sort((x, y) => x - y)
      expect(mounts[1] !== null && mounts[1] < 300, "at 4x CPU the post is on screen within 300ms of the press (75ms at full speed) (middle of three)", runs.map((r) => r.mount))
      expect(middle.over34 === 0 && middle.max <= 34, "and it slides in with no frame over two frames' time (middle of three)", runs.map((r) => ({ max: r.max, long: r.long })))
      /* Back closes it too. */
      await p.click('[data-post="p-text"] [data-post-excerpt]')
      await sleep(500)
      await p.evaluate(() => history.back())
      await sleep(450)
      expect(!(await p.$("[data-post-overlay]")), "the browser's Back closes it")
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── THE POST PAGE AND THE LIGHTBOX ───────────────────────────── */
    {
      const { p, errors } = await open("post", "/community/studio-notes/post/p-intro", vp)
      await shot(p, `${label}-post-page`, true)
      const grid = await p.evaluate(() => {
        const card = document.querySelector("[data-post]").getBoundingClientRect()
        const tiles = [...document.querySelectorAll("[data-media-tile]")].map((t) => t.getBoundingClientRect())
        return { cardW: Math.round(card.width), tiles: tiles.length, tileW: Math.round(tiles[0]?.width ?? 0), widest: Math.round(Math.max(...tiles.map((t) => t.width))) }
      })
      expect(grid.tiles === 4 && grid.widest < grid.cardW * 0.5, "inside the post media is a grid of thumbnails, never its full width", grid)
      const cdp = await p.target().createCDPSession()
      /* Three opens, the middle one judged, as for the post: the machine these run on is shared. */
      const lbRuns = []
      for (let i = 0; i < 3; i++) {
        if (i) {
          await p.keyboard.press("Escape")
          await sleep(450)
        }
        lbRuns.push(await frames(p, cdp, () => p.click('[data-media-tile="image"]'), () => document.querySelector("[data-lightbox-phase]")?.getAttribute("data-lightbox-phase") === "open", 300, "[data-lightbox]"))
      }
      const openLb = [...lbRuns].sort((x, y) => x.mount - y.mount)[1]
      expect(!!(await p.$("[data-lightbox]")), "a tile opens the lightbox")
      expect(openLb.mount !== null && openLb.mount < 300 && openLb.over34 === 0 && openLb.max <= 34, "the lightbox at 4x CPU: on screen within 300ms (75ms at full speed), then no frame over two frames' time (middle of three)", lbRuns.map((r) => ({ mount: r.mount, max: r.max })))
      await shot(p, `${label}-lightbox`)
      if (!phone) {
        await p.keyboard.press("ArrowRight")
        await sleep(350)
        expect((await p.$eval("[data-lightbox-count]", (e) => e.textContent)) === "2 / 4", "the arrow key moves to the next one")
      } else {
        const box = { x: 195, y: 420 }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] })
        for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x - i * 25, y: box.y }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(400)
        expect((await p.$eval("[data-lightbox-count]", (e) => e.textContent)) === "2 / 4", "a swipe moves to the next one")
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] })
        for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + i * 25, y: box.y }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(400)
        /* Two fingers apart: a zoom. */
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 170, y: 420, id: 1 }, { x: 220, y: 420, id: 2 }] })
        for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 170 - i * 15, y: 420, id: 1 }, { x: 220 + i * 15, y: 420, id: 2 }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(300)
        const scale = await p.evaluate(() => [...document.querySelectorAll("[data-lightbox-image]")].map((i) => Number(i.style.scale || 1)).sort((a, b) => b - a)[0])
        expect(scale > 1.5, "two fingers zoom the picture", scale)
        await shot(p, `${label}-lightbox-zoom`)
      }
      await p.keyboard.press("Escape")
      await sleep(450)
      expect(!(await p.$("[data-lightbox]")), "Escape closes it")
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }
  }

  /* ── MESSAGES: two members, two pages ───────────────────────────── */
  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    console.log(`\n${label}: messages between two members`)
    dmStore.conversations.clear()
    dmStore.messages.length = 0
    dmStore.pages.clear()
    const a = await open("dm", "/community/studio-notes?as=u-me", vp, { dm: true })
    const b = await open("dm", "/community/studio-notes?as=u-jonas", vp, { dm: true })
    const authed = await a.p.evaluate(() => window.__channels.filter((h) => /community-dm/.test(h.name)).every((h) => h.authed))
    expect(authed, "the inbox stream joins after the member's token is set, not as a visitor")
    /* The page being pressed is brought to the front: a tab in the back gets no animation frames, and a press waits for one. */
    await a.p.bringToFront()
    await press(a.p, "[data-community-messages-button]")
    await a.p.waitForSelector("[data-messages-new]", { timeout: 4000 })
    await press(a.p, "[data-messages-new]")
    await a.p.type('input[aria-label="Search members"]', "Jon")
    await a.p.waitForFunction(() => [...document.querySelectorAll('[data-community-messages] button')].some((x) => /Jonas Berg/.test(x.textContent)), { timeout: 4000 }).catch(() => {})
    const jonas = await a.p.evaluateHandle(() => [...document.querySelectorAll('[data-community-messages] button')].find((x) => /Jonas Berg/.test(x.textContent)))
    await jonas.asElement()?.evaluate((e) => e.click())
    await a.p.waitForSelector("[data-thread-form] textarea", { timeout: 4000 })
    await a.p.type("[data-thread-form] textarea", "Hey Jonas, are you coming to critique night?")
    await a.p.keyboard.press("Enter")
    await b.p.waitForFunction(() => /1/.test(document.querySelector("[data-community-messages-button]")?.getAttribute("aria-label") ?? ""), { timeout: 4000 }).catch(() => {})
    const badge = await b.p.$eval("[data-community-messages-button]", (x) => x.getAttribute("aria-label"))
    await b.p.bringToFront()
    expect(badge === "Messages, 1 unread", "the other member's badge lights without a reload", badge)
    await shot(b.p, `${label}-dm-badge`)
    await press(b.p, "[data-community-messages-button]")
    await b.p.waitForSelector("[data-conversation]", { timeout: 4000 }).catch(() => {})
    await press(b.p, "[data-conversation]")
    await b.p.waitForFunction(() => /critique night/.test(document.querySelector("[data-thread-list]")?.textContent ?? ""), { timeout: 4000 }).catch(() => {})
    expect(/critique night/.test(await b.p.$eval("[data-thread-list]", (x) => x.textContent)), "they open it and read it")
    await b.p.type("[data-thread-form] textarea", "Yes, see you there")
    await b.p.keyboard.press("Enter")
    await a.p.bringToFront()
    await a.p.waitForFunction(() => /see you there/.test(document.querySelector("[data-thread-list]")?.textContent ?? ""), { timeout: 4000 }).catch(() => {})
    expect(/see you there/.test(await a.p.$eval("[data-thread-list]", (x) => x.textContent)), "the answer arrives in the first member's open conversation, live")
    await shot(a.p, `${label}-dm-thread`)
    await b.p.bringToFront()
    await shot(b.p, `${label}-dm-thread-b`)
    const side = await sideScroll(a.p)
    expect(side.scroll <= side.width, "nothing scrolls sideways", side)
    expect(a.errors.length === 0 && b.errors.length === 0, "no page error", [...a.errors, ...b.errors])
    await a.p.close()
    await b.p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
