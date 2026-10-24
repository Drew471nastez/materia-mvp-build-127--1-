/**
 * The buyer's Library > Courses (components/courses/courses-index.tsx),
 * measured in headless Chromium at 390 and 1280, in the light look and the
 * dark look. Round AD5, the owner: "I don't like at all the In progress /
 * Not started / Completed pills, I don't like the product card".
 *
 *   NO PILLS. No tab list, no switch, and no rounded label anywhere that
 *   says In progress, Not started or Completed.
 *   COMPACT CARDS. On a phone a card is a row (the cover left of the words)
 *   at most 136px tall; from 640px the cover is on top and the courses still
 *   to do sit side by side.
 *   ONE BAR, ONE LINE. Each card has a 3px bar whose fill is the course's
 *   share of lessons done, and one line: "5 of 12 lessons", "Not started ·
 *   9 lessons", "Finished". The next step: Continue, Start, Watch again.
 *   Continue opens the lesson they are on.
 *   FINISHED LAST, and nothing scrolls sideways.
 *   THE DARK LOOK keeps the bar visible: light ink on a faint track.
 *
 *   node scripts/check-library-courses.mjs
 *   COURSES_SHOTS=<dir> keeps a picture of each.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }

let passed = 0
let failed = 0
const check = (label, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ok    ${label}${detail ? `  (${detail})` : ""}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ""}`) }
}

const stubs = join(root, `.library-courses-probe-${process.pid}`)
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/account/library/courses"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
`)
let html = ""
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-courses-index.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error", outfile: join(stubs, "courses.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    alias: { "@": ".", "next/link": `./${stubs.slice(root.length + 1)}/link.jsx`, "next/image": `./${stubs.slice(root.length + 1)}/image.jsx`, "next/navigation": `./${stubs.slice(root.length + 1)}/navigation.js` },
    loader: { ".css": "empty" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const css = (await appCss(root)) + "\n" + readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const js = readFileSync(join(stubs, "courses.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.__err=[];addEventListener("error",function(e){window.__err.push(String(e.message))});if(location.hash==="#dark")document.documentElement.setAttribute("data-sl-dark","")</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
const shotsDir = process.env.COURSES_SHOTS || ""
if (shotsDir) mkdirSync(shotsDir, { recursive: true })

for (const vp of [{ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { width: 1280, height: 900, deviceScaleFactor: 1 }]) {
  for (const look of ["light", "dark"]) {
    const phone = vp.width < 640
    console.log(`\n── ${vp.width}px, the ${look} look ──`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto("about:blank")
    await p.setContent(html.replace('location.hash==="#dark"', look === "dark" ? "true" : "false"), { waitUntil: "load" })
    await p.waitForSelector("[data-course-row]")
    await new Promise((r) => setTimeout(r, 700))
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-course-row]")]
      const words = ["In progress", "Not started", "Completed"]
      const pills = [...document.querySelectorAll("[data-courses-index] *")].filter((el) => {
        const t = el.textContent?.trim() ?? ""
        if (!words.includes(t)) return false
        const b = el.getBoundingClientRect(), c = getComputedStyle(el)
        return b.height > 0 && (parseFloat(c.borderTopLeftRadius) >= b.height / 2 - 1 || c.backgroundColor !== "rgba(0, 0, 0, 0)")
      }).length
      return {
        tabs: document.querySelectorAll("[data-courses-index] [role=tablist], [data-progress-switch]").length,
        pills,
        scroll: document.scrollingElement.scrollWidth, width: innerWidth,
        cards: rows.map((row) => {
          const b = row.getBoundingClientRect()
          const cover = row.querySelector(".aspect-video").getBoundingClientRect()
          const title = row.querySelector("[data-continue]").getBoundingClientRect()
          const bar = row.querySelector("[data-course-bar]")
          const fill = bar.firstElementChild
          return {
            status: row.getAttribute("data-course-row"), x: Math.round(b.left), y: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width),
            coverRight: cover.right, coverBottom: cover.bottom, titleLeft: title.left, titleTop: title.top,
            barH: bar.getBoundingClientRect().height, share: fill.getBoundingClientRect().width / bar.getBoundingClientRect().width, now: Number(bar.getAttribute("aria-valuenow")),
            fill: getComputedStyle(fill).backgroundColor, track: getComputedStyle(bar).backgroundColor,
            line: row.querySelector("[data-course-state]").textContent.trim(), action: row.querySelector("[data-course-action]").textContent.trim(),
            href: row.querySelector("[data-continue]").getAttribute("href"),
          }
        }),
        errors: window.__err,
      }
    })
    if (shotsDir) await p.screenshot({ path: join(shotsDir, `courses-${vp.width}-${look}.png`), fullPage: true })
    check("no progress switch and no status pills", r.tabs === 0 && r.pills === 0, `${r.tabs} switches, ${r.pills} pills`)
    check("nothing scrolls sideways", r.scroll <= r.width, `${r.scroll} <= ${r.width}`)
    check("three cards, the finished one last", r.cards.length === 3 && r.cards[2].status === "completed", r.cards.map((c) => c.status).join(", "))
    check("one line each: how far, in words", r.cards.map((c) => c.line).join(" | ") === "5 of 12 lessons | Not started · 9 lessons | Finished", r.cards.map((c) => c.line).join(" | "))
    check("and the next step: Continue, Start, Watch again", r.cards.map((c) => c.action).join(",") === "Continue,Start,Watch again", r.cards.map((c) => c.action).join(", "))
    check("Continue opens the lesson they are on", /\?lesson=l6$/.test(r.cards[0].href), r.cards[0].href)
    check("a 3px bar on each card, filled to its share of the lessons", r.cards.every((c) => Math.abs(c.barH - 3) < 0.5 && Math.abs(c.share * 100 - c.now) <= 1.5), r.cards.map((c) => `${c.barH}px, ${(c.share * 100).toFixed(0)}% for ${c.now}%`).join("; "))
    const [fr, fg, fb] = r.cards[0].fill.match(/[\d.]+/g).map(Number)
    const ink = 0.2126 * fr + 0.7152 * fg + 0.0722 * fb
    check(look === "dark" ? "the dark look: the bar's fill is light ink" : "the bar's fill is Storelib's ink", look === "dark" ? ink > 180 : ink < 60, `${r.cards[0].fill} on ${r.cards[0].track}`)
    if (phone) {
      check("on a phone a card is a row: the cover left of the words", r.cards.every((c) => c.coverRight <= c.titleLeft), r.cards.map((c) => `${c.coverRight.toFixed(0)} <= ${c.titleLeft.toFixed(0)}`).join(", "))
      check("and compact: 136px tall at most", r.cards.every((c) => c.h <= 136), r.cards.map((c) => c.h).join(", ") + "px")
    } else {
      check("on a computer the cover is on top", r.cards.every((c) => c.coverBottom <= c.titleTop), "")
      check("the courses still to do sit side by side, one height", r.cards[0].y === r.cards[1].y && r.cards[0].h === r.cards[1].h && r.cards[2].y > r.cards[0].y, r.cards.map((c) => `${c.x},${c.y} ${c.w}x${c.h}`).join("; "))
    }
    check("no page errors", r.errors.length === 0, r.errors.join("; "))
    await p.close()
  }
}

await browser.close()
console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
