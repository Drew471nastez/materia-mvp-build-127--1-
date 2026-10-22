/**
 * ===========================================================================
 *  ROUND 39'S COMMUNITY CHAT, MEASURED
 * ===========================================================================
 * The member's real Messages panel and the Chat tab's channel
 * (scripts/render-community-chat-r39.tsx: messages.tsx, chat.tsx,
 * chat-surface.tsx) in headless Chromium at 1440x900 and on a 390x844
 * phone, light and dark, against a server in this script that answers the
 * chat routes READ_MS late (300 by default) and a picture storage that takes
 * the upload. Every number is read in the page:
 *
 *   COMPOSER  the attach button, the field, the GIF and emoji buttons and
 *             Send in the conversation and in the Chat tab: each one's box,
 *             its height, how far its middle is from the field's middle, the
 *             GIF and emoji buttons the same size and at the field's right
 *             end (nothing floating in the middle of it)
 *   OPEN      the conversation opened from a person's Message button (cold,
 *             and after the pointer rested on it), and from the list: the
 *             time to the conversation's header and to its first bubble,
 *             and whether the list was ever drawn on the way
 *   MOTION    the panel opening and closing, frame by frame: its opacity,
 *             where it is, and whether `transform` ever carried the movement
 *             (round 39 moves it with `translate` and `scale` alone)
 *   PICTURE   a picture picked in the box: its preview, its upload to
 *             storage, Send, what the send carried, and the bubble drawing
 *             it at its own shape with a srcset
 *   STATES    one's own message sending, sent, delivered (the other side's
 *             delivered mark arriving over realtime) and seen
 *   PRESENCE  the other person online now (realtime presence), and last
 *             seen when they go; typing in the header
 *
 *   PROBE_CSS=source node scripts/check-community-chat-r39.mjs
 *   BEFORE=1 prints the numbers only (for a run on round 38's code).
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { crc32, deflateSync } from "node:zlib"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const READ_MS = Number(process.env.READ_MS || 300)
const BEFORE = !!process.env.BEFORE
const stubs = join(root, ".community-chat-r39-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-chat-r39-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  if (BEFORE) return
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const note = (what, got) => console.log(`  ..    ${what}   ${JSON.stringify(got)}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const svg = (a, b, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="${b}"/></svg>`

/* A real PNG for the file input, 1600x1000, a soft gradient: big enough that the browser makes it smaller before it goes up. */
function png(w, h) {
  const rows = []
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3)
    for (let x = 0; x < w; x++) {
      row[1 + x * 3] = 120 + Math.round((x / w) * 100)
      row[2 + x * 3] = 150 + Math.round((y / h) * 80)
      row[3 + x * 3] = 210
    }
    rows.push(row)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))])
}
const PHOTO = join(stubs, "workbench.png")
writeFileSync(PHOTO, png(1600, 1000))

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
/*
  The browser's Supabase client, as the page uses it: postgres changes (window.__emit), broadcast (window.__broadcast)
  and presence (window.__presence sets who is on a topic), a signed in session for the upload, and storage handing back
  Storelib's own media address as the real client does (lib/storage/media-url.ts withMediaAddresses).
*/
writeFileSync(join(stubs, "supabase-client.js"), `const handlers = []
const presence = new Map()
const joined = []
window.__emit = (table, row, eventType = "UPDATE") => {
  for (const h of handlers) {
    if (h.gone || h.type !== "postgres_changes" || h.filter.table !== table) continue
    const m = /^(\\w+)=eq\\.(.+)$/.exec(h.filter.filter || "")
    if (m && String(row[m[1]]) !== m[2]) continue
    h.cb({ eventType, new: row })
  }
}
window.__broadcast = (topic, event, payload) => {
  for (const h of handlers) if (!h.gone && h.type === "broadcast" && h.topic === topic && h.filter.event === event) h.cb({ payload })
}
window.__presence = (topic, keys) => {
  presence.set(topic, Object.fromEntries(keys.map((k) => [k, [{ presence_ref: k, at: new Date().toISOString() }]])))
  for (const h of handlers) if (!h.gone && h.type === "presence" && h.topic === topic) h.cb({})
}
window.__joined = joined
window.__tracked = []
export const isNativePlatform = () => false
export function createClient() {
  return {
    realtime: { setAuth: async () => {} },
    channel(topic, opts) {
      const mine = []
      joined.push(topic)
      const ch = {
        on(type, filter, cb) { const h = { type, filter, cb, topic, gone: false }; mine.push(h); handlers.push(h); return ch },
        subscribe(cb) { setTimeout(() => { cb && cb("SUBSCRIBED"); for (const h of mine) if (h.type === "presence") h.cb({}) }, 20); return ch },
        send() { return Promise.resolve("ok") },
        track(state) { window.__tracked.push({ topic, state }); return Promise.resolve("ok") },
        untrack() { return Promise.resolve("ok") },
        presenceState() { return presence.get(topic) || {} },
        _gone() { mine.forEach((h) => (h.gone = true)) },
      }
      return ch
    },
    removeChannel(ch) { ch && ch._gone && ch._gone() },
    storage: { from(bucket) { return { upload: async () => ({ error: null }), getPublicUrl: (path) => ({ data: { publicUrl: "${ORIGIN}/media/" + bucket + "/" + path } }) } } },
    auth: { getSession: async () => ({ data: { session: { access_token: "probe-token" } } }), getUser: async () => ({ data: { user: null } }) },
  }
}
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-chat-r39.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.community-chat-r39-probe/navigation.js", "next/link": "./.community-chat-r39-probe/link.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules"), "/home/user/materia-mvp-build-127--1-/node_modules"],
})
const css = await appCss(root)
const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const fonts = interFaces(root)
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}\n//# sourceURL=chat-app.js</script></body></html>`

/* ── The server ─────────────────────────────────────────────────────────── */

const ME = { id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "Ana Ruiz" }
const MINU = { id: "bbbbbbbb-0000-4000-8000-0000000000aa", name: "Minu Sato", username: "minu", avatarUrl: null, role: "owner" }
const PEOPLE = [MINU, ...["Ben Okafor", "Cleo Park", "Dev Shah"].map((name, i) => ({ id: `bbbbbbbb-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, name, username: name.split(" ")[0].toLowerCase(), avatarUrl: null, role: "member" }))]
const CONVS = PEOPLE.map((other, i) => ({ id: `c0c0c0c0-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, other }))
const ago = (n) => new Date(Date.now() - n * 60_000).toISOString()
const SPACE = "5a5a5a5a-0000-4000-8000-000000000001"

function makeServer() {
  const s = { chats: new Map(), posts: [], opened: 0, uploads: 0, uploaded: [] }
  CONVS.forEach((c, i) => {
    s.chats.set(
      c.id,
      Array.from({ length: 14 }, (_, k) => ({ id: `${c.id.slice(0, 24)}${String(k).padStart(12, "0")}`, author: k % 3 === 0 ? ME.id : c.other.id, body: k % 4 === 2 ? "That works for me. I will bring the notes from last week and we can go through the open questions." : `Message ${k} with ${c.other.name.split(" ")[0]}`, attachments: [], createdAt: ago(300 - k * 6 - i) })),
    )
  })
  /* Minu sent a picture a while ago: drawn from the optimizer at the bubble's width, not the upload. */
  const minuRows = s.chats.get(CONVS[0].id)
  minuRows[10] = { ...minuRows[10], author: MINU.id, body: "", attachments: [{ type: "image", url: `${ORIGIN}/media/product-images/${MINU.id}/community/${CID}/1792600000000_abcd12.webp`, w: 1200, h: 800 }] }
  const space = Array.from({ length: 10 }, (_, k) => ({ id: `5e5e5e5e-0000-4000-8000-${String(k).padStart(12, "0")}`, author: k % 3 === 0 ? ME.id : PEOPLE[1 + (k % 3)].id, body: k % 2 ? "Morning all. Finished the dovetail jig from last week's lesson." : `Channel line ${k}`, createdAt: ago(200 - k * 5) }))
  const person = (id) => (id === ME.id ? { id: ME.id, name: ME.name, username: "ana", avatarUrl: null, role: "member", level: 1 } : { ...PEOPLE.find((p) => p.id === id), level: 2 })
  const view = (r, convId) => ({ id: r.id, conversationId: convId, authorId: r.author, author: person(r.author), mine: r.author === ME.id, body: r.body, attachments: r.attachments ?? [], replyTo: null, clientId: r.clientId ?? null, createdAt: r.createdAt, editedAt: null, canEdit: r.author === ME.id, canDelete: r.author === ME.id, canModerate: false })
  s.spaceMessages = space.map((r) => ({ ...view(r, null), spaceId: SPACE, status: "published", reactionCount: 0, reacted: false }))
  s.handle = (r) => {
    const url = new URL(r.url())
    const path = url.pathname.replace(`/api/community/${CID}`, "")
    const method = r.method()
    const json = (body, status = 200, wait = READ_MS) => setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}), wait)
    if (url.pathname === "/api/storage/uploaded") return json({ ok: true }, 200, 20)
    if (path === "/chat" && method === "GET") return json({ ready: true, rules: "", rulesVersion: 0, needsRules: false, dmPolicy: "everyone", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: ME.name, canStartGroups: true })
    const states = { otherReadAt: ago(120), otherDeliveredAt: ago(60), otherSeenAt: ago(42) }
    const newest = (id) => ({ messages: [...s.chats.get(id)].sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1)).slice(-50).map((x) => view(x, id)), hasMore: false, ...states })
    if (path === "/dms" && method === "GET" && url.searchParams.get("with")) {
      s.found = (s.found ?? 0) + 1
      const c = CONVS.find((x) => x.other.id === url.searchParams.get("with"))
      return json(c ? { conversation: { id: c.id, other: c.other }, page: newest(c.id) } : { conversation: null })
    }
    if (path === "/dms" && method === "GET") {
      const conversations = CONVS.map((c) => {
        const rows = s.chats.get(c.id)
        const last = rows[rows.length - 1]
        return { id: c.id, other: c.other, lastBody: last.body || "Photo", lastAt: last.createdAt, lastFromMe: last.author === ME.id, unread: false, muted: false }
      }).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      return json({ ready: true, conversations, groups: [], unread: 0 })
    }
    if (path === "/dms" && method === "POST") {
      s.opened++
      const b = JSON.parse(r.postData() || "{}")
      const c = CONVS.find((x) => x.other.id === b.userId)
      return json({ conversation: { id: c.id, other: c.other }, ...(b.page === true ? { page: newest(c.id) } : {}) })
    }
    const m = /^\/dms\/([0-9a-f-]{36})$/.exec(path)
    if (m && method === "GET") {
      const rows = [...(s.chats.get(m[1]) ?? [])].sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1))
      const after = url.searchParams.get("after")
      const states = { otherReadAt: ago(120), otherDeliveredAt: ago(60), otherSeenAt: ago(42) }
      if (after) return json({ messages: rows.filter((x) => x.createdAt > after).map((x) => view(x, m[1])), hasMore: false, ...states }, 200, Math.round(READ_MS / 2))
      return json({ messages: rows.slice(-50).map((x) => view(x, m[1])), hasMore: false, ...states })
    }
    if (m && method === "POST") {
      const body = JSON.parse(r.postData() || "{}")
      s.posts.push(body)
      const row = { id: randomUUID(), author: ME.id, body: body.body, attachments: body.attachments ?? [], clientId: body.clientId, createdAt: new Date().toISOString() }
      s.chats.get(m[1]).push(row)
      return json({ message: view(row, m[1]) }, 201, 250)
    }
    if (path === `/spaces/${SPACE}/messages` || path.startsWith("/chat/messages") || (path.includes("/messages") && method === "GET")) {
      const after = url.searchParams.get("after")
      return json({ messages: after ? [] : s.spaceMessages, hasMore: false }, 200, 150)
    }
    if (path.endsWith("/read")) return json({ ok: true }, 200, 80)
    if (path.startsWith("/chat/prefs")) return json({ notify: "default", mutedUntil: null }, 200, 120)
    if (path.startsWith("/chat/blocks")) return json({ blocked: false }, 200, 120)
    if (path.startsWith("/gifs")) return json({ connected: true, gifs: [], next: null }, 200, 100)
    if (path.startsWith("/members")) return json({ members: [] }, 200, 100)
    if (path.startsWith("/chat/unfurl")) return json({ card: null }, 200, 100)
    return json({ error: "not_found" }, 404, 20)
  }
  return s
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], protocolTimeout: 60_000 })

async function open(server, viewport, { mode = "panel", theme = "light" } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) page.on("console", (m) => console.log("    [page]", m.text()))
  await page.evaluateOnNewDocument(
    (p, t) => {
      window.__probe = p
      if (t === "dark") document.addEventListener("DOMContentLoaded", () => document.documentElement.setAttribute("data-sl-dark", ""))
    },
    { mode, communityId: CID, me: ME, other: MINU, messages: server.spaceMessages },
    theme,
  )
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void server.handle(r)
    if (url.startsWith("https://placeholder.supabase.co/storage/v1/object/") && r.method() === "OPTIONS") {
      return void r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, PUT, OPTIONS" }, body: "" }).catch(() => {})
    }
    if (url.startsWith("https://placeholder.supabase.co/storage/v1/object/")) {
      server.uploads++
      server.uploaded.push({ url, type: r.headers()["content-type"], bytes: r.postData()?.length ?? null })
      return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ Key: "ok" }) }).catch(() => {}), 200)
    }
    if (url.startsWith(`${ORIGIN}/media/`) || url.startsWith(`${ORIGIN}/_next/image`)) return void r.respond({ status: 200, contentType: "image/svg+xml", body: svg("#dfe5ec", "#8796ab", 1600, 1000) }).catch(() => {})
    if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: html })
    r.continue().catch(() => {})
  })
  await page.goto(`${ORIGIN}/community/studio-notes`, { waitUntil: "load" })
  await until(page, () => !!document.querySelector("[data-probe-open]"))
  await sleep(250)
  return { page, errors }
}

async function until(page, fn, arg, timeout = 15_000) {
  const t0 = Date.now()
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null)
    if (v) return v
    if (Date.now() - t0 > timeout) return null
    await sleep(20)
  }
}

/* In the page, frame by frame from now: the panel's look, whether the list or a skeleton was drawn, and when `done` first matched. */
const WATCH = `window.__frames = (done, ms) => new Promise((resolve) => {
  const t0 = performance.now(); const out = []; let hit = -1; let header = -1
  const visible = (sel) => [...document.querySelectorAll(sel)].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  const step = () => {
    const d = document.querySelector("[data-community-messages]")
    const t = Math.round(performance.now() - t0)
    if (d) { const cs = getComputedStyle(d); const r = d.getBoundingClientRect(); out.push({ t, o: Math.round(parseFloat(cs.opacity) * 100) / 100, x: Math.round(r.left), y: Math.round(r.top), tf: cs.transform, tr: cs.translate, sc: cs.scale, list: visible("[data-community-messages] [data-messages-new]"), skel: visible("[data-community-messages] [data-chat-skeleton], [data-community-messages] [data-messages-skeleton]") }) }
    else out.push({ t, gone: true })
    if (header < 0 && document.querySelector("[data-community-messages] [data-person-link]")) header = t
    if (hit < 0 && done && document.querySelector(done)) hit = t
    if (performance.now() - t0 < ms) requestAnimationFrame(step); else resolve({ frames: out, hit, header })
  }
  requestAnimationFrame(step)
})`
async function frames(page, done, ms, act) {
  await page.evaluate((w, d, m) => {
    eval(w)
    window.__seen = null
    void window.__frames(d, m).then((r) => (window.__seen = r))
  }, WATCH, done, ms)
  await act()
  return until(page, () => window.__seen, null, ms + 8000)
}

const BUBBLE = "[data-community-messages] [data-chat-message]:not([data-chat-message^='local-'])"

/* The composer's parts, measured. */
async function composer(page, scope) {
  return page.evaluate((scope) => {
    const q = (s) => document.querySelector(`${scope} ${s}`)
    const box = (e) => {
      if (!e) return null
      const r = e.getBoundingClientRect()
      return r.width ? { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), mid: Math.round((r.top + r.bottom) / 2) } : null
    }
    const field = box(q("[data-chat-field]"))
    const text = box(q("[data-chat-field] textarea"))
    const parts = { attach: box(q("[data-chat-attach]")), field, text, gif: box(q("[data-composer-gif]")), emoji: box(q("[data-emoji-trigger]") || q("[data-chat-emoji]")), send: box(q("[data-chat-send]")) }
    const gifEl = q("[data-composer-gif]")
    return { ...parts, gifText: gifEl ? gifEl.textContent.trim() : null, gifSvg: !!gifEl?.querySelector("svg") }
  }, scope)
}

function judgeComposer(where, c) {
  note(`${where} composer`, c)
  const buttons = ["attach", "gif", "emoji", "send"].filter((k) => c[k])
  expect(buttons.every((k) => c[k].h === 40 && c[k].w === 40), `${where}: attach, GIF, emoji and Send are 40px squares`, buttons.map((k) => `${k} ${c[k]?.w}x${c[k]?.h}`))
  expect(!!c.field && c.field.h === 40, `${where}: the field is 40px tall with one line`, c.field?.h)
  expect(!!c.field && buttons.every((k) => Math.abs(c[k].mid - c.field.mid) <= 1), `${where}: every button's middle on the field's middle`, buttons.map((k) => c[k].mid - (c.field?.mid ?? 0)))
  expect(!!c.gif && !!c.emoji && c.gif.r <= c.emoji.l && c.emoji.r <= c.field.r && c.field.r - c.emoji.r <= 2, `${where}: GIF then emoji at the field's right end, nothing in its middle`, c.field && c.emoji ? { fieldRight: c.field.r, emojiRight: c.emoji.r, gifRight: c.gif?.r, emojiLeft: c.emoji.l } : null)
  expect(!!c.text && !!c.gif && c.gif.l - c.text.r <= 2, `${where}: the words reach the GIF button (the box is as wide as the field)`, c.text && c.gif ? c.gif.l - c.text.r : null)
  expect(c.gifSvg, `${where}: GIF is an icon like the emoji, not bold letters`, c.gifText)
  expect(!!c.attach && !!c.send && c.attach.r < c.field.l && c.send.l > c.field.r, `${where}: attach left of the field, Send right of it`)
}

const VIEWS = [
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]
const numbers = {}

/* ONLY_VIEW=1440|390 and ONLY_THEME=light|dark run a part of it. */
const onlyView = ([l]) => !process.env.ONLY_VIEW || l === process.env.ONLY_VIEW
const themes = ["light", "dark"].filter((t) => !process.env.ONLY_THEME || t === process.env.ONLY_THEME)
for (const [label, vp] of VIEWS.filter(onlyView)) {
  for (const theme of themes) {
    console.log(`\nThe conversation, ${label}, ${theme}`)
    const server = makeServer()
    const { page, errors } = await open(server, vp, { theme })

    /* OPEN FROM A PROFILE, cold: nothing kept, nothing asked before. */
    const cold = await frames(page, BUBBLE, 1500, () => page.click("[data-probe-profile-message]"))
    const coldListed = cold.frames.some((f) => f.list)
    note("open from the profile, cold (ms to header, ms to first bubble, list drawn on the way)", { header: cold.header, bubble: cold.hit, list: coldListed })
    expect(!coldListed, "opened from a profile, the list is never drawn on the way to the conversation")
    const coldPanel = cold.frames.find((f) => !f.gone)?.t ?? -1
    expect(cold.header >= 0 && cold.header === coldPanel, "the conversation's header is drawn in the panel's first frame (its name is known from the profile)", { panel: coldPanel, header: cold.header })
    expect(cold.hit >= 0 && cold.hit <= READ_MS + 250, "its messages after one round trip (the conversation and its page in one answer)", cold.hit)
    numbers[`${label}-${theme}-profileCold`] = { panel: coldPanel, header: cold.header, bubble: cold.hit, list: coldListed }
    await until(page, (s) => !!document.querySelector(s), BUBBLE)
    await sleep(400)

    /* MOTION, opening: from the bar's Messages button, the panel's frames. */
    const shotFile = join(shots, `thread-${label}-${theme}.png`)
    await page.screenshot({ path: shotFile })
    console.log(`    ${shotFile}`)

    /* COMPOSER, in the conversation. */
    const c = await composer(page, "[data-community-messages]")
    judgeComposer(`conversation ${label}`, c)
    numbers[`${label}-${theme}-composer-dm`] = c
    const formShot = join(shots, `composer-dm-${label}-${theme}.png`)
    const form = await page.$("[data-community-messages] [data-chat-form]")
    if (form) await form.screenshot({ path: formShot })
    console.log(`    ${formShot}`)

    /* STATES: a message sent, then delivered over realtime, then seen. */
    const conv = CONVS[0].id
    await page.focus("[data-community-messages] [data-chat-form] textarea")
    await page.keyboard.type("Thursday works, see you there")
    if (label === "390") await page.click("[data-community-messages] [data-chat-send]")
    else await page.keyboard.press("Enter")
    const sentId = await until(page, () => {
      const els = [...document.querySelectorAll("[data-community-messages] [data-chat-message][data-mine]")]
      const last = els.pop()
      return last && !last.getAttribute("data-state") ? last.getAttribute("data-chat-message") : null
    })
    const ticks = () => page.evaluate((id) => {
      const el = document.querySelector(`[data-chat-message="${id}"]`)
      const all = [...document.querySelectorAll("[data-community-messages] [data-chat-message][data-mine]")].map((e) => e.querySelector("[data-tick]")?.getAttribute("data-tick") ?? [...e.querySelectorAll("[aria-label]")].map((a) => a.getAttribute("aria-label")).join("/"))
      return { tick: el?.querySelector("[data-tick]")?.getAttribute("data-tick") ?? [...(el?.querySelectorAll("[aria-label]") ?? [])].map((a) => a.getAttribute("aria-label")).join("/"), under: document.querySelector("[data-community-messages] [data-chat-seen]")?.textContent ?? null, all }
    }, sentId)
    const sent = await ticks()
    await page.evaluate((row) => window.__emit("community_conversations", row), { id: conv, user_a: ME.id, user_b: MINU.id, a_read_at: new Date().toISOString(), b_read_at: ago(120), a_delivered_at: null, b_delivered_at: new Date(Date.now() + 1000).toISOString() })
    await sleep(120)
    const delivered = await ticks()
    await page.evaluate((row) => window.__emit("community_conversations", row), { id: conv, user_a: ME.id, user_b: MINU.id, a_read_at: new Date().toISOString(), b_read_at: new Date(Date.now() + 1000).toISOString(), a_delivered_at: null, b_delivered_at: new Date(Date.now() + 1000).toISOString() })
    await sleep(120)
    const seen = await ticks()
    note("own message: sent, delivered, seen", { sent, delivered, seen })
    expect(sent.tick === "sent", "sent: one tick", sent.tick)
    expect(delivered.tick === "delivered", "delivered over realtime: two ticks", delivered.tick)
    expect(seen.tick === "seen" && seen.under === "Seen", "seen: the ticks lit, and Seen under the last one", [seen.tick, seen.under])
    expect(sent.all.slice(0, -1).every((t) => t === "seen" || t === "delivered"), "older own messages carry their own state (here: seen or delivered by the marks the page came with)", sent.all)
    numbers[`${label}-${theme}-states`] = { sent: sent.tick, delivered: delivered.tick, seen: seen.tick, under: seen.under }
    const stateShot = join(shots, `states-${label}-${theme}.png`)
    await page.screenshot({ path: stateShot })
    console.log(`    ${stateShot}`)

    /* PRESENCE and TYPING in the header. */
    const status = () => page.evaluate(() => {
      const s = document.querySelector("[data-community-messages] [data-chat-status]")
      const dot = document.querySelector("[data-community-messages] [data-thread] [data-online-dot]")
      const head = document.querySelector("[data-community-messages] [data-thread] [data-person-link]")
      return { status: s?.textContent ?? null, dot: !!dot, head: head?.textContent ?? null }
    })
    const seenBefore = await status()
    const presenceTopic = (await page.evaluate(() => window.__joined)).find((t) => t === `online:${CID}:${MINU.id}`) ?? null
    if (presenceTopic) await page.evaluate((t, k) => window.__presence(t, [k]), presenceTopic, MINU.id)
    await sleep(80)
    const online = await status()
    if (presenceTopic) await page.evaluate((t) => window.__presence(t, []), presenceTopic)
    await sleep(80)
    const gone = await status()
    await page.evaluate((t, id) => window.__broadcast(t, "typing", { id, name: "Minu", on: true }), `chat:dm:${conv}`, MINU.id)
    await sleep(80)
    const typing = await status()
    const typingAbove = await page.evaluate(() => document.querySelector("[data-community-messages] [data-chat-typing]")?.textContent ?? null)
    note("header: before, online, gone, typing", { seenBefore, online, gone, typing, typingAbove, presenceTopic, tracked: await page.evaluate(() => window.__tracked) })
    expect(/Last seen/.test(seenBefore.status ?? ""), "the header says when they were last seen, from the server's mark", seenBefore.status)
    expect(online.status === "Online" && online.dot, "online now: the header says so and their picture has the dot", online)
    expect(/Last seen just now/.test(gone.status ?? "") && !gone.dot, "gone: last seen just now, no dot", gone)
    expect(/typing/.test(typing.status ?? "") && /typing/.test(typingAbove ?? ""), "typing shows in the header and above the box", [typing.status, typingAbove])
    numbers[`${label}-${theme}-presence`] = { before: seenBefore.status, online: online.status, dot: online.dot, gone: gone.status, typing: typing.status }
    const tracked = await page.evaluate((t) => window.__tracked.some((x) => x.topic === t), `online:${CID}:${ME.id}`)
    expect(tracked, "the page says it is here on the member's own presence topic")
    const headShot = join(shots, `header-typing-${label}-${theme}.png`)
    await page.screenshot({ path: headShot, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 260) } })
    console.log(`    ${headShot}`)

    /* PICTURE: picked, previewed, uploaded, sent, drawn. */
    const input = await page.$("[data-community-messages] [data-chat-form] input[type=file]")
    const t0 = Date.now()
    await input.uploadFile(PHOTO)
    const preview = await until(page, () => {
      const el = document.querySelector("[data-community-messages] [data-chat-upload]")
      return el ? { state: el.getAttribute("data-chat-upload"), img: !!el.querySelector("img") } : null
    })
    const previewMs = Date.now() - t0
    const done = await until(page, () => document.querySelector("[data-community-messages] [data-chat-upload='done']") ? true : null)
    const doneMs = Date.now() - t0
    const sendOn = await page.evaluate(() => !document.querySelector("[data-community-messages] [data-chat-send]").disabled)
    const trayShot = join(shots, `picture-tray-${label}-${theme}.png`)
    if (form) await (await page.$("[data-community-messages] [data-chat-form]")).screenshot({ path: trayShot })
    console.log(`    ${trayShot}`)
    const before = server.posts.length
    await page.click("[data-community-messages] [data-chat-send]")
    await until(page, () => !!document.querySelector("[data-community-messages] [data-chat-message]:not([data-state]) [data-chat-picture] img"))
    await sleep(600)
    const pic = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("[data-community-messages] [data-chat-picture] img")]
      const img = imgs.pop()
      const box = img?.closest("[data-chat-picture]")?.getBoundingClientRect()
      return img ? { src: img.currentSrc.slice(0, 60), srcset: img.getAttribute("srcset"), sizes: img.getAttribute("sizes"), w: Math.round(box.width), h: Math.round(box.height), loaded: img.complete && img.naturalWidth > 0 } : null
    })
    const body = server.posts[server.posts.length - 1]
    note("picture: preview, upload, send, bubble", { previewMs, doneMs, preview, sendOn, uploads: server.uploaded.map((u) => ({ type: u.type, url: u.url.slice(-40) })), carried: body?.attachments, pic })
    expect(!!preview && preview.img, "the picture shows in the box the moment it is picked", preview)
    expect(!!done && sendOn, "uploaded, Send is on", { done, sendOn })
    expect(server.uploaded.length === 1 && /webp|jpeg/.test(server.uploaded[0].type ?? ""), "it went to storage made lighter (WebP or JPEG, not the PNG picked)", server.uploaded[0]?.type)
    expect(Array.isArray(body?.attachments) && body.attachments[0]?.type === "image" && body.attachments[0]?.w === 1600, "the send carries the picture with its size", body?.attachments)
    expect(!!pic && pic.loaded && Math.abs(pic.w / pic.h - 1.6) < 0.05, "the bubble draws it at its own shape, from the file picked (no second download)", pic)
    const theirs = await page.evaluate(() => {
      const img = [...document.querySelectorAll("[data-community-messages] [data-chat-message]:not([data-mine]) [data-chat-picture] img")][0]
      return img ? { src: img.getAttribute("src").slice(0, 40), srcset: (img.getAttribute("srcset") || "").split(", ").map((x) => x.split(" ")[1]), sizes: img.getAttribute("sizes") } : null
    })
    note("a picture somebody else sent", theirs)
    expect(!!theirs && theirs.src.startsWith("/_next/image") && theirs.srcset.join() === "384w,640w,828w", "somebody else's picture comes from the optimizer at the bubble's width, with a srcset", theirs)
    /* SENT BEFORE IT FINISHED UPLOADING: Send is pressable at once; the bubble is up with the picture picked, and the server gets the uploaded one. */
    const input2 = await page.$("[data-community-messages] [data-chat-form] input[type=file]")
    const posted0 = server.posts.length
    await input2.uploadFile(PHOTO)
    await until(page, () => !!document.querySelector("[data-community-messages] [data-chat-upload='sending']"))
    const sendWhile = await page.evaluate(() => !document.querySelector("[data-community-messages] [data-chat-send]").disabled)
    const t1 = Date.now()
    await page.click("[data-community-messages] [data-chat-send]")
    const early = await until(page, () => {
      const img = [...document.querySelectorAll("[data-community-messages] [data-chat-message][data-state='sending'] [data-chat-picture] img")].pop()
      const box = img?.closest("[data-chat-picture]")?.getBoundingClientRect()
      return img ? { blob: img.getAttribute("src").startsWith("blob:"), w: Math.round(box.width), h: Math.round(box.height) } : null
    })
    const earlyMs = Date.now() - t1
    const trayGone = await page.evaluate(() => !document.querySelector("[data-community-messages] [data-chat-upload]"))
    for (let i = 0; i < 200 && server.posts.length === posted0; i++) await sleep(25)
    const sentLate = server.posts[server.posts.length - 1]
    const calm = await until(page, () => ![...document.querySelectorAll("[data-community-messages] [data-chat-message][data-mine]")].some((e) => e.getAttribute("data-state")))
    note("a picture sent while still uploading", { sendWhile, earlyMs, early, trayGone, carried: sentLate?.attachments?.map((a) => a.url.slice(0, 48)), settled: !!calm })
    expect(sendWhile, "Send is on while a picture is still uploading")
    expect(!!early && early.blob && Math.abs(early.w / early.h - 1.6) < 0.05 && earlyMs < 400, "pressed, the bubble is up at once with the picture picked, at its shape", { earlyMs, early })
    expect(server.posts.length > posted0 && /^https:\/\/storelib\.com\/media\/product-images\//.test(sentLate?.attachments?.[0]?.url ?? "") && !!calm, "and the server gets the uploaded picture once it is in; the bubble settles", sentLate?.attachments)
    numbers[`${label}-${theme}-picture`] = { previewMs, doneMs, srcset: !!pic?.srcset, shape: pic ? `${pic.w}x${pic.h}` : null, sentWhileUploadingMs: earlyMs }
    const picShot = join(shots, `picture-sent-${label}-${theme}.png`)
    await page.screenshot({ path: picShot })
    console.log(`    ${picShot}`)

    /* MOTION: closed, then opened from the bar, then closed again. */
    await page.keyboard.press("Escape")
    await until(page, () => !document.querySelector("[data-community-messages]"))
    await sleep(200)
    const opening = await frames(page, null, 520, () => page.click("[data-probe-open]"))
    await sleep(200)
    const closing = await frames(page, null, 520, () => page.keyboard.press("Escape"))
    const first = opening.frames.find((f) => !f.gone)
    const settled = opening.frames[opening.frames.length - 1]
    const goneAt = closing.frames.find((f) => f.gone)?.t ?? -1
    const usedTransform = [...opening.frames, ...closing.frames].some((f) => f.tf && f.tf !== "none")
    note("opening frames (t, opacity, x, y, translate, scale, transform)", opening.frames.filter((f, i) => i < 14).map((f) => (f.gone ? [f.t, "gone"] : [f.t, f.o, f.x, f.y, f.tr, f.sc, f.tf])))
    note("closing frames", closing.frames.filter((f, i) => i < 14).map((f) => (f.gone ? [f.t, "gone"] : [f.t, f.o, f.x, f.y, f.tr, f.sc, f.tf])))
    /* A computer's panel fades in; a phone's sheet rises from below the screen at full strength (the app's sheets). */
    expect(!!first && (first.o < 0.5 || first.y >= vp.height * 0.9), "opening: the first frame is faint or below the screen (no flash of the whole panel in place)", first ? { o: first.o, y: first.y } : null)
    expect(settled && !settled.gone && settled.o === 1, "opening: settled at full strength", settled?.o)
    expect(!usedTransform, "the motion is translate, scale and opacity; transform is never used", usedTransform)
    expect(goneAt > 120 && goneAt < 360, "closing: eased out, gone in under 360ms", goneAt)
    const closingFrames = closing.frames.filter((f) => !f.gone)
    expect(closingFrames.length > 3 && closingFrames.every((f, i) => i === 0 || f.o <= closingFrames[i - 1].o + 0.01), "closing: fades without a flicker", closingFrames.map((f) => f.o))
    numbers[`${label}-${theme}-motion`] = { firstOpacity: first?.o, goneAt, transform: usedTransform }

    /* OPEN FROM A PROFILE, with the pointer resting on Message first: the conversation is asked for ahead. */
    await until(page, () => !document.querySelector("[data-community-messages]"))
    const server2 = makeServer()
    const again = await open(server2, vp, { theme })
    if (!vp.hasTouch) await again.page.hover("[data-probe-profile-message]")
    else await again.page.evaluate(() => document.querySelector("[data-probe-profile-message]").dispatchEvent(new TouchEvent("touchstart", { bubbles: true })))
    await sleep(READ_MS * 2 + 200)
    if (process.env.DEBUG) await again.page.evaluate(() => { window.__dbg = true; console.log("click at", Math.round(performance.now())); document.addEventListener("click", () => console.log("clicked", Math.round(performance.now())), true) })
    let prof = null
    if (process.env.PROFILE === "warm") {
      prof = await again.page.createCDPSession()
      await prof.send("Profiler.enable")
      await prof.send("Profiler.setSamplingInterval", { interval: 200 })
      await prof.send("Profiler.start")
    }
    const warm = await frames(again.page, BUBBLE, 1200, () => again.page.click("[data-probe-profile-message]"))
    if (prof) {
      const { profile } = await prof.send("Profiler.stop")
      const self = new Map()
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      profile.samples.forEach((id, i) => {
        const n = byId.get(id)
        const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`
        self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0))
      })
      console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `      ${(v / 1000).toFixed(1)}ms ${k}`).join("\n"))
    }
    const warmPanel = warm.frames.find((f) => !f.gone)?.t ?? -1
    note("open from the profile after a hover (ms to the panel, header, first bubble)", { panel: warmPanel, header: warm.header, bubble: warm.hit, list: warm.frames.some((f) => f.list), skeleton: warm.frames.some((f) => f.skel), made: server2.opened, found: server2.found ?? 0 })
    expect(warm.hit >= 0 && warm.hit === warmPanel, "hovered first, the messages are in the panel's first frame", { panel: warmPanel, bubble: warm.hit })
    expect(!warm.frames.some((f) => f.skel), "and no skeleton on the way")
    expect(server2.opened === 0 && server2.found === 1, "the hover found the conversation without making or counting one (GET ?with=), once", { made: server2.opened, found: server2.found })
    numbers[`${label}-${theme}-profileWarm`] = { panel: warmPanel, header: warm.header, bubble: warm.hit }

    /* OPEN FROM THE LIST. */
    await again.page.keyboard.press("Escape")
    await until(again.page, () => !document.querySelector("[data-community-messages]"))
    await sleep(200)
    await again.page.click("[data-probe-open]")
    await until(again.page, () => !!document.querySelector(`[data-conversation="${"c0c0c0c0-0000-4000-8000-000000000003"}"]`))
    await sleep(READ_MS + 300)
    const fromList = await frames(again.page, BUBBLE, 1200, () => again.page.$eval(`[data-conversation="c0c0c0c0-0000-4000-8000-000000000001"]`, (el) => el.click()))
    note("open from the list (ms to first bubble)", { bubble: fromList.hit, skeleton: fromList.frames.some((f) => f.skel) })
    numbers[`${label}-${theme}-fromList`] = { bubble: fromList.hit }
    expect(fromList.hit >= 0 && fromList.hit <= 60 && !fromList.frames.some((f) => f.skel), "from the list, kept: the first bubble within a few frames, no skeleton", fromList.hit)

    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: innerWidth }))
    expect(w.doc <= w.view, "nothing wider than the screen", w)
    expect(errors.length === 0 && again.errors.length === 0, "no page errors", [...errors, ...again.errors])
    await page.close()
    await again.page.close()
  }

  for (const theme of themes) {
    console.log(`\nThe Chat tab, ${label}, ${theme}`)
    const server = makeServer()
    const { page, errors } = await open(server, vp, { mode: "tab", theme })
    await until(page, () => !!document.querySelector("[data-chat] [data-chat-form] textarea"))
    await sleep(1600)
    const c = await composer(page, "[data-chat]")
    judgeComposer(`Chat tab ${label}`, c)
    numbers[`${label}-${theme}-composer-tab`] = c
    const formShot = join(shots, `composer-tab-${label}-${theme}.png`)
    const form = await page.$("[data-chat] [data-chat-form]")
    if (form) await form.screenshot({ path: formShot })
    console.log(`    ${formShot}`)
    const tabShot = join(shots, `tab-${label}-${theme}.png`)
    await page.screenshot({ path: tabShot })
    console.log(`    ${tabShot}`)
    expect(errors.length === 0, "no page errors", errors)
    await page.close()
  }
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
writeFileSync(join(shots, "numbers.json"), JSON.stringify(numbers, null, 2))
console.log(`\nNumbers: ${join(shots, "numbers.json")}`)
console.log(`Pictures: ${shots}`)
if (!BEFORE) {
  console.log(broken ? `\n${broken} FAILED` : "\nall ok")
  process.exit(broken ? 1 : 0)
}
