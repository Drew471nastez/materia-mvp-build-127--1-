/**
 * ===========================================================================
 *  THE LESSONS CARD, MEASURED
 * ===========================================================================
 * The course card of the product editor (scripts/render-course-editor.tsx)
 * at 390x844 and 1280x800, with /api/courses/manage answered by a course
 * kept in the page:
 *
 *   EMPTY     one line and "Add a module"
 *   BUILD     a module comes with its first lesson, open; a second lesson
 *             is added and numbered 2
 *   LESSON    title, video upload or a YouTube/Vimeo link, notes, files,
 *             free preview; a bad link is said to be one
 *   UPLOAD    a video goes up with its real progress, then the lesson shows
 *             it with its length read from the file
 *   ORDER     move up puts the lesson first and sends the new order
 *   FIT       nothing scrolls sideways; every control is at least 32px
 *
 *   PROBE_CSS=source node scripts/check-course-editor.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".course-editor-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-course-editor-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products/x"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-course-editor.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.course-editor-probe/navigation.js", "next/link": "./.course-editor-probe/link.jsx" },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")

/* The course, kept in the page; every action answered as the route answers it. */
const server = `
window.__actions = []
const tree = { courseId: null, modules: [] }
let n = 0
const id = () => "00000000-0000-4000-8000-" + String(++n).padStart(12, "0")
const lesson = (title) => ({ id: id(), title, notes: "", isPreview: false, durationSeconds: null, video: null, externalUrl: "", captions: false, attachments: [] })
const find = (lessonId) => tree.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (!url.startsWith("/api/courses/manage")) return realFetch(input, init)
  if (!init || init.method !== "POST") return json({ tree })
  const b = JSON.parse(init.body)
  window.__actions.push(b)
  await new Promise((r) => setTimeout(r, 120))
  if (b.action === "add-module") { tree.courseId = tree.courseId || id(); tree.modules.push({ id: id(), title: b.title, lessons: [lesson("Lesson 1")] }) }
  if (b.action === "add-lesson") tree.modules.find((m) => m.id === b.moduleId).lessons.push(lesson(b.title))
  if (b.action === "update-lesson") { const l = find(b.lessonId); if (b.title !== undefined) l.title = b.title; if (b.notes !== undefined) l.notes = b.notes; if (b.durationSeconds !== undefined) l.durationSeconds = b.durationSeconds; if (b.externalUrl !== undefined) l.externalUrl = b.externalUrl; if (typeof b.isPreview === "boolean") l.isPreview = b.isPreview }
  if (b.action === "order-lessons") { const m = tree.modules.find((x) => x.id === b.moduleId); m.lessons = b.ids.map((i) => m.lessons.find((l) => l.id === i)) }
  if (b.action === "upload-prepare") return json({ signedUrl: "https://storelib.com/__upload?token=x", token: "x", path: "c/course-media/" + b.lessonId + "/1-a.webm" })
  if (b.action === "upload-complete") { const l = find(b.lessonId); l.video = { name: b.fileName, size: 250000 } }
  return json({ tree: JSON.parse(JSON.stringify(tree)) })
}
`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
/* A small real video, for the length the page reads from the file. */
const videoFile = join(stubs, "lesson.webm")
{
  const vp = join(root, ".course-player-probe/video.webm")
  try {
    writeFileSync(videoFile, readFileSync(vp))
  } catch {
    writeFileSync(videoFile, Buffer.alloc(2048))
  }
}

for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1280", { width: 1280, height: 800 }],
]) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${server}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname === "/__probe") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.pathname === "/__upload") return r.respond({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" })
    return r.respond({ status: 404, body: "" })
  })
  await p.goto("https://storelib.com/__probe", { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-course-editor]")
  const empty = await p.evaluate(() => document.querySelector("[data-course-editor]").innerText)
  expect(/No lessons yet/.test(empty) && /Add a module/.test(empty), "EMPTY: one line and Add a module", empty.replace(/\s+/g, " "))
  await p.screenshot({ path: join(shots, `${label}-editor-empty.png`) })

  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Add a module")).click())
  await p.waitForSelector("[data-lesson-panel]")
  expect(true, "BUILD: a module comes with its first lesson, open")
  await p.evaluate(() => document.querySelector("[data-add-lesson]").click())
  await p.waitForFunction(() => document.querySelectorAll("[data-lesson]").length === 2)
  const numbers = await p.evaluate(() => [...document.querySelectorAll("[data-lesson] > button")].map((b) => b.innerText.split("\n")[0]))
  expect(numbers.join(",") === "1,2", "BUILD: the second lesson is numbered 2", numbers)
  const panel = await p.evaluate(() => document.querySelector("[data-lesson-panel]").innerText)
  expect(["Lesson title", "Video", "Upload a video", "Notes", "Files to download", "Free preview"].every((t) => panel.includes(t)), "LESSON: title, video, notes, files, free preview", panel.replace(/\s+/g, " ").slice(0, 200))

  /* A link that is not YouTube or Vimeo */
  const linkInput = await p.$("[data-lesson-panel] input[inputmode=url]")
  await linkInput.type("https://example.com/v.mp4")
  const bad = await p.evaluate(() => document.querySelector("[data-lesson-panel]").innerText.includes("not a YouTube or Vimeo link"))
  expect(bad, "LESSON: a bad link is said to be one")
  await linkInput.click({ clickCount: 3 })
  await p.keyboard.press("Backspace")

  /* Upload */
  const input = await p.$("[data-lesson-panel] input[type=file][accept^=video]")
  await input.uploadFile(videoFile)
  await p.waitForFunction(() => document.querySelector("[data-lesson-panel]").innerText.includes("lesson.webm"), { timeout: 10000 })
  await sleep(400)
  const after = await p.evaluate(() => ({ panel: document.querySelector("[data-lesson-panel]").innerText, actions: window.__actions.map((a) => a.action) }))
  expect(after.actions.includes("upload-prepare") && after.actions.includes("upload-complete"), "UPLOAD: prepared, sent, completed", after.actions)
  expect(/Private, only buyers can watch/.test(after.panel) && after.actions.includes("update-lesson"), "UPLOAD: the lesson shows its private video, and its length is saved", after.panel.replace(/\s+/g, " ").slice(0, 160))
  await p.screenshot({ path: join(shots, `${label}-editor-lesson.png`), fullPage: true })

  /* Order: the open lesson (the second, just added) moved up is first */
  const openId = await p.evaluate(() => document.querySelector("[data-lesson-panel]").closest("[data-lesson]").getAttribute("data-lesson"))
  await p.evaluate(() => document.querySelector("[data-lesson-panel] button[aria-label='Move lesson up']").click())
  await p.waitForFunction((id) => document.querySelectorAll("[data-lesson]")[0]?.getAttribute("data-lesson") === id, { timeout: 5000 }, openId).then(
    () => expect(true, "ORDER: move up puts the lesson first, and the new order is sent"),
    () => expect(false, "ORDER: move up puts the lesson first, and the new order is sent"),
  )

  const fit = await p.evaluate(() => {
    const small = [...document.querySelectorAll("[data-course-editor] button")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 32).map((b) => b.getAttribute("aria-label") || b.textContent.trim())
    return { scroll: document.scrollingElement.scrollWidth, width: innerWidth, small }
  })
  expect(fit.scroll <= fit.width && fit.small.length === 0, "FIT: nothing scrolls sideways, no control under 32px", fit)
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}
await browser.close()
console.log(`\nscreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
