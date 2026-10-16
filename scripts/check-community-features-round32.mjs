/**
 * ===========================================================================
 *  ROUND 32, MEASURED: WHAT A COMMUNITY WAS MISSING
 * ===========================================================================
 * The new pieces in headless Chromium, at 390 (a phone, touch) and 1440,
 * over the real components (scripts/render-community-features-round32.tsx),
 * every /api/ answer given here and every request written down:
 *
 *   QUESTIONS  Settings' questions before joining: the rows, Add question,
 *              the save bar up only with a change, the PUT it sends, the
 *              preview showing the member's own fields
 *   JOINFORM   the member's join form: a press opens the questions (a sheet
 *              on a phone, a dialog on a computer), the button waits for the
 *              required ones, the foot stays on screen with every question,
 *              POST join carries the answers, fields are 16px on a phone
 *   REQUESTS   the queue with the answers, Approve sends Members' own PATCH
 *              and the row goes
 *   ONBOARDING first steps and the welcome message: the rows, Add step's
 *              menu, the message box under its switch, the PUT
 *   SCHEDULED  the list in its groups, the form (sheet or dialog), the POST
 *              with a time an hour ahead
 *   BULK       a paste counts its addresses, Send sends them, the answer
 *   FIRSTSTEPS a member's list: the count, the rows, a manual step ticked
 *   OVERFLOW   nothing wider than the screen, anywhere above
 *
 *   node scripts/check-community-features-round32.mjs [QUESTIONS JOINFORM ...]
 *   SHOTS_DIR=dir keeps the pictures (.round32-features-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".community-features32-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round32-features-shots")
const ORIGIN = "https://storelib.com"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const QUESTIONS = [
  { id: "q_aaaaaaaa", kind: "short", label: "What do you make?", help: "A line is plenty.", required: true, options: [] },
  { id: "q_bbbbbbbb", kind: "choice", label: "How long have you been making things?", help: "", required: true, options: ["Under a year", "One to five years", "Longer"] },
  { id: "q_cccccccc", kind: "multi", label: "What are you here for?", help: "", required: false, options: ["Feedback on my work", "Friends who make things", "The courses", "The weekly calls"] },
  { id: "q_dddddddd", kind: "long", label: "Anything else we should know before you join?", help: "", required: false, options: [] },
  { id: "q_eeeeeeee", kind: "email", label: "Your email for the newsletter", help: "", required: false, options: [] },
]
const iso = (ms) => new Date(ms).toISOString()
const NOW = Date.now()

function answer(url, method, body) {
  const path = url.replace(ORIGIN, "")
  if (path.endsWith("/join-questions") && method === "GET") return { ready: true, questions: QUESTIONS }
  if (path.endsWith("/join-questions") && method === "PUT") return { questions: (body.questions || []).map((q, i) => ({ ...q, id: q.id || `q_new0000${i}`, help: q.help || "", options: q.options || [] })) }
  if (path.endsWith("/join") && method === "POST") return { state: "member", url: "/community/salajanywood" }
  if (path.includes("/join-requests")) return {
    rows: [
      { userId: "u-1", name: "Ioana Petrescu", username: "ioana", avatarUrl: null, email: "ioana@example.com", requestedAt: iso(NOW - 3_600_000), note: null, approved: false, answers: [{ id: "q_aaaaaaaa", label: "What do you make?", kind: "short", value: "Walnut cutting boards and small boxes" }, { id: "q_bbbbbbbb", label: "How long have you been making things?", kind: "choice", value: "One to five years" }, { id: "q_cccccccc", label: "What are you here for?", kind: "multi", value: ["Feedback on my work", "The weekly calls"] }] },
      { userId: "u-2", name: "Marcus Lindqvist", username: "marcus", avatarUrl: null, email: "marcus@example.com", requestedAt: iso(NOW - 86_400_000), note: "Found you through the spoon carving thread.", approved: false, answers: [{ id: "q_aaaaaaaa", label: "What do you make?", kind: "short", value: "Spoons" }] },
      { userId: "u-3", name: "Ana Souza", username: null, avatarUrl: null, email: null, requestedAt: iso(NOW - 2 * 86_400_000), note: null, approved: true, answers: [] },
    ],
    total: 3, questions: QUESTIONS, ready: true, approvalRequired: true, canExport: true,
  }
  if (path.includes("/members/") && method === "PATCH") return { status: "active", role: "member", mutedUntil: null }
  if (path.endsWith("/onboarding") && method === "GET") return { ready: true, messages: true, config: { steps: [{ id: "intro", kind: "intro", label: "", url: "" }, { id: "rules", kind: "rules", label: "", url: "" }, { id: "c_abcdef", kind: "custom", label: "Book your first call", url: "https://cal.com/salajany" }], dmEnabled: false, dmBody: "" } }
  if (path.endsWith("/onboarding") && method === "PUT") return { config: { steps: body.steps, dmEnabled: body.dmEnabled, dmBody: body.dmBody } }
  if (path.endsWith("/scheduled-posts") && method === "GET") return {
    ready: true,
    spaces: [{ id: "s-ann", name: "Announcements", kind: "announcements", icon: null }, { id: "s-gen", name: "General", kind: "feed", icon: null }],
    rows: [
      { id: "p1", status: "scheduled", spaceId: "s-ann", spaceName: "Announcements", title: "Friday call: finishing oils", body: "Bring a board.", publishAt: iso(NOW + 2 * 86_400_000), publishedAt: null, postId: null, error: null, authorId: "me", authorName: "Ana", mine: true, updatedAt: iso(NOW) },
      { id: "p2", status: "draft", spaceId: "s-gen", spaceName: "General", title: "Monthly challenge ideas", body: "", publishAt: null, publishedAt: null, postId: null, error: null, authorId: "me", authorName: "Ana", mine: true, updatedAt: iso(NOW - 3_600_000) },
      { id: "p3", status: "failed", spaceId: null, spaceName: null, title: "Old space post", body: "x", publishAt: iso(NOW - 86_400_000), publishedAt: null, postId: null, error: "Its space was removed. Pick another space and schedule it again.", authorId: "me", authorName: "Ana", mine: true, updatedAt: iso(NOW - 86_400_000) },
      { id: "p4", status: "published", spaceId: "s-gen", spaceName: "General", title: "Welcome, new members", body: "x", publishAt: iso(NOW - 3 * 86_400_000), publishedAt: iso(NOW - 3 * 86_400_000), postId: "post-1", error: null, authorId: "me", authorName: "Ana", mine: true, updatedAt: iso(NOW - 3 * 86_400_000) },
    ],
  }
  if (path.endsWith("/scheduled-posts") && method === "POST") return { post: { id: "p9", status: body.publishAt ? "scheduled" : "draft", spaceId: body.spaceId, spaceName: "General", title: body.title, body: body.body, publishAt: body.publishAt, publishedAt: null, postId: null, error: null, authorId: "me", authorName: "Ana", mine: true, updatedAt: iso(NOW) } }
  if (path.endsWith("/tiers")) return { tiers: [{ id: "t-free", name: "Members", archived: false }, { id: "t-pro", name: "Pro", archived: false }] }
  if (path.endsWith("/invites/bulk")) return { found: 3, result: { sent: 2, members: 1, recent: 0, failed: 0, limited: 0 } }
  if (path.endsWith("/get-started") && method === "GET") return { checklist: { done: 1, total: 4, items: [
    { id: "intro", kind: "intro", label: "Introduce yourself", href: "/community/salajanywood/space/introductions", done: true, manual: false },
    { id: "rules", kind: "rules", label: "Read the rules", href: "/community/salajanywood/about#community-rules", done: false, manual: true },
    { id: "learn", kind: "learn", label: "Start a program", href: "/community/salajanywood/learn", done: false, manual: false },
    { id: "c_abcdef", kind: "custom", label: "Book your first call with Ana", href: "https://cal.com/salajany", done: false, manual: true },
  ] } }
  if (path.endsWith("/get-started")) return { ok: true }
  return {}
}

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push: (h) => (window.__pushed ||= []).push(h), replace() {}, prefetch() {}, refresh: () => (window.__refreshed = (window.__refreshed || 0) + 1), back() {}, forward() {} }
export const useRouter = () => router
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault(); (window.__pushed ||= []).push(href) } }, children)
})
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) } } }\nexport const isNativePlatform = () => false\n`)
  const css = await appCss(root)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-features-round32.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-features32-probe/navigation.js", "next/link": "./.community-features32-probe/link.jsx", "next/image": "./.community-features32-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "features.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "features.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(query, vp) {
    /* A fresh context each time: what one page keeps on the device (a list hidden) is not the next page's. */
    const context = await browser.createBrowserContext()
    const p = await context.newPage()
    await p.setViewport(vp)
    const errors = []
    const api = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        let body = {}
        try { body = r.postData() ? JSON.parse(r.postData()) : {} } catch {}
        api.push({ method: r.method(), path: url.replace(ORIGIN, ""), body })
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer(url, r.method(), body)) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/probe?${query}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(500)
    return { p, errors, api }
  }
  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom), shown: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 }
    }, sel)
  const wide = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth, over: [...document.querySelectorAll("body *")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !el.closest("[data-radix-popper-content-wrapper]") }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`) }))
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
  const clickText = (p, text, scope = "body") =>
    p.evaluate((text, scope) => {
      const el = [...document.querySelectorAll(`${scope} button, ${scope} a, ${scope} [role=menuitem]`)].find((b) => b.textContent.trim() === text)
      if (!el) return false
      el.click()
      return true
    }, text, scope)
  const fieldFont = (p, sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => parseFloat(getComputedStyle(el).fontSize)), sel)
  const overflow = (name, w) => expect(w.doc <= w.vw && w.over.length === 0, `${name}: nothing wider than the screen`, w)

  if (want("QUESTIONS")) {
    console.log("\nQUESTIONS")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=join-questions", vp)
      const rows = await p.$$eval("[data-join-question-row]", (els) => els.length)
      expect(rows === 5, `${vpName}: the five questions are drawn`, rows)
      expect((await box(p, "[data-editor-foot]"))?.shown !== true || (await p.$eval("[data-editor-foot]", (el) => el.getAttribute("data-foot"))) === "down", `${vpName}: no save bar before a change`)
      if (vpName === "390") expect((await fieldFont(p, "[data-join-question-label]")).every((s) => s >= 16), "390: question fields are 16px, so iOS does not zoom", await fieldFont(p, "[data-join-question-label]"))
      overflow(`${vpName} questions`, await wide(p))
      await shot(p, `questions-${vpName}`)
      await p.click("[data-join-question-add]")
      await sleep(150)
      expect((await p.$$eval("[data-join-question-row]", (els) => els.length)) === 6, `${vpName}: Add question adds a row`)
      await p.type("[data-join-question-row='5'] [data-join-question-label]", "Where are you based?")
      await sleep(200)
      expect((await p.$eval("[data-editor-foot]", (el) => el.getAttribute("data-foot"))) === "up", `${vpName}: the save bar rises with the change`)
      await p.click("[data-foot-save], [data-editor-foot] button:last-of-type")
      await sleep(500)
      const put = api.find((a) => a.method === "PUT")
      expect(!!put && put.body.questions.length === 6 && put.body.questions[5].label === "Where are you based?" && put.body.questions[0].id === "q_aaaaaaaa", `${vpName}: Save sends the six, ids kept`, put?.body?.questions?.length)
      await p.click("[data-join-questions-preview]")
      await sleep(500)
      const fields = await p.$$eval("[role=dialog] [data-join-question], [data-bottom-sheet] [data-join-question], [data-join-question]", (els) => new Set(els.map((e) => e.getAttribute("data-join-question"))).size)
      expect(fields >= 6, `${vpName}: Preview shows the member's own fields`, fields)
      await shot(p, `questions-preview-${vpName}`)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("JOINFORM")) {
    console.log("\nJOINFORM")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=join-form&kind=join_free", vp)
      expect(api.some((a) => a.path.endsWith("/join-questions")), `${vpName}: the questions are asked as the page arrives`)
      await p.click("[data-join-state='join_free']")
      await sleep(700)
      const form = await box(p, "[data-join-form]")
      expect(!!form?.shown, `${vpName}: the press opens the questions`, form)
      expect(!api.some((a) => a.path.endsWith("/join")), `${vpName}: nothing is joined before they answer`)
      const send = await box(p, "[data-join-form-send]")
      expect(!!send && send.bottom <= vp.height && send.y >= 0, `${vpName}: the button is on screen with all five questions`, send)
      expect(await p.$eval("[data-join-form-send]", (b) => b.disabled), `${vpName}: and waits for the required answers`)
      if (vpName === "390") {
        const sizes = await fieldFont(p, "[data-join-form] input, [data-join-form] textarea")
        expect(sizes.length >= 3 && sizes.every((s) => s >= 16), "390: the fields are 16px", sizes)
        const sheet = await p.evaluate(() => {
          const panel = document.querySelector("[data-join-form]")?.closest("[data-sheet-panel]")
          if (!panel) return null
          const b = panel.getBoundingClientRect()
          return { left: Math.round(b.left), width: Math.round(b.width), bottom: Math.round(b.bottom), vh: window.innerHeight }
        })
        expect(!!sheet && sheet.left === 0 && sheet.width === 390 && sheet.bottom >= sheet.vh - 1, "390: the shared bottom sheet, across the width and down to the foot", sheet)
      }
      await p.type("[data-join-form] input[type=text]", "Walnut boxes")
      await p.evaluate(() => [...document.querySelectorAll("[data-join-question='q_bbbbbbbb'] [role=radio]")][1].click())
      await p.evaluate(() => [...document.querySelectorAll("[data-join-question='q_cccccccc'] [role=checkbox]")][0].click())
      await sleep(150)
      await shot(p, `join-form-${vpName}`)
      expect(!(await p.$eval("[data-join-form-send]", (b) => b.disabled)), `${vpName}: answered, Join can be pressed`)
      await p.click("[data-join-form-send]")
      await sleep(600)
      const post = api.find((a) => a.path.endsWith("/join") && a.method === "POST")
      expect(!!post && post.body.answers?.q_aaaaaaaa === "Walnut boxes" && post.body.answers?.q_bbbbbbbb === "One to five years" && JSON.stringify(post.body.answers?.q_cccccccc) === JSON.stringify(["Feedback on my work"]), `${vpName}: POST join carries the answers`, post?.body)
      overflow(`${vpName} join form`, await wide(p))
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("REQUESTS")) {
    console.log("\nREQUESTS")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=requests", vp)
      expect((await p.$$eval("[data-join-request]", (els) => els.length)) === 3, `${vpName}: three requests`)
      const answers = await p.$$eval("[data-join-request='u-1'] [data-join-request-answers] dd", (els) => els.map((e) => e.textContent))
      expect(answers.join("|") === "Walnut cutting boards and small boxes|One to five years|Feedback on my work, The weekly calls", `${vpName}: question over answer, choices joined`, answers)
      const exports = await p.$$eval("[data-join-answers-export]", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().width)))
      expect(exports.length === 1, `${vpName}: Download answers for the owner, once on screen`, exports)
      const title = await box(p, "section h2")
      expect(!!title && title.w >= (vpName === "390" ? 100 : 60) && title.h <= 26, `${vpName}: the heading keeps its line (the actions do not squeeze it)`, title)
      overflow(`${vpName} requests`, await wide(p))
      await shot(p, `requests-${vpName}`)
      await p.click("[data-join-request='u-1'] [data-join-request-approve]")
      await sleep(500)
      const patch = api.find((a) => a.method === "PATCH")
      expect(!!patch && patch.path.endsWith("/members/u-1") && patch.body.action === "approve", `${vpName}: Approve is Members' own PATCH`, patch)
      expect((await p.$$eval("[data-join-request]", (els) => els.length)) === 2, `${vpName}: and the row goes`)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("ONBOARDING")) {
    console.log("\nONBOARDING")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=onboarding", vp)
      expect((await p.$$eval("[data-onboarding-step]", (els) => els.map((e) => e.getAttribute("data-onboarding-step")))).join() === "intro,rules,custom", `${vpName}: the three steps`)
      await p.click("[data-onboarding-add]")
      await sleep(500)
      const offered = await p.evaluate(() => [...document.querySelectorAll("[role=menuitem], [data-bottom-sheet] button, [role=dialog] button")].map((b) => b.textContent.trim()).filter(Boolean))
      expect(offered.includes("Comment on a post") && !offered.includes("Introduce yourself"), `${vpName}: Add step offers what is not on the list yet`, offered.slice(0, 8))
      await shot(p, `onboarding-menu-${vpName}`)
      await clickText(p, "Comment on a post")
      await sleep(400)
      expect((await p.$$eval("[data-onboarding-step]", (els) => els.length)) === 4, `${vpName}: and adds it`)
      await clickText(p, "Send a welcome message")
      await p.evaluate(() => [...document.querySelectorAll("button[role=switch]")].find((b) => b.textContent.includes("Send a welcome message"))?.click())
      await sleep(200)
      const dm = await box(p, "[data-onboarding-dm]")
      if (!dm) await p.evaluate(() => [...document.querySelectorAll("button[role=switch]")].find((b) => b.textContent.includes("welcome"))?.click())
      await sleep(200)
      expect(!!(await box(p, "[data-onboarding-dm]"))?.shown, `${vpName}: the switch shows the message box`)
      await p.type("[data-onboarding-dm]", "Hi {name}, welcome in.")
      await sleep(200)
      await p.click("[data-editor-foot] button:last-of-type")
      await sleep(500)
      const put = api.find((a) => a.method === "PUT")
      expect(!!put && put.body.steps.length === 4 && put.body.dmEnabled === true && put.body.dmBody === "Hi {name}, welcome in.", `${vpName}: Save sends the steps and the message`, put?.body)
      overflow(`${vpName} onboarding`, await wide(p))
      await shot(p, `onboarding-${vpName}`)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("SCHEDULED")) {
    console.log("\nSCHEDULED")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=scheduled", vp)
      const groups = await p.$$eval("[data-scheduled-group] > p", (els) => els.map((e) => e.textContent))
      expect(groups.join() === "Scheduled,Drafts,Last two weeks", `${vpName}: the groups in order`, groups)
      expect((await p.$$eval("[data-scheduled-row]", (els) => els.map((e) => e.getAttribute("data-scheduled-row")))).join() === "scheduled,draft,failed,published", `${vpName}: each row in its place`)
      const failed = await p.$eval("[data-scheduled-row='failed'] p", (e) => e.textContent)
      expect(/space was removed/.test(failed), `${vpName}: a failed one says why`, failed)
      overflow(`${vpName} scheduled`, await wide(p))
      await shot(p, `scheduled-${vpName}`)
      await p.click("[data-scheduled-new]")
      await sleep(700)
      expect(!!(await box(p, "[data-form-sheet='scheduled-post'], #scheduled-title"))?.shown, `${vpName}: Schedule a post opens the form`)
      await p.type("#scheduled-title", "Saturday open shop")
      await p.type("#scheduled-body", "Bring a project you are stuck on.")
      await sleep(150)
      await shot(p, `scheduled-form-${vpName}`)
      await p.click("[data-scheduled-save]")
      await sleep(600)
      const post = api.find((a) => a.method === "POST")
      const ahead = post ? Date.parse(post.body.publishAt) - Date.now() : NaN
      expect(!!post && post.body.title === "Saturday open shop" && post.body.spaceId === "s-ann" && ahead > 50 * 60_000 && ahead < 70 * 60_000, `${vpName}: POST with the space and a time about an hour ahead`, post?.body)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("BULK")) {
    console.log("\nBULK")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=bulk", vp)
      await p.click("[data-bulk-invite]")
      await sleep(700)
      await p.type("#bulk-invite-text", "ana@example.com\nBo <bo@example.com>, cy@example.com\nana@example.com")
      await sleep(200)
      const count = await p.$eval("[data-bulk-invite-count]", (e) => e.getAttribute("data-bulk-invite-count"))
      expect(count === "3", `${vpName}: three addresses counted, the repeat once`, count)
      const label = await p.$eval("[data-bulk-invite-send]", (e) => e.textContent.trim())
      expect(label === "Send 3 invites", `${vpName}: the button says how many`, label)
      overflow(`${vpName} bulk`, await wide(p))
      await shot(p, `bulk-${vpName}`)
      await p.click("[data-bulk-invite-send]")
      await sleep(600)
      const post = api.find((a) => a.path.endsWith("/invites/bulk"))
      expect(!!post && post.body.text.includes("cy@example.com") && post.body.tierId === null, `${vpName}: the list is sent, no tier`, post?.body)
      const result = await p.$eval("[data-bulk-invite-result]", (e) => e.textContent)
      expect(/2 invites sent/.test(result) && /1 is a member already/.test(result), `${vpName}: what happened`, result.slice(0, 120))
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("FIRSTSTEPS")) {
    console.log("\nFIRSTSTEPS")
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      const { p, errors, api } = await open("panel=get-started", vp)
      await sleep(300)
      expect((await p.$eval("[data-get-started-count]", (e) => e.textContent)) === "1 of 4 done", `${vpName}: the count`)
      const rows = await p.$$eval("[data-get-started-step]", (els) => els.map((e) => [e.getAttribute("data-get-started-step"), e.hasAttribute("data-done")]))
      expect(JSON.stringify(rows) === JSON.stringify([["intro", true], ["rules", false], ["learn", false], ["custom", false]]), `${vpName}: the steps, the first done`, rows)
      const heights = await p.$$eval("[data-get-started-step] > *", (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
      expect(heights.every((h) => h >= 44), `${vpName}: every row is a 44px target at least`, heights)
      overflow(`${vpName} first steps`, await wide(p))
      await shot(p, `first-steps-${vpName}`)
      await p.click("[data-get-started-step='rules'] a")
      await sleep(300)
      const tick = api.find((a) => a.method === "POST")
      expect(!!tick && tick.body.step === "rules", `${vpName}: opening the rules ticks them`, tick?.body)
      expect((await p.$eval("[data-get-started-count]", (e) => e.textContent)) === "2 of 4 done", `${vpName}: at once`)
      await p.click("[data-get-started-hide]")
      await sleep(200)
      expect(!(await p.$("[data-get-started]")) && api.some((a) => a.body?.step === "dismissed"), `${vpName}: Hide hides it and says so to the server`)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall measured")
process.exit(broken ? 1 : 0)
