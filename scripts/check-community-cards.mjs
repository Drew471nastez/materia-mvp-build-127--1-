/**
 * ===========================================================================
 *  THE ONE COMMUNITY CARD, MEASURED WHERE IT IS LISTED
 * ===========================================================================
 * Renders the real places a community is listed (scripts/render-community-
 * cards.tsx: Explore's communities mode, Explore's search, a creator's
 * Communities tab in the creator's scheme, the communities somebody is in)
 * against the app's stylesheet at 1440x900 and 390x844, and checks:
 *
 *   ONE CARD     every card there is the shared card (data-explore-community)
 *                with its foot row; nothing says "N members · Free"
 *   ROUND 6      no "Launched" anywhere; a sneak peek under the creator
 *                line, two lines at most with an ellipsis (a long one is
 *                clipped at exactly two); the foot row in order: the price,
 *                a slim hairline (1px wide, shorter than the text), members,
 *                views, and the stars only on a card with reviews, all on
 *                one line; the mark 44px in the grid and 57 in a row
 *   THE TITLE    computed font-family starts with Roboto, 18px, weight 500,
 *                24px line, letter spacing 0, and the face really loaded
 *                (document.fonts), while the creator line stays Inter
 *   THE GRID     three across on a computer and one on a phone, one height
 *                a row; a library row at least 72px tall and nothing cut
 *   STOREFRONT   the card takes the creator's --card ground, not white
 *   NOTHING SIDEWAYS, no errors, at both sizes.
 *
 *   PROBE_CSS=source node scripts/check-community-cards.mjs
 *
 * Roboto 500 is fetched once (Latin and Latin Extended, the two subsets
 * app/layout.tsx asks next/font for) into a temporary folder and declared
 * under the same family and variable next/font gives the page; without the
 * network the probe says so and measures the declared family only.
 * Screenshots go to SHOTS_DIR (a temporary folder by default).
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".community-cards-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-cards-")), "shots")
mkdirSync(shots, { recursive: true })

/* ROBOTO 500, the two subsets the layout asks for, as next/font serves them: a family named Roboto behind --font-community-title. */
const fontCache = join(tmpdir(), "storelib-probe-roboto-500")
async function robotoFaces() {
  mkdirSync(fontCache, { recursive: true })
  const cached = join(fontCache, "roboto-500.css")
  if (existsSync(cached)) return readFileSync(cached, "utf8")
  try {
    const sheet = await (await fetch("https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap", { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" } })).text()
    const blocks = [...sheet.matchAll(/\/\* (latin-ext|latin) \*\/\s*(@font-face\s*\{[^}]*\})/g)]
    if (blocks.length !== 2) throw new Error("no latin faces in the answer")
    let out = ""
    for (const [, subset, block] of blocks) {
      const url = /url\((https:[^)]+)\)/.exec(block)[1]
      const file = join(fontCache, `roboto-500-${subset}.woff2`)
      writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()))
      out += block.replace(url, `file://${file}`) + "\n"
    }
    writeFileSync(cached, out)
    return out
  } catch (e) {
    console.log(`  note  Roboto could not be fetched (${e.message}); measuring the declared family only`)
    return ""
  }
}
const roboto = await robotoFaces()

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || "")
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) {
  return React.createElement("img", { src, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`)

execFileSync("npx", [
  "esbuild", "scripts/render-community-cards.tsx", "--bundle", "--format=iife", "--jsx=automatic",
  '--define:process.env.NODE_ENV="production"', "--alias:@=.",
  "--banner:js=var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;",
  "--alias:next/navigation=./.community-cards-probe/navigation.js",
  "--alias:next/link=./.community-cards-probe/link.jsx",
  "--alias:next/image=./.community-cards-probe/image.jsx",
  "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const js = readFileSync(join(stubs, "app.js"), "utf8")
/* The body's classes as app/layout.tsx sets them: Inter's variable and the community title's, which next/font writes as the family and its fallback. */
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${roboto}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa;--font-community-title:'Roboto','Roboto Fallback'}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })

async function open(vp, mode) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}#${mode}`)
  await p.waitForSelector("[data-explore-community]", { timeout: 8000 }).catch(() => {})
  await p.evaluate(async () => { await document.fonts.load('500 18px "Roboto"'); await document.fonts.ready })
  await sleep(500)
  return { p, errors }
}

const MEASURE = `(() => {
  const cards = [...document.querySelectorAll("[data-explore-community]")]
  const title = cards[0]?.querySelector("[data-community-title]")
  const creator = cards[0]?.querySelector("[data-community-creator] span")
  const cs = title ? getComputedStyle(title) : null
  const rects = cards.map((c) => c.getBoundingClientRect())
  const first = rects.filter((r) => Math.abs(r.top - rects[0].top) < 2)
  const text = document.body.innerText
  return {
    n: cards.length,
    withStats: cards.filter((c) => c.querySelector("[data-community-stats] [data-stat=members]")).length,
    withViews: cards.filter((c) => c.querySelector("[data-stat=views]")).length,
    withLaunched: cards.filter((c) => c.querySelector("[data-stat=launched]")).length + (/Launched/.test(text) ? 1 : 0),
    foot: cards.map((c) => {
      const stats = c.querySelector("[data-community-stats]")
      const kids = [...stats.children].map((k) => k.hasAttribute("data-community-price") ? "price" : k.hasAttribute("data-community-divider") ? "divider" : k.getAttribute("data-stat") || (k.hasAttribute("data-community-standing") ? "standing" : "?"))
      const d = stats.querySelector("[data-community-divider]")
      const dr = d?.getBoundingClientRect()
      const price = stats.querySelector("[data-community-price]")?.getBoundingClientRect()
      const blurb = c.querySelector("[data-community-blurb]")
      const bcs = blurb ? getComputedStyle(blurb) : null
      const mark = c.querySelector("[data-community-title]")?.parentElement?.previousElementSibling
      const tops = [...stats.children].map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2))
      return {
        name: c.querySelector("[data-community-title]").textContent.slice(0, 14),
        kids: kids.join(","),
        rated: !!c.querySelector("[data-stat=rating]"),
        divider: dr ? { w: Math.round(dr.width * 10) / 10, h: Math.round(dr.height), bg: getComputedStyle(d).backgroundColor, belowPrice: price ? dr.height < price.height : null } : null,
        oneLine: Math.max(...tops) - Math.min(...tops) <= 2,
        blurb: blurb ? { lines: Math.round(blurb.getBoundingClientRect().height / parseFloat(bcs.lineHeight)), clipped: blurb.scrollHeight > blurb.clientHeight + 1, clamp: bcs.webkitLineClamp, text: blurb.textContent.slice(0, 24) } : null,
        mark: mark ? Math.round(mark.getBoundingClientRect().width) : null,
      }
    }),
    oldLine: /\\d+ members? · /.test(text),
    titles: [...new Set(cards.map((c) => { const t = getComputedStyle(c.querySelector("[data-community-title]")); return [t.fontFamily, t.fontSize, t.fontWeight, t.lineHeight, t.letterSpacing].join("|") }))],
    font: cs ? { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, tracking: cs.getPropertyValue("--tw-tracking").trim() } : null,
    creatorFamily: creator ? getComputedStyle(creator).fontFamily : null,
    loaded: document.fonts.check('500 18px "Roboto"') && [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Roboto" && f.status === "loaded"),
    perRow: first.length,
    heights: [...new Set(first.map((r) => Math.round(r.height)))],
    rowHeights: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
    cut: cards.filter((c) => c.scrollWidth > c.clientWidth + 1).length,
    cardBg: cards[0] ? getComputedStyle(cards[0]).backgroundColor : null,
    doc: document.documentElement.scrollWidth,
    win: innerWidth,
  }
})()`

const SIZES = [
  ["desktop", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]
const PLACES = [
  ["explore", "Explore, communities mode"],
  ["search", "Explore, a search"],
  ["storefront", "a creator's Communities tab"],
  ["library", "the communities somebody is in"],
]

for (const [label, vp] of SIZES) {
  const phone = label === "phone"
  for (const [mode, name] of PLACES) {
    console.log(`\n${label}: ${name}`)
    const { p, errors } = await open(vp, mode)
    if (mode === "search") await p.evaluate(() => document.querySelector("[data-search-communities]")?.scrollIntoView({ block: "start" }))
    else if (mode === "explore") await p.evaluate(() => document.querySelector("[data-explore-community-grid]")?.scrollIntoView({ block: "start" }))
    await sleep(250)
    await p.screenshot({ path: join(shots, `${label}-${mode}.png`) })
    const m = await p.evaluate(MEASURE)
    expect(m.n >= 3 && m.withStats === m.n, "every card is the shared card, with the stats row", { n: m.n, withStats: m.withStats })
    expect(m.withViews >= m.n - 1 && m.withLaunched === 0, "views where known, and no Launched anywhere", { views: m.withViews, launched: m.withLaunched })
    const ordered = m.foot.every((f) => /^(price,divider,)?members(,views)?(,rating)?$/.test(f.kids))
    expect(ordered, `the foot row in order: price, hairline, members, views, stars`, m.foot.map((f) => f.kids))
    expect(m.foot.filter((f) => f.kids.startsWith("price")).every((f) => f.divider && f.divider.w <= 1 && f.divider.h >= 10 && f.divider.h <= 16 && f.divider.belowPrice), "the hairline is 1px wide and shorter than the price beside it", m.foot.map((f) => f.divider))
    expect(m.foot.every((f) => f.oneLine), "the foot row sits on one line", m.foot.filter((f) => !f.oneLine))
    expect(m.foot.filter((f) => f.rated).map((f) => f.name).join() === m.foot.filter((f) => /^(Film Photo Clu|Founders Weekl)/.test(f.name)).map((f) => f.name).join(), "stars only on the cards with reviews", m.foot.map((f) => `${f.name}:${f.rated}`))
    const withBlurb = m.foot.filter((f) => f.blurb)
    expect(withBlurb.length >= 1 && withBlurb.every((f) => f.blurb.lines <= 2 && f.blurb.clamp === "2"), "every sneak peek is two lines at most, clamped", withBlurb.map((f) => f.blurb))
    const long = m.foot.find((f) => /^Film Photo Clu/.test(f.name))
    if (long) expect(long.blurb && long.blurb.lines === 2 && long.blurb.clipped, "a long one stops at two lines with the rest cut", long.blurb)
    const markSize = mode === "library" ? 57 : 44
    expect(m.foot.every((f) => f.mark === markSize), `the mark is ${markSize}px (ten per cent over ${mode === "library" ? 52 : 40})`, m.foot.map((f) => f.mark))
    expect(!m.oldLine, `no "N members · Free" line anywhere`)
    expect(m.font && /^Roboto\b/.test(m.font.family.replace(/["']/g, "")), "title family is Roboto", m.font?.family)
    expect(m.font && m.font.size === "18px" && m.font.weight === "500" && m.font.lineHeight === "24px" && m.font.tracking === "0px" && (m.font.letterSpacing === "0px" || m.font.letterSpacing === "normal"), "18px, 500, 24px line, letter spacing 0 (Chrome prints a computed 0 as normal; the 0px is the card's own)", m.font)
    expect(m.titles.length === 1, "every title on the page is set the same", m.titles)
    if (roboto) expect(m.loaded, "the Roboto 500 face is the one that rendered")
    expect(/Inter/.test(m.creatorFamily ?? ""), "the creator line stays Inter", m.creatorFamily)
    if (mode === "library") {
      expect(m.rowHeights.every((h) => h >= 72) && m.cut === 0, "rows at least 72px tall, nothing cut", { heights: m.rowHeights, cut: m.cut })
      const standing = await p.evaluate(() => [...document.querySelectorAll("[data-community-standing]")].map((s) => s.textContent))
      expect(standing.join() === "Owner,Studio members,Moderator,Request sent", "each row leads with where they stand", standing)
    } else if (mode !== "search") {
      expect(m.perRow === (phone ? 1 : 3) && m.heights.length === 1, `${phone ? "one" : "three"} across, one height a row`, { perRow: m.perRow, heights: m.heights })
    }
    if (mode === "storefront") expect(m.cardBg === "rgb(255, 253, 249)", "the card takes the creator's --card ground", m.cardBg)
    if (phone) {
      const small = await p.evaluate(() => [...document.querySelectorAll("[data-explore-community]")].map((c) => c.getBoundingClientRect().height).filter((h) => h < 40).length)
      expect(small === 0, "every card is a tap target at least 40px tall")
    }
    expect(m.doc <= m.win, "nothing sideways", { doc: m.doc, win: m.win })
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await p.close()
  }
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall good")
process.exit(broken ? 1 : 0)
