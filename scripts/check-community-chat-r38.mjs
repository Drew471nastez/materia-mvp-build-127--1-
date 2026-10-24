/**
 * ===========================================================================
 *  ROUND 38'S COMMUNITY CHAT, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-chat-r38.tsx) in headless
 * Chromium at 1440x900 and on a 390x844 phone, light and dark, with this
 * script answering every /api request the screens make. Pictures of each go
 * to SHOTS_DIR (a temp folder by default).
 *
 *   TAB          the row of places reads Community, Chat, Learn, ... with
 *                Chat lit; the left column too (1440); the chips are the chat
 *                channels alone, the main one first, no All; the pinned line
 *                sits under the channel's name; nothing wider than the screen
 *   READ ONLY    an announcements channel has no box, and says why
 *   PROFILE      Message beside Follow at Follow's height; greyed, its reason
 *                is under the row and a press says it again; the members
 *                list greys a member's Message and keeps the admin's
 *   CHAT PANEL   the Chat tab switch and its channel, who can post with the
 *                level beside it, slow mode and the pinned line per channel,
 *                who can start a conversation with its number; nothing wider
 *                than the screen at 390
 *   AUTOMATIONS  the list with its counts; New message opens the sheet, the
 *                words show filled in for one member, a broadcast says how
 *                many members get it and its button names the number
 *
 *   PROBE_CSS=source node scripts/check-community-chat-r38.mjs
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
const stubs = join(root, ".community-chat-r38-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-chat-r38-")), "shots")
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
  nodePaths: [join(root, "node_modules"), "/home/user/materia-mvp-build-127--1-/node_modules"],
})
const css = await appCss(root)
const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const fonts = interFaces(root)
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const ME = { id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "Ana Ruiz" }
const OLIVIA = "dddddddd-0000-4000-8000-00000000000d"
const author = (id, name, role = "member") => ({ id, name, username: null, avatarUrl: null, role, level: 3 })
const msg = (i, who, body, minsAgo) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, spaceId: "5a5a5a5a-0000-4000-8000-000000000001", status: "published", authorId: who.id, author: who, mine: who.id === ME.id, body, attachments: [], replyToId: null, replyTo: null, clientId: null, createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString(), editedAt: null, reactionCount: i % 3 === 0 ? 2 : 0, reacted: false, canEdit: who.id === ME.id, canDelete: who.id === ME.id, canModerate: false })
const olivia = author(OLIVIA, "Olivia Hart", "owner")
const ben = author("bbbbbbbb-0000-4000-8000-00000000000b", "Ben Okafor")
const cleo = author("cccccccc-0000-4000-8000-00000000000c", "Cleo Park")
const me = author(ME.id, ME.name)
const MESSAGES = [
  msg(1, olivia, "Welcome in! Read the rules in About, then say hi here. Office hours are Thursdays at 6pm.", 300),
  msg(2, ben, "Morning all. Finished the dovetail jig from last week's lesson.", 120),
  msg(3, cleo, "Photos or it didn't happen", 118),
  msg(4, ben, "Posting them in Wins tonight.", 117),
  msg(5, me, "Which saw did you use for the tails?", 60),
  msg(6, ben, "A Japanese dozuki. Cheap one, works fine.", 58),
  msg(7, olivia, "We'll go through saws on Thursday. Bring questions.", 20),
]

const CHANNELS = [
  { id: "5a5a5a5a-0000-4000-8000-000000000001", name: "lounge", slug: "lounge", slowMode: 0, post: "everyone", minLevel: 0, pinned: { id: MESSAGES[0].id, authorName: "Olivia Hart", text: MESSAGES[0].body } },
  { id: "5a5a5a5a-0000-4000-8000-000000000002", name: "announcements", slug: "announcements", slowMode: 0, post: "team", minLevel: 0, pinned: null },
  { id: "5a5a5a5a-0000-4000-8000-000000000003", name: "wins", slug: "wins", slowMode: 30, post: "level", minLevel: 3, pinned: null },
]
const SETTINGS = { dmPolicy: "level", dmMinLevel: 3, dmMinDays: 7, dmToStaff: true, groupsPolicy: "members", attachmentsEnabled: true, pushPreviews: true, rules: "Be kind.\nNo selling in chat.", rulesVersion: 2, chatTab: true, mainSpaceId: CHANNELS[0].id }
const AUTOMATIONS = [
  { id: "a1", name: "Welcome", trigger: "join", triggerLevel: null, triggerDays: null, target: "dm", spaceId: null, senderId: OLIVIA, body: "Hi {first_name}, welcome to {community}! Say hello in the lounge and tell us what you are building.", segment: {}, status: "active", sendAt: null, sent: 184, failed: 2, pending: 0, lastSentAt: new Date().toISOString(), createdAt: new Date().toISOString() },
  { id: "a2", name: "Level 5", trigger: "level", triggerLevel: 5, triggerDays: null, target: "dm", spaceId: null, senderId: OLIVIA, body: "You reached level 5, {first_name}. The advanced joinery program is open to you now.", segment: {}, status: "active", sendAt: null, sent: 23, failed: 0, pending: 0, lastSentAt: null, createdAt: new Date().toISOString() },
  { id: "a3", name: "Thursday reminder", trigger: "broadcast", triggerLevel: null, triggerDays: null, target: "channel", spaceId: CHANNELS[1].id, senderId: OLIVIA, body: "Office hours start in an hour. Questions welcome.", segment: {}, status: "scheduled", sendAt: new Date(Date.now() + 2 * 86400000).toISOString(), sent: 0, failed: 0, pending: 0, lastSentAt: null, createdAt: new Date().toISOString() },
  { id: "a4", name: "Two weeks in", trigger: "days", triggerLevel: null, triggerDays: 14, target: "dm", spaceId: null, senderId: OLIVIA, body: "Two weeks in. What would make this place more useful for you?", segment: {}, status: "paused", sendAt: null, sent: 61, failed: 0, pending: 12, lastSentAt: null, createdAt: new Date().toISOString() },
]

function handle(r) {
  const url = new URL(r.url())
  const method = r.method()
  const json = (body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {})
  const path = url.pathname
  if (path === `/api/app/community/${CID}/chat` && method === "GET") {
    if (url.searchParams.get("recent")) return json({ messages: MESSAGES.slice().reverse().map((m) => ({ id: m.id, authorName: m.author.name, text: m.body, createdAt: m.createdAt })) })
    return json({ ready: true, ready272: true, chatEnabled: true, settings: SETTINGS, channels: CHANNELS, restricted: [], canEdit: true, canModerate: true })
  }
  if (path === `/api/app/community/${CID}/chat` && method === "PATCH") return json({ settings: { ...SETTINGS, ...JSON.parse(r.postData() || "{}") } })
  if (path === `/api/app/community/${CID}/chat` && method === "POST") return json({ ok: true, pinned: CHANNELS[0].pinned })
  if (path === `/api/app/community/${CID}/chat/automations` && method === "GET") return json({ ready: true, automations: AUTOMATIONS, senders: [{ userId: OLIVIA, name: "Olivia Hart", role: "owner" }, { userId: ben.id, name: "Ben Okafor", role: "moderator" }], channels: CHANNELS.map((c) => ({ id: c.id, name: c.name, slug: c.slug })), tiers: [{ id: "eeeeeeee-0000-4000-8000-00000000000e", name: "Workshop" }], chatEnabled: true, canEdit: true })
  if (path === `/api/app/community/${CID}/chat/automations` && method === "POST") {
    const b = JSON.parse(r.postData() || "{}")
    if (b.action === "preview") return json({ text: b.body, audience: b.segment?.minLevel ? 61 : 214 })
    return json({ automation: { ...AUTOMATIONS[0], id: "new" } }, 201)
  }
  if (path.endsWith("/read")) return json({ ok: true })
  if (path.includes("/chat/prefs")) return json({ notify: "default", mutedUntil: null })
  if (path.includes("/messages")) return json({ messages: [], hasMore: false })
  return json({ error: "not_found" }, 404)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 30_000 })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

async function open(mode, viewport, { darkMode = false, extra = {} } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) page.on("console", (m) => console.log("    [page]", m.text()))
  await page.evaluateOnNewDocument((p) => {
    window.__probe = p
  }, { mode, communityId: CID, me: ME, messages: MESSAGES, ...extra })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    if (r.url().startsWith(`${ORIGIN}/api/`)) return void handle(r)
    if (r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: html })
    r.continue().catch(() => {})
  })
  await page.goto(`${ORIGIN}/community/studio-notes/space/lounge`, { waitUntil: "load" })
  /* Dark as a person who chose it sees Storelib's buyer pages and a community (app/theme-dark.css under html[data-sl-dark]). */
  if (darkMode) await page.evaluate(() => document.documentElement.setAttribute("data-sl-dark", ""))
  await sleep(500)
  return { page, errors }
}
const wide = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: innerWidth }))
const shot = async (page, name, full = false) => {
  const file = join(shots, `${name}.png`)
  await page.screenshot({ path: file, fullPage: full })
  return file
}

for (const [label, vp] of [["1440", DESK], ["390", PHONE]]) {
  for (const darkMode of [false, true]) {
    const tone = darkMode ? "dark" : "light"
    console.log(`\nThe Chat tab, ${label}, ${tone}`)
    {
      const { page, errors } = await open("tab", vp, { darkMode })
      await page.waitForSelector("[data-chat]")
      const tabs = await page.$$eval("[data-community-tabs] [data-community-nav]", (els) => els.map((e) => ({ label: e.getAttribute("data-community-nav"), on: e.getAttribute("data-on") })))
      expect(tabs.map((t) => t.label).slice(0, 3).join() === "Community,Chat,Learn", "the row reads Community, Chat, Learn...", tabs.map((t) => t.label))
      expect(tabs.find((t) => t.label === "Chat")?.on === "true" && tabs.filter((t) => t.on === "true").length === 1, "Chat is the one lit")
      if (label === "1440") {
        const wall = await page.$$eval("[data-wall-places] [data-community-nav]", (els) => els.map((e) => `${e.getAttribute("data-community-nav")}:${e.getAttribute("data-on")}`))
        expect(wall[1] === "Chat:true", "the left column has Chat second, lit", wall)
      }
      /* From 640px the chips sit above the chat; on a phone the chat covers the page under the bar, so they ride under the channel's name. */
      const chips = await page.$$eval("[data-space-chip]", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute("data-space-chip")))
      expect(chips.join() === "lounge,announcements,wins", "the chips: chat channels only, the main one first, no All, one row on screen", chips)
      if (label === "390") {
        const row = await page.$eval("[data-chat-channels-phone]", (el) => { const r = el.getBoundingClientRect(); const h = document.querySelector("[data-chat] header").getBoundingClientRect(); return { top: Math.round(r.top), headBottom: Math.round(h.bottom), visible: r.height > 0 } }).catch(() => null)
        expect(!!row && row.visible && row.top === row.headBottom, "on a phone the channels sit under the channel's name, inside the chat", row)
      }
      const pin = await page.$eval("[data-chat-pinned]", (el) => { const r = el.getBoundingClientRect(); const h = (document.querySelector("[data-chat-channels-phone]")?.getBoundingClientRect().height ? document.querySelector("[data-chat-channels-phone]") : document.querySelector("[data-chat] header")).getBoundingClientRect(); return { top: Math.round(r.top), headBottom: Math.round(h.bottom), height: Math.round(r.height), text: el.textContent } }).catch(() => null)
      expect(!!pin && Math.abs(pin.top - pin.headBottom) <= 1 && /Pinned/.test(pin.text), "the pinned line sits right under the channel's name (and its channels on a phone)", pin)
      const box = await page.$("[data-chat-form] textarea")
      expect(!!box, "a member can write in the main channel")
      const w = await wide(page)
      expect(w.doc <= w.view, "nothing wider than the screen", w)
      expect(errors.length === 0, "no page errors", errors)
      console.log(`    ${await shot(page, `tab-${label}-${tone}`)}`)
      await page.close()
    }
    console.log(`\nAn announcements channel, ${label}, ${tone}`)
    {
      const { page, errors } = await open("readonly", vp, { darkMode })
      await page.waitForSelector("[data-chat]")
      const closed = await page.evaluate(() => ({ box: !!document.querySelector("[data-chat-form] textarea"), text: document.querySelector("[data-chat]")?.textContent ?? "" }))
      expect(!closed.box && /Only the team posts in this channel\./.test(closed.text), "no box, and the reason in its place", closed.box)
      expect(errors.length === 0, "no page errors", errors)
      console.log(`    ${await shot(page, `readonly-${label}-${tone}`)}`)
      await page.close()
    }
    console.log(`\nMessage on a profile, ${label}, ${tone}`)
    for (const can of [true, false]) {
      const { page, errors } = await open("profile", vp, { darkMode, extra: { profileCan: can } })
      await page.waitForSelector("[data-member-profile-actions]")
      const m = await page.evaluate(() => {
        const f = document.querySelector("[data-member-profile-follow]")?.getBoundingClientRect()
        const b = document.querySelector("[data-member-profile-message]")
        const r = b?.getBoundingClientRect()
        return { follow: f ? { top: Math.round(f.top), h: Math.round(f.height) } : null, msg: r ? { top: Math.round(r.top), h: Math.round(r.height), state: b.getAttribute("data-member-profile-message"), color: getComputedStyle(b).color } : null, why: document.querySelector("[data-member-profile-message-why]")?.textContent ?? null }
      })
      expect(!!m.msg && !!m.follow && m.msg.top === m.follow.top && m.msg.h === m.follow.h, `Message ${can ? "" : "(greyed) "}beside Follow, at its height`, m)
      if (can) expect(m.msg?.state === "on" && m.why === null, "pressable, no reason")
      else {
        expect(m.msg?.state === "off" && m.why === "Messages open at level 3", "greyed with its reason under the row", m.why)
        await page.click("[data-member-profile-message]")
        await sleep(200)
        const toast = await page.evaluate(() => document.body.textContent.includes("Messages open at level 3"))
        expect(toast, "a press says the reason again")
      }
      const rows = await page.$$eval("[data-member-message]", (els) => els.map((e) => ({ state: e.getAttribute("data-member-message"), op: getComputedStyle(e).opacity })))
      expect(rows.length === 2 && rows[0].state === "off" && rows[1].state === "on", "the list greys a member's Message (level rule) and keeps the admin's", rows)
      const w = await wide(page)
      expect(w.doc <= w.view, "nothing wider than the screen", w)
      expect(errors.length === 0, "no page errors", errors)
      console.log(`    ${await shot(page, `profile-${can ? "on" : "off"}-${label}-${tone}`)}`)
      await page.close()
    }
  }
  console.log(`\nSettings > Chat, ${label}`)
  {
    const { page, errors } = await open("chat-panel", vp)
    await page.waitForSelector("[data-chat-channels] li")
    const f = await page.evaluate(() => ({
      tab: !!document.querySelector("[data-chat-tab-settings] [role=switch]"),
      main: document.querySelector("[data-select=chat-main-channel]")?.textContent ?? null,
      posts: [...document.querySelectorAll("[data-chat-channel]")].map((li) => ({ slug: li.getAttribute("data-chat-channel"), post: li.querySelector("[data-select^=post-]")?.textContent ?? null, level: li.querySelector("input[type=number]")?.value ?? null, pin: li.querySelector("[data-chat-channel-pin]")?.textContent ?? "" })),
      dm: document.querySelector("[data-select=chat-dm-policy]")?.textContent ?? null,
      dmLevel: document.querySelector("#chat-dm-level")?.value ?? null,
    }))
    expect(f.tab && f.main === "#lounge", "the Chat tab switch and the channel it opens", f.main)
    expect(f.posts.length === 3 && f.posts[1].post === "The team only (announcements)" && f.posts[2].post === "From a level" && f.posts[2].level === "3" && f.posts[0].level === null, "who can post per channel, the level beside it", f.posts.map((p) => [p.post, p.level]))
    expect(/Olivia Hart/.test(f.posts[0].pin) && /Nothing pinned/.test(f.posts[1].pin), "the pinned line per channel", f.posts.map((p) => p.pin.slice(0, 40)))
    expect(f.dm === "Members from a level" && f.dmLevel === "3", "who can start a conversation, with its number", [f.dm, f.dmLevel])
    const w = await wide(page)
    expect(w.doc <= w.view, "nothing wider than the screen", w)
    expect(errors.length === 0, "no page errors", errors)
    console.log(`    ${await shot(page, `chat-panel-${label}`, true)}`)
    await page.click("[data-chat-channel=wins] [data-chat-channel-pin] button")
    await page.waitForSelector("[data-pin-list] button")
    const n = await page.$$eval("[data-pin-list] button", (els) => els.length)
    expect(n === MESSAGES.length, "Pin a message lists the channel's last messages", n)
    console.log(`    ${await shot(page, `pin-sheet-${label}`)}`)
    await page.close()
  }
  console.log(`\nSettings > Automated messages, ${label}`)
  {
    const { page, errors } = await open("automations", vp)
    await page.waitForSelector("[data-automation-list] li")
    const rows = await page.$$eval("[data-automation-list] li", (els) => els.map((e) => e.querySelector("[data-automation-counts]")?.textContent ?? ""))
    expect(rows.length === 4 && /184 sent/.test(rows[0]) && /2 not sent/.test(rows[0]) && /Paused/.test(rows[3]) && /12 waiting/.test(rows[3]), "each row: its state and counts", rows)
    const w = await wide(page)
    expect(w.doc <= w.view, "nothing wider than the screen", w)
    console.log(`    ${await shot(page, `automations-${label}`, true)}`)
    await page.click("[data-automation-new]")
    await page.waitForSelector("[data-automation-editor]")
    await page.type("#auto-name", "Spring sale")
    await page.type("[data-automation-body]", "Hi {first_name}, members of {community} get 20% off this week.")
    await sleep(150)
    const preview = await page.$eval("[data-automation-preview]", (el) => el.textContent)
    expect(/Hi Ana, members of Studio Notes get 20% off this week\./.test(preview), "the words as one member reads them", preview.slice(0, 120))
    console.log(`    ${await shot(page, `automation-sheet-${label}`)}`)
    /* A broadcast: pick "Once" from the sheet's list. */
    await page.click("[data-select=auto-trigger]")
    await sleep(250)
    const picked = await page.evaluate(() => {
      const opt = [...document.querySelectorAll("[role=option], [data-pick-option], button")].find((b) => b.textContent?.trim() === "Once, now or at a time")
      if (!opt) return false
      opt.click()
      return true
    })
    await page.waitForSelector("[data-automation-audience]", { timeout: 4000 }).catch(() => {})
    const b = await page.evaluate(() => ({ audience: document.querySelector("[data-automation-audience]")?.getAttribute("data-automation-audience") ?? null, save: document.querySelector("[data-automation-save]")?.textContent ?? "" }))
    expect(picked && b.audience === "214" && b.save === "Send to 214 members", "a broadcast says how many get it, and the button names the number", b)
    console.log(`    ${await shot(page, `automation-broadcast-${label}`)}`)
    expect(errors.length === 0, "no page errors", errors)
    await page.close()
  }
}

await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall held")
process.exit(broken ? 1 : 0)
