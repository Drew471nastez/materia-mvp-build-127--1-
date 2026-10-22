/**
 * ===========================================================================
 *  ROUND 37'S COMMUNITY CHAT, MEASURED
 * ===========================================================================
 * The real chat screen (scripts/render-community-chat-r37.tsx: chat.tsx and
 * chat-surface.tsx) in headless Chromium, at 1440x900 and on a 390x844
 * phone. Two members, A and B, each on a page of their own; a server in this
 * script answers the chat routes the way the real ones do (server time,
 * client ids written once), and when one page writes, the other is told
 * through the realtime stand in (the stream's INSERT), as Supabase would.
 *
 *   LATENCY   A presses Enter: how long until A's bubble is drawn, and until
 *             B has it on screen (send, stream, catch up, draw)
 *   ORDER     after a burst from both sides, both pages show the same ids in
 *             the same order, each once
 *   SCROLL    at the bottom a new message keeps the reader at the bottom;
 *             scrolled up, the page does not move and a "1 new message" pill
 *             appears; the pill takes them down
 *   OLDER     scrolled to the top, the next page loads and the message that
 *             was first stays exactly where it was on screen
 *   PICTURES  a picture's bubble is its height before the picture arrives
 *   RETRY     a send the server refuses says Not sent; tapped, it goes with
 *             the same client id and is written once
 *   RULES     a community with chat rules shows them in place of the box; I
 *             agree brings the box back
 *   PHONE     the chat fills from under the bar to the foot of the screen,
 *             the box on the foot; with the keyboard up (--vv-h 500,
 *             data-keyboard) the box sits on the keyboard and the chat takes
 *             the screen from the top
 *
 *   PROBE_CSS=source node scripts/check-community-chat-r37.mjs
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
const SPACE = "5a5a5a5a-0000-4000-8000-000000000001"
const stubs = join(root, ".community-chat-r37-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-chat-r37-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const svg = (a, b, w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="${b}"/></svg>`

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
  let n = 0
  for (const h of handlers) {
    if (h.gone || h.type !== "postgres_changes" || h.filter.table !== table) continue
    const m = /^(\\w+)=eq\\.(.+)$/.exec(h.filter.filter || "")
    if (m && String(row[m[1]]) !== m[2]) continue
    n++
    h.cb({ eventType, new: row })
  }
  return n
}
window.__typing = []
export const isNativePlatform = () => false
export function createClient() {
  return {
    realtime: { setAuth: async () => {} },
    channel(name, opts) {
      const mine = []
      const ch = {
        name,
        on(type, filter, cb) { const h = { name, type, filter, cb, gone: false, opts }; mine.push(h); handlers.push(h); return ch },
        subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return ch },
        send(msg) { window.__typing.push({ name, private: !!opts?.config?.private, ...msg }); return Promise.resolve("ok") },
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
  entryPoints: [join(root, "scripts/render-community-chat-r37.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.community-chat-r37-probe/navigation.js", "next/link": "./.community-chat-r37-probe/link.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const css = await appCss(root)
const fonts = interFaces(root)
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

/* ── The server: the chat routes, as the real ones answer ─────────────── */

const PEOPLE = {
  a: { id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "Ana Ruiz" },
  b: { id: "bbbbbbbb-0000-4000-8000-00000000000b", name: "Ben Okafor" },
}
function makeServer(seed) {
  const s = { rows: [...seed], pages: new Map(), posts: [], failNext: new Set(), imageWait: 0 }
  const view = (r, who) => ({
    id: r.id, spaceId: SPACE, status: "published", authorId: r.author, author: { id: r.author, name: r.author === PEOPLE.a.id ? PEOPLE.a.name : r.author === PEOPLE.b.id ? PEOPLE.b.name : "Cleo Park", username: null, avatarUrl: null, role: "member", level: 1 },
    mine: r.author === PEOPLE[who].id, body: r.body, attachments: r.attachments ?? [], replyToId: null, replyTo: null, clientId: r.clientId ?? null, createdAt: r.createdAt, editedAt: null, reactionCount: 0, reacted: false, canEdit: r.author === PEOPLE[who].id, canDelete: r.author === PEOPLE[who].id, canModerate: false,
  })
  s.view = view
  s.handle = async (who, r) => {
    const url = new URL(r.url())
    const path = url.pathname.replace(`/api/community/${CID}`, "")
    const method = r.method()
    const json = (body, status = 200, wait = 0) => setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}), wait)
    if (path === `/spaces/${SPACE}/messages` && method === "GET") {
      const after = url.searchParams.get("after")
      const before = url.searchParams.get("before")
      const sorted = [...s.rows].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : x.id < y.id ? -1 : 1))
      if (after) return json({ messages: sorted.filter((m) => m.createdAt > after).map((m) => view(m, who)), hasMore: false }, 200, 15)
      if (before) {
        const older = sorted.filter((m) => m.createdAt < before)
        return json({ messages: older.slice(-30).map((m) => view(m, who)), hasMore: older.length > 30 }, 200, 120)
      }
      return json({ messages: sorted.slice(-50).map((m) => view(m, who)), hasMore: sorted.length > 50 })
    }
    if (path === `/spaces/${SPACE}/messages` && method === "POST") {
      const body = JSON.parse(r.postData() || "{}")
      s.posts.push({ who, ...body })
      if (s.failNext.has(body.body)) {
        s.failNext.delete(body.body)
        return json({ error: "The message did not send. Try again." }, 500, 40)
      }
      const had = s.rows.find((m) => m.clientId && m.clientId === body.clientId)
      if (had) return json({ message: view(had, who) }, 201, 20)
      const row = { id: randomUUID(), author: PEOPLE[who].id, body: body.body, attachments: body.attachments, clientId: body.clientId, createdAt: new Date().toISOString() }
      s.rows.push(row)
      json({ message: view(row, who) }, 201, 20)
      /* The database's realtime: the row to every page that listens to this space. */
      for (const [other, page] of s.pages) if (other !== who) page.evaluate((id, sp) => window.__emit("community_messages", { id, space_id: sp }), row.id, SPACE).catch(() => {})
      return
    }
    if (path === "/chat" && method === "POST") return json({ version: 1 })
    if (path.startsWith("/chat/prefs")) return json({ notify: "default", mutedUntil: null })
    if (path.endsWith("/read")) return json({ ok: true })
    if (path.startsWith("/members")) return json({ members: [] })
    return json({ error: "not_found" }, 404)
  }
  return s
}

const at = (i) => new Date(Date.now() - (200 - i) * 45_000).toISOString()
const seedRows = (n) => Array.from({ length: n }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, author: [PEOPLE.a.id, PEOPLE.b.id, "cccccccc-0000-4000-8000-00000000000c"][i % 5 === 0 ? 2 : i % 2], body: i % 7 === 3 ? "That works for me. I will bring the notes from last week and we can go through the open questions one by one." : `Message ${i}`, createdAt: at(i) }))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], protocolTimeout: 30_000 })
/* Each member in a browser of their own, so both pages are in front and draw frames, as two phones would. */
const browserB = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 30_000 })

async function open(server, who, viewport, extra = {}) {
  const page = await (who === "b" ? browserB : browser).newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) page.on("console", (m) => console.log("    [page]", m.text()))
  const sorted = [...server.rows].sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1))
  const probe = { communityId: CID, me: PEOPLE[who], messages: sorted.slice(-50).map((m) => server.view(m, who)), hasMore: sorted.length > 50, ...extra }
  await page.evaluateOnNewDocument((p) => {
    window.__probe = p
  }, probe)
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void server.handle(who, r)
    if (url.startsWith(`${ORIGIN}/pic/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "image/svg+xml", body: svg("#dfe5ec", "#8796ab", 1200, 800) }).catch(() => {}), server.imageWait)
    if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: html })
    r.continue().catch(() => {})
  })
  await page.goto(`${ORIGIN}/community/studio-notes/space/general`, { waitUntil: "load" })
  await page.waitForSelector("[data-chat-form], [data-chat-rules]")
  await sleep(150)
  server.pages.set(who, page)
  return { page, errors }
}

const ids = (page) => page.$$eval("[data-chat-message]", (els) => els.map((e) => e.getAttribute("data-chat-message")))
/* Typed first, then sent: Enter on a computer, the Send button on a phone (where Enter is a new line). Answers when it was sent. */
const typeAndSend = async (page, text, phone = false) => {
  await page.click("[data-chat-form] textarea")
  await page.$eval("[data-chat-form] textarea", (t) => t.focus())
  await page.keyboard.type(text, { delay: 0 })
  const t0 = Date.now()
  if (phone) await page.click("[data-chat-send]")
  else await page.keyboard.press("Enter")
  return t0
}
const bottomGap = (page) => page.$eval("[data-chat-list]", (el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight))

for (const [label, viewport] of [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  console.log(`\n${label}`)
  const phone = label.startsWith("phone")
  const server = makeServer(seedRows(80))
  const A = await open(server, "a", viewport)
  const B = await open(server, "b", viewport)

  /* LATENCY */
  const lat = []
  for (let i = 0; i < 5; i++) {
    const text = `Latency check ${label} ${i}`
    const t0 = await typeAndSend(A.page, text, phone)
    await A.page.waitForFunction((t) => [...document.querySelectorAll("[data-chat-bubble]")].some((b) => b.textContent.includes(t)), { polling: 5 }, text)
    const tA = Date.now()
    await B.page.waitForFunction((t) => [...document.querySelectorAll("[data-chat-bubble]")].some((b) => b.textContent.includes(t)), { polling: 5, timeout: 5000 }, text)
    lat.push({ own: tA - t0, other: Date.now() - t0 })
  }
  const med = (k) => lat.map((x) => x[k]).sort((a, b) => a - b)[2]
  console.log(`    send to render (from the key or tap that sends): own bubble median ${med("own")}ms, the other member's page median ${med("other")}ms (this server answers a send in 20ms and a catch up in 15ms)`)
  expect(med("own") < 100, "the sender's bubble is on screen at once (optimistic)", lat.map((x) => x.own))
  expect(med("other") < 1000, "the other member has it in under a second", lat.map((x) => x.other))
  expect(phone ? true : (await A.page.$eval("[data-chat-form] textarea", (t) => t.value)) === "", "the box is empty after sending")
  expect((await A.page.evaluate(() => document.activeElement?.tagName)) === "TEXTAREA", "the box keeps its focus (the keyboard stays up)")
  expect((await bottomGap(A.page)) < 4 && (await bottomGap(B.page)) < 4, "both stay at the bottom as messages arrive", [await bottomGap(A.page), await bottomGap(B.page)])
  expect((await A.page.evaluate(() => window.__typing.filter((t) => t.event === "typing").length)) > 0 && (await A.page.evaluate(() => window.__typing.every((t) => t.private))), "typing goes out on a private channel, a few times, not per key")

  /* ORDER after a burst from both sides */
  await Promise.all([typeAndSend(A.page, "burst a1", phone), typeAndSend(B.page, "burst b1", phone)])
  await Promise.all([typeAndSend(A.page, "burst a2", phone), typeAndSend(B.page, "burst b2", phone)])
  await sleep(700)
  const [ia, ib] = [await ids(A.page), await ids(B.page)]
  expect(JSON.stringify(ia) === JSON.stringify(ib), "both pages show the same messages in the same order", [ia.length, ib.length])
  expect(new Set(ia).size === ia.length && !ia.some((x) => x.startsWith("local-")), "each once, none left pending")

  /* SCROLL: scrolled up, a new message waits in a pill */
  await A.page.$eval("[data-chat-list]", (el) => (el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 900)))
  await sleep(150)
  const before = await A.page.$eval("[data-chat-list]", (el) => el.scrollTop)
  await typeAndSend(B.page, "while A reads back", phone)
  await A.page.waitForFunction(() => /new message/.test(document.querySelector("[data-chat-pill]")?.textContent ?? ""), { timeout: 3000 }).catch(() => null)
  const after = await A.page.$eval("[data-chat-list]", (el) => el.scrollTop)
  const pill = await A.page.$eval("[data-chat-pill]", (e) => e.textContent).catch(() => null)
  expect(Math.abs(after - before) <= 1, "scrolled up, the page does not move when a message arrives", [before, after])
  expect(!!pill && /^1 new message$/.test(pill.trim()), "a pill says so", pill)
  expect(ia.length > 0 && (await ids(A.page)).length === ia.length + 1, "and the message is there, under the reader's place")
  if (!phone) await A.page.screenshot({ path: join(shots, `${label}-pill.png`) })
  await A.page.click("[data-chat-pill]")
  await sleep(700)
  expect((await bottomGap(A.page)) < 4, "the pill takes the reader to the newest", await bottomGap(A.page))

  /* OLDER */
  const firstId = (await ids(A.page))[0]
  const y0 = await A.page.$eval(`[data-chat-message="${firstId}"]`, (e) => e.getBoundingClientRect().top)
  await A.page.$eval("[data-chat-list]", (el) => el.scrollTo({ top: 0 }))
  const y1 = await A.page.$eval(`[data-chat-message="${firstId}"]`, (e) => e.getBoundingClientRect().top)
  await A.page.waitForFunction((n) => document.querySelectorAll("[data-chat-message]").length > n, { timeout: 4000 }, (await ids(A.page)).length).catch(() => null)
  await sleep(100)
  const y2 = await A.page.$eval(`[data-chat-message="${firstId}"]`, (e) => e.getBoundingClientRect().top)
  expect((await ids(A.page)).length > 50, "older messages load as the top comes near", (await ids(A.page)).length)
  expect(Math.abs(y2 - y1) <= 2, "and the message that was first stays where it was on screen", { before: Math.round(y1), after: Math.round(y2), atBottom: Math.round(y0) })

  /* PICTURES: the box is its height before the picture comes */
  server.imageWait = 1500
  await A.page.evaluate(() => {
    const el = document.querySelector("[data-chat-list]")
    el.scrollTop = el.scrollHeight
  })
  const picRow = { id: randomUUID(), author: PEOPLE.b.id, body: "", attachments: [{ type: "image", url: `${ORIGIN}/pic/1.svg`, w: 1200, h: 800 }], createdAt: new Date().toISOString() }
  server.rows.push(picRow)
  await A.page.evaluate((id, sp) => window.__emit("community_messages", { id, space_id: sp }), picRow.id, SPACE)
  await A.page.waitForSelector(`[data-chat-message="${picRow.id}"] [data-chat-picture]`)
  const h0 = await A.page.$eval(`[data-chat-message="${picRow.id}"]`, (e) => e.getBoundingClientRect().height)
  await A.page.waitForFunction((id) => document.querySelector(`[data-chat-message="${id}"] img`)?.complete && document.querySelector(`[data-chat-message="${id}"] img`).naturalWidth > 0, { timeout: 5000 }, picRow.id).catch(() => null)
  const h1 = await A.page.$eval(`[data-chat-message="${picRow.id}"]`, (e) => e.getBoundingClientRect().height)
  expect(Math.abs(h1 - h0) < 1 && h0 > 100, "a picture's bubble has its height before the picture arrives (no jump)", { before: Math.round(h0), after: Math.round(h1) })
  expect((await bottomGap(A.page)) < 4, "and the reader is still at the bottom", await bottomGap(A.page))
  server.imageWait = 0

  /* RETRY */
  server.failNext.add("this one fails first")
  await typeAndSend(A.page, "this one fails first", phone)
  await A.page.waitForSelector("[data-chat-retry]", { timeout: 3000 }).catch(() => null)
  expect(!!(await A.page.$("[data-chat-retry]")), "a refused send says Not sent, with a way to try again")
  await A.page.click("[data-chat-retry]")
  await A.page.waitForFunction(() => !document.querySelector("[data-chat-retry]") && !document.querySelector('[data-state="sending"]'), { timeout: 3000 }).catch(() => null)
  const tries = server.posts.filter((p) => p.body === "this one fails first")
  expect(tries.length === 2 && tries[0].clientId === tries[1].clientId, "sent again under the same client id", tries.map((t) => t.clientId))
  expect(server.rows.filter((r) => r.body === "this one fails first").length === 1 && !(await A.page.$("[data-chat-retry]")), "and written once")

  /* PHONE layout */
  if (phone) {
    const box = await A.page.$eval("[data-chat]", (e) => {
      const r = e.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), pos: getComputedStyle(e).position }
    })
    const form = await A.page.$eval("[data-chat-form]", (e) => Math.round(e.getBoundingClientRect().bottom))
    expect(box.pos === "fixed" && box.top === 99 && box.bottom === 844, "the chat fills from under the bar (99px) to the foot of the screen", box)
    expect(form === 844, "the box sits on the foot of the screen", form)
    await A.page.screenshot({ path: join(shots, `${label}-chat.png`) })
    /* The keyboard: what components/viewport-vars.tsx publishes with it up. */
    await A.page.evaluate(() => {
      document.documentElement.style.setProperty("--vv-h", "500px")
      document.documentElement.style.setProperty("--vv-top", "0px")
      document.documentElement.dataset.keyboard = "open"
    })
    await sleep(250)
    const kb = await A.page.$eval("[data-chat]", (e) => {
      const r = e.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
    })
    const kbForm = await A.page.$eval("[data-chat-form]", (e) => Math.round(e.getBoundingClientRect().bottom))
    expect(kb.top === 0 && kb.bottom === 500 && kbForm === 500, "keyboard up: the chat takes the visible screen and the box sits on the keyboard", { ...kb, form: kbForm })
    expect((await bottomGap(A.page)) < 4, "and the newest message is still in sight above the box", await bottomGap(A.page))
    await A.page.screenshot({ path: join(shots, `${label}-keyboard.png`) })
    /* iOS pans the page: the chat follows --vv-top. */
    await A.page.evaluate(() => document.documentElement.style.setProperty("--vv-top", "120px"))
    await sleep(100)
    const pan = await A.page.$eval("[data-chat]", (e) => Math.round(e.getBoundingClientRect().top))
    expect(pan === 120, "a pan (--vv-top) moves the chat with the visible screen", pan)
    const wide = await A.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(wide, "nothing scrolls sideways")
  } else {
    await A.page.screenshot({ path: join(shots, `${label}-chat.png`) })
  }
  expect(A.errors.length === 0 && B.errors.length === 0, "no page errors", [...A.errors, ...B.errors].slice(0, 3))
  await A.page.close()
  await B.page.close()

  /* RULES */
  const rs = makeServer(seedRows(3))
  const R = await open(rs, "a", viewport, { rules: "Be kind.\nNo selling in chat." })
  expect(!!(await R.page.$("[data-chat-rules]")) && !(await R.page.$("[data-chat-form]")), "chat rules stand in place of the box until accepted")
  if (phone) await R.page.screenshot({ path: join(shots, `${label}-rules.png`) })
  await R.page.click("[data-chat-rules-accept]")
  await R.page.waitForSelector("[data-chat-form]", { timeout: 3000 }).catch(() => null)
  expect(!!(await R.page.$("[data-chat-form]")), "I agree brings the box back")
  await R.page.close()
}

await browser.close()
await browserB.close()
if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
console.log(`\nPictures: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
