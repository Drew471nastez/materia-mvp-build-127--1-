/**
 * ===========================================================================
 *  PROFILE DETAILS, MEASURED (r51)
 * ===========================================================================
 * The owner's list for the creator page's Edit profile sheet, each as
 * something a browser reads back, at 1280 with a mouse and 390 with touch:
 *
 *   one scroll       how many boxes inside the sheet can scroll, and whether
 *                    the page behind it moves while the form does;
 *   the cover        the frame's height and shape;
 *   Save             its colour with nothing changed, after a change, while
 *                    saving and once saved;
 *   live preview     the name, bio, photo, cover, social links and each of
 *                    the three switches on the page BEFORE Save; back to
 *                    what was saved on Cancel; kept after Save;
 *   schemes          every scheme pressed in turn: the page root's colour
 *                    and the header's type follow it;
 *   social fields    "@" in front, the saved link shown as the name, a full
 *                    link still accepted, and what is sent.
 *
 *   node scripts/check-profile-sheet-r51.mjs        (SHOTS=dir keeps pictures)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

const out = mkdtempSync(join(tmpdir(), "storelib-profile-sheet-"))
const stubs = join(root, ".profile-sheet-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/andrewrullz"
export const useRouter = () => ({ push() {}, prefetch() {},
  replace(href) { window.__onReplace && window.__onReplace(href) },
  refresh() { window.__refreshes = (window.__refreshes || 0) + 1; window.__onRefresh && window.__onRefresh() }, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "upload.js"), `export async function uploadWithProgress(bucket, path, file, o = {}) {
  for (const p of [20, 50, 80, 96]) { await new Promise((r) => setTimeout(r, 60)); o.onProgress && o.onProgress(p) }
}
`)
writeFileSync(join(stubs, "supabase.js"), `export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: window.__uploadedUrl } }), upload: async () => ({ error: null }) }) },
  }
}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, quality, priority, loading, style, className, onLoad, onError }) {
  return React.createElement("img", { src, alt, sizes, className, onLoad, onError, style: { ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : {}), ...(style || {}) } })
}
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-profile-sheet-r51.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@/lib/storage/upload-with-progress=${join(stubs, "upload.js")}`,
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
  `<script src="probe.js"></script></body></html>`)

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], ignoreDefaultArgs: ["--hide-scrollbars"] })
const problems = []
const report = {}
const expect = (ok, what) => { if (!ok) problems.push(what) }

async function open(vp, search = "") {
  const phone = vp.width < 768
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone })
  const page = await ctx.newPage()
  await page.goto(`file://${file}${search}`)
  await page.waitForFunction(() => window.__ready)
  await sleep(400)
  const errs = await page.evaluate(() => window.__err)
  if (errs.length) fail(`The page reported errors: ${errs.join(" | ")}`)
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${vp.width}.png`) }) }
  const press = async (sel) => { if (phone) await page.tap(sel); else await page.click(sel) }
  const openSheet = async () => {
    await press("[aria-label='Edit profile']")
    await page.waitForFunction(() => !!document.querySelector("[data-sheet-scroll]"))
    await sleep(700)
  }
  return { ctx, page, phone, shot, press, openSheet }
}

/* Every box inside the sheet that can scroll, and how. */
const SCROLLERS = `(() => {
  const sheet = document.querySelector("[data-sheet-scroll]")?.closest("[role=dialog], [data-sheet-panel]") || document.body
  const out = []
  for (const el of [document.scrollingElement, ...sheet.querySelectorAll("*")]) {
    const cs = getComputedStyle(el)
    const scrolls = /(auto|scroll)/.test(cs.overflowY) || el === document.scrollingElement
    if (!scrolls) continue
    const extra = el.scrollHeight - el.clientHeight
    if (extra > 1) out.push({ sw: cs.scrollbarWidth, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), extra, bar: el.offsetWidth - el.clientWidth, doc: el === document.scrollingElement })
  }
  return out
})()`

const SAVE = `(() => {
  const b = [...document.querySelectorAll("[data-sheet-pin-bottom] button")].pop()
  if (!b) return null
  const cs = getComputedStyle(b)
  return { state: b.getAttribute("data-save-state"), bg: cs.backgroundColor, color: cs.color, opacity: cs.opacity, disabled: b.disabled, text: b.innerText.replace(/\\s+/g, " ").trim() }
})()`

const HEADER = `(() => {
  const h1 = document.querySelector("h1")
  const bio = h1?.parentElement?.querySelector("p.max-w-xl")
  const band = document.querySelector("[data-cover-band] img")
  const av = document.querySelector("[data-storefront-root] .relative.group img")
  const meta = [...document.querySelectorAll("[data-storefront-root] a[href]")].map((a) => a.getAttribute("href")).filter((h) => /instagram|tiktok|youtube|x\\.com|twitter|facebook|linkedin|twitch/.test(h))
  const text = document.querySelector("[data-storefront-root]").innerText
  const root = getComputedStyle(document.querySelector("[data-storefront-root]"))
  return {
    name: h1?.firstChild?.textContent ?? null,
    bio: bio?.textContent ?? null,
    cover: band?.getAttribute("src")?.slice(0, 40) ?? null,
    coverPos: band ? getComputedStyle(band).objectPosition : null,
    avatar: av?.getAttribute("src")?.slice(0, 40) ?? null,
    socials: meta,
    reviews: /4\\.8/.test(text),
    sales: /482/.test(text),
    rootBg: root.backgroundColor,
    barBg: getComputedStyle(document.querySelector("[data-bar]")).backgroundColor,
    nameColor: h1 ? getComputedStyle(h1).color : null,
  }
})()`

for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  const r = (report[vp.width] = {})
  try { await run(vp, r) } catch (e) { problems.push(`${vp.width}: stopped: ${String(e.message).split("\n")[0]}`) }
}
async function run(vp, r) {
  const { ctx, page, phone, shot, press, openSheet } = await open(vp)
  await shot("0-page")
  const GUTTER = `(() => ({ gutter: window.innerWidth - document.documentElement.clientWidth, h1: Math.round(document.querySelector("h1").getBoundingClientRect().left * 10) / 10 }))()`
  const closed = await page.evaluate(GUTTER)
  await openSheet()
  await shot("1-open")
  /* The page's own bar beside the drawer is the second scrollbar; and nothing behind may move when it goes. */
  const opened = await page.evaluate(GUTTER)
  r.pageBar = { closed, opened }
  expect(phone || opened.gutter === 0, `${vp.width}: the page behind still draws its ${opened.gutter}px scrollbar beside the sheet`)
  expect(opened.h1 === closed.h1, `${vp.width}: the page behind moved ${opened.h1 - closed.h1}px sideways when the sheet opened`)

  /* ── one scroll ─────────────────────────────────────────────────────── */
  r.scrollers = await page.evaluate(SCROLLERS)
  const inner = r.scrollers.filter((s) => !s.doc)
  r.visibleBars = r.scrollers.filter((s) => s.bar > 0).length
  /* What a wheel over the form moves. */
  const box = await page.locator("[data-sheet-scroll]").first().boundingBox()
  const before = await page.evaluate(() => ({ doc: document.scrollingElement.scrollTop, form: document.querySelector("[data-sheet-scroll]").scrollTop }))
  if (!phone) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 400)
    await sleep(500)
  } else {
    await page.evaluate(() => { const s = document.querySelector("[data-sheet-scroll]"); s.scrollTop = s.scrollHeight })
    await sleep(300)
  }
  const after = await page.evaluate(() => ({ doc: document.scrollingElement.scrollTop, form: document.querySelector("[data-sheet-scroll]").scrollTop }))
  r.wheel = { before, after }
  await shot("2-scrolled")
  await page.evaluate(() => { document.querySelector("[data-sheet-scroll]").scrollTop = 0 })
  await sleep(200)
  expect(inner.length <= 1, `${vp.width}: ${inner.length} boxes scroll inside the sheet`)
  expect(r.visibleBars === 0, `${vp.width}: ${r.visibleBars} native scrollbars drawn`)
  expect(after.doc === before.doc, `${vp.width}: the page behind moved ${after.doc - before.doc}px while the form scrolled`)

  /* ── the cover ──────────────────────────────────────────────────────── */
  r.cover = await page.evaluate(() => {
    const f = document.querySelector("[data-sheet-scroll] [data-cover-frame], [data-sheet-scroll] [role=img], [data-sheet-scroll] img")?.closest("div")
    const frame = [...document.querySelectorAll("[data-sheet-scroll] *")].find((el) => getComputedStyle(el).touchAction === "none")
    const el = frame || f
    const b = el.getBoundingClientRect()
    return { w: Math.round(b.width), h: Math.round(b.height), ratio: Math.round((b.width / b.height) * 100) / 100 }
  })

  /* ── Save, untouched ─────────────────────────────────────────────────── */
  r.saveClean = await page.evaluate(SAVE)
  const header0 = await page.evaluate(HEADER)
  r.header0 = header0

  /* ── live: name and bio ──────────────────────────────────────────────── */
  await page.fill("#ep-name", "Andrew R")
  await page.fill("#ep-bio", "Film presets, new every month.")
  await sleep(150)
  r.saveDirty = await page.evaluate(SAVE)
  const live1 = await page.evaluate(HEADER)
  r.liveName = live1.name
  r.liveBio = live1.bio
  expect(live1.name === "Andrew R", `${vp.width}: the name on the page is "${live1.name}" before Save`)
  expect(live1.bio === "Film presets, new every month.", `${vp.width}: the bio on the page is "${live1.bio}" before Save`)

  /* ── live: social fields ─────────────────────────────────────────────── */
  r.socialFields = await page.evaluate(() => [...document.querySelectorAll("[data-social-field]")].map((row) => ({
    key: row.getAttribute("data-social-field"),
    prefix: row.querySelector("[data-social-prefix]")?.textContent ?? null,
    prefixShown: !!row.querySelector("[data-social-prefix]") && getComputedStyle(row.querySelector("[data-social-prefix]")).display !== "none",
    value: row.querySelector("input").value,
  })))
  await page.locator("input[aria-label='YouTube']").fill("filmlab")
  await page.locator("input[aria-label='X / Twitter']").fill("https://twitter.com/filmlab_x")
  await sleep(150)
  const live2 = await page.evaluate(HEADER)
  r.liveSocials = live2.socials
  expect(live2.socials.some((h) => /youtube\.com\/@filmlab/.test(h)), `${vp.width}: a typed YouTube name is not on the page before Save (${live2.socials.join(", ")})`)
  expect(live2.socials.some((h) => /twitter\.com\/filmlab_x|x\.com\/filmlab_x/.test(h)), `${vp.width}: a pasted X link is not on the page before Save`)
  r.socialFields2 = await page.evaluate(() => [...document.querySelectorAll("[data-social-field]")].map((row) => ({
    key: row.getAttribute("data-social-field"),
    prefixShown: !!row.querySelector("[data-social-prefix]") && getComputedStyle(row.querySelector("[data-social-prefix]")).display !== "none",
    value: row.querySelector("input").value,
  })).filter((f) => f.value))
  await shot("3-live")

  /* ── live: the three switches ────────────────────────────────────────── */
  const switchFor = (label) => page.locator("label", { hasText: label }).locator("[role=switch]")
  for (const [label, key] of [["Rating and reviews", "reviews"], ["Sales count", "sales"], ["Social links", "socials"]]) {
    const sw = switchFor(label)
    await sw.scrollIntoViewIfNeeded()
    await sw.click()
    await sleep(150)
    const off = await page.evaluate(HEADER)
    const shownOff = key === "socials" ? off.socials.length > 0 : off[key]
    expect(!shownOff, `${vp.width}: ${label} switched off still shows on the page`)
    await sw.click()
    await sleep(150)
    const on = await page.evaluate(HEADER)
    const shownOn = key === "socials" ? on.socials.length > 0 : on[key]
    expect(shownOn, `${vp.width}: ${label} switched back on does not show`)
    r[`switch_${key}`] = { off: shownOff, on: shownOn }
  }
  /* Leave Sales off, to be saved. */
  await switchFor("Sales count").click()
  await sleep(100)
  await shot("4-switches")

  /* ── Cancel puts it back ─────────────────────────────────────────────── */
  await page.locator("button", { hasText: /^Cancel$/ }).click()
  await sleep(900)
  const cancelled = await page.evaluate(HEADER)
  r.afterCancel = { name: cancelled.name, bio: cancelled.bio, sales: cancelled.sales, socials: cancelled.socials.length }
  expect(cancelled.name === "AndrewRullz" && cancelled.sales && cancelled.socials.length === 2, `${vp.width}: Cancel left the page showing the abandoned edits (${JSON.stringify(r.afterCancel)})`)

  /* ── Save keeps it, with every state on the way ──────────────────────── */
  await openSheet()
  await page.fill("#ep-name", "Andrew R")
  await page.locator("input[aria-label='YouTube']").fill("@filmlab")
  await page.evaluate(() => { window.__hold = true })
  await page.locator("[data-sheet-pin-bottom] button").last().click()
  await sleep(250)
  r.saveSaving = await page.evaluate(SAVE)
  await shot("5-saving")
  /* Read every frame from the release until the sheet has gone. */
  await page.evaluate(() => {
    window.__states = []
    const tick = () => {
      const b = [...document.querySelectorAll("[data-sheet-pin-bottom] button")].pop()
      window.__states.push(b ? (b.getAttribute("data-save-state") || b.innerText.replace(/\s+/g, " ").trim()) : "gone")
      if (b) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__hold = false
    window.__release?.()
  })
  await sleep(120)
  r.saveSaved = await page.evaluate(SAVE)
  await shot("6-saved")
  await sleep(1400)
  r.saveSequence = await page.evaluate(() => [...new Set(window.__states)])
  const kept = await page.evaluate(HEADER)
  r.afterSave = { name: kept.name, socials: kept.socials }
  const sent = await page.evaluate(() => window.__saved.socialLinks)
  r.savedSocials = Object.fromEntries(Object.entries(sent).filter(([, v]) => v.url).map(([k, v]) => [k, v.url]))
  expect(kept.name === "Andrew R", `${vp.width}: after Save the page says "${kept.name}"`)
  expect(r.savedSocials.instagram === "https://www.instagram.com/andrewrullz", `${vp.width}: an untouched Instagram link changed on save (${r.savedSocials.instagram})`)
  expect(/youtube\.com\/@filmlab$/.test(r.savedSocials.youtube || ""), `${vp.width}: "@filmlab" saved as ${r.savedSocials.youtube}`)
  expect(r.saveSequence.includes("saved"), `${vp.width}: Save never said Saved (${r.saveSequence.join(" > ")})`)

  /* ── every scheme ────────────────────────────────────────────────────── */
  await openSheet()
  const schemes = await page.evaluate(() => [...document.querySelectorAll("[data-scheme-picker] [role=radio], [data-scheme-picker] button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()).filter(Boolean))
  r.schemes = {}
  const seen = new Set()
  for (let i = 0; i < schemes.length; i++) {
    const btn = page.locator("[data-scheme-picker] [role=radio], [data-scheme-picker] button").nth(i)
    await btn.scrollIntoViewIfNeeded()
    await btn.click()
    await sleep(700)
    const h = await page.evaluate(HEADER)
    r.schemes[schemes[i]] = { bg: h.rootBg, bar: h.barBg, name: h.nameColor }
    seen.add(`${h.rootBg} ${h.barBg} ${h.nameColor}`)
    if (i === 3) await shot("7-scheme")
    if (phone) {
      /* Lowered to show the page: raise it again for the next press. */
      await page.evaluate(() => document.querySelector("[data-sheet-panel] h2")?.click())
      await sleep(450)
    }
  }
  expect(schemes.length === 9 && seen.size === schemes.length, `${vp.width}: ${schemes.length} schemes painted only ${seen.size} different pages`)
  await page.locator("button", { hasText: /^Cancel$/ }).click()
  await sleep(900)
  r.schemeAfterCancel = (await page.evaluate(HEADER)).rootBg
  expect(r.schemeAfterCancel === r.header0.rootBg, `${vp.width}: Cancel left the page in another scheme (${r.schemeAfterCancel})`)

  await ctx.close()
}

await browser.close()
rmSync(out, { recursive: true, force: true })
console.log(JSON.stringify(report, null, 2))
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}\n`)
  process.exit(1)
}
console.log("\nProfile details: one scroll, live preview, every switch, every scheme, all measured.\n")
