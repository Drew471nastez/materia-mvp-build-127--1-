/**
 * ===========================================================================
 *  EVERY SOCIAL PLATFORM AND EVERY LINK ICON, DRAWN ON THE PUBLISHED PAGE
 * ===========================================================================
 * The editor offered 22 social platforms and about 155 link icons; the
 * published page knew 11 platforms and about 40 icons and drew nothing for the
 * rest. This renders the real PublicOnePage (scripts/render-onepage-icons.tsx)
 * with a social row holding all 22 platforms and one link button per icon in
 * the picker, and reads what the browser drew:
 *
 *   SOCIAL   every platform has a link in the row, each with an <svg> whose
 *            paths carry drawing data, a name a screen reader can say, its
 *            own mark (no two platforms share one) and never the fallback
 *            glyph; the addresses are the normalised ones (https://, mailto:,
 *            wa.me/<digits>)
 *   ICONS    every picker icon's button has an <svg> with path data and a
 *            size, with the probe's named few (home, users, send, headphones,
 *            cart, clock, twitch, reddit, apple-music) checked by name
 *   ADDRESS  a WhatsApp or Telegram address with no icon chosen gets that
 *            mark; an Instagram handle with "t.me" inside it does not
 *
 *   PROBE_CSS=source node scripts/check-onepage-icons.mjs
 *   SHOTS_DIR=/some/dir to keep the screenshots
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
const css = await appCss(root)
const work = join(root, ".onepage-icons-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-icons-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const NAMED = ["home", "users", "send", "headphones", "cart", "clock", "twitch", "reddit", "apple-music"]

let browser
try {
  writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/mara-studio/links"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(work, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-onepage-icons.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(work, "app.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/link=${join(work, "link.jsx")}`,
    `--alias:next/navigation=${join(work, "navigation.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(join(work, "app.js"), "utf8")
  writeFileSync(join(work, "index.html"),
    `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.goto(`file://${join(work, "index.html")}`)
  await new Promise((r) => setTimeout(r, 800))
  if (errors.length) fail(`The page threw: ${errors[0]}`)

  const r = await p.evaluate(() => {
    const visible = (el) => {
      const b = el.getBoundingClientRect()
      return b.width > 0 && b.height > 0
    }
    const drawing = (svg) => [...svg.querySelectorAll("path")].map((n) => n.getAttribute("d") || "").join(" ").trim()
    /* The page lays itself out twice (phone and desktop) and lets CSS hide one: judge the one that shows. */
    const socialLinks = [...document.querySelectorAll("a")].filter((a) => a.querySelector('svg[aria-label][data-mark]') && visible(a))
    const social = socialLinks.map((a) => {
      const svg = a.querySelector('svg[aria-label][data-mark]')
      const b = svg.getBoundingClientRect()
      return { mark: svg.getAttribute("data-mark"), name: svg.getAttribute("aria-label"), href: a.getAttribute("href"), d: drawing(svg), w: Math.round(b.width), h: Math.round(b.height) }
    })
    const buttons = {}
    for (const el of document.querySelectorAll("a, button")) {
      const label = [...el.querySelectorAll("span")].map((s) => s.textContent.trim()).find((t) => /^(icon|url):/.test(t))
      if (!label || !visible(el) || buttons[label]) continue
      const svg = el.querySelector("svg[data-mark]")
      const b = svg?.getBoundingClientRect()
      buttons[label] = svg ? { mark: svg.getAttribute("data-mark"), d: drawing(svg), w: Math.round(b.width), h: Math.round(b.height) } : null
    }
    return { social, buttons }
  })

  /* The lists the fixture was built from, as the page itself read them. */
  const { ONEPAGE_KEYS, LINK_IDS } = await p.evaluate(() => window.__iconProbe)

  console.log("\nsocial row")
  const drawn = new Map(r.social.map((s) => [s.mark, s]))
  expect(ONEPAGE_KEYS.length === 22, "the editor offers 22 platforms", ONEPAGE_KEYS.length)
  const missing = ONEPAGE_KEYS.filter((k) => !drawn.has(k))
  expect(missing.length === 0, `all ${ONEPAGE_KEYS.length} platforms are on the page, none dropped`, { drawn: r.social.length, missing })
  const empty = r.social.filter((s) => !s.d || s.w === 0 || s.h === 0).map((s) => s.mark)
  expect(empty.length === 0, "each one is an svg with path data and a size", empty)
  expect(!drawn.has("fallback"), "none of them is the fallback glyph", r.social.filter((s) => s.mark === "fallback").map((s) => s.name))
  const signatures = new Set(r.social.map((s) => s.d))
  expect(signatures.size === r.social.length, "no two platforms share a drawing", { platforms: r.social.length, drawings: signatures.size })
  expect(r.social.every((s) => s.name && s.name.trim().length > 0), "each link has a name to be read out", r.social.filter((s) => !s.name).map((s) => s.mark))
  const href = (k) => drawn.get(k)?.href
  expect(href("email") === "mailto:mara@example.com", "email opens a mail", href("email"))
  expect(href("whatsapp") === "https://wa.me/447700900123", "a WhatsApp number becomes wa.me/<digits>", href("whatsapp"))
  expect(href("website") === "https://mara.studio", "a website typed without https:// gets it", href("website"))
  expect(href("calendly") === "https://calendly.com/mara", "a Calendly handle becomes its page", href("calendly"))
  expect(href("tiktok") === "https://tiktok.com/@mara", "a TikTok handle becomes its page", href("tiktok"))

  console.log("\nlink icons")
  const iconIds = LINK_IDS
  const got = iconIds.map((id) => [id, r.buttons[`icon:${id}`]])
  const blank = got.filter(([, b]) => !b || !b.d || b.w === 0 || b.h === 0).map(([id]) => id)
  expect(iconIds.length >= 150, "the picker's whole set is on the page", iconIds.length)
  expect(blank.length === 0, `every one of the ${iconIds.length} icons draws path data at a size`, blank)
  const wrong = got.filter(([id, b]) => b && b.mark !== id).map(([id, b]) => `${id}->${b.mark}`)
  expect(wrong.length === 0, "each button draws the icon it was given", wrong)
  for (const id of NAMED) {
    const b = r.buttons[`icon:${id}`]
    expect(!!b && b.d.length > 0 && b.w > 0, `${id} is drawn`, b ? { mark: b.mark, w: b.w, dLength: b.d.length } : null)
  }

  console.log("\nicons read from the address")
  expect(r.buttons["url:wa"]?.mark === "whatsapp", "a wa.me address wears WhatsApp's mark", r.buttons["url:wa"]?.mark)
  expect(r.buttons["url:tg"]?.mark === "telegram", "a t.me address wears Telegram's mark", r.buttons["url:tg"]?.mark)
  expect(!r.buttons["url:ig-dot-me"], "instagram.com/robert.meyer is not taken for Telegram", r.buttons["url:ig-dot-me"]?.mark)

  await p.screenshot({ path: join(shots, "onepage-icons-top.png") })
  await p.screenshot({ path: join(shots, "onepage-icons-full.png"), fullPage: true })
  console.log(`\n  screenshots in ${shots}`)
  console.log(`  counts: ${r.social.length} social marks, ${Object.keys(r.buttons).filter((k) => k.startsWith("icon:") && r.buttons[k]).length} link icons drawn of ${iconIds.length}`)
} finally {
  if (browser) await browser.close()
  rmSync(work, { recursive: true, force: true })
}

if (broken) fail(`${broken} check(s) failed.`)
console.log("\nEvery platform and every link icon the editor offers is drawn on the published page.\n")
