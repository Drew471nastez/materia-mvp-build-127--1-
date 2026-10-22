/**
 * ===========================================================================
 *  ROUND 38'S COMMUNITY CHAT, MEASURED: SPEED AND RICH CONTENT
 * ===========================================================================
 * The member's real Messages panel (scripts/render-community-chat-r38.tsx:
 * messages.tsx, chat-surface.tsx) in headless Chromium at 1440x900 and on a
 * 390x844 phone, at full speed and with the CPU slowed four times, against
 * a server in this script that answers the chat routes the way the real
 * ones do, READ_MS late for a read and SEND_MS late for a send (300 and 250
 * by default, what a phone on a good connection sees from the real routes).
 *
 * Every number is taken in the page, frame by frame (requestAnimationFrame):
 *
 *   LIST      the panel opened the first time; Back from a conversation; the
 *             panel closed and opened again; the page loaded again in the
 *             same tab. How long until the rows are drawn, and whether a
 *             skeleton or a spinner was ever on screen on the way.
 *   OPEN      a conversation opened cold (nothing kept, nothing asked
 *             before), opened right after the list drew (the top rows are
 *             asked for while the list is read), and opened again. Time to
 *             the first real bubble, a skeleton or a spinner seen, and how
 *             far the newest message moved in the frames after it was drawn.
 *   SEND      the key that sends to the frame the bubble is in, in frames
 *             and milliseconds; the box empty and still focused in that
 *             frame; the list pinned to the bottom.
 *   RICH      a YouTube link as a still with a play button that becomes the
 *             youtube-nocookie player on a press; a link card with its
 *             title, words and picture, in a box of its own size; an
 *             uploaded GIF still a GIF; a video in its box; links with
 *             rel=noopener noreferrer nofollow and target _blank, and a
 *             javascript: address never made a link; the emoji and GIF
 *             buttons in the box, and a pasted link previewed above it.
 *
 *   PROBE_CSS=source node scripts/check-community-chat-r38.mjs
 *   READ_MS=600 SEND_MS=400 to try a slower connection. BEFORE=1 only prints
 *   the numbers (for a run on the code before this round), no checks.
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const READ_MS = Number(process.env.READ_MS || 300)
const SEND_MS = Number(process.env.SEND_MS || 250)
const BEFORE = !!process.env.BEFORE
const stubs = join(root, ".community-chat-r38-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-chat-r38-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  if (BEFORE) return
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const svg = (a, b, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="${b}"/></svg>`
/* A 2 frame GIF, 4x4: red then blue. */
const GIF = Buffer.from("R0lGODlhBAAEAPABAP8AAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAABAAEAAACBISPqVcAIfkEAAoAAAAsAAAAAAQABACAAAD/AAAAAgSEj6lXADs=", "base64")

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(stubs, "supabase-client.js"), `const handlers = []
window.__emit = (table, row, eventType = "INSERT") => {
  for (const h of handlers) {
    if (h.gone || h.type !== "postgres_changes" || h.filter.table !== table) continue
    const m = /^(\\w+)=eq\\.(.+)$/.exec(h.filter.filter || "")
    if (m && String(row[m[1]]) !== m[2]) continue
    h.cb({ eventType, new: row })
  }
}
export const isNativePlatform = () => false
export function createClient() {
  return {
    realtime: { setAuth: async () => {} },
    channel(name, opts) {
      const mine = []
      const ch = {
        on(type, filter, cb) { const h = { type, filter, cb, gone: false }; mine.push(h); handlers.push(h); return ch },
        subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return ch },
        send() { return Promise.resolve("ok") },
        _gone() { mine.forEach((h) => (h.gone = true)) },
      }
      return ch
    },
    removeChannel(ch) { ch && ch._gone && ch._gone() },
    storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) } } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  }
}
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-chat-r38.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.community-chat-r38-probe/navigation.js", "next/link": "./.community-chat-r38-probe/link.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const css = await appCss(root)
const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const fonts = interFaces(root)
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}\n//# sourceURL=chat-app.js</script></body></html>`

/* ── The server ─────────────────────────────────────────────────────────── */

const ME = { id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "Ana Ruiz" }
const NAMES = ["Ben Okafor", "Cleo Park", "Dev Shah", "Eli Moreau", "Fay Lin", "Gus Novak", "Hana Ito", "Ivo Petrov"]
const PEOPLE = NAMES.map((name, i) => ({ id: `bbbbbbbb-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, name, username: name.split(" ")[0].toLowerCase(), avatarUrl: null, role: "member" }))
const CONVS = PEOPLE.map((other, i) => ({ id: `c0c0c0c0-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, other }))
const ago = (n) => new Date(Date.now() - n * 60_000).toISOString()
const PIC = `${ORIGIN}/pic/1.svg`

function seedRows(conv, i) {
  const rows = Array.from({ length: 40 }, (_, k) => ({
    id: `${conv.id.slice(0, 24)}${String(k).padStart(12, "0")}`,
    author: k % 3 === 0 ? ME.id : conv.other.id,
    body: k % 5 === 2 ? "That works for me. I will bring the notes from last week and we can go through the open questions one by one." : `Message ${k} with ${conv.other.name.split(" ")[0]}`,
    attachments: [],
    createdAt: ago(600 - k * 6 - i),
  }))
  /* The newest conversation, the top row, carries the rich messages. */
  if (i === NAMES.length - 1) {
    const n = rows.length
    rows[n - 6].body = "Have you seen this talk? https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    rows[n - 5].body = "The write up is here https://example.com/notes/round-38"
    rows[n - 5].attachments = [{ type: "link", url: "https://example.com/notes/round-38", title: "Round 38 notes: what changed in the chat", description: "Caching, prefetching and rich messages, measured at 1440 and 390.", image: `${ORIGIN}/pic/card.svg`, site: "example.com" }]
    rows[n - 4].body = ""
    rows[n - 4].attachments = [{ type: "image", url: `${ORIGIN}/pic/party.gif`, w: 480, h: 270 }]
    rows[n - 3].body = "Clip from the session"
    rows[n - 3].attachments = [{ type: "file", assetId: "f1f1f1f1-0000-4000-8000-000000000001", name: "session.mp4", size: 2_400_000, store: "community" }]
    rows[n - 2].body = "Careful javascript:alert(1) is not a link, but https://storelib.com is"
    rows[n - 1].body = ""
    rows[n - 1].attachments = [{ type: "image", url: PIC, w: 1200, h: 800 }]
  }
  return rows
}

function makeServer() {
  const s = { chats: new Map(CONVS.map((c, i) => [c.id, seedRows(c, i)])), asked: [], posts: [] }
  const view = (r, convId) => ({
    id: r.id, conversationId: convId, authorId: r.author, author: r.author === ME.id ? { id: ME.id, name: ME.name, username: "ana", avatarUrl: null, role: "member", level: 1 } : { ...CONVS.find((c) => c.id === convId).other, level: 1 },
    mine: r.author === ME.id, body: r.body, attachments: r.attachments ?? [], replyTo: null, clientId: r.clientId ?? null, createdAt: r.createdAt, editedAt: null, canEdit: r.author === ME.id, canDelete: r.author === ME.id, canModerate: false,
  })
  s.handle = (r) => {
    const url = new URL(r.url())
    const path = url.pathname.replace(`/api/community/${CID}`, "")
    const method = r.method()
    s.asked.push(`${method} ${path}${url.search}`)
    const json = (body, status = 200, wait = READ_MS) => setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}), wait + Math.round(Math.random() * 40))
    if (path === "/chat" && method === "GET") return json({ ready: true, rules: "", rulesVersion: 0, needsRules: false, dmPolicy: "everyone", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: ME.name, canStartGroups: true })
    if (path === "/dms" && method === "GET") {
      const conversations = CONVS.map((c) => {
        const rows = s.chats.get(c.id)
        const last = rows[rows.length - 1]
        return { id: c.id, other: c.other, lastBody: last.body || "Photo", lastAt: last.createdAt, lastFromMe: last.author === ME.id, unread: last.author !== ME.id, muted: false }
      }).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      return json({ ready: true, conversations, groups: [], unread: 2 }, 200, s.listWait ?? READ_MS)
    }
    const m = /^\/dms\/([0-9a-f-]{36})$/.exec(path)
    if (m && method === "GET") {
      const rows = [...(s.chats.get(m[1]) ?? [])].sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1))
      const after = url.searchParams.get("after")
      const before = url.searchParams.get("before")
      if (after) return json({ messages: rows.filter((x) => x.createdAt > after).map((x) => view(x, m[1])), hasMore: false, otherReadAt: null }, 200, Math.round(READ_MS / 2))
      if (before) return json({ messages: rows.filter((x) => x.createdAt < before).slice(-50).map((x) => view(x, m[1])), hasMore: false, otherReadAt: null })
      return json({ messages: rows.slice(-50).map((x) => view(x, m[1])), hasMore: rows.length > 50, otherReadAt: null })
    }
    if (m && method === "POST") {
      const body = JSON.parse(r.postData() || "{}")
      s.posts.push(body)
      const rows = s.chats.get(m[1])
      const row = { id: randomUUID(), author: ME.id, body: body.body, attachments: body.attachments ?? [], clientId: body.clientId, createdAt: new Date().toISOString() }
      rows.push(row)
      return json({ message: view(row, m[1]) }, 201, SEND_MS)
    }
    if (path.endsWith("/read")) return json({ ok: true }, 200, 80)
    if (path.startsWith("/chat/prefs")) return json({ notify: "default", mutedUntil: null }, 200, 120)
    if (path.startsWith("/chat/blocks")) return json({ blocked: false }, 200, 120)
    if (path.startsWith("/chat/unfurl")) {
      const u = url.searchParams.get("url") || ""
      return json({ card: { url: u, title: "A page worth reading", description: "What the page says about itself, read by the server.", image: `${ORIGIN}/pic/card.svg`, site: new URL(u).hostname.replace(/^www\./, ""), sig: "probe" } }, 200, 200)
    }
    if (path.startsWith("/gifs")) return json({ connected: false, gifs: [], next: null }, 200, 100)
    /* No video bytes here: headless Chromium has no H.264, and an empty mp4 can hold its main thread. The box is what is measured. */
    if (path.startsWith("/chat/files")) return r.respond({ status: 404, contentType: "text/plain", body: "" }).catch(() => {})
    if (path.startsWith("/members")) return json({ members: [] }, 200, 100)
    return json({ error: "not_found" }, 404, 20)
  }
  return s
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], protocolTimeout: 60_000 })

/* In the page: a frame by frame watch, from now until `done` matches, of whether a skeleton or a spinner was drawn on the way. */
const WATCH = () => {
  window.__watch = (done, opts = {}) =>
    new Promise((resolve) => {
      const t0 = performance.now()
      let frames = 0
      let skeleton = false
      let spinner = false
      const visible = (sel) => [...document.querySelectorAll(sel)].some((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(e).opacity !== "0"
      })
      /* Frames are counted by requestAnimationFrame; the look is also taken on a short timer, so a page that draws no frame is still watched. */
      let alive = true
      const count = () => {
        frames++
        if (alive) requestAnimationFrame(count)
      }
      requestAnimationFrame(count)
      const tick = () => {
        if (visible("[data-chat-skeleton], [data-messages-skeleton], [aria-label='Loading conversations']")) skeleton = true
        if (visible("[data-chat-surface] .activity-spinner, [data-community-messages] .activity-spinner")) spinner = true
        if (document.querySelector(done)) {
          alive = false
          return resolve({ ms: Math.round(performance.now() - t0), frames, skeleton, spinner })
        }
        if (performance.now() - t0 > (opts.timeout ?? 8000)) {
          alive = false
          return resolve({ ms: -1, frames, skeleton, spinner })
        }
        setTimeout(tick, 4)
      }
      tick()
    })
  /* How far the newest bubble moves in the frames after it is first drawn (a layout jump), and the list's gap to the bottom. */
  window.__steady = (n = 20) =>
    new Promise((resolve) => {
      const list = document.querySelector("[data-community-messages] [data-chat-list]")
      const last = () => [...document.querySelectorAll("[data-community-messages] [data-chat-message]")].pop()
      const y0 = last()?.getBoundingClientRect().bottom ?? 0
      let moved = 0
      let k = 0
      const tick = () => {
        const y = last()?.getBoundingClientRect().bottom ?? y0
        moved = Math.max(moved, Math.abs(y - y0))
        if (++k >= n) return resolve({ moved: Math.round(moved), gap: list ? Math.round(list.scrollHeight - list.scrollTop - list.clientHeight) : -1 })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  /* The send: from the key's keydown to the frame the new bubble is drawn in. */
  window.__sendWatch = () =>
    new Promise((resolve) => {
      let t0 = 0
      let f0 = 0
      let frame = 0
      const count = () => {
        frame++
        raf = requestAnimationFrame(count)
      }
      let raf = requestAnimationFrame(count)
      const onKey = (e) => {
        if (e.key === "Enter" || e.type === "pointerdown") {
          t0 = performance.now()
          f0 = frame
        }
      }
      document.addEventListener("keydown", onKey, true)
      document.addEventListener("pointerdown", onKey, true)
      const known = new Set([...document.querySelectorAll("[data-chat-message]")].map((e) => e.getAttribute("data-chat-message")))
      const mo = new MutationObserver(() => {
        const fresh = [...document.querySelectorAll("[data-chat-message]")].find((e) => !known.has(e.getAttribute("data-chat-message")))
        if (!fresh || !t0) return
        mo.disconnect()
        const box = document.querySelector("[data-chat-form] textarea")
        const at = performance.now()
        requestAnimationFrame(() => {
          cancelAnimationFrame(raf)
          document.removeEventListener("keydown", onKey, true)
          document.removeEventListener("pointerdown", onKey, true)
          resolve({ ms: Math.round((at - t0) * 10) / 10, frames: frame - f0, empty: box?.value === "", focused: document.activeElement === box, state: fresh.getAttribute("data-state") })
        })
      })
      mo.observe(document.body, { childList: true, subtree: true })
    })
}

async function open(server, viewport, cpu, theme = "light", page = null) {
  page = page ?? (await browser.newPage())
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) page.on("console", (m) => console.log("    [page]", m.text()))
  await page.evaluateOnNewDocument(WATCH)
  await page.evaluateOnNewDocument((p, t) => {
    window.__probe = p
    /* The dark look as lib/appearance sets it on Storelib's own pages, once there is an <html> to set it on. */
    if (t === "dark") document.addEventListener("DOMContentLoaded", () => document.documentElement.setAttribute("data-sl-dark", ""))
  }, { communityId: CID, me: ME }, theme)
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void server.handle(r)
    if (url.startsWith(`${ORIGIN}/pic/party.gif`)) return void r.respond({ status: 200, contentType: "image/gif", body: GIF }).catch(() => {})
    if (url.startsWith(`${ORIGIN}/pic/card`)) return void r.respond({ status: 200, contentType: "image/svg+xml", body: svg("#e9e4fb", "#8b5cf6", 1200, 630) }).catch(() => {})
    if (url.startsWith(`${ORIGIN}/pic/`)) return void r.respond({ status: 200, contentType: "image/svg+xml", body: svg("#dfe5ec", "#8796ab", 1200, 800) }).catch(() => {})
    if (url.startsWith("https://i.ytimg.com/")) return void r.respond({ status: 200, contentType: "image/svg+xml", body: svg("#1f2937", "#ef4444", 480, 360) }).catch(() => {})
    if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("https://www.youtube-nocookie.com/")) return void r.respond({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#000'></body>" }).catch(() => {})
    r.continue().catch(() => {})
  })
  if (cpu > 1) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  }
  await page.goto(`${ORIGIN}/community/studio-notes`, { waitUntil: "load" })
  await sel(page, "[data-probe-open]")
  await sleep(200)
  return { page, errors }
}

/*
  Waiting from here, with one short evaluate at a time: an evaluate that awaits a promise in the page (waitForFunction,
  waitForSelector, an awaited evaluate) could stall in this build of Chromium once the conversation was open, while a
  plain one answered at once.
*/
async function until(page, fn, arg, timeout = 20_000) {
  const t0 = Date.now()
  for (;;) {
    const v = await page.evaluate(fn, arg)
    if (v) return v
    if (Date.now() - t0 > timeout) return null
    await sleep(25)
  }
}
const sel = (page, s, timeout) => until(page, (q) => !!document.querySelector(q), s, timeout)

/* PROFILE=<step> (openAgain, listBack): where the page's time went in that step at 4x, by function, self time. */
async function profiled(page, cpu, step, run) {
  if (process.env.PROFILE !== step || cpu !== 4) return run()
  const prof = await page.createCDPSession()
  await prof.send("Profiler.enable")
  await prof.send("Profiler.setSamplingInterval", { interval: 200 })
  await prof.send("Profiler.start")
  const out = await run()
  await sleep(300)
  const { profile } = await prof.send("Profiler.stop")
  const self = new Map()
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  profile.samples.forEach((id, i) => {
    const n = byId.get(id)
    const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`
    self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0))
  })
  console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `      ${(v / 1000).toFixed(1)}ms ${k}`).join("\n"))
  return out
}

const med = (xs) => {
  const s = xs.filter((x) => x >= 0).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : -1
}
/* The i-th row of the list from the top (the list is newest first: the last of CONVS wrote last). */
const ROW = (i) => `[data-conversation="${CONVS[CONVS.length - 1 - i].id}"]`
const BUBBLE = "[data-community-messages] [data-chat-message]:not([data-chat-message^='local-'])"
/* Started in the page and left running there; its answer is read once it has one (an awaited evaluate across the press could stall). */
const watchAfter = async (page, done, act) => {
  await page.evaluate((d) => {
    window.__watched = null
    void window.__watch(d).then((r) => (window.__watched = r))
  }, done)
  await act()
  return until(page, () => window.__watched)
}
const steady = async (page, n) => {
  await page.evaluate((k) => {
    window.__still = null
    void window.__steady(k).then((r) => (window.__still = r))
  }, n)
  return until(page, () => window.__still)
}
const pressRow = (page, i) => page.$eval(ROW(i), (el) => el.click())

const report = []
for (const [label, viewport] of [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  for (const cpu of [1, 4]) {
    console.log(`\n${label}, CPU ${cpu}x, reads ${READ_MS}ms, sends ${SEND_MS}ms`)
    const server = makeServer()
    const { page, errors } = await open(server, viewport, cpu)
    const r = {}

    /* LIST, the first time */
    r.listFirst = await watchAfter(page, ROW(0), () => page.click("[data-probe-open]"))
    /* A person reads the list for a moment before they pick. */
    await sleep(700)
    /* OPEN, right after the list (row 1: the newest) */
    r.openTop = await watchAfter(page, BUBBLE, () => pressRow(page, 0))
    r.openTopSteady = await steady(page)
    if (cpu === 1) await page.screenshot({ path: join(shots, `${label}-thread.png`) })

    /* SEND, five times */
    const sends = []
    for (let i = 0; i < 5; i++) {
      const box = await page.$("[data-community-messages] [data-chat-form] textarea")
      await box.focus()
      await page.keyboard.type(`Quick one ${i}`, { delay: 0 })
      await page.evaluate(() => {
        window.__sent = null
        void window.__sendWatch().then((r) => (window.__sent = r))
      })
      if (viewport.isMobile) await page.$eval("[data-community-messages] [data-chat-send]", (b) => {
        b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        b.click()
      })
      else await page.keyboard.press("Enter")
      sends.push(await until(page, () => window.__sent))
      await sleep(350)
    }
    r.send = { ms: med(sends.map((s) => s.ms)), frames: med(sends.map((s) => s.frames)), empty: sends.every((s) => s.empty), focused: sends.every((s) => s.focused), pending: sends.every((s) => s.state === "sending") }
    await sleep(SEND_MS + 200)
    r.sentGap = await steady(page, 4)

    /* LIST, back from the conversation */
    r.listBack = await profiled(page, cpu, "listBack", () => watchAfter(page, ROW(0), () => page.click("[data-community-messages] button[aria-label='Back']")))
    /* OPEN again (kept) */
    await sleep(300)
    r.openAgain = await profiled(page, cpu, "openAgain", () => watchAfter(page, BUBBLE, () => pressRow(page, 0)))
    await page.click("[data-community-messages] button[aria-label='Back']")
    await sel(page, ROW(0))
    await sleep(300)
    /* OPEN cold: the last row, never asked for, pressed without a hover or a touch first */
    r.openCold = await watchAfter(page, BUBBLE, () => pressRow(page, CONVS.length - 1))
    r.openColdSteady = await steady(page)

    /* LIST, the panel closed and opened again */
    await page.keyboard.press("Escape")
    await sleep(400)
    r.listReopen = await watchAfter(page, ROW(0), () => page.click("[data-probe-open]"))

    /* LIST and OPEN after the page loads again in the same tab */
    await page.reload({ waitUntil: "load" })
    await sel(page, "[data-probe-open]")
    await sleep(200)
    r.listReload = await watchAfter(page, ROW(0), () => page.click("[data-probe-open]"))
    await sleep(50)
    r.openReload = await watchAfter(page, BUBBLE, () => pressRow(page, 0))

    /* The two skeletons, drawn: a conversation never opened, and the list in a tab that never read it. */
    if (cpu === 1) {
      await page.click("[data-community-messages] button[aria-label='Back']")
      await sel(page, ROW(0))
      await sleep(200)
      await pressRow(page, 5)
      await sleep(90)
      await page.screenshot({ path: join(shots, `${label}-cold-skeleton.png`) })
      await sel(page, BUBBLE)
      /* Past the kept list's own write (a moment after each answer), then a tab with nothing kept. */
      await sleep(900)
      await page.evaluate(() => sessionStorage.clear())
      server.listWait = 2500
      await page.reload({ waitUntil: "load" })
      await sel(page, "[data-probe-open]")
      await page.click("[data-probe-open]")
      await sleep(120)
      await page.screenshot({ path: join(shots, `${label}-list-skeleton.png`) })
      server.listWait = undefined
      await sel(page, ROW(0))
      await sleep(300)
      await page.screenshot({ path: join(shots, `${label}-list.png`) })
    }

    const line = (k) => `${k.padEnd(12)} ${String(r[k].ms).padStart(5)}ms  ${r[k].skeleton ? "skeleton" : "        "} ${r[k].spinner ? "SPINNER" : ""}`
    for (const k of ["listFirst", "listBack", "listReopen", "listReload", "openTop", "openAgain", "openCold", "openReload"]) console.log(`    ${line(k)}`)
    console.log(`    send         ${r.send.ms}ms, ${r.send.frames} frame(s) from the key to the bubble; box empty ${r.send.empty}, focused ${r.send.focused}; pinned gap ${r.sentGap.gap}px`)
    console.log(`    layout       newest bubble moved ${r.openTopSteady.moved}px (top row), ${r.openColdSteady.moved}px (cold) in the 20 frames after it was drawn; gap to bottom ${r.openTopSteady.gap}px / ${r.openColdSteady.gap}px`)
    report.push({ label, cpu, ...r })

    /*
      What is checked is that nothing waits on the server: no skeleton, no spinner, and at full speed well inside one read
      (READ_MS). At 4x the time left is the browser laying out and painting the panel, which this round measures and
      reports but cannot take away (scripts/check-community-chat-r38.mjs PROFILE=openAgain: style, layout and paint).
    */
    const quick = (x) => cpu > 1 || x.ms < READ_MS / 2
    expect(!r.listBack.skeleton && !r.listBack.spinner && quick(r.listBack), "Back to the list: drawn at once, no skeleton", r.listBack)
    expect(!r.listReopen.skeleton && !r.listReopen.spinner && quick(r.listReopen), "the panel opened again: the list at once", r.listReopen)
    expect(!r.listReload.skeleton && !r.listReload.spinner && quick(r.listReload), "after a reload in the same tab: the kept list at once, then refreshed quietly", r.listReload)
    expect(r.listFirst.ms > 0 && !r.listFirst.spinner, "the first list: rows, never a spinner", r.listFirst)
    expect(!r.openTop.spinner && !r.openTop.skeleton && (cpu > 1 || r.openTop.ms < READ_MS), "a top row opened after the list: asked for already, no wait for the server", r.openTop)
    expect(!r.openAgain.spinner && !r.openAgain.skeleton && quick(r.openAgain), "a conversation opened again: kept, drawn at once", r.openAgain)
    expect(!r.openReload.spinner && !r.openReload.skeleton && quick(r.openReload), "after a reload: the kept conversation, no skeleton", r.openReload)
    expect(!r.openCold.spinner && r.openCold.skeleton && r.openCold.ms > 0, "a cold open: skeleton bubbles, never a spinner", r.openCold)
    expect(r.openColdSteady.moved <= 1 && r.openColdSteady.gap <= 2 && r.openTopSteady.moved <= 1, "no jump once the messages are drawn, pinned to the bottom", { cold: r.openColdSteady, top: r.openTopSteady })
    expect(r.send.frames <= 1 && r.send.pending, "the bubble is in the frame of the press, pending", r.send)
    expect(r.send.empty && r.send.focused, "the box is empty in that frame and keeps the focus (the keyboard stays up)", r.send)
    expect(r.sentGap.gap <= 2, "the list stays pinned after the sends settle", r.sentGap)
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await page.close()
  }
}

/* The numbers, kept before the rich content is looked at (a run on older code stops there). */
writeFileSync(join(shots, "numbers.json"), JSON.stringify(report, null, 2))

/* ── RICH CONTENT, light and dark ───────────────────────────────────────── */
for (const [label, viewport] of [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  for (const theme of ["light", "dark"]) {
    console.log(`\nRich content, ${label}, ${theme}`)
    const server = makeServer()
    const { page, errors } = await open(server, viewport, 1, theme)
    await page.click("[data-probe-open]")
    await sel(page, ROW(0))
    await pressRow(page, 0)
    await sel(page, BUBBLE)
    await sleep(600)
    const rich = await page.evaluate(() => {
      const q = (s) => document.querySelector(`[data-community-messages] ${s}`)
      const links = [...document.querySelectorAll("[data-community-messages] [data-chat-bubble] a[href^='http']")]
      const card = q("[data-chat-link-card]")
      const embed = q("[data-chat-embed]")
      const gif = q("[data-chat-picture] img[src$='.gif']")
      return {
        embed: !!embed && !!embed.querySelector("img[src*='i.ytimg.com']") && !document.querySelector("iframe"),
        embedBox: embed ? Math.round(embed.getBoundingClientRect().height) : 0,
        card: card ? { title: !!card.querySelector("[data-chat-link-title]")?.textContent, words: !!card.querySelector("[data-chat-link-words]")?.textContent, pic: !!card.querySelector("img"), h: Math.round(card.getBoundingClientRect().height), rel: card.getAttribute("rel"), target: card.getAttribute("target") } : null,
        gif: !!gif,
        video: !!q("[data-chat-video]"),
        rel: links.length > 0 && links.every((a) => /noopener/.test(a.rel) && /noreferrer/.test(a.rel) && /nofollow/.test(a.rel) && a.target === "_blank"),
        js: [...document.querySelectorAll("a")].some((a) => /^javascript:/i.test(a.getAttribute("href") || "")),
        emoji: !!q("[data-chat-form] [data-emoji-trigger], [data-chat-form] [data-chat-emoji]"),
        attach: !!q("[data-chat-attach]"),
      }
    })
    expect(rich.embed && rich.embedBox > 100, "a YouTube link is a still with a play button, no player until pressed", rich)
    expect(!!rich.card && rich.card.title && rich.card.words && rich.card.pic && /noopener/.test(rich.card.rel || "") && rich.card.target === "_blank", "a link card: title, words, picture, opened safely", rich.card)
    expect(rich.gif, "an uploaded GIF is drawn as the GIF itself")
    expect(rich.video, "a video file is a video in its own box")
    expect(rich.rel && !rich.js, "links open in a new tab, noopener noreferrer nofollow; javascript: is never a link", rich)
    expect(rich.emoji && rich.attach, "the box has emoji and attachments", rich)
    await page.screenshot({ path: join(shots, `${label}-${theme}-rich.png`) })
    /* And a screen further up: the YouTube still and the link card. */
    await page.$eval("[data-community-messages] [data-chat-embed]", (e) => e.scrollIntoView({ block: "start" })).catch(() => null)
    await sleep(250)
    await page.screenshot({ path: join(shots, `${label}-${theme}-links.png`) })
    await page.$eval("[data-community-messages] [data-chat-list]", (el) => (el.scrollTop = el.scrollHeight))
    await sleep(150)
    /* The card's height is the same before and after its picture loads (its box is its own). */
    if (theme === "light") {
      await page.$eval("[data-community-messages] [data-chat-embed] button", (b) => b.click()).catch(() => null)
      await sleep(300)
      const frame = await page.evaluate(() => {
        const f = document.querySelector("[data-community-messages] [data-chat-embed] iframe")
        return f ? { src: f.getAttribute("src"), allow: f.getAttribute("allow") } : null
      })
      expect(!!frame && frame.src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "a press plays it in the youtube-nocookie player", frame)
      /* Emoji: the button draws the picker, open, on its first press; a pick goes into the box. */
      await page.$eval("[data-community-messages] [data-chat-emoji]", (b) => b.click()).catch(() => null)
      const grid = await sel(page, "[data-emoji-grid] button[data-emoji]", 4000)
      let picked = null
      if (grid) {
        picked = await page.$eval("[data-emoji-grid] button[data-emoji]", (b) => {
          b.click()
          return b.getAttribute("data-emoji")
        })
        await sleep(200)
      }
      const boxText = await page.$eval("[data-community-messages] [data-chat-form] textarea", (t) => t.value)
      expect(!!grid && !!picked && boxText.includes(picked), "the emoji button opens the picker on its first press, and a pick goes into the box", { grid: !!grid, picked, boxText })
      if (viewport.isMobile) await page.screenshot({ path: join(shots, `${label}-emoji.png`) })
      /* Closed again by its own button (Escape would close the whole panel). On a phone a pick already closed the sheet. */
      if (!viewport.isMobile) await page.$eval("[data-community-messages] [data-emoji-trigger]", (b) => b.click()).catch(() => null)
      await sleep(250)
      await page.$eval("[data-community-messages] [data-chat-form] textarea", (t) => {
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set
        set.call(t, "")
        t.dispatchEvent(new Event("input", { bubbles: true }))
      })
      /* A link typed in the box: its card shows above the box before it is sent. */
      const box = await page.$("[data-community-messages] [data-chat-form] textarea")
      await box.focus()
      await page.keyboard.type("look https://example.org/a-page", { delay: 0 })
      await sel(page, "[data-chat-form] [data-chat-link-draft]", 3000)
      expect(!!(await page.$("[data-chat-form] [data-chat-link-draft]")), "a link in the box is previewed above it")
      await page.screenshot({ path: join(shots, `${label}-link-draft.png`) })
      await page.keyboard.press(viewport.isMobile ? "Tab" : "Enter")
      if (viewport.isMobile) await page.$eval("[data-community-messages] [data-chat-send]", (b) => b.click())
      await sleep(SEND_MS + 300)
      const sent = server.posts[server.posts.length - 1]
      expect(!!sent && Array.isArray(sent.attachments) && sent.attachments.some((a) => a.type === "link" && a.sig === "probe" && a.url === "https://example.org/a-page"), "and it goes with the message as the server read it (signed)", sent)
    }
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await page.close()
  }
}

await browser.close()
if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
console.log(`\nPictures and numbers: ${shots}`)
if (BEFORE) process.exit(0)
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
