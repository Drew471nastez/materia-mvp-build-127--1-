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
 *   • Connections stands apart under Code and lists the tools, Claude Code,
 *     Codex and GitHub, each with its status and one button; pressing one
 *     shows only its own steps: a key and a command for Claude Code and
 *     Codex, a GitHub repository for the rest;
 *   • a setting written here reaches the editor's state, and the search
 *     preview follows it;
 *   • nothing scrolls sideways, at either width.
 *
 *   node scripts/check-website-settings.mjs   (PROBE_CSS=source without a build)
 *
 * Screenshots go to SHOTS_DIR, or a temporary folder that is printed.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/* The built stylesheet when there is one, else globals.css compiled from source (scripts/probe-css.mjs). */
const css = (await appCss(root)) + "\n" + interFaces(root)

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

/* Navigation is its own subject (round N5), after Pages. */
const EXPECTED = ["General", "Domains", "SEO & Social", "Pages", "Navigation", "Commerce", "Policies", "Publishing", "Backups & Versions", "Connections"]

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

/** Presses the one button on a line of Connections ("claude", "codex", "github"). Fails loudly if there is none. */
const pressLine = async (p, id) => {
  const hit = await p.evaluate((id) => {
    const el = document.querySelector(`[data-connection="${id}"] > div:first-child button`)
    if (!el) return false
    el.click()
    return true
  }, id)
  if (!hit) fail(`No "${id}" line to press.`)
}
/** Each line of Connections: its id, its status in words, and the buttons on it while closed. */
const connectionLines = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-connection]")].map((r) => ({
      id: r.getAttribute("data-connection"),
      status: (r.querySelector("[data-connection-status]")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      buttons: [...r.firstElementChild.querySelectorAll("button, a")].map((b) => b.textContent.trim()),
    })),
  )

/* ── Desktop ─────────────────────────────────────────────────────────── */
console.log("\ndesktop, 1280 wide")
{
  const p = await open({ width: 1280, height: 860 })
  const nav = await p.$$eval("nav[aria-label='Website settings'] button", (b) => b.map((x) => x.textContent.trim()))
  expect(JSON.stringify(nav) === JSON.stringify(EXPECTED), "every subject, in the order asked for", nav.join(" | "))
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
    /* Primary, redirect and HTTPS, then the field for another domain. */
    return rows.length === 4 && rows.slice(0, -1).every((r) => ruleOf(r) > 0)
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

  /* Switching subjects: a fade in place, nothing rising or growing into it. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Commerce")
  await sleep(300)
  await clickText(p, "nav[aria-label='Website settings'] button", "Policies")
  const mid = await p.evaluate(() => {
    const box = document.querySelector("main > div[aria-label]")
    const cs = getComputedStyle(box)
    return { transform: cs.transform, top: Math.round(box.getBoundingClientRect().top) }
  })
  await sleep(400)
  const settled = await p.evaluate(() => Math.round(document.querySelector("main > div[aria-label]").getBoundingClientRect().top))
  expect(mid.transform === "none" && mid.top === settled, "a new subject fades in where it will sit, without a rise or a scale", JSON.stringify({ ...mid, settled }))
  await clickText(p, "nav[aria-label='Website settings'] button", "Commerce")
  await sleep(250)
  expect(!/shipping/i.test(await p.evaluate(() => document.querySelector("main").textContent)), "Commerce no longer asks about shipping")

  /* Policies: the cookie banner is set in Theme settings now (beside the colours); Policies says whether it shows and opens it. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Policies")
  await sleep(250)
  const banner = await p.evaluate(() => {
    const main = document.querySelector("main")
    return { said: /Cookie banner/.test(main.textContent) && /(Shown to visitors|Turned off)/.test(main.textContent), edit: [...main.querySelectorAll("button")].some((b) => b.textContent.trim() === "Edit banner") }
  })
  expect(banner.said && banner.edit, "Policies says whether the cookie banner shows, with Edit banner to set it in Theme settings", JSON.stringify(banner))

  /* Domains: the website's own name on Storelib, changed without touching the username. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Domains")
  await sleep(250)
  await clickText(p, "main button", "Change address")
  await sleep(150)
  const field = "#wb-site-handle"
  await p.$eval(field, (el) => el.select())
  await p.type(field, "ab")
  await sleep(80)
  const short = await p.evaluate(() => document.querySelector("[data-address-editor] p").textContent)
  expect(/At least 3/.test(short), "a name that is too short says so as it is typed", short)
  await p.$eval(field, (el) => el.select())
  await p.type(field, "Astrid Studio")
  await sleep(80)
  const hint = await p.evaluate(() => document.querySelector("[data-address-editor] p").textContent)
  expect(/Will be astrid-studio\.storelib\.com/.test(hint), "and one with spaces or capitals says the name it will be", hint)
  await clickText(p, "[data-address-editor] button", "Save")
  await sleep(300)
  const renamed = await p.evaluate(() => ({ text: document.querySelector("main").textContent, posted: window.__calls.includes("POST /api/website-address") }))
  expect(renamed.posted && /astrid-studio\.storelib\.com/.test(renamed.text), "saved, the new address is the one shown", renamed.posted)

  /* Domains: a new one is added here, and replacing the one there is asked first. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Domains")
  await sleep(300)
  await p.type("#wb-new-domain", "newstudio.com")
  await clickText(p, "main button", "Connect")
  await sleep(150)
  const asked = await p.evaluate(() => ({ text: document.querySelector("main").textContent, posted: window.__calls.some((c) => c.startsWith("POST /api/domains")) }))
  expect(/This replaces astridstudio\.com/.test(asked.text) && !asked.posted, "replacing the connected domain is said and asked before anything is sent", asked.posted)
  await clickText(p, "main button", "Replace")
  await sleep(300)
  const added = await p.evaluate(() => ({ text: document.querySelector("main").textContent, posted: window.__calls.includes("POST /api/domains") }))
  expect(added.posted && /216\.150\.1\.1/.test(added.text) && /domains\.storelib\.com/.test(added.text) && !/vercel/i.test(added.text) && /storelib-verify-3f9c2a71d04b8e56a1c7f02e9d4b6a8c/.test(added.text), "then it is added, with the three records to set", added.posted)
  await clickText(p, "main button", "Check DNS")
  await sleep(300)
  expect(await p.evaluate(() => window.__calls.includes("POST /api/domains/verify")), "and Check DNS asks whether they are in place")
  expect((await overflow(p)) === 0, "the records fit without scrolling sideways", await overflow(p))
  const wideSetup = await p.evaluate(() => ({
    steps: document.querySelectorAll("[data-dns-setup] ol > li").length,
    picker: Boolean(document.querySelector("[data-dns-registrar]")),
    header: [...document.querySelectorAll("[data-dns-table] [role=columnheader]")].filter((h) => h.getBoundingClientRect().width > 0).map((h) => h.textContent),
  }))
  expect(wideSetup.steps === 3 && wideSetup.picker && wideSetup.header.join() === "Type,Name,Value,TTL,Status", "the records are the same three steps as Settings, with the provider picker and the table", wideSetup)
  await p.screenshot({ path: join(shots, "desktop-domains-add.png") })
  await p.evaluate(() => document.querySelector("[data-dns-setup]")?.scrollIntoView({ block: "start" }))
  await p.screenshot({ path: join(shots, "domains2-website-settings-1280.png") })

  /* Pages: each page's search result, edited in place. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Pages")
  await sleep(300)
  await p.click("button[aria-controls='wb-page-seo-about']")
  await sleep(320)
  await p.type("#wb-page-seo-about input", "About Astrid Studio")
  await sleep(120)
  const stored = await p.evaluate(() => window.__settings?.page_seo?.about?.title)
  expect(stored === "About Astrid Studio", "a page's own title reaches the draft", stored)
  await p.click("#wb-page-seo-about input[type=checkbox]")
  await sleep(150)
  const hidden = await p.evaluate(() => ({ v: window.__settings?.page_seo?.about?.hidden, badge: /Hidden from search/.test(document.querySelector("main").textContent) }))
  expect(hidden.v === true && hidden.badge, "and it can be kept out of search, which the list then says", hidden)
  await p.screenshot({ path: join(shots, "desktop-pages-seo.png") })

  /* Connections: its own group, a line per tool, then only that tool's steps. */
  const group = await p.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Website settings']")
    const heading = [...nav.querySelectorAll("p")].find((x) => x.textContent.trim() === "Code")
    const conn = [...nav.querySelectorAll("button")].find((b) => b.textContent.trim() === "Connections")
    return { heading: !!heading, before: !!heading && !!conn && !!(heading.compareDocumentPosition(conn) & Node.DOCUMENT_POSITION_FOLLOWING) }
  })
  expect(group.heading && group.before, "Connections stands apart, under its own Code heading after the site's settings", group)
  await clickText(p, "nav[aria-label='Website settings'] button", "Connections")
  await sleep(400)
  const lines = await connectionLines(p)
  /* Your own AI key (round 8) has its line too. */
  expect(["claude", "codex", "github"].every((id) => lines.some((l) => l.id === id)), "it lists the tools: Claude Code, Codex, GitHub", lines.map((l) => l.id))
  expect(lines.every((l) => l.status === "Not connected" && l.buttons.join() === "Connect"), "each says whether it is connected, with one button", lines)
  await p.screenshot({ path: join(shots, "desktop-connections.png") })
  await pressLine(p, "claude")
  await sleep(500)
  const direct = await p.evaluate(() => document.querySelector("main").textContent)
  expect(/Paste this and press/.test(direct) && /Bearer slb_/.test(direct) && !/Continue to GitHub/.test(direct), "Claude Code shows its key in its command, and nothing about a repository")
  await p.screenshot({ path: join(shots, "desktop-connections-direct.png") })
  await pressLine(p, "github")
  await sleep(500)
  const github = await p.evaluate(() => document.querySelector("main").textContent)
  expect(/Continue to GitHub/.test(github) && !/Paste this and press/.test(github), "GitHub shows the repository steps, and Claude Code's close")
  await p.screenshot({ path: join(shots, "desktop-connections-github.png") })

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
  expect(list.items.length === EXPECTED.length && list.items.every((i) => i.v), "every subject are a list you can see, not chips off the edge", list.items.map((i) => i.t).join(" | "))
  expect(list.items.every((i) => i.h >= 44), "every one is a thumb's height", list.items.map((i) => i.h))
  const lastBottom = await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Website settings'] button")].pop().getBoundingClientRect().bottom)
  expect(lastBottom <= list.viewport, "Connections is on the first screen, where it can be found", `${lastBottom} of ${list.viewport}`)
  expect(!list.mainShown, "and the list comes first")
  await p.screenshot({ path: join(shots, "phone-list.png") })

  await clickText(p, "nav[aria-label='Website settings'] button", "Connections")
  /* The push takes 340ms (PUSH_MS); the list hides once it lands. */
  await sleep(700)
  const inside = await p.evaluate(() => ({
    heading: document.querySelector("main h1")?.textContent,
    /* Under the page, hidden rather than removed, so it keeps its scroll for Back. */
    listShown: getComputedStyle(document.querySelector("aside")).visibility !== "hidden",
  }))
  expect(inside.heading === "Connections" && !inside.listShown, "a subject opens over the list", inside)
  expect((await overflow(p)) === 0, "and does not scroll sideways", await overflow(p))
  const buttons = await p.$$eval("[data-connection] > div:first-child button", (r) => r.map((x) => { const b = x.getBoundingClientRect(); return { h: Math.round(b.height), right: Math.round(b.right) } }))
  expect(buttons.length >= 3 && buttons.every((c) => c.h >= 44 && c.right <= 390), "each line's button is a thumb's height, on the screen", buttons)
  await pressLine(p, "claude")
  await sleep(500)
  const steps = await p.evaluate(() => [...document.querySelectorAll("main button, main pre, main code")].filter((e) => e.getBoundingClientRect().right > 391).length)
  expect(steps === 0, "no step, command or button runs off the right edge", steps)
  await p.screenshot({ path: join(shots, "phone-connections.png"), fullPage: false })
  await pressLine(p, "github")
  await sleep(500)
  expect((await overflow(p)) === 0, "the GitHub steps fit the phone too", await overflow(p))
  await p.screenshot({ path: join(shots, "phone-connections-github.png"), fullPage: false })
  await clickText(p, "main button", "Website Settings")
  await sleep(250)
  await sleep(200)
  expect(await p.evaluate(() => getComputedStyle(document.querySelector("aside")).visibility !== "hidden" && getComputedStyle(document.querySelector("main")).display === "none"), "its Back returns to the list")

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

  /* The two panels that open in place: a new domain's records, a page's search result. */
  await clickText(p, "nav[aria-label='Website settings'] button", "Domains")
  await sleep(250)
  await p.type("#wb-new-domain", "newstudio.com")
  await clickText(p, "main button", "Connect")
  await sleep(120)
  await clickText(p, "main button", "Replace")
  await sleep(300)
  const records = await p.evaluate(() => ({
    rows: document.querySelectorAll("[data-dns-record]").length,
    copies: [...document.querySelectorAll("[data-dns-copy]")].map((b) => b.getBoundingClientRect()).map((r) => ({ right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) })),
  }))
  expect(records.rows === 3 && records.copies.length === 3 && records.copies.every((r) => r.right <= 390 - 16 && r.w >= 44 && r.h >= 44) && (await overflow(p)) === 0, "a new domain's three records fit the phone, each copy button in reach and 44px", records)
  const cut = await p.evaluate(() => [...document.querySelectorAll("[data-dns-value]")].filter((v) => v.scrollWidth > v.clientWidth + 1).map((v) => v.textContent))
  expect(cut.length === 0, "and every value is there in full, to be typed by hand if need be", cut)
  await p.evaluate(() => document.querySelector("[data-dns-copy]")?.scrollIntoView({ block: "center" }))
  await p.screenshot({ path: join(shots, "phone-domains-records.png") })
  await p.evaluate(() => document.querySelector("[data-dns-setup]")?.scrollIntoView({ block: "start" }))
  await p.screenshot({ path: join(shots, "domains2-website-settings-390.png") })
  await clickText(p, "main button", "Website Settings")
  await sleep(150)
  await clickText(p, "nav[aria-label='Website settings'] button", "Pages")
  await sleep(250)
  await p.click("button[aria-controls='wb-page-seo-contact']")
  await sleep(200)
  expect((await overflow(p)) === 0, "and so does a page's search panel", await overflow(p))
  await p.evaluate(() => document.getElementById("wb-page-seo-contact")?.scrollIntoView({ block: "start" }))
  await p.screenshot({ path: join(shots, "phone-pages-seo.png") })

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
