/**
 * The Design tab's pattern picker and name styles, photographed (round W10).
 *   SHOTS=/some/dir node scripts/shot-onepage-patterns-editor.mjs
 * For each width (390, 1280): Wallpaper on a light flat colour and on a dark
 * one, scrolled to Pattern and texture; Header, scrolled to Name style, then
 * a style picked, and the preview read: the name's words carry it at once.
 */
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-pattern-editor-"))
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const AVATAR = "https://storelib.com/media/avatars/probe/avatar.jpg"
const header = { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } }
const links = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: 1 + i, data: { title: `Link ${i + 1}`, url: `https://example.com/${i}` } }))
let state = { avatar: AVATAR, theme: {}, blocks: [header, ...links] }
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-avatar-audit.tsx",
  api(req) {
    if (req.url === "/audit-state") return { body: state }
    if (req.url.startsWith("/_next/image")) return { status: 503, body: { error: "original" } }
    return null
  },
})
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
async function open(width, theme, section) {
  state = { ...state, theme }
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  page.on("pageerror", (e) => problems.push(`${width} ${section}: ${e.message}`))
  await page.setViewport({ width, height: width < 500 ? 844 : 900, isMobile: width < 500, hasTouch: width < 500, deviceScaleFactor: width < 500 ? 2 : 1 })
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "storelib.com" && u.pathname.startsWith("/media/")) return void r.respond({ status: 200, contentType: "image/jpeg", body: readFileSync("public/placeholder-user.jpg") })
    if (u.origin !== base && !u.protocol.startsWith("data")) return void r.abort()
    void r.continue()
  })
  await page.goto(`${base}/app/onepage#design`)
  await page.waitForSelector("[data-onepage-loader]", { hidden: true })
  await page.waitForSelector(`[data-nav-row="${section}"]`, { visible: true })
  await sleep(800)
  await page.$eval(`[data-nav-row="${section}"]`, (b) => b.click())
  await sleep(900)
  return { page, context }
}
const scrollTo = (page, sel) => page.$eval(sel, (el) => el.scrollIntoView({ block: "start" }))
for (const width of [390, 1280]) {
  for (const [tone, theme] of [["light", { background_type: "solid", background_color: "#f4efe9", text_color: "#1a1a2e", background_pattern: "gingham" }], ["dark", { background_type: "solid", background_color: "#14161c", text_color: "#ffffff", title_color: "#ffffff", button_color: "#e8687a", background_pattern: "scales", pattern_color: "#00000090" }]]) {
    const { page, context } = await open(width, theme, "wallpaper")
    await scrollTo(page, '[data-pattern-group="textures"]')
    await sleep(500)
    await page.screenshot({ path: join(shots, `editor-patterns-${tone}-${width}.png`) })
    console.log(`  editor-patterns-${tone}-${width}.png`)
    await context.close()
  }
  const { page, context } = await open(width, { background_type: "solid", background_color: "#14161c", text_color: "#ffffff", title_color: "#ffffff", button_color: "#e8687a" }, "header")
  await page.waitForSelector("[data-name-style-rows]")
  await scrollTo(page, "[data-name-style-rows]")
  await sleep(500)
  await page.screenshot({ path: join(shots, `editor-names-${width}.png`) })
  await page.$eval('[data-name-style-choice="gradient"]', (el) => el.closest("button").click())
  await sleep(300)
  const preview = await page.evaluate(() => {
    const docs = [document, ...[...document.querySelectorAll("iframe")].map((f) => f.contentDocument).filter(Boolean)]
    return docs.flatMap((d) => [...d.querySelectorAll("[data-name-words]")].map((e) => e.getAttribute("data-name-words")))
  })
  /* A phone shows the preview behind its own button; the page under it is the same component, photographed by shot-onepage-patterns.mjs. */
  if (width > 500 && !preview.includes("gradient")) problems.push(`${width}: the preview did not take the gradient name (${preview.join()})`)
  console.log(`  ${width}: preview name styles after a pick: ${preview.join(", ")}`)
  await page.screenshot({ path: join(shots, `editor-names-picked-${width}.png`) })
  await context.close()
}
await browser.close()
server.close()
if (problems.length) { console.log(problems.join("\n")); process.exit(1) }
console.log(`Shots in ${shots}`)
