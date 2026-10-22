/**
 * ===========================================================================
 *  EMAILS › CUSTOMER EMAILS: THE FAMILY SWITCH AND ITS LISTS, IN CHROMIUM
 * ===========================================================================
 * The real panel (scripts/render-emails-families-probe.tsx) on a phone
 * (390x844, touch) and a computer (1440x900), on the Emails page and in
 * Settings. What the owner asked for, measured:
 *
 *   the switch    All, Digital products, Physical products, Communities as
 *                 tabs (one tab stop, arrows, Home and End move and choose);
 *                 every segment the same width with its words whole, the
 *                 thumb exactly one segment under the chosen one, moved by
 *                 transform alone and the words by opacity alone; nothing
 *                 wider than the screen; 44px tall on a phone
 *   the lists     each family lists its own emails and no other's; All has
 *                 the three; the address says which (?kind=); rows are 44px
 *                 or more on a phone; what each sent is beside it
 *   the previews  a digital receipt bought on the website is signed by the
 *                 shop and can be drawn in French; bought on the creator page
 *                 it is signed by the creator and in English; a community's
 *                 email is drawn by the server for that community; the old
 *                 "Communities: ... edited in each community" note is gone
 *
 *   node scripts/check-emails-families.mjs      (SHOTS_DIR=... keeps the screenshots)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-email-families-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const ORIGIN = "https://storelib.test"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

writeFileSync(join(out, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export function redirect() {}
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
execFileSync(
  "npx",
  ["esbuild", "scripts/render-emails-families-probe.tsx", `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="x"', "--bundle", "--format=iife", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined", "--define:process.env.NEXT_PUBLIC_APP_URL=undefined", "--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY=undefined", "--alias:@=.", `--outfile=${join(out, "app.js")}`, "--log-level=error"],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const css = await appCss(root)
const js = readFileSync(join(out, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
async function open(phone, path) {
  const p = await browser.newPage()
  if (phone) await p.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await p.setViewport({ width: 1440, height: 900 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
  p.on("console", (m) => (m.type() === "error" ? errors.push(m.text()) : null))
  await p.goto(`${ORIGIN}${path}`)
  await p.waitForSelector("[data-segmented-tabs]", { timeout: 10000 }).catch((e) => {
    console.error(errors.join("\n"))
    throw e
  })
  await p.waitForSelector("[data-email-sent], [data-email-sent-wide]", { timeout: 10000 }).catch(() => null)
  await sleep(300)
  return { p, errors }
}

const DIGITAL = ["receipt", "digital_refund", "checkout_reminder"]
const COMMUNITY = ["community_welcome", "community_join_approved", "community_invite", "community_broadcast", "community_event_ticket", "community_event_ticket_invite", "community_event_refund", "community_event_cancelled"]

/** The switch as it stands: each segment's box, its words' fit, the thumb's box and what animates. */
const measureSwitch = (p) =>
  p.evaluate(() => {
    const list = document.querySelector("[data-segmented-tabs]")
    const tabs = [...list.querySelectorAll("[role=tab]")]
    const thumb = list.querySelector("[data-segmented-thumb]")
    const box = (el) => el.getBoundingClientRect()
    const chosen = tabs.find((t) => t.getAttribute("aria-selected") === "true")
    const words = tabs.map((t) => [...t.querySelectorAll("span")].filter((s) => getComputedStyle(s).display !== "none" && s.children.length === 0 && s.textContent.trim()))
    return {
      labels: tabs.map((t) => t.textContent.replace(/\s+/g, " ").trim()),
      widths: tabs.map((t) => Math.round(box(t).width * 10) / 10),
      heights: tabs.map((t) => Math.round(box(t).height)),
      trackHeight: Math.round(box(list).height),
      trackRight: box(list).right,
      chosen: chosen?.getAttribute("data-segment"),
      stops: tabs.filter((t) => t.tabIndex === 0).length,
      clipped: words.flat().filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent),
      thumb: { left: Math.round(box(thumb).left), width: Math.round(box(thumb).width), transition: getComputedStyle(thumb).transitionProperty, transform: getComputedStyle(thumb).transform },
      chosenBox: chosen ? { left: Math.round(box(chosen).left), width: Math.round(box(chosen).width) } : null,
      labelTransitions: [...new Set(tabs.flatMap((t) => [...t.querySelectorAll(":scope > span")].map((s) => getComputedStyle(s).transitionProperty)))],
      pageWide: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }
  })

const rowsShown = (p) => p.evaluate(() => [...document.querySelectorAll("[data-customer-email]")].map((b) => b.getAttribute("data-customer-email")))

for (const [phone, path] of [
  [true, "/app/emails?tab=customer"],
  [false, "/app/emails?tab=customer"],
  [true, "/app/settings?tab=emails"],
  [false, "/app/settings?tab=emails"],
]) {
  const where = `${phone ? "phone 390" : "computer 1440"} ${path.startsWith("/app/emails") ? "Emails" : "Settings"}`
  console.log(`\n${where}`)
  const { p, errors } = await open(phone, path)
  const tag = `${phone ? "390" : "1440"}-${path.startsWith("/app/emails") ? "emails" : "settings"}`

  let m = await measureSwitch(p)
  expect(m.labels.length === 4 && /All/.test(m.labels[0]) && /Digital/.test(m.labels[1]) && /Physical/.test(m.labels[2]) && /Communities/.test(m.labels[3]), "All, Digital products, Physical products, Communities", m.labels)
  expect(m.stops === 1 && m.chosen === "all", "one tab stop, All chosen to start", { stops: m.stops, chosen: m.chosen })
  expect(Math.max(...m.widths) - Math.min(...m.widths) <= 1, "every segment the same width", m.widths)
  expect(m.clipped.length === 0, "every label whole, none cut", m.clipped)
  expect(m.pageWide <= m.viewport && m.trackRight <= m.viewport, "nothing wider than the screen", { page: m.pageWide, track: m.trackRight, viewport: m.viewport })
  if (phone) expect(m.trackHeight >= 44 && m.heights.every((h) => h >= 36), "a thumb's size on a phone: the track 44px, each segment 36px", { track: m.trackHeight, segments: m.heights })
  expect(m.thumb.transition === "transform" && m.labelTransitions.every((t) => t === "opacity"), "the thumb moves by transform, the words change by opacity", { thumb: m.thumb.transition, words: m.labelTransitions })
  expect(Math.abs(m.thumb.left - m.chosenBox.left) <= 1 && Math.abs(m.thumb.width - m.chosenBox.width) <= 1, "the thumb sits exactly under All", { thumb: m.thumb, chosen: m.chosenBox })
  const all = await rowsShown(p)
  expect(DIGITAL.every((id) => all.includes(id)) && all.includes("order_confirmation") && COMMUNITY.every((id) => all.includes(id)), "All lists the three families", all.length)
  expect(!(await p.evaluate(() => /edited in each community/i.test(document.body.innerText))), "the old Communities note is gone")
  expect((await p.evaluate(() => document.querySelectorAll("[data-email-family]").length)) === 3, "All has a heading per family")
  if (phone) {
    const short = await p.evaluate(() => [...document.querySelectorAll("[data-customer-email]")].map((b) => Math.round(b.getBoundingClientRect().height)).filter((h) => h < 44))
    expect(short.length === 0, "every row is 44px or more on a phone", short)
  }
  expect(await p.evaluate(() => !!document.querySelector("[data-email-sent], [data-email-sent-wide]")), "what each sent is beside it")
  await p.screenshot({ path: join(shots, `${tag}-all.png`), fullPage: true })

  /* Digital, by a tap: the thumb slides (frames between), and only digital emails are listed. */
  await p.evaluate(() => {
    window.__thumbFrames = []
    const thumb = document.querySelector("[data-segmented-thumb]")
    const tick = () => {
      window.__thumbFrames.push(getComputedStyle(thumb).transform)
      if (window.__thumbFrames.length < 40) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await p.click('[data-segment="digital"]')
  await sleep(700)
  const frames = await p.evaluate(() => [...new Set(window.__thumbFrames)].length)
  expect(frames >= 4, "the thumb slides over several frames", frames)
  m = await measureSwitch(p)
  expect(m.chosen === "digital" && Math.abs(m.thumb.left - m.chosenBox.left) <= 1, "Digital chosen, the thumb under it", { chosen: m.chosen, thumb: m.thumb.left, at: m.chosenBox.left })
  let rows = await rowsShown(p)
  expect(rows.length > 0 && rows.every((id) => DIGITAL.includes(id)), "Digital lists its own emails and no other", rows)
  expect(await p.evaluate(() => new URLSearchParams(location.search).get("kind") === "digital"), "the address says Digital")
  expect(await p.evaluate(() => !!document.querySelector("[data-language-rule]")), "it says which language each place's emails go in")
  const flows = await p.evaluate(() => [...document.querySelectorAll("[data-email-flow]")].map((e) => e.getAttribute("data-email-flow")))
  expect(flows.includes("f1") && flows.includes("f3") && !flows.includes("f2"), "its automations, with their switches, and not physical's", flows)
  await p.screenshot({ path: join(shots, `${tag}-digital.png`), fullPage: true })

  /* The keyboard: one stop, the arrows move and choose, End and Home go to the ends. */
  await p.focus('[data-segment="digital"]')
  await p.keyboard.press("ArrowRight")
  await sleep(350)
  m = await measureSwitch(p)
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("data-segment"))
  expect(m.chosen === "physical" && focused === "physical", "ArrowRight chooses Physical products and keeps the focus on it", { chosen: m.chosen, focused })
  rows = await rowsShown(p)
  expect(rows.length >= 15 && rows.every((id) => !DIGITAL.includes(id) && !COMMUNITY.includes(id)), "Physical lists only orders that ship", rows.length)
  await p.screenshot({ path: join(shots, `${tag}-physical.png`), fullPage: true })
  await p.keyboard.press("End")
  await sleep(500)
  m = await measureSwitch(p)
  rows = await rowsShown(p)
  expect(m.chosen === "communities" && rows.every((id) => COMMUNITY.includes(id)) && rows.length === COMMUNITY.length, "End chooses Communities, its own emails only", rows)
  expect(await p.evaluate(() => !!document.querySelector("[data-community-picker]")), "a picker for the community, with two")
  await p.screenshot({ path: join(shots, `${tag}-communities.png`), fullPage: true })
  await p.keyboard.press("Home")
  await sleep(350)
  expect((await measureSwitch(p)).chosen === "all", "Home goes back to All")

  /* The receipt's preview: the shop's on the website, in French when asked; the creator's on the creator page, in English. */
  await p.click('[data-segment="digital"]')
  await sleep(300)
  await p.click('[data-customer-email="receipt"]')
  await p.waitForSelector("[data-email-frame]", { timeout: 5000 })
  await sleep(600)
  const frameText = () => p.evaluate(() => {
    const f = document.querySelector("[data-email-sheet] [data-email-frame]")
    const d = f?.contentDocument
    return { text: d?.body?.innerText ?? "" }
  })
  let f = await frameText()
  expect(/Angus Farm/.test(f.text) && !/Andrei Popescu/.test(f.text), "bought on the website: signed by the shop", f.text.slice(0, 80))
  if (await p.$("[data-preview-language]")) {
    await p.select("[data-preview-language]", "fr")
    await sleep(500)
    f = await frameText()
    expect(/Merci pour votre commande/.test(f.text) && /octobre/.test(f.text), "in French when the buyer used French, its date too", f.text.slice(0, 120))
  } else expect(false, "a language to preview in")
  await p.click('[data-preview-place] [data-segment="storelib"]')
  await sleep(500)
  f = await frameText()
  expect(/Andrei Popescu/.test(f.text) && !/Angus Farm/.test(f.text.split("Thanks")[0]) && /Thanks for your order/.test(f.text) && /October/.test(f.text), "bought on the creator page: signed by the creator, in English", f.text.slice(0, 120))
  await p.screenshot({ path: join(shots, `${tag}-receipt.png`) })
  await p.keyboard.press("Escape")
  await sleep(500)

  /* A community's email is drawn by the server for that community. */
  await p.click('[data-segment="communities"]')
  await sleep(400)
  await p.click('[data-customer-email="community_welcome"]')
  await sleep(900)
  const asked = await p.evaluate(() => window.__requests.filter((r) => /emails\/preview/.test(r.url)).map((r) => r.body?.kind))
  expect(asked.includes("welcome"), "the welcome is drawn by its community's preview route", asked)
  await p.screenshot({ path: join(shots, `${tag}-welcome.png`) })
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

await browser.close()
console.log(`\n${broken ? `${broken} failed` : "all good"}  (screenshots: ${shots})`)
process.exit(broken ? 1 : 0)
