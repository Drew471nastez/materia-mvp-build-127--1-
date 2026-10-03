/**
 * ===========================================================================
 *  A LINK TO A SECTION, PICKED AND SHOWN BY ITS NAME
 * ===========================================================================
 * "In the link picker add a category 'Sections on this page' (and for other
 * pages, sections of that page when drilling into a page) that lists the
 * sections by their visible name, never hashes or ids. ... show the
 * section's name with a section icon instead [of '#ghostwriting']."
 *
 * The real LinkPicker (scripts/render-link-sections.tsx) with the home page's
 * sections and a reader for About's, driven with a real mouse and keyboard:
 *
 *   at rest     a stored "#ghostwriting", "/#pricing" or picked
 *               "/#section-…" shows the section's name with the section
 *               mark; "#nowhere" stays as typed
 *   the list    "Sections on this page" first; it opens onto the sections
 *               by heading; a pick stores "/#section-<id>"
 *   a page      the chevron on About's row reads About's sections (saying
 *               so while it does) and a pick shows "About · The team";
 *               Right arrow on Home opens Home's
 *
 *   node scripts/check-link-sections.mjs      (SHOTS_DIR=dir for pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { probeCss } from "./probe-css.mjs"
import { reporter, sleep } from "./anchor-motion-probe.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const css = (await probeCss(root)).replace(/@media \(hover: ?hover\)/g, "@media all")
const out = mkdtempSync(join(tmpdir(), "storelib-linksections-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-link-sections.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f3f4f6;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const { check, finish } = reporter()
const shots = process.env.SHOTS_DIR

const INPUT = 'input[role="combobox"]'
const CHEVRON = 'button[aria-label="Pages and products"]'
const STATE = () => {
  const el = document.querySelector('input[role="combobox"]')
  const mark = el.parentElement.querySelector("span[aria-hidden] svg")
  const options = [...document.querySelectorAll('[role="option"]')]
  const label = (o) => (o.querySelector("span.truncate")?.textContent ?? o.textContent).trim()
  const panel = document.querySelector(".wb-field-panel")
  return {
    saved: window.__value,
    shown: el.value,
    mark: mark ? [...mark.classList].find((c) => c.startsWith("lucide-")) : null,
    rows: options.map(label),
    rowMarks: options.map((o) => [...(o.querySelector("span.rounded-md svg")?.classList ?? [])].find((c) => c.startsWith("lucide-")) ?? null),
    panelText: panel ? panel.textContent : "",
    loads: window.__loads,
  }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const open = async (value) => {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(`${origin}/?value=${encodeURIComponent(value)}`, { waitUntil: "load" })
  await page.waitForSelector(INPUT)
  await sleep(150)
  return page
}
const clickRow = async (page, text) => {
  const rows = await page.$$('[role="option"]')
  for (const r of rows) {
    const t = await r.evaluate((o) => (o.querySelector("span.truncate")?.textContent ?? o.textContent).trim())
    if (t === text) { await r.click(); return true }
  }
  return false
}

try {
  console.log("\nAt rest, a stored link is shown by its section's name")
  for (const [value, want] of [["#ghostwriting", "Ghostwriting"], ["/#pricing", "Plans"], ["/#section-story-c3", "Our story"], ["#section-faq-x1", "FAQ"]]) {
    const page = await open(value)
    const s = await page.evaluate(STATE)
    check(`"${value}" shows "${want}" with the section mark`, s.shown === want && /rows-?3/.test(s.mark ?? ""), `${s.shown} ${s.mark}`)
    if (value === "#ghostwriting" && shots) await page.screenshot({ path: join(shots, "link-sections-rest.png"), clip: { x: 0, y: 0, width: 340, height: 90 } })
    await page.close()
  }
  {
    const page = await open("#nowhere")
    const s = await page.evaluate(STATE)
    check('"#nowhere" names no section and stays as typed', s.shown === "#nowhere", s.shown)
    await page.close()
  }

  console.log("\nSections on this page")
  {
    const page = await open("")
    await page.click(CHEVRON)
    await sleep(250)
    let s = await page.evaluate(STATE)
    check("is the first row of the list", s.rows[0] === "Sections on this page" && /rows-?3/.test(s.rowMarks[0] ?? ""), s.rows.join(" | "))
    await clickRow(page, "Sections on this page")
    await sleep(250)
    s = await page.evaluate(STATE)
    console.log(`        rows: ${s.rows.join(" | ")}`)
    check("lists the sections by what a visitor reads, header and footer left out",
      s.rows.join("|") === "Back|Words that sell|Ghostwriting|Plans|Our story|FAQ", s.rows.join("|"))
    check("and never an id or a hash", !/#|section-/.test(s.panelText))
    if (shots) await page.screenshot({ path: join(shots, "link-sections-list.png"), clip: { x: 0, y: 0, width: 340, height: 360 } })
    await clickRow(page, "Our story")
    await sleep(200)
    await page.click("#sidebar", { offset: { x: 300, y: 500 } })
    await sleep(150)
    s = await page.evaluate(STATE)
    check('a pick stores the stable anchor "/#section-story-c3"', s.saved === "/#section-story-c3", s.saved)
    check('and the field shows "Our story"', s.shown === "Our story", s.shown)
    await page.close()
  }

  console.log("\nAnother page's sections")
  {
    const page = await open("")
    await page.click(CHEVRON)
    await sleep(200)
    await clickRow(page, "Pages")
    await sleep(200)
    const chevron = await page.$('button[aria-label="Sections on About"]')
    check("About's row has a way into its sections", !!chevron)
    await chevron.click()
    await sleep(60)
    let s = await page.evaluate(STATE)
    check("which says so while they are read", /Loading sections/.test(s.panelText) && s.loads.includes("/about"), s.loads)
    await sleep(400)
    s = await page.evaluate(STATE)
    console.log(`        rows: ${s.rows.join(" | ")}`)
    check("then lists the page and its sections", s.rows.join("|") === "Back|About|The team|Since 2019", s.rows.join("|"))
    if (shots) await page.screenshot({ path: join(shots, "link-sections-about.png"), clip: { x: 0, y: 0, width: 340, height: 260 } })
    await clickRow(page, "The team")
    await sleep(200)
    await page.click("#sidebar", { offset: { x: 300, y: 500 } })
    await sleep(150)
    s = await page.evaluate(STATE)
    check('a pick stores "/about#section-t1" and shows "About · The team"', s.saved === "/about#section-t1" && s.shown === "About · The team", `${s.saved} ${s.shown}`)
    await page.close()
  }
  {
    const page = await open("/about#section-t2")
    await sleep(500)
    const s = await page.evaluate(STATE)
    check("a stored link to another page's section is named once that page is read", s.shown === "About · Since 2019", s.shown)
    await page.close()
  }

  console.log("\nThe keyboard")
  {
    const page = await open("")
    await page.focus(INPUT)
    await sleep(150)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    let s = await page.evaluate(STATE)
    const active = await page.evaluate(() => document.querySelector('[role="option"][aria-selected="true"]')?.textContent.trim())
    check("Down reaches Home", /^Home/.test(active ?? ""), active)
    await page.keyboard.press("ArrowRight")
    await sleep(200)
    s = await page.evaluate(STATE)
    check("Right opens Home's sections", s.rows[0] === "Back" && s.rows[1] === "Home" && s.rows.includes("Plans"), s.rows.join("|"))
    await page.keyboard.press("ArrowLeft")
    await sleep(200)
    s = await page.evaluate(STATE)
    check("Left comes back", s.rows[0] === "Sections on this page", s.rows.join("|"))
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
finish()
