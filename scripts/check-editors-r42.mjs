/**
 * ===========================================================================
 *  THE COLLECTION AND OFFER EDITORS, MEASURED (round 42)
 * ===========================================================================
 *   node scripts/check-editors-r42.mjs        (SHOTS=dir to keep screenshots)
 *
 * The real components (scripts/render-editors-r42.tsx) in headless Chromium
 * at a phone's width (390) and a computer's (1280), with the stylesheet
 * built from the sources (PROBE_CSS=source by default here):
 *
 *   collection   nothing sideways; the cards are /app's card (16px radius,
 *                the border, the shadow) at the app's gutter; from 1280 two
 *                columns, the side column is one Published card with its
 *                switch and Products are shown, the coupon editor's side;
 *                the switch changes its line and the header's state stays
 *                the saved one
 *   offer-new    the page starts on What do you want to make? alone: three
 *                kinds, side by side from 640, one under another on a phone,
 *                each with its line and drawing, nothing else on the page
 *                and Create off; a kind brings the form in; More options is
 *                folded with its line and opens; Create with nothing picked
 *                says what to do under the field
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

process.env.PROBE_CSS ??= "source"
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error("No browser"); process.exit(1) }
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-editors-r42-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-editors-r42.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(panel, vp) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p) => { window.__panel = p }, panel)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(400)
}
const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${name}.png`), fullPage: true }) }
const over = () => page.evaluate(() => {
  const pane = document.querySelector("[data-collection-page], [data-offer-editor]")
  return Math.max(document.documentElement.scrollWidth - innerWidth, pane ? pane.scrollWidth - pane.clientWidth : 0)
})
const cardLook = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length).map((el) => {
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return { radius: s.borderTopLeftRadius, border: s.borderTopColor, shadow: s.boxShadow !== "none", bg: s.backgroundColor, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width) }
}), sel)

for (const [name, vp] of [["a phone (390)", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["a computer (1280)", { width: 1280, height: 900 }]]) {
  const phone = vp.width < 640

  console.log(`\nA collection's page on ${name}`)
  await open("collection", vp)
  await shot(`collection-${vp.width}`)
  say((await over()) <= 0, `nothing runs off the side (${await over()}px over)`)
  const cards = await cardLook("[data-collection-editor] section")
  const gutter = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-gutter")) || 16)
  say(cards.length >= 3 && cards.every((c) => c.radius === "16px" && c.shadow && c.bg === "rgb(255, 255, 255)"), `every card is /app's card: 16px corners, white, the shadow (${cards.length} cards, ${[...new Set(cards.map((c) => c.radius))].join("/")})`)
  if (phone) say(cards.every((c) => c.left === gutter && c.right === vp.width - gutter), `cards at the app's gutter, ${gutter}px each side (${cards.map((c) => `${c.left}-${vp.width - c.right}`).join(", ")})`)
  const side = await page.evaluate(() => {
    const status = document.querySelector("[data-collection-status]")
    const main = document.querySelector("[data-editor-main]").getBoundingClientRect()
    const s = status.getBoundingClientRect()
    const sw = status.querySelector('[role="switch"]')
    return { title: status.querySelector("h2")?.textContent, hint: status.querySelector("h2 + p")?.textContent, switchOn: sw?.getAttribute("aria-checked"), sort: !!status.querySelector("select#collection-sort"), sideLeft: Math.round(s.left), mainRight: Math.round(main.right), sideTop: Math.round(s.top), mainTop: Math.round(main.top), width: Math.round(s.width), oldRows: document.querySelectorAll("[data-editor-side] .divide-y").length, badge: document.querySelector("[data-collection-state]")?.textContent ?? null }
  })
  say(side.title === "Published" && side.switchOn === "true" && side.sort && side.oldRows === 0, `the side is one Published card with its switch and the order, as the coupon's Active card (no settings list): "${side.hint}"`)
  if (!phone) say(side.sideLeft > side.mainRight && side.sideTop === side.mainTop && side.width >= 272, `two columns, the side beside the form at the same top (${side.mainRight} | ${side.sideLeft}, ${side.width}px wide)`)
  if (!phone) say(side.badge === "Published", `the header says where it stands: ${side.badge}`)
  await page.click("[data-collection-status] [role=switch]")
  await wait(80)
  const after = await page.evaluate(() => ({ hint: document.querySelector("[data-collection-status] h2 + p")?.textContent, badge: document.querySelector("[data-collection-state]")?.textContent ?? null, state: document.querySelector("[data-editor-state]")?.getAttribute("data-editor-state") }))
  say(/Hidden/.test(after.hint ?? "") && (phone || (after.badge === "Published" && after.state === "unsaved")), `the switch says what it changes, the header keeps the saved state until Save ("${after.hint}"${phone ? "" : `, header ${after.badge}, ${after.state}`})`)

  console.log(`\nNew offer on ${name}`)
  await open("offer-new", vp)
  await shot(`offer-new-${vp.width}`)
  say((await over()) <= 0, `nothing runs off the side (${await over()}px over)`)
  const start = await page.evaluate(() => {
    const kinds = [...document.querySelectorAll("[data-kind]")].map((el) => { const r = el.getBoundingClientRect(); return { kind: el.getAttribute("data-kind"), top: Math.round(r.top), left: Math.round(r.left), height: Math.round(r.height), line: el.querySelector("[data-kind-hint]")?.textContent, drawn: el.querySelectorAll("[aria-hidden] span").length, checked: el.getAttribute("aria-checked") } })
    return { kinds, sections: document.querySelectorAll("[data-editor-main] > section").length, side: !!document.querySelector("[data-editor-side]"), save: [...document.querySelectorAll("button")].filter((b) => /^Create$/.test(b.textContent.trim())).every((b) => b.disabled), title: document.querySelector("#offer-kind-title")?.textContent }
  })
  say(start.title === "What do you want to make?" && start.sections === 1 && !start.side && start.save, `the page starts on "${start.title}" alone (${start.sections} card, no side column, Create off)`)
  say(start.kinds.map((k) => k.kind).join() === "quantity_break,bundle,checkout" && start.kinds.every((k) => k.line && k.line.length > 20 && k.drawn >= 3 && k.checked === "false" && k.height >= 64), `three kinds, each with its line and its drawing, none chosen yet: ${start.kinds.map((k) => `${k.kind} ${k.height}px`).join(", ")}`)
  say(phone ? start.kinds.every((k, i) => i === 0 || k.top > start.kinds[i - 1].top) : start.kinds.every((k) => k.top === start.kinds[0].top), phone ? "one under another on a phone" : "side by side on a computer")
  await page.click('[data-kind="bundle"]')
  await wait(120)
  const form = await page.evaluate(() => ({ sections: document.querySelectorAll("[data-editor-main] > section").length, side: !!document.querySelector("[data-editor-side]"), more: document.querySelector("[data-offer-more]")?.getAttribute("data-offer-more"), line: document.querySelector("[data-offer-more-line]")?.textContent, places: document.querySelectorAll("[data-place]").length, name: document.querySelector("#offer-title")?.value, help: document.querySelector("[data-offer-help]")?.getAttribute("href") }))
  say(form.sections >= 5 && form.side && form.name === "Buy it together", `a kind brings the form and the preview in (${form.sections} cards, named "${form.name}")`)
  say(form.more === "closed" && form.places === 0 && /Shown on product page and cart/.test(form.line ?? ""), `More options is folded, saying what is set: "${form.line}"`)
  say(form.help === "/help/products/bundles", `the preview links to the guide for the kind (${form.help})`)
  await page.click("[data-offer-more] > button")
  await wait(80)
  say((await page.evaluate(() => document.querySelectorAll("[data-place]").length)) === 2, "More options opens on Show it on and Dates and limits")
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Create$/.test(b.textContent.trim()) && b.getClientRects().length)?.click())
  await wait(120)
  const problems = await page.evaluate(() => ({ count: document.querySelector("[data-problem-count]")?.getAttribute("data-problem-count"), words: [...document.querySelectorAll("[data-problem] p")].map((p) => p.textContent).filter((t) => /Tick|Type|Pick|Set/.test(t)) }))
  say(problems.count === "1" && problems.words.some((t) => /Tick 2 to 5 products for the bundle/.test(t)), `Create with nothing picked says what to do: ${problems.words.join(" | ")}`)
  const sent = await page.evaluate(() => window.__sent.length)
  say(sent === 0, "and sends nothing")
}

await browser.close()
console.log(bad ? `\n${bad} FAILED` : "\nAll measured.")
process.exit(bad ? 1 : 0)
