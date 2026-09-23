/**
 * ===========================================================================
 *  WEBSITE SETTINGS, MEASURED
 * ===========================================================================
 * The claims about this page are claims about a browser, so they are checked
 * in one:
 *
 *   • nine subjects, in the order the request named them, and each opens
 *     its own page with its own heading;
 *   • on a phone the subjects are a list first, every one a thumb's height,
 *     and a subject opens over it with its own Back;
 *   • Advanced asks which tool, and each answer shows only its own path:
 *     a token and a command for Claude Code and Codex, GitHub for ChatGPT;
 *   • a setting written here reaches the editor's state, and the search
 *     preview follows it;
 *   • nothing scrolls sideways, at either width.
 *
 *   pnpm build && node scripts/check-website-settings.mjs
 *
 * Screenshots go to SHOTS_DIR, or a temporary folder that is printed.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-settings-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".settings-probe")
mkdirSync(stubs, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-website-settings-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
const wanted = new URLSearchParams(location.search).get("section")
window.__section = wanted || null
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
execFileSync(
  "npx",
  [
    "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ],
  { cwd: root, stdio: "inherit" },
)
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

const EXPECTED = ["General", "Domains", "SEO & Social", "Pages & Navigation", "Commerce", "Policies", "Publishing", "Backups & Versions", "Advanced"]

async function open(viewport, section = "") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/?section=${section}`, { waitUntil: "load" })
  await p.waitForSelector("[role=dialog][aria-label='Website settings']")
  await sleep(400)
  return p
}
const overflow = (p) => p.evaluate(() => {
  const d = document.querySelector("[role=dialog]")
  const main = d.querySelector("main")
  return Math.max(d.scrollWidth - d.clientWidth, main ? main.scrollWidth - main.clientWidth : 0)
})
const heading = (p) => p.evaluate(() => document.querySelector("main h1")?.textContent?.trim() ?? null)
const clickText = (p, selector, text) =>
  p.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === t)
    if (!el) return false
    el.click()
    return true
  }, selector, text)

/* ── Desktop ─────────────────────────────────────────────────────────── */
console.log("\ndesktop, 1280 wide")
{
  const p = await open({ width: 1280, height: 860 })
  const nav = await p.$$eval("nav[aria-label='Website settings'] button", (b) => b.map((x) => x.textContent.trim()))
  expect(JSON.stringify(nav) === JSON.stringify(EXPECTED), "nine subjects, in the order asked for", nav.join(" | "))
  expect((await heading(p)) === "General", "it opens on General", await heading(p))
  const layout = await p.evaluate(() => {
    const label = [...document.querySelectorAll("main label")].find((l) => l.textContent.trim() === "Website name")
    return {
      aside: Math.round(document.querySelector("aside").getBoundingClientRect().width),
      labelLines: label ? Math.round(label.getBoundingClientRect().height / 20) : 0,
      pickerBg: getComputedStyle(document.querySelector(".wb-dropzone")).backgroundColor,
    }
  })
  expect(layout.aside === 264, "the list is a 264px column, not half the screen", layout.aside)
  expect(layout.labelLines === 1, "a label keeps its line rather than being squeezed by its control", layout.labelLines)
  expect(!/rgb\(250, 250, 250\)/.test(layout.pickerBg), "the picture box is dark on the dark page, not a white hole", layout.pickerBg)
  expect(await p.evaluate(() => !document.body.textContent.includes("Project General Settings") && !document.body.textContent.includes("Project name")),
    "and says Website, never Project")
  expect(await p.evaluate(() => [...document.querySelectorAll("label")].some((l) => l.textContent.trim() === "Website name")), "the name is called Website name")
  await p.screenshot({ path: join(shots, "desktop-general.png") })

  const opened = []
  for (const label of EXPECTED) {
    await clickText(p, "nav[aria-label='Website settings'] button", label)
    await sleep(260)
    opened.push([label, await heading(p), await overflow(p)])
    if (label === "Domains") await p.screenshot({ path: join(shots, "desktop-domains.png") })
    if (label === "Commerce") await p.screenshot({ path: join(shots, "desktop-commerce.png") })
    if (label === "Backups & Versions") await p.screenshot({ path: join(shots, "desktop-backups.png") })
  }
  expect(opened.every(([l, h]) => l === h), "each subject opens a page with its own heading", opened.filter(([l, h]) => l !== h))
  expect(opened.every(([, , o]) => o === 0), "and none of them scrolls sideways", opened.filter(([, , o]) => o > 0))

  /* Domains reads the account's domain and says what it is. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Domains")
  await sleep(300)
  const domains = await p.evaluate(() => document.querySelector("main").textContent)
  expect(/www\.astridstudio\.com/.test(domains) && /Connected/.test(domains) && /to www\.astridstudio\.com/.test(domains),
    "a connected domain shows its primary address, its redirect and that it is connected")
  const ruled = await p.evaluate(() => {
    const card = [...document.querySelectorAll("main section")].find((s) => s.querySelector("h2")?.textContent === "Custom domain")
    const rows = [...card.querySelectorAll(":scope > div > div")]
    /* Tailwind 4's divide-y rules the bottom of every row but the last. */
    const ruleOf = (r) => parseFloat(getComputedStyle(r).borderTopWidth) + parseFloat(getComputedStyle(r).borderBottomWidth)
    return rows.length === 3 && rows.slice(0, -1).every((r) => ruleOf(r) > 0)
  })
  expect(ruled, "and each of its rows is ruled off like every other card's")

  /* SEO writes through the editor, and the preview follows. */
  await clickText(p, "nav[aria-label='Website settings'] button", "SEO & Social")
  await sleep(300)
  await p.type("#wb-seo-title", "Astrid Studio | Film presets")
  await sleep(150)
  const seo = await p.evaluate(() => ({
    preview: document.querySelector("[aria-label='Search result preview']")?.textContent ?? "",
    stored: window.__settings?.seo_title,
  }))
  expect(seo.stored === "Astrid Studio | Film presets", "a title typed here reaches the editor's settings", seo.stored)
  expect(seo.preview.includes("Astrid Studio | Film presets"), "and the search preview shows it")
  await p.click("input[aria-label='Let search engines list this website']")
  await sleep(150)
  const robots = await p.evaluate(() => window.__settings?.seo_robots)
  expect(robots === false, "switching search engines off stores false, which the live page now reads as noindex", robots)
  await p.screenshot({ path: join(shots, "desktop-seo.png"), fullPage: false })

  /* Advanced: which tool first, then only its path. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Advanced")
  await sleep(400)
  const tabs = await p.$$eval("[role=tablist][aria-label='Which tool'] [role=tab]", (t) => t.map((x) => x.textContent.trim()))
  expect(tabs.join("|") === "Claude Code|Codex|ChatGPT", "Advanced asks which tool: Claude Code, Codex or ChatGPT", tabs.join("|"))
  const claude = await p.evaluate(() => ({ name: document.querySelector("#agent-name")?.value, text: document.querySelector("main").textContent }))
  expect(claude.name === "Claude Code" && /Direct connection/.test(claude.text), "Claude Code gets a direct connection, named for it", claude.name)
  await p.screenshot({ path: join(shots, "desktop-advanced-claude.png") })
  await clickText(p, "[role=tab]", "Codex")
  await sleep(250)
  expect((await p.$eval("#agent-name", (i) => i.value)) === "Codex", "Codex is named Codex")
  await clickText(p, "[role=tab]", "ChatGPT")
  await sleep(300)
  const gpt = await p.evaluate(() => ({ direct: !!document.querySelector("#agent-name"), text: document.querySelector("[role=tabpanel]").textContent }))
  expect(!gpt.direct && /GitHub repository/.test(gpt.text), "ChatGPT is sent to GitHub, with no token it could not use")
  await p.screenshot({ path: join(shots, "desktop-advanced-chatgpt.png") })

  /* Escape is the way out. */
  await p.keyboard.press("Escape")
  await sleep(200)
  expect(await p.evaluate(() => !!document.getElementById("closed")), "Escape closes it")
  const errors = await p.evaluate(() => window.__errors)
  expect(errors.length === 0, "no errors in the console", errors.slice(0, 2).join(" | "))
  await p.close()
}

/* ── Phone ───────────────────────────────────────────────────────────── */
console.log("\nphone, 390 wide")
{
  const p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const list = await p.evaluate(() => ({
    items: [...document.querySelectorAll("nav[aria-label='Website settings'] button")].map((b) => ({ t: b.textContent.trim(), h: b.getBoundingClientRect().height, v: b.getBoundingClientRect().width > 0 })),
    mainShown: getComputedStyle(document.querySelector("main")).display !== "none",
    viewport: window.innerHeight,
  }))
  expect(list.items.length === 9 && list.items.every((i) => i.v), "the nine subjects are a list you can see, not chips off the edge", list.items.map((i) => i.t).join(" | "))
  expect(list.items.every((i) => i.h >= 44), "every one is a thumb's height", list.items.map((i) => i.h))
  const lastBottom = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Website settings'] button")].pop().getBoundingClientRect().bottom)
  expect(lastBottom <= list.viewport, "Advanced is on the first screen, where it can be found", `${lastBottom} of ${list.viewport}`)
  expect(!list.mainShown, "and the list comes first")
  await p.screenshot({ path: join(shots, "phone-list.png") })

  await clickText(p, "nav[aria-label='Website settings'] button", "Advanced")
  await sleep(350)
  const inside = await p.evaluate(() => ({
    heading: document.querySelector("main h1")?.textContent,
    listShown: getComputedStyle(document.querySelector("aside")).display !== "none",
  }))
  expect(inside.heading === "Advanced" && !inside.listShown, "a subject opens over the list", inside)
  expect((await overflow(p)) === 0, "and does not scroll sideways", await overflow(p))
  const nameBox = await p.$eval("#agent-name", (i) => Math.round(i.getBoundingClientRect().height))
  expect(nameBox >= 44, "the agent's name box is a full-height field on a phone, not a sliver", nameBox)
  await p.screenshot({ path: join(shots, "phone-advanced.png") })
  await clickText(p, "main button", "Website Settings")
  await sleep(250)
  expect(await p.evaluate(() => getComputedStyle(document.querySelector("aside")).display !== "none"), "its Back returns to the list")

  for (const label of EXPECTED) {
    await clickText(p, "nav[aria-label='Website settings'] button", label)
    await sleep(220)
    const o = await overflow(p)
    if (o > 0) expect(false, `${label} scrolls sideways at 390`, o)
    if (label === "SEO & Social") await p.screenshot({ path: join(shots, "phone-seo.png") })
    await clickText(p, "main button", "Website Settings")
    await sleep(120)
  }
  expect(true, "every subject fits the phone's width")

  /* Straight to one subject: how the tabs on the website page arrive. */
  const q = await open({ width: 390, height: 844, isMobile: true, hasTouch: true }, "domains")
  expect((await heading(q)) === "Domains", "?settings=domains opens straight on Domains, past the list", await heading(q))
  await q.close()
  await p.close()
}

/* ── Storelib AI's status line ───────────────────────────────────────── */
console.log("\nthe status line Storelib AI shows while it works")
{
  const p = await browser.newPage()
  await p.setViewport({ width: 420, height: 200, deviceScaleFactor: 2 })
  await p.goto(`${origin}/?status=1`, { waitUntil: "load" })
  await p.waitForSelector("[role=status]")
  await sleep(300)
  const look = await p.evaluate(() => {
    const t = document.querySelector(".ai-status-text")
    const cs = getComputedStyle(t)
    return { text: t.textContent, image: cs.backgroundImage, clip: cs.backgroundClip || cs.webkitBackgroundClip, anim: cs.animationName, live: document.querySelector("[role=status]").getAttribute("aria-live") }
  })
  expect(look.text === "Starting…" && look.live === "polite", "it says what it is doing, and a screen reader hears it", look.text)
  expect(/gradient/.test(look.image) && /text/.test(look.clip) && /ai-status-sweep/.test(look.anim),
    "the words carry a moving sweep of light, drawn from real colours", look.image.slice(0, 60))
  /* The words are painted: sample the pixels under them and find ink. */
  const box = await p.$eval(".ai-status-text", (t) => { const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  const png = await p.screenshot({ clip: box, encoding: "base64" })
  const ink = await p.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let dark = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 600) dark++
    return dark / (d.length / 4)
  }, png)
  expect(ink > 0.04, "and they can be read: the text is painted, not clipped away", `${Math.round(ink * 100)}% ink`)
  await p.evaluate(() => window.__setStatus("Checking it…"))
  await sleep(250)
  expect((await p.$eval(".ai-status-text", (t) => t.textContent)) === "Checking it…", "a new stage replaces the words in place")
  await p.screenshot({ path: join(shots, "ai-status.png") })
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}\n`)
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed.`)
console.log("Website Settings measured as asked.\n")
