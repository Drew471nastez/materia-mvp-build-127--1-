/**
 * ===========================================================================
 *  THE COMMUNITY SECTION AND CARD, MEASURED AT A DESK AND ON A PHONE
 * ===========================================================================
 * Renders the creator page's Community section through the live page's own
 * SectionRenderer, and the website's community_card through the theme
 * engine (scripts/render-community-section.tsx), at 1440 and 390, and
 * measures:
 *
 *   the page never scrolls sideways              document scrollWidth
 *   nothing pokes out of the card                card scrollWidth
 *   the join button is 44px and full width        its rect on a phone
 *     on a phone, beside the name on a desk
 *   the posts and the side column sit side by     their rects at 1440
 *     side on a desk and stack on a phone
 *   no text is clipped                            name, stats scrollWidth
 *   the card follows a dark creator scheme        computed colours
 *   with no data nothing is drawn                 an empty page
 *   while off, the builder says so                its note
 *
 * and writes a screenshot of each to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-community-section.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-community-section-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-community-section.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
)

const css = await appCss(root)
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head>
<body><div id="root"></div><script src="probe.js"></script></body></html>`,
)

/* The website card is drawn by the theme engine in node, then measured like the rest. */
const card = JSON.parse(execFileSync("npx", ["--no-install", "tsx", join(root, "scripts/render-community-card.ts")], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }))
const cardPage = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style><style>${card.css}</style></head><body><div id="root">${body}</div></body></html>`
writeFileSync(join(out, "card.html"), cardPage(card.html))
writeFileSync(join(out, "card-empty.html"), cardPage(card.empty))
writeFileSync(join(out, "card-editor.html"), cardPage(card.editor))

const MODES = ["full", "dark", "minimal", "phone", "off", "builder", "card", "card-empty", "card-editor"]
const CASES = []
for (const width of [1440, 390]) for (const mode of MODES) CASES.push({ width, mode, name: `${mode}-${width}` })
CASES.push({ width: 1440, mode: "sample", name: "sample-1440" })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
const note = (c, m) => problems.push(`${c.name}: ${m}`)

for (const c of CASES) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  await page.setViewport({ width: c.width, height: c.width > 800 ? 900 : 844, deviceScaleFactor: 1, isMobile: c.width < 800, hasTouch: c.width < 800 })
  await page.goto(c.mode.startsWith("card") ? `file://${join(out, `${c.mode}.html`)}` : `file://${join(out, "index.html")}?mode=${c.mode}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 500))

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const rect = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
    const sectionEl = document.querySelector("[data-community-section]")
    const card = sectionEl ? sectionEl.querySelector(".rounded-2xl") : document.querySelector(".cc__card")
    const joins = [...document.querySelectorAll("[data-community-join], .cc__btn")].filter((el) => el.getBoundingClientRect().width > 0)
    const clipped = [...document.querySelectorAll("a, p, h2, h3")].filter((el) => {
      const s = getComputedStyle(el)
      return s.overflow === "hidden" && s.textOverflow !== "ellipsis" && el.scrollWidth - el.clientWidth > 1 && !s.webkitLineClamp
    }).map((el) => (el.textContent || "").slice(0, 30))
    const parts = [...document.querySelectorAll("[data-community-section] h3")].map((h) => ({ text: h.textContent, rect: h.getBoundingClientRect().toJSON() }))
    const small = [...document.querySelectorAll("a, button")].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.height < 40 && (el.matches("[data-community-join], .cc__btn"))
    }).length
    return {
      vw,
      scroll: document.documentElement.scrollWidth - vw,
      hasSection: !!sectionEl || !!document.querySelector(".cc__card"),
      placeholder: sectionEl?.getAttribute("data-community-section") === "placeholder",
      text: (document.body.textContent || "").replace(/\s+/g, " ").slice(0, 2000),
      card: rect(card),
      cardOver: card ? card.scrollWidth - card.clientWidth : 0,
      joins: joins.map((j) => j.getBoundingClientRect().toJSON()),
      parts,
      clipped,
      small,
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      cardColor: card ? getComputedStyle(card).color : null,
      height: Math.round(document.getElementById("root").getBoundingClientRect().height),
      /* What the section put on the page: its wrapper's height, which is 0 when it draws nothing. */
      pageChildren: [...(document.querySelector("[data-page]")?.children ?? [])].reduce((n, el) => n + Math.round(el.getBoundingClientRect().height), 0),
    }
  })
  await page.screenshot({ path: join(shots, `${c.name}.png`), fullPage: true })

  if (errors.length) note(c, `errors: ${errors.join(" | ").slice(0, 300)}`)
  if (m.scroll > 0) note(c, `page scrolls sideways by ${m.scroll}px`)
  if (m.cardOver > 1) note(c, `the card's content is wider than the card by ${m.cardOver}px`)
  if (m.clipped.length) note(c, `clipped text: ${m.clipped.join(", ")}`)
  if (["full", "dark", "minimal", "phone", "card"].includes(c.mode)) {
    if (!m.hasSection) note(c, "nothing drawn")
    if (m.joins.length !== 1) note(c, `${m.joins.length} join buttons visible, expected one`)
    const j = m.joins[0]
    if (j && j.height < 44) note(c, `join button is ${Math.round(j.height)}px tall`)
    if (j && (c.width < 800 || c.mode === "phone") && c.mode !== "card" && m.card && j.width < m.card.width - 40) note(c, `join button is not full width on a phone (${Math.round(j.width)} of ${Math.round(m.card.width)})`)
    if (m.small) note(c, "a join button under 40px")
  }
  if (c.mode === "full" && c.width === 1440) {
    const latest = m.parts.find((p) => /Latest/.test(p.text))
    const coming = m.parts.find((p) => /Coming up/.test(p.text))
    if (!latest || !coming || Math.abs(latest.rect.top - coming.rect.top) > 2 || coming.rect.left <= latest.rect.left) note(c, "posts and the side column are not side by side on a desk")
    for (const want of ["Morning Runners", "1.2k members", "318 posts", "2 upcoming events", "Latest in the community", "Coming up", "Members", "Most active this month", "4.8", "37 reviews", "Join for $9/month", "and 1.2k more"]) if (!m.text.includes(want)) note(c, `missing "${want}"`)
  }
  if (c.mode === "full" && c.width === 390) {
    const latest = m.parts.find((p) => /Latest/.test(p.text))
    const coming = m.parts.find((p) => /Coming up/.test(p.text))
    if (latest && coming && coming.rect.top <= latest.rect.top) note(c, "the side column does not stack under the posts on a phone")
  }
  if (c.mode === "dark" && !/rgb\(27, 27, 31\)/.test(m.cardBg ?? "")) note(c, `the card does not take the dark scheme (${m.cardBg})`)
  if (c.mode === "minimal" && /Latest in the community|Coming up/.test(m.text)) note(c, "a part that is off was drawn")
  if (c.mode === "off" && (m.hasSection || m.pageChildren > 0)) note(c, `drew ${m.pageChildren}px with no data`)
  if (c.mode === "builder" && !(m.placeholder && /switched off/.test(m.text))) note(c, "the builder does not say communities are off")
  if (c.mode === "card" && !/1\.2k members/.test(m.text)) note(c, "the card has no members line")
  if (c.mode === "card-empty" && (m.hasSection || /Choose one of your communities/.test(m.text) || m.height > 0)) note(c, `an unknown community drew ${m.height}px on the live site`)
  if (c.mode === "card-editor" && !/Choose one of your communities/.test(m.text)) note(c, "the builder does not say what to do with an empty card")

  console.log(`${c.name.padEnd(16)} drawn=${m.hasSection} height=${m.height} scroll=${m.scroll} join=${m.joins[0] ? `${Math.round(m.joins[0].width)}x${Math.round(m.joins[0].height)}` : "-"}`)
  await page.close()
}

await browser.close()
console.log(`\nscreenshots: ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nall clear")
