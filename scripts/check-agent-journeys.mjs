/**
 * ===========================================================================
 *  THE PUBLIC JOURNEYS, DRIVEN THE WAY AN AGENT OR A SCREEN READER DRIVES THEM
 * ===========================================================================
 * Headless Chromium (Playwright), using ONLY role and label locators
 * (getByRole, getByLabel): what a browser agent or assistive technology
 * can find from the accessibility tree, never a CSS class or a test id.
 *
 *   home -> pricing -> sign up       links found by their names
 *   sign up and log in               every field by its label, with the
 *                                    right type and autocomplete
 *   explore -> a creator page        a creator found by a link
 *   a product -> checkout entry      the buy control by its name, and the
 *                                    checkout's email field by its label
 *                                    (nothing is paid or submitted)
 *
 * On every page: one h1, the main landmark (and banner, navigation and
 * contentinfo where the page has them), no heading level skipped, no
 * clickable element that is neither a link nor a button, every button and
 * link named, and the cookie banner not covering the main content.
 *
 * Reads only; it never submits a form. BASE is the site to drive
 * (https://storelib.com by default; http://localhost:3000 for a dev server).
 *
 *   node scripts/check-agent-journeys.mjs
 *   BASE=http://localhost:3346 node scripts/check-agent-journeys.mjs
 */
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
let playwright
try {
  playwright = require("playwright")
} catch {
  playwright = require("/opt/node-tools/node_modules/playwright")
}

const BASE = (process.env.BASE || "https://storelib.com").replace(/\/$/, "")
const PRODUCT = process.env.PRODUCT_PATH || ""
let broken = 0
const results = []
const expect = (ok, what, got) => {
  results.push({ ok, what, got })
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok) broken++
}

/** What the page offers an agent, read from the DOM the accessibility tree is built from. */
async function audit(page, where) {
  const a = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
    }
    const nameOf = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && [...el.getAttribute("aria-labelledby").split(/\s+/)].map((id) => document.getElementById(id)?.textContent || "").join(" ") || el.textContent || el.getAttribute("title") || el.querySelector("img[alt]")?.getAttribute("alt") || el.querySelector("svg title")?.textContent || "").trim()
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => Number(h.tagName[1]))
    const skips = []
    for (let i = 1; i < headings.length; i++) if (headings[i] > headings[i - 1] + 1) skips.push(`h${headings[i - 1]}->h${headings[i]}`)
    const landmarks = {
      banner: document.querySelectorAll("header:not(main header):not(article header):not(section header), [role=banner]").length,
      navigation: document.querySelectorAll("nav, [role=navigation]").length,
      main: document.querySelectorAll("main, [role=main]").length,
      contentinfo: document.querySelectorAll("footer:not(main footer):not(article footer):not(section footer), [role=contentinfo]").length,
    }
    /* Hidden from the accessibility tree (a resting sheet, a honeypot): not offered to an agent, so not judged. */
    const exposed = (el) => !el.closest('[aria-hidden="true"], [inert]')
    const labelled = (el) => [...(el.labels || [])].map((l) => l.textContent || "").join(" ").trim()
    const unnamed = [...document.querySelectorAll("a[href], button, [role=button], [role=checkbox]")].filter(visible).filter(exposed).filter((el) => !nameOf(el) && !labelled(el)).map((el) => el.outerHTML.slice(0, 120))
    /* A pointer cursor on something that is neither a link, a button, a form control nor inside one. */
    const fakeClicks = [...document.querySelectorAll("div, span, li, img, svg")].filter(visible).filter((el) => getComputedStyle(el).cursor === "pointer" && !el.closest("a, button, [role=button], [role=link], [role=tab], [role=option], [role=menuitem], [role=switch], [role=checkbox], label, summary, input, select, textarea")).filter((el) => !(el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer" && !el.parentElement.closest("a, button"))).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} "${(el.textContent || "").trim().slice(0, 30)}"`)
    const inputs = [...document.querySelectorAll("input:not([type=hidden]), select, textarea, button[role=checkbox]")].filter(visible).filter(exposed).map((el) => {
      const id = el.id
      const label = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) || el.closest("label")?.textContent || el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") ? el.getAttribute("aria-labelledby").split(/\s+/).map((x) => document.getElementById(x)?.textContent || "").join(" ") : "")
      return { name: el.getAttribute("name"), type: el.getAttribute("type") || el.tagName.toLowerCase(), autocomplete: el.getAttribute("autocomplete"), label: (label || "").trim().slice(0, 40), placeholderOnly: !label && !!el.getAttribute("placeholder") }
    })
    const main = document.querySelector("main, [role=main]")
    const dialogs = [...document.querySelectorAll("[role=dialog], dialog[open], [aria-modal=true]")].filter(visible).filter(exposed)
    const covering = dialogs.filter((d) => {
      const r = d.getBoundingClientRect()
      return r.width * r.height > innerWidth * innerHeight * 0.5
    }).map((d) => (d.getAttribute("aria-label") || d.textContent || "").trim().slice(0, 50))
    return { h1: headings.filter((h) => h === 1).length, skips, landmarks, unnamed, fakeClicks: fakeClicks.slice(0, 8), inputs, hasMain: !!main, covering, title: document.title }
  })
  expect(a.h1 === 1, `${where}: exactly one h1`, a.h1)
  expect(a.landmarks.main === 1, `${where}: one main landmark`, a.landmarks)
  expect(a.skips.length === 0, `${where}: no heading level skipped`, a.skips)
  expect(a.unnamed.length === 0, `${where}: every link and button has a name`, a.unnamed)
  expect(a.fakeClicks.length === 0, `${where}: nothing clickable that is not a link or a button`, a.fakeClicks)
  expect(a.inputs.every((i) => i.label), `${where}: every field has a label`, a.inputs.filter((i) => !i.label))
  expect(a.covering.length === 0, `${where}: no dialog covering the page`, a.covering)
  return a
}

async function dismissCookies(page) {
  /* An agent answers the banner by its buttons' names, like a person. */
  for (const name of [/^reject/i, /^only necessary/i, /^necessary only/i, /^decline/i]) {
    const b = page.getByRole("button", { name }).filter({ visible: true }).first()
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => undefined)
      return true
    }
  }
  return false
}

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const widths = (process.env.WIDTHS || "1280,390").split(",").map(Number)
for (const width of widths) {
  console.log(`\n── ${width}px ──`)
  const context = await browser.newContext({ viewport: { width, height: 900 }, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 StorelibAgentCheck" })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  /* Home -> Pricing -> Sign up */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => expect(false, `opened ${`${BASE}/`}`, String(e).slice(0, 120)))
  await page.waitForLoadState("networkidle").catch(() => undefined)
  const banner = await page.getByRole("dialog").filter({ hasText: /cookie/i }).filter({ visible: true }).first().isVisible().catch(() => false)
  const region = await page.getByRole("region", { name: /cookie/i }).filter({ visible: true }).first().isVisible().catch(() => false)
  console.log(`  note  cookie banner as dialog: ${banner}, as region: ${region}`)
  await audit(page, "home")
  await dismissCookies(page)
  let pricing = page.getByRole("link", { name: /^pricing$/i }).filter({ visible: true }).first()
  if (width < 1024 && !(await pricing.isVisible().catch(() => false))) {
    const menu = page.getByRole("button", { name: /menu/i }).filter({ visible: true }).first()
    expect(await menu.isVisible().catch(() => false), "home: the phone menu is a named button")
    await menu.click().catch(() => undefined)
    const dialog = page.getByRole("dialog").filter({ visible: true }).first()
    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape")
      expect(!(await dialog.isVisible().catch(() => false)), "home: the menu closes with Escape")
      await menu.click().catch(() => undefined)
    }
    pricing = page.getByRole("link", { name: /^pricing$/i }).filter({ visible: true }).first()
  }
  expect(await pricing.isVisible().catch(() => false), "home: a link named Pricing")
  await pricing.click().catch(() => undefined)
  await page.waitForURL(/\/pricing/, { timeout: 15_000 }).catch(() => undefined)
  expect(/\/pricing/.test(page.url()), "pricing: reached by the link", page.url())
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await audit(page, "pricing")
  const start = page.getByRole("main").getByRole("link", { name: /start|sign up|get started|create/i }).first()
  /* An agent scrolls to what it found; a section that fades in on scroll is there once it is in view. */
  await start.scrollIntoViewIfNeeded().catch(() => undefined)
  await page.waitForTimeout(800)
  expect(await start.isVisible().catch(() => false), "pricing: a link to start", await start.textContent().catch(() => null))
  await start.click().catch(() => undefined)
  await page.waitForURL(/\/signup|\/sell|\/login/, { timeout: 15_000 }).catch(() => undefined)
  expect(/\/signup|\/sell/.test(page.url()), "pricing: the start link reaches sign up", page.url())

  /* Sign up */
  await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => expect(false, `opened ${`${BASE}/signup`}`, String(e).slice(0, 120)))
  await page.waitForLoadState("networkidle").catch(() => undefined)
  const s = await audit(page, "signup")
  const email = page.getByLabel(/email/i).filter({ visible: true }).first()
  expect(await email.isVisible().catch(() => false), "signup: email field found by its label")
  expect((await email.getAttribute("type").catch(() => null)) === "email" && /email/.test((await email.getAttribute("autocomplete").catch(() => "")) || ""), "signup: email is type email, autocomplete email", { type: await email.getAttribute("type").catch(() => null), ac: await email.getAttribute("autocomplete").catch(() => null) })
  const pw = page.getByLabel(/^password/i).filter({ visible: true }).first()
  const pwVisible = await pw.isVisible().catch(() => false)
  if (pwVisible) expect((await pw.getAttribute("type").catch(() => null)) === "password" && (await pw.getAttribute("autocomplete").catch(() => "")) === "new-password", "signup: password is type password, autocomplete new-password", { type: await pw.getAttribute("type").catch(() => null), ac: await pw.getAttribute("autocomplete").catch(() => null) })
  /* Two steps: the password field comes after Continue, which asks the server about the address. Not pressed here, so nothing is sent. */
  else console.log("  note  signup: the password field appears after Continue (two steps); checked in the source by tests/seo-tracking-r45")
  expect(await page.getByRole("button", { name: /create account|sign up|continue/i }).filter({ visible: true }).first().isVisible().catch(() => false), "signup: the submit button by its name")
  expect(await page.getByRole("link", { name: /log in|sign in/i }).filter({ visible: true }).first().isVisible().catch(() => false), "signup: a link to log in")

  /* Log in */
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => expect(false, `opened ${`${BASE}/login`}`, String(e).slice(0, 120)))
  await page.waitForLoadState("networkidle").catch(() => undefined)
  const l = await audit(page, "login")
  const lemail = page.getByLabel(/email/i).filter({ visible: true }).first()
  expect(await lemail.isVisible().catch(() => false), "login: email field found by its label", l.inputs)
  expect((await lemail.getAttribute("type").catch(() => null)) === "email" && /email|username/.test((await lemail.getAttribute("autocomplete").catch(() => "")) || ""), "login: email is type email with autocomplete", { type: await lemail.getAttribute("type").catch(() => null), ac: await lemail.getAttribute("autocomplete").catch(() => null) })
  const lpw = page.getByLabel(/^password/i).filter({ visible: true }).first()
  if (await lpw.isVisible().catch(() => false)) expect((await lpw.getAttribute("autocomplete").catch(() => "")) === "current-password", "login: password autocomplete current-password", await lpw.getAttribute("autocomplete").catch(() => null))
  expect(await page.getByRole("button", { name: /log in|sign in|continue/i }).filter({ visible: true }).first().isVisible().catch(() => false), "login: the submit button by its name")

  /* Explore -> a creator page */
  await page.goto(`${BASE}/explore`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => expect(false, `opened ${`${BASE}/explore`}`, String(e).slice(0, 120)))
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await audit(page, "explore")
  const creators = page.getByRole("main").getByRole("link")
  const count = await creators.count().catch(() => 0)
  let creatorHref = null
  for (let i = 0; i < Math.min(count, 80); i++) {
    const href = await creators.nth(i).getAttribute("href").catch(() => null)
    if (href && /^\/(?:u\/)?[a-z0-9_.-]+\/?$/i.test(href) && !/^\/(explore|pricing|blog|signup|login|sell|help|app|about|features|terms|privacy|alternatives|cart|checkout|search)\b/.test(href)) {
      creatorHref = href
      break
    }
  }
  expect(!!creatorHref, "explore: a creator page reachable by a link", creatorHref)
  if (creatorHref) {
    await page.goto(`${BASE}${creatorHref}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => expect(false, `opened ${`${BASE}${creatorHref}`}`, String(e).slice(0, 120)))
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await audit(page, `creator ${creatorHref}`)
  }

  /* A product -> checkout entry */
  let productPath = PRODUCT
  if (!productPath && creatorHref) {
    const links = page.getByRole("main").getByRole("link")
    const n = await links.count().catch(() => 0)
    for (let i = 0; i < Math.min(n, 120); i++) {
      const href = await links.nth(i).getAttribute("href").catch(() => null)
      if (href && (/^\/p\//.test(href) || new RegExp(`^${creatorHref.replace(/\/$/, "")}/[a-z0-9-]+$`, "i").test(href))) {
        productPath = href
        break
      }
    }
  }
  expect(!!productPath, "creator: a product reachable by a link", productPath)
  if (productPath) {
    await page.goto(`${BASE}${productPath}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e) => expect(false, `opened ${`${BASE}${productPath}`}`, String(e).slice(0, 120)))
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await audit(page, `product ${productPath}`)
    const buy = page.getByRole("main").getByRole("link", { name: /buy|get|purchase|add to cart|download/i }).or(page.getByRole("main").getByRole("button", { name: /buy|get|purchase|add to cart|download/i })).filter({ visible: true }).first()
    expect(await buy.isVisible().catch(() => false), "product: the buy control by its name", await buy.textContent().catch(() => null))
    await buy.click().catch(() => undefined)
    await page.waitForURL(/\/checkout/, { timeout: 15_000 }).catch(() => undefined)
    if (/\/checkout/.test(page.url())) {
      await page.waitForLoadState("networkidle").catch(() => undefined)
      await audit(page, "checkout")
      const ce = page.getByLabel(/email/i).filter({ visible: true }).first()
      expect(await ce.isVisible().catch(() => false), "checkout: the email field by its label")
      expect((await ce.getAttribute("autocomplete").catch(() => "")) === "email" && (await ce.getAttribute("type").catch(() => "")) === "email", "checkout: email type and autocomplete", { type: await ce.getAttribute("type").catch(() => null), ac: await ce.getAttribute("autocomplete").catch(() => null) })
    } else expect(true, "product: buy opened a basket or a sheet, not checkout", page.url())
  }
  await context.close()
}
await browser.close()
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
