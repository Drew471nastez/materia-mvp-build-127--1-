/**
 * ===========================================================================
 *  LEARN, ROUND 33, MEASURED
 * ===========================================================================
 * The real program editor and the member's locked pages
 * (scripts/render-learn-round33.tsx), served at a storelib.com address with
 * the API answered here, at 1440x900 and on a 390x844 phone:
 *
 *   LAYOUT       the editor's head is one row; on a computer the access card
 *                stands beside the details at the top, on a phone under the
 *                lessons; nothing inside the editor scrolls on its own; no
 *                save bar while nothing changed; nothing scrolls sideways;
 *                on a phone every control is at least 40px tall
 *   ACCESS       five cards in order (Open, Reach a level, Buy now, Days
 *                after joining, Private), each 52px or taller; picking one
 *                shows what it needs; picking a member puts them on the
 *                list; the save bar comes up, and Cancel puts it all back
 *   RICH TEXT    the description is the product editor's field: a heading,
 *                a list and a picture drawn in it, Picture and Emoji in its
 *                toolbar
 *   ADD MODULE   with the server answering 700ms later, the new module is on
 *                screen with the caret in its name within two frames of the
 *                press, and it is the same element after the answer; a new
 *                lesson opens with the caret in its title the same way; a
 *                module the server refuses comes off again with the reason
 *   REORDER      a module moved down is in its new place in the next frame,
 *                gliding there
 *   MEMBERS      the locks say what opens them and offer the step: the level
 *                and See your points, the day it opens, Buy for $49; a rich
 *                description is drawn with its heading and picture and
 *                without a script, a handler or a javascript link
 *
 *   node scripts/check-learn-round33.mjs        (PROBE_CSS=source in a worktree)
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const work = mkdtempSync(join(tmpdir(), "storelib-learn-r33-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const numbers = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/app/community/x/learn"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
writeFileSync(join(work, "stripe-react.jsx"), `export function EmbeddedCheckoutProvider({ children }) { return children }\nexport function EmbeddedCheckout() { return null }\n`)
writeFileSync(join(work, "stripe-pure.js"), `export const loadStripe = () => Promise.resolve({})\n`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-learn-round33.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    "next/navigation": join(work, "navigation.js"),
    "next/link": join(work, "link.jsx"),
    "next/image": join(work, "image.jsx"),
    "@stripe/react-stripe-js": join(work, "stripe-react.jsx"),
    "@stripe/stripe-js/pure": join(work, "stripe-pure.js"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_probe'}};" },
  loader: { ".css": "empty" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const json = (r, body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })

const startTree = () => ({
  courseId: "k2",
  modules: [
    { id: "m1", title: "Clay and the wheel", coverUrl: null, lessons: [{ id: "l1", title: "Wedging without wrist pain", coverUrl: null, notes: "", isPreview: true, durationSeconds: 412, video: null, externalUrl: "", captions: false, attachments: [] }, { id: "l2", title: "Centering, slowly", coverUrl: null, notes: "", isPreview: false, durationSeconds: 655, video: null, externalUrl: "", captions: false, attachments: [] }] },
    { id: "m2", title: "Trimming", coverUrl: null, lessons: [{ id: "l3", title: "Leather hard, explained", coverUrl: null, notes: "", isPreview: false, durationSeconds: null, video: null, externalUrl: "", captions: false, attachments: [] }] },
  ],
})
const blank = (id, title) => ({ id, title, coverUrl: null, notes: "", isPreview: false, durationSeconds: null, video: null, externalUrl: "", captions: false, attachments: [] })

/* What the course route does with each change, here: enough of lib/courses/manage.ts for the editor to be answered as production answers it. */
function apply(tree, b) {
  if (b.action === "add-module") tree.modules.push({ id: b.moduleId, title: b.title, coverUrl: null, lessons: [blank(b.lessonId, b.lessonTitle || "Lesson 1")] })
  if (b.action === "add-lesson") tree.modules.find((m) => m.id === b.moduleId)?.lessons.push(blank(b.lessonId, b.title))
  if (b.action === "rename-module") Object.assign(tree.modules.find((m) => m.id === b.moduleId) ?? {}, { title: b.title })
  if (b.action === "order-modules") tree.modules = b.ids.map((id) => tree.modules.find((m) => m.id === id))
}

const MEMBERS = [
  { userId: "u1", name: "Erin Park", avatarUrl: null, username: "erin" },
  { userId: "u2", name: "Eric Dale", avatarUrl: null, username: "eric" },
]

async function open(vp, which) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  const state = { tree: startTree(), failAdd: false, delay: 700 }
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith("https://storelib.com/__r33")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("https://storelib.com/media/")) return r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e8e3d9"/><text x="40" y="290" font-family="Arial" font-size="44" font-weight="700" fill="#1a1a2e">Four cups</text></svg>' })
    if (u.includes("/api/")) calls.push(`${r.method()} ${u.replace("https://storelib.com", "")}`)
    if (u.includes("/api/courses/manage") && r.method() === "GET") return json(r, { tree: state.tree })
    if (u.includes("/api/courses/manage") && r.method() === "POST") {
      const b = JSON.parse(r.postData() || "{}")
      await sleep(state.delay)
      if (state.failAdd && b.action === "add-module") {
        state.failAdd = false
        return json(r, { error: "A course holds up to 50 modules." }, 400)
      }
      apply(state.tree, b)
      return json(r, { tree: state.tree })
    }
    if (u.includes("/learn/members")) return json(r, { rows: MEMBERS })
    if (/\/api\/app\/community\/[^/]+\/learn\/p2$/.test(u)) return json(r, { ok: true })
    if (/\/api\/app\/community\/[^/]+\/learn$/.test(u)) return json(r, { error: "probe" }, 500)
    if (u.startsWith("data:")) return r.continue()
    return r.abort()
  })
  await p.goto(`https://storelib.com/__r33?${which}`, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-probe-case]")
  await sleep(400)
  return { p, errors, calls, state }
}

async function common(p, label, which, phone) {
  const m = await p.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth
    const small = []
    for (const el of document.querySelectorAll("main a, main button, main input, main select")) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[hidden]") || el.closest("[aria-hidden=true]")) continue
      if (el.type === "file" || el.getAttribute("role") === "switch") continue
      if (r.height < 40) small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return { over, small }
  })
  expect(m.over <= 0, `${label} ${which}: nothing scrolls sideways`, m.over)
  if (phone) expect(m.small.length === 0, `${label} ${which}: every button, link and field is at least 40px tall`, m.small)
}

/* Frames from a press until a condition holds, counted in the page with requestAnimationFrame. */
const framesUntil = (p, pressSel, condition, pressIndex = 0) =>
  p.evaluate(
    (pressSel, condition, pressIndex) =>
      new Promise((resolve) => {
        const test = new Function(`return (${condition})`)
        const t0 = performance.now()
        let frames = 0
        const tick = () => {
          if (test()) return resolve({ frames, ms: Math.round(performance.now() - t0) })
          if (++frames > 120) return resolve({ frames: -1, ms: Math.round(performance.now() - t0) })
          requestAnimationFrame(tick)
        }
        document.querySelectorAll(pressSel)[pressIndex].click()
        requestAnimationFrame(tick)
      }),
    pressSel,
    condition,
    pressIndex,
  )

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900 }, false],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
]

for (const [label, vp, phone] of VIEWPORTS) {
  console.log(`\n${label}`)
  const n = (numbers[label] = {})

  /* The editor: layout, access cards, rich text */
  {
    const { p, errors } = await open(vp, "editor")
    await p.waitForSelector("[data-program-editor] [data-module]")
    await sleep(300)
    const g = await p.evaluate(() => {
      const r = (sel) => document.querySelector(sel)?.getBoundingClientRect()
      const head = r("[data-program-head]")
      const details = r("[data-editor-card='details']")
      const lessons = r("[data-editor-card='lessons']")
      const access = r("[data-editor-card='access']")
      const scrollers = [...document.querySelectorAll("[data-program-editor] *")].filter((el) => {
        const cs = getComputedStyle(el)
        return (cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1
      }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${el.clientHeight}/${el.scrollHeight}`)
      const cards = [...document.querySelectorAll("[data-access-card]")]
      const field = document.querySelector("[data-program-description] [contenteditable]")
      return {
        head: Math.round(head.height),
        details: { left: Math.round(details.left), right: Math.round(details.right), top: Math.round(details.top), width: Math.round(details.width) },
        access: { left: Math.round(access.left), top: Math.round(access.top), width: Math.round(access.width) },
        lessonsBottom: Math.round(lessons.bottom),
        scrollers,
        foot: document.querySelector("[data-editor-foot]")?.getAttribute("data-foot"),
        cards: cards.map((c) => c.getAttribute("data-access-card")),
        titles: cards.map((c) => c.querySelector("button > span:last-child > span:first-child")?.textContent),
        heights: cards.map((c) => Math.round(c.querySelector("button").getBoundingClientRect().height)),
        on: document.querySelector("[data-access-card][data-on]")?.getAttribute("data-access-card"),
        price: document.querySelector("#program-price")?.value,
        rich: { h2: !!field?.querySelector("h2"), ul: !!field?.querySelector("ul"), img: !!field?.querySelector("img"), emoji: /🙂/.test(field?.textContent || "") },
        tools: [...document.querySelectorAll("[data-program-description] button[aria-label]")].map((b) => b.getAttribute("aria-label")),
        publish: document.querySelector("[data-publish]")?.textContent,
      }
    })
    n.headPx = g.head
    n.detailsWidth = g.details.width
    expect(g.head <= 44, `${label} editor: the head is one row (${g.head}px)`, g.head)
    if (phone) expect(g.access.top > g.lessonsBottom, `${label} editor: on a phone the access card comes after the lessons`, g)
    else expect(g.access.left >= g.details.right && Math.abs(g.access.top - g.details.top) <= 1 && g.details.width >= 700, `${label} editor: on a computer access stands beside the details, the details ${g.details.width}px wide`, g)
    expect(g.scrollers.length === 0, `${label} editor: nothing inside the editor scrolls on its own`, g.scrollers)
    expect(g.foot === "down", `${label} editor: no save bar while nothing changed`, g.foot)
    expect(g.cards.join() === "free,level,paid,time,private" && g.titles.join() === "Open,Reach a level,Buy now,Days after joining,Private", `${label} access: five cards, in order`, g.titles)
    expect(g.heights.every((h) => h >= 52), `${label} access: every card 52px or taller`, g.heights)
    expect(g.on === "paid" && g.price === "49", `${label} access: Buy now picked, its price under it`, { on: g.on, price: g.price })
    expect(g.rich.h2 && g.rich.ul && g.rich.img && g.rich.emoji, `${label} rich text: the heading, the list, the picture and the emoji drawn in the field`, g.rich)
    expect(g.tools.includes("Picture") && g.tools.includes("Emoji") && g.tools.includes("Bold"), `${label} rich text: Picture, Emoji and Bold in its toolbar`, g.tools)
    expect(g.publish === "Publish", `${label} editor: a draft offers Publish in its head`, g.publish)
    await common(p, label, "editor", phone)
    await p.screenshot({ path: join(shots, `editor-${label}.png`), fullPage: true })

    const inputs = {}
    for (const choice of ["level", "time", "private", "free"]) {
      await p.evaluate((c) => document.querySelector(`[data-access-card='${c}'] button[role=radio]`).click(), choice)
      await sleep(80)
      inputs[choice] = await p.evaluate((c) => {
        const box = document.querySelector(`[data-access-inputs='${c}']`)
        return { level: !!box?.querySelector("[data-select='program-level']"), drip: !!box?.querySelector("#program-drip"), search: !!box?.querySelector("#program-member-search"), text: (box?.textContent || "").slice(0, 60) }
      }, choice)
      if (choice === "private") {
        await p.focus("#program-member-search")
        await p.type("#program-member-search", "er")
        await p.waitForSelector("[data-member-choice]", { timeout: 3000 }).catch(() => null)
        await p.evaluate(() => document.querySelector("[data-member-choice]")?.click())
        await sleep(120)
        inputs.picked = await p.evaluate(() => [...document.querySelectorAll("[data-member-picked] li")].map((li) => li.textContent.trim()))
        await p.evaluate(() => document.activeElement?.blur())
        await sleep(200)
        await p.evaluate(() => document.querySelector("[data-editor-card='access']")?.scrollIntoView({ block: "start" }))
        await sleep(150)
        await p.screenshot({ path: join(shots, `access-private-${label}.png`) })
        inputs.footPrivate = await p.evaluate(() => ({ foot: document.querySelector("[data-editor-foot]")?.getAttribute("data-foot"), state: document.querySelector("[data-editor-foot]")?.getAttribute("data-state") }))
        await common(p, label, "access-private", phone)
      }
    }
    expect(inputs.level.level, `${label} access: Reach a level shows the level to pick`, inputs.level)
    expect(inputs.time.drip, `${label} access: Days after joining shows the days`, inputs.time)
    expect(inputs.private.search && inputs.picked?.length === 1 && /Erin Park/.test(inputs.picked[0]), `${label} access: Private shows the member search, and a pick goes on the list`, { ...inputs.private, picked: inputs.picked })
    expect(inputs.footPrivate.foot === "up" && inputs.footPrivate.state === "dirty", `${label} access: a change brings the save bar up`, inputs.footPrivate)
    await p.evaluate(() => document.querySelector("[data-foot-cancel]").click())
    await sleep(400)
    const reset = await p.evaluate(() => ({ on: document.querySelector("[data-access-card][data-on]")?.getAttribute("data-access-card"), foot: document.querySelector("[data-editor-foot]")?.getAttribute("data-foot") }))
    expect(reset.on === "paid" && reset.foot === "down", `${label} access: Cancel puts it back and the bar goes`, reset)
    expect(errors.length === 0, `${label} editor: no page errors`, errors)
    await p.close()
  }

  /* Adding a module and a lesson, with the server 700ms behind */
  {
    const { p, errors, state, calls } = await open(vp, "editor")
    await p.waitForSelector("[data-program-editor] [data-module]")
    await sleep(200)
    await p.evaluate(() => document.querySelector("[data-add-module]")?.scrollIntoView({ block: "center" }))
    await sleep(100)
    const add = await framesUntil(p, "[data-add-module]", `document.querySelectorAll("[data-module]").length === 3 && document.activeElement?.hasAttribute("data-module-name") && document.activeElement.closest("[data-module]") === document.querySelectorAll("[data-module]")[2]`)
    const sel = await p.evaluate(() => {
      const el = document.activeElement
      el.__probe = 1
      return { value: el.value, selected: el.selectionStart === 0 && el.selectionEnd === el.value.length }
    })
    n.addModuleFrames = add.frames
    n.addModuleMs = add.ms
    expect(add.frames >= 0 && add.frames <= 2, `${label} add module: on screen with the caret in its name in ${add.frames} frame(s), ${add.ms}ms, while the server takes 700ms`, add)
    expect(sel.value === "Module 3" && sel.selected, `${label} add module: its name selected, so typing replaces it`, sel)
    await p.keyboard.type("Glazing")
    await sleep(900)
    const after = await p.evaluate(() => {
      const el = document.activeElement
      return { same: el?.__probe === 1, value: el?.value, modules: document.querySelectorAll("[data-module]").length }
    })
    const posted = calls.filter((c) => c.startsWith("POST /api/courses/manage")).length
    expect(after.same && after.value === "Glazing" && after.modules === 3 && posted === 1, `${label} add module: the same field after the server answered, the typing kept`, { ...after, posted })
    await p.keyboard.press("Enter")
    await sleep(900)
    const renamed = state.tree.modules[2]?.title
    expect(renamed === "Glazing", `${label} add module: the name typed meanwhile is saved after it`, renamed)

    const lesson = await framesUntil(p, "[data-add-lesson]", `document.activeElement?.hasAttribute("data-lesson-title") && document.activeElement.value === "Lesson 2"`, 2)
    n.addLessonFrames = lesson.frames
    expect(lesson.frames >= 0 && lesson.frames <= 2, `${label} add lesson: open with the caret in its title in ${lesson.frames} frame(s), ${lesson.ms}ms`, lesson)
    await sleep(900)
    await p.screenshot({ path: join(shots, `add-module-${label}.png`) })

    state.failAdd = true
    const before = await p.evaluate(() => document.querySelectorAll("[data-module]").length)
    await p.evaluate(() => document.querySelectorAll("[data-add-module]")[0].click())
    await sleep(60)
    const shown = await p.evaluate(() => document.querySelectorAll("[data-module]").length)
    await sleep(1000)
    const rolled = await p.evaluate(() => ({ modules: document.querySelectorAll("[data-module]").length, note: [...document.querySelectorAll("[data-program-editor] [role=status], [data-program-editor] [role=alert]")].map((e) => e.textContent).join(" | ") }))
    expect(shown === before + 1 && rolled.modules === before && /50 modules/.test(rolled.note), `${label} add module refused: it showed, then came off with the reason`, { before, shown, ...rolled })

    const move = await p.evaluate(
      () =>
        new Promise((resolve) => {
          const first = document.querySelectorAll("[data-module]")[0]
          const id = first.getAttribute("data-module")
          first.querySelector("button[aria-label$='down']").click()
          let frames = 0
          const tick = () => {
            const now = [...document.querySelectorAll("[data-module]")].map((m) => m.getAttribute("data-module"))
            if (now[1] === id) {
              const gliding = [...document.querySelectorAll("[data-module]")].filter((m) => m.getAnimations().length > 0).length
              return resolve({ frames, gliding })
            }
            if (++frames > 60) return resolve({ frames: -1, gliding: 0 })
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
    )
    n.reorderFrames = move.frames
    expect(move.frames >= 0 && move.frames <= 1 && move.gliding >= 2, `${label} reorder: in its new place in ${move.frames} frame(s), ${move.gliding} modules gliding`, move)
    await common(p, label, "add-module", phone)
    expect(errors.length === 0, `${label} add module: no page errors`, errors)
    await p.close()
  }

  /* The member's side */
  for (const which of ["level", "time", "paid", "description"]) {
    const { p, errors } = await open(vp, which)
    const g = await p.evaluate(() => {
      const desc = document.querySelector("[data-program-description]")
      return {
        sentence: document.querySelector("[data-lock-sentence]")?.textContent ?? "",
        action: document.querySelector("[data-open-action]")?.textContent ?? null,
        actionH: Math.round(document.querySelector("[data-open-action]")?.getBoundingClientRect().height || 0),
        buy: document.querySelector("[data-buy-program]")?.textContent?.trim() ?? null,
        covers: document.querySelectorAll("[data-module-cover]").length,
        desc: desc ? { h2: !!desc.querySelector("h2"), img: desc.querySelectorAll("img").length, script: desc.querySelectorAll("script").length, handlers: desc.querySelectorAll("[onerror], [onclick], [onload]").length, js: [...desc.querySelectorAll("a")].filter((a) => /^javascript:/i.test(a.getAttribute("href") || "")).length } : null,
        xss: window.__xss ?? null,
      }
    })
    if (which === "level") expect(/opens at level 3/.test(g.sentence) && /You are at level 1/.test(g.sentence) && g.action === "See your points" && g.actionH >= 40, `${label} level: the level, where the member is, and See your points`, g)
    if (which === "time") expect(/Opens on/.test(g.sentence) && !g.buy && !g.action, `${label} time: the day it opens, nothing to buy`, g)
    if (which === "paid") expect(g.buy === "Buy for $49" && g.desc?.h2 && g.desc.img === 1 && g.covers === 1, `${label} paid: Buy for $49, the rich description, the module's cover`, g)
    if (which === "description") expect(g.desc?.h2 && g.desc.script === 0 && g.desc.handlers === 0 && g.desc.js === 0 && g.xss === null, `${label} description: drawn, with no script, no handler and no javascript link`, g)
    await common(p, label, which, phone)
    await p.screenshot({ path: join(shots, `${which}-${label}.png`), fullPage: true })
    expect(errors.length === 0, `${label} ${which}: no page errors`, errors)
    await p.close()
  }
}

await browser.close()
console.log(`\nnumbers: ${JSON.stringify(numbers)}`)
console.log(`shots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
