/**
 * ===========================================================================
 *  ROUND 39: NEW MESSAGE'S PEOPLE, AND A POST SENT IN A MESSAGE, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-people-r39.tsx) in headless
 * Chromium at 1440x900 and on a 390x844 phone, light and dark, with this
 * script answering every /api request. Pictures go to SHOTS_DIR.
 *
 *   NEW MESSAGE  the pen opens the picker over the list (a popover in the
 *                panel at 1440, a sheet at 390) with its rows in the first
 *                frame (the Suggested list was read as the panel opened), the
 *                search focused; it moves by opacity, translate and scale
 *                (sampled every frame: it starts closed and ends open, the
 *                combined property never set); the owner and team first;
 *                typing narrows at once and the server's answer lands in the
 *                same box (the list's height never changes); arrow keys move
 *                the lit row; two picked is a group with a name; Escape closes
 *                the picker and leaves the panel
 *   COLD         opened before the Suggested list came back: skeleton rows,
 *                then the rows in their place, at the same height
 *   CHAT         a post the reader may see as a card (author, title, words,
 *                picture), one they may not as "Post not available"
 *   SHARE        a post's share button offers Send in a message; the dialog
 *                (1440) or sheet (390) lists recent chats, channels, people;
 *                two picked and a note send one request naming both
 *
 *   PROBE_CSS=source node scripts/check-community-people-r39.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const work = mkdtempSync(join(tmpdir(), "storelib-people-r39-"))
const stubs = join(work, "stubs")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
writeFileSync(join(stubs, "supabase-client.js"), `export const isNativePlatform = () => false
export function createClient() {
  const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return ch }, send() { return Promise.resolve("ok") } }
  return { realtime: { setAuth: async () => {} }, channel() { return ch }, removeChannel() {}, storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) } } }, auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) } }
}
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-people-r39.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(stubs, "navigation.js"), "next/link": join(stubs, "link.jsx") },
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
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const svg = (w, h, body) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
const face = (bg, fg) => svg(96, 96, `<rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/>`)
const JIG = svg(400, 300, `<rect width="400" height="300" fill="#d9cbb6"/><rect x="40" y="120" width="320" height="60" fill="#8a5a3c"/><rect x="80" y="100" width="40" height="100" fill="#5b3a22"/><rect x="180" y="100" width="40" height="100" fill="#5b3a22"/><rect x="280" y="100" width="40" height="100" fill="#5b3a22"/>`)

const ME = { id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "Ana Ruiz" }
const uid = (c, n) => `${c.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`
const person = (n, name, username, role, extra = {}) => ({ id: uid("1", n), name, username, avatarUrl: face(["#e8d5c4", "#cfdcd2", "#efe3cf", "#dfd4ea", "#d4e2ea"][n % 5], ["#8a5a3c", "#3f6b4f", "#8a6d3c", "#5b4a8a", "#3c6a8a"][n % 5]), role, online: false, can: true, why: null, ...extra })
const OLIVIA = person(1, "Olivia Hart", "olivia", "owner", { online: true, from: "team" })
const ADA = person(2, "Ada Stone", "ada", "admin", { from: "team" })
const BEN = person(3, "Ben Okafor", "benokafor", "member", { online: true, from: "talked" })
const CLEO = person(4, "Cleo Park", "cleo", "member", { from: "commented" })
const DAN = person(5, "Dan Wu", "danwu", "member", { from: "liked" })
const EVE = person(6, "Eve Laine", "eve", "member", { from: "top" })
const FAY = person(7, "Fay Moss", "fay", "member", { online: true, from: "active" })
const SUGGESTED = [OLIVIA, ADA, BEN, CLEO, DAN, EVE, FAY]
const DIRECTORY = [...SUGGESTED, person(8, "Bea Lund", "bealund", "member"), person(9, "Benedict Cole", "bcole", "member"), person(10, "Hal Reed", "hal", "member", { can: false, why: "Not taking messages" })]
const CONVO = "c0c0c0c0-0000-4000-8000-000000000001"
const at = (min) => new Date(Date.now() - min * 60_000).toISOString()
const SHARED = { postId: "00000000-0000-4000-a000-000000000201", available: true, title: "Dovetail jig, finally square", excerpt: "How I cut the tails with a cheap dozuki and a block of oak. Three tries, then it clicked.", author: { name: "Dan Wu", avatarUrl: DAN.avatarUrl }, image: JIG, href: "/community/studio-notes/post/dovetail-jig-finally-square-00000000", space: "General" }
const line = (i, mine, body, extra = {}) => ({ id: `00000000-0000-4000-b000-${String(i).padStart(12, "0")}`, conversationId: CONVO, authorId: mine ? ME.id : BEN.id, author: mine ? { id: ME.id, name: ME.name, username: "ana", avatarUrl: null, role: "member", level: 3 } : { id: BEN.id, name: BEN.name, username: BEN.username, avatarUrl: BEN.avatarUrl, role: "member", level: 3 }, mine, body, attachments: [], replyTo: null, clientId: null, createdAt: at(60 - i), editedAt: null, canEdit: mine, canDelete: mine, canModerate: false, ...extra })
const MESSAGES = [
  line(1, false, "Did you finish the jig?"),
  line(2, true, "Look at this, Dan nailed it", { post: SHARED }),
  line(3, false, "", { post: { postId: "00000000-0000-4000-a000-000000000299", available: false } }),
  line(4, false, "That one is from the members only space, I think"),
  line(5, false, "Here is the one I meant", { post: { ...SHARED, postId: "00000000-0000-4000-a000-000000000203", title: null, image: null, excerpt: "Anyone near Porto with a bandsaw to share for an afternoon?" } }),
]
const CHATS = [
  { kind: "dm", id: CONVO, name: BEN.name, avatarUrl: BEN.avatarUrl, username: BEN.username, role: "member", sub: null, at: at(5), personId: BEN.id },
  { kind: "group", id: "9a9a9a9a-0000-4000-8000-000000000001", name: "Makers", avatarUrl: null, username: null, role: null, sub: "6 people", at: at(30) },
  { kind: "dm", id: "c0c0c0c0-0000-4000-8000-000000000002", name: OLIVIA.name, avatarUrl: OLIVIA.avatarUrl, username: OLIVIA.username, role: "owner", sub: null, at: at(300), personId: OLIVIA.id },
  { kind: "space", id: "5a5a5a5a-0000-4000-8000-000000000001", name: "lounge", avatarUrl: null, username: null, role: null, sub: null, at: null },
  { kind: "space", id: "5a5a5a5a-0000-4000-8000-000000000002", name: "wins", avatarUrl: null, username: null, role: null, sub: null, at: null },
]
const INBOX = { ready: true, unread: 0, conversations: [{ id: CONVO, other: { id: BEN.id, name: BEN.name, username: BEN.username, avatarUrl: BEN.avatarUrl, role: "member", level: 3 }, lastBody: "Here is the one I meant", lastAt: at(5), lastFromMe: false, unread: false, muted: false }], groups: [{ id: CHATS[1].id, name: "Makers", memberCount: 6, lastBody: "Thursday works", lastAt: at(30), lastFromMe: false, unread: false, muted: false }] }

function matchPeople(q) {
  const t = q.toLowerCase().replace(/^@/, "")
  return DIRECTORY.filter((x) => x.name.toLowerCase().split(" ").some((w) => w.startsWith(t)) || x.username.startsWith(t))
}

function handler(state) {
  return async (r) => {
    const url = new URL(r.url())
    const method = r.method()
    const json = (body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {})
    const path = url.pathname.replace(`/api/community/${CID}`, "")
    if (path === "/dms" && method === "GET") return json(INBOX)
    if (path === "/dms" && method === "POST") return json({ conversation: { id: CONVO, other: { id: BEN.id, name: BEN.name, username: BEN.username, avatarUrl: BEN.avatarUrl, role: "member" } } })
    if (path === "/chat" && method === "GET") return json({ ready: true, rules: "", rulesVersion: 0, needsRules: false, dmPolicy: "everyone", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: ME.name, canStartGroups: true })
    if (path === "/chat/people") {
      const q = url.searchParams.get("q") ?? ""
      state.peopleAsks.push(q)
      if (!q) {
        await sleep(state.coldMs ?? 30)
        return json({ people: SUGGESTED })
      }
      await sleep(240)
      return json({ people: matchPeople(q) })
    }
    if (path === "/chat/share" && method === "GET") return json({ ready: true, chats: CHATS })
    if (path === "/chat/share" && method === "POST") {
      const b = JSON.parse(r.postData() || "{}")
      state.shares.push(b)
      return json({ results: b.targets.map((t) => ({ ...t, chatId: t.id, ok: true })) }, 201)
    }
    if (path === `/dms/${CONVO}` && method === "GET") return json({ messages: url.searchParams.get("after") ? [] : MESSAGES, hasMore: false, otherReadAt: at(1) })
    if (path.startsWith("/chat/blocks")) return json({ blocked: false })
    if (path.includes("/chat/prefs")) return json({ notify: "default", mutedUntil: null })
    if (path.endsWith("/read")) return json({ ok: true })
    if (path === "/groups" && method === "POST") return json({ group: { id: CHATS[1].id, name: "Makers" } })
    return json({ error: "not_found" }, 404)
  }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 30_000 })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function open(mode, viewport, { darkMode = false, extra = {}, state = {} } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) page.on("console", (m) => console.log("    [page]", m.text()))
  await page.evaluateOnNewDocument((p) => {
    window.__probe = p
  }, { mode, communityId: CID, me: ME, ...extra })
  const s = { peopleAsks: [], shares: [], ...state }
  const handle = handler(s)
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    if (r.url().startsWith(`${ORIGIN}/api/`)) return void handle(r)
    if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: html })
    r.continue().catch(() => {})
  })
  await page.goto(`${ORIGIN}/community/studio-notes`, { waitUntil: "load" })
  if (darkMode) await page.evaluate(() => document.documentElement.setAttribute("data-sl-dark", ""))
  await sleep(300)
  return { page, errors, state: s }
}
const wide = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: innerWidth }))
const shot = async (page, name) => {
  const file = join(shots, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}
/* The picker's frame, sampled once a frame from the press: opacity, translate, scale and the combined property. */
const sampleOpen = (page, selector) =>
  page.evaluate(
    (sel) =>
      new Promise((done) => {
        const out = []
        const t0 = performance.now()
        document.querySelector(sel).click()
        const tick = () => {
          const f = document.querySelector("[data-picker-frame]")
          if (f) {
            const cs = getComputedStyle(f)
            out.push({ t: Math.round(performance.now() - t0), top: Math.round(f.getBoundingClientRect().top), o: Number(cs.opacity), tr: cs.translate, sc: cs.scale, tf: cs.transform, rows: document.querySelectorAll("[data-picker-rows] [data-person]").length, skel: !!document.querySelector("[data-picker-skeleton]"), focus: document.activeElement?.hasAttribute("data-picker-search") ?? false, prop: cs.transitionProperty })
          }
          /* Until it has come to rest (a loaded machine draws fewer frames), two seconds at most. */
          const at = out[out.length - 1]
          const rest = !!at && at.o === 1 && (at.tr === "none" || at.tr === "0px") && (at.sc === "none" || at.sc === "1")
          const t = performance.now() - t0
          if (t < 2000 && !(t > 520 && rest)) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
    selector,
  )
/* "none", "0.96", "96% 96%": the first number, as a factor. */
const scaleOf = (v) => {
  if (!v || v === "none") return 1
  const n = parseFloat(v)
  return /%/.test(v.split(" ")[0]) ? n / 100 : n
}

const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean)
const runs = (name) => !ONLY.length || ONLY.includes(name)
for (const [label, vp] of [["1440", DESK], ["390", PHONE]]) {
  for (const darkMode of [false, true]) {
    const tone = darkMode ? "dark" : "light"
    console.log(`\nNew message, ${label}, ${tone}`)
    if (runs("new")) {
      const { page, errors, state } = await open("panel", vp, { darkMode })
      await page.evaluate(() => window.__openMessages())
      await page.waitForSelector("[data-messages-new]")
      await sleep(450)
      expect(state.peopleAsks.includes(""), "the Suggested list was asked for as the panel opened")
      const frames = await sampleOpen(page, "[data-messages-new]")
      const first = frames[0]
      const last = frames[frames.length - 1]
      expect(!!first && first.rows > 0 && !frames.some((f) => f.skel), "its rows are in the picker's first frame; no skeleton", first)
      expect(frames.some((f) => f.focus), "the search is focused as it opens")
      if (label === "390") expect(!!first && first.top - last.top > 200 && last.tr === "0px" && frames.some((f) => f.top > last.top && f.top < first.top), "a sheet: it starts below the screen and slides up to rest (translate), through the frames between", { first: first && [first.tr, first.top], last: [last.tr, last.top], frames: frames.length })
      else expect(!!first && first.o < 0.6 && last.o === 1 && scaleOf(first.sc) < 0.99 && scaleOf(last.sc) === 1, "a popover: it fades and scales in from a closed first frame", { first: first && [first.o, first.sc, first.tr], last: [last.o, last.sc, last.tr] })
      expect(frames.every((f) => f.tf === "none") && /translate/.test(last.prop) && !/transform/.test(last.prop), "moved by opacity, translate and scale, never the combined property", { tf: [...new Set(frames.map((f) => f.tf))], prop: last.prop })
      const rows = await page.$$eval("[data-picker-rows] [data-person]", (els) => els.map((e) => ({ name: e.querySelector("span span span")?.textContent, h: Math.round(e.getBoundingClientRect().height), role: e.querySelector("[data-role-badge]")?.getAttribute("data-role-badge") ?? null, online: !!e.querySelector("[data-online]") })))
      expect(rows.map((r) => r.name).join() === SUGGESTED.map((x) => x.name).join(), "Suggested: the owner and team first, then the people the member deals with", rows.map((r) => r.name))
      expect(rows[0].role === "owner" && rows[1].role === "admin" && rows.slice(2).every((r) => !r.role), "Owner and Admin beside their names, nothing beside a member's", rows.map((r) => r.role))
      expect(rows.filter((r) => r.online).length === 3 && rows.every((r) => r.h === 56), "an online dot where the heartbeat says so; every row 56px", rows.map((r) => [r.online, r.h]))
      const label1 = await page.$eval("[data-picker-list]", (el) => el.textContent.slice(0, 9))
      expect(label1 === "Suggested", "under the word Suggested", label1)
      console.log(`    ${await shot(page, `new-${label}-${tone}`)}`)

      const box = await page.$eval("[data-picker-list]", (el) => Math.round(el.getBoundingClientRect().height))
      await page.keyboard.type("be", { delay: 40 })
      const quick = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-picker-rows] [data-person]")].map((e) => e.querySelector("span span span")?.textContent), h: Math.round(document.querySelector("[data-picker-list]").getBoundingClientRect().height) }))
      expect(quick.rows.length > 0 && quick.rows[0] === "Ben Okafor", "typing narrows the people on screen at once", quick.rows)
      await sleep(700)
      const later = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-picker-rows] [data-person]")].map((e) => e.querySelector("span span span")?.textContent), h: Math.round(document.querySelector("[data-picker-list]").getBoundingClientRect().height) }))
      expect(later.rows.join() === "Ben Okafor,Bea Lund,Benedict Cole", "the server's answer replaces it in place", later.rows)
      expect(quick.h === box && later.h === box, "the list's box never changes height while results change", { box, quick: quick.h, later: later.h })
      expect(state.peopleAsks.filter((q) => q).length <= 2, "one ask per pause in typing (at most one per word typed)", state.peopleAsks)
      await page.keyboard.press("ArrowDown")
      const lit = await page.$eval("[data-picker-rows] [data-active]", (el) => el.getAttribute("data-row")).catch(() => null)
      expect(lit === "1", "the down arrow lights the next row", lit)
      console.log(`    ${await shot(page, `search-${label}-${tone}`)}`)

      await page.$eval("[data-picker-search]", (el) => el.select())
      await page.keyboard.press("Backspace")
      await sleep(150)
      const picks = await page.$$("[data-picker-rows] [data-pick]")
      await picks[2].click()
      await picks[3].click()
      await sleep(150)
      const foot = await page.evaluate(() => ({ name: document.querySelector("[data-picker-group-name]")?.getAttribute("placeholder") ?? null, go: document.querySelector("[data-picker-go]")?.textContent ?? null }))
      expect(foot.name === "Ben and Cleo" && foot.go === "Start group", "two picked: a group, named after them until a name is typed", foot)
      console.log(`    ${await shot(page, `group-${label}-${tone}`)}`)
      await page.keyboard.press("Escape")
      await sleep(420)
      const after = await page.evaluate(() => ({ picker: !!document.querySelector("[data-picker-frame]"), panel: !!document.querySelector("[data-community-messages]") }))
      expect(!after.picker && after.panel, "Escape closes the picker and leaves the panel", after)
      const w = await wide(page)
      expect(w.doc <= w.view, "nothing wider than the screen", w)
      expect(errors.length === 0, "no page errors", errors)
      await page.close()
    }

    console.log(`\nA conversation with posts in it, ${label}, ${tone}`)
    if (runs("chat")) {
      const { page, errors } = await open("chat", vp, { darkMode, extra: { start: { userId: BEN.id } } })
      await page.evaluate(() => window.__openMessages())
      await page.waitForSelector("[data-chat-post]")
      await sleep(400)
      const cards = await page.$$eval("[data-chat-post]", (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          const bubble = e.closest("[data-chat-bubble]").getBoundingClientRect()
          return { id: e.getAttribute("data-chat-post"), text: e.textContent, img: !!e.querySelector("img[src^='data:image/svg']"), href: e.getAttribute("href"), w: Math.round(r.width), inside: r.left >= bubble.left - 0.5 && r.right <= bubble.right + 0.5 }
        }),
      )
      expect(cards.length === 3, "three posts in the conversation, three cards", cards.length)
      expect(/Dan Wu/.test(cards[0]?.text) && /Dovetail jig/.test(cards[0]?.text) && /dozuki/.test(cards[0]?.text) && cards[0]?.img && /\/post\/dovetail-jig/.test(cards[0]?.href ?? ""), "a post the reader may see: the author, title, words and picture, and it opens the post", cards[0])
      expect(cards[1]?.id === "gone" && cards[1]?.text === "Post not available" && !cards[1]?.href, "one they may not: Post not available, nothing else", cards[1])
      expect(cards.every((c) => c.inside && c.w <= 280), "each card inside its bubble, 280px at most", cards.map((c) => [c.w, c.inside]))
      const w = await wide(page)
      expect(w.doc <= w.view, "nothing wider than the screen", w)
      expect(errors.length === 0, "no page errors", errors)
      console.log(`    ${await shot(page, `chat-${label}-${tone}`)}`)
      await page.close()
    }

    console.log(`\nSend in a message, ${label}, ${tone}`)
    if (runs("share")) {
      const { page, errors, state } = await open("feed", vp, { darkMode })
      await page.waitForSelector("[data-share-post]")
      /* The feed's card: Send in a message among its dots. */
      const dots = await page.$$("[data-post-more]")
      await dots[dots.length - 1].click()
      await sleep(450)
      const inDots = await page.evaluate(() => [...document.querySelectorAll("[role=menuitem], button")].some((b) => b.textContent?.trim() === "Send in a message"))
      expect(inDots, "a card in the feed offers Send in a message among its dots")
      await page.keyboard.press("Escape")
      await sleep(450)
      /* The opened post: its share button is a menu with Send in a message first. */
      await page.click("[data-share-post]")
      await sleep(450)
      const clicked = await page.evaluate(() => {
        const item = [...document.querySelectorAll("[role=menuitem], button, a")].find((b) => b.textContent?.trim() === "Send in a message")
        item?.click()
        return !!item
      })
      expect(clicked, "the post's share button offers Send in a message")
      await page.waitForSelector("[data-picker-frame] [data-share-target]", { timeout: 5000 }).catch(() => {})
      await sleep(450)
      const kind = await page.$eval("[data-picker]", (el) => el.getAttribute("data-picker")).catch(() => null)
      expect(kind === (label === "390" ? "sheet" : "dialog"), "a dialog on a computer, a sheet on a phone", kind)
      const groups = await page.$$eval("[data-picker-list] [role=group]", (els) => els.map((g) => ({ label: g.getAttribute("aria-label"), rows: [...g.querySelectorAll("[data-share-target]")].map((r) => r.getAttribute("data-share-target").split(":")[0]) })))
      expect(groups.map((g) => g.label).join() === "Recent,Channels,People" && groups[0].rows.join() === "dm,group,dm" && groups[1].rows.every((k) => k === "space"), "recent conversations and groups, then channels, then people", groups)
      expect(!groups[2]?.rows.length || !(await page.$(`[data-share-target="person:${BEN.id}"]`)), "somebody already in a conversation is that conversation, not listed twice")
      const headline = await page.$eval("[data-share-headline]", (el) => el.textContent).catch(() => null)
      expect(headline === "Dovetail jig, finally square", "it names the post being sent", headline)
      console.log(`    ${await shot(page, `share-${label}-${tone}`)}`)
      await page.click(`[data-share-target="dm:${CONVO}"]`)
      await page.click(`[data-share-target="space:${CHATS[3].id}"]`)
      await page.click("[data-share-note]")
      await page.keyboard.type("Worth a look")
      const send = await page.$eval("[data-share-send]", (el) => el.textContent)
      expect(send === "Send to 2", "the button names how many chats", send)
      console.log(`    ${await shot(page, `share-picked-${label}-${tone}`)}`)
      await page.click("[data-share-send]")
      await sleep(600)
      const b = state.shares[0]
      expect(!!b && b.postId === "00000000-0000-4000-a000-000000000201" && b.note === "Worth a look" && b.targets.map((t) => t.kind).join() === "dm,space", "one request: the post, the note, both chats", b)
      const done = await page.evaluate(() => ({ toast: document.body.textContent.includes("Sent to 2 chats"), open: !!document.querySelector("[data-picker-frame]") }))
      expect(done.toast && !done.open, "it says where it went and closes", done)
      const w = await wide(page)
      expect(w.doc <= w.view, "nothing wider than the screen", w)
      expect(errors.length === 0, "no page errors", errors)
      await page.close()
    }
  }

  console.log(`\nNew message opened cold, ${label}`)
  if (runs("cold")) {
    const { page, errors } = await open("panel", vp, { state: { coldMs: 1200 } })
    await page.evaluate(() => window.__openMessages())
    await page.waitForSelector("[data-messages-new]")
    /* Every 50ms from the press: the skeleton or the rows, the list box's height, and the visible height the page knows. */
    const samples = await page.evaluate(
      () =>
        new Promise((done) => {
          const out = []
          const t0 = performance.now()
          document.querySelector("[data-messages-new]").click()
          const tick = () => {
            const list = document.querySelector("[data-picker-list]")
            out.push({ t: Math.round(performance.now() - t0), skel: !!document.querySelector("[data-picker-skeleton]"), rows: document.querySelectorAll("[data-picker-rows] [data-person]").length, h: Math.round(list?.getBoundingClientRect().height ?? 0), vv: getComputedStyle(document.documentElement).getPropertyValue("--vv-h").trim() })
            if (performance.now() - t0 < 2000) setTimeout(tick, 50)
            else done(out)
          }
          tick()
        }),
    )
    const lastSkel = [...samples].reverse().find((x) => x.skel)
    const firstRows = samples.find((x) => x.rows > 0)
    expect(!!lastSkel && lastSkel.t > 300, "before the list ever came back: skeleton rows", lastSkel)
    console.log(`    ${await shot(page, `cold-after-${label}`)}`)
    expect(!!firstRows && firstRows.rows === SUGGESTED.length && !firstRows.skel && firstRows.h === lastSkel.h && lastSkel.vv === firstRows.vv, "then the rows in its place, in a box of the same height", { lastSkel, firstRows, heights: [...new Set(samples.map((x) => `${x.h}@${x.vv}`))] })
    expect(errors.length === 0, "no page errors", errors)
    await page.close()
  }
}

await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall held")
process.exit(broken ? 1 : 0)
