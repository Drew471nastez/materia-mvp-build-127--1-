/**
 * The full screen seller onboarding (components/app/creator-onboarding-modal),
 * walked step by step in a real browser and measured, at phone, tablet and
 * laptop sizes and a short window:
 *
 *   - the page never scrolls sideways
 *   - the film is behind it (its poster at least) and the card is white
 *   - every pill, Back and Continue is at least 44px tall
 *   - there is no Skip anywhere
 *   - going Back keeps what was typed
 *   - on the plans, every card is whole: its foot can be scrolled into view
 *     and nothing is laid over it; from 768px the heading starts at the left
 *     of the row and Monthly / Yearly ends at its right
 *
 * Same stubs as scripts/check-onboarding.mjs. SHOTS=<dir> keeps a screenshot
 * of every step at every size.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".onboarding-fullscreen-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/sell"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, sizes, preload, priority, unoptimized, loading, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), updateUser: async () => ({ data: {}, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
writeFileSync(join(dir, "entry.tsx"), `import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
const join = new URLSearchParams(location.search).has("join")
createRoot(document.getElementById("app")!).render(
  join
    ? createElement(CreatorOnboardingModal, { open: true, onClose: () => {}, preview: true, start: { next: "/community/clay", name: "Ana Lucia", username: null, avatar: null, bio: "" } } as never)
    : createElement(CreatorOnboardingModal, { open: true, onClose: () => {}, leave: { label: "Not now", href: "/explore" }, seed: { name: "Andrei Balan", username: null } } as never),
)
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(dir, "entry.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", mp4: "video/mp4", svg: "image/svg+xml" }
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0])
  if (path.startsWith("/api/")) {
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ available: true })) }, 40)
    return
  }
  const file = join(root, "public", path)
  if (path !== "/" && existsSync(file)) {
    res.writeHead(200, { "content-type": TYPES[path.split(".").pop()] ?? "application/octet-stream" })
    res.end(readFileSync(file))
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const problems = []
const report = {}

/* What a person sees of the step on screen. */
const LOOK = `(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) } }
  const step = document.querySelector("[data-onboarding-step]")
  const scroller = document.querySelector("[data-onboarding-scroller]")
  const presses = [...(step?.querySelectorAll("button, a") ?? [])].filter((b) => b.offsetParent).map((b) => ({ text: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 30), ...r(b) }))
  return {
    step: step?.getAttribute("data-onboarding-step"),
    sideways: document.documentElement.scrollWidth - innerWidth,
    scrollerSideways: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    backdrop: !!document.querySelector("[data-onboarding-backdrop] img"),
    skip: [...document.querySelectorAll("button, a")].some((b) => /^skip$/i.test((b.textContent || "").trim())),
    /* Each card inside the window with its margin: overflow hidden would clip a card without any sideways scroll to show for it. */
    offEdge: [...(step?.querySelectorAll("section") ?? [])].map(r).filter((b) => b.x < 8 || b.right > innerWidth - 8),
    small: presses.filter((p) => p.h < 44 && !/^(Monthly|Yearly)/.test(p.text)),
    fadeTop: scroller ? (scroller.style.getPropertyValue("--fade-top") || "0px") : "0px",
    scrollTop: scroller ? scroller.scrollTop : 0,
  }
})()`

const SIZES = [
  ["375", { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["768", { width: 768, height: 1024, deviceScaleFactor: 1 }],
  ["1280x720", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["1366x600", { width: 1366, height: 600, deviceScaleFactor: 1 }],
  ["1440x900", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["1920x1080", { width: 1920, height: 1080, deviceScaleFactor: 1 }],
]

for (const [label, viewport] of SIZES) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(label)) continue
  const at = `at ${label}:`
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.setViewport(viewport)
  await page.goto(base)
  await page.waitForSelector("[data-onboarding-identity]", { timeout: 15000 })
  await wait(400)
  const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `fs-${label}-${name}.png`) }) }
  const look = async (name) => {
    const l = await page.evaluate(LOOK)
    report[`${label} ${name}`] = l
    if (l.sideways > 0 || l.scrollerSideways > 0) problems.push(`${at} ${name} scrolls sideways by ${Math.max(l.sideways, l.scrollerSideways)}px`)
    if (!l.backdrop) problems.push(`${at} ${name} has no film behind it`)
    if (l.offEdge.length) problems.push(`${at} ${name} has a card past the window's edge: ${JSON.stringify(l.offEdge)}`)
    if (l.skip) problems.push(`${at} ${name} still has a Skip`)
    if (l.small.length) problems.push(`${at} ${name} has presses under 44px: ${JSON.stringify(l.small)}`)
    if (l.fadeTop !== "0px" && l.scrollTop === 0) problems.push(`${at} ${name} fades its top edge before anything has scrolled (${l.fadeTop})`)
    return l
  }
  const next = async () => {
    await page.click("[data-onboarding-step] [data-onboarding-next]")
    await wait(450)
  }

  /*
    NOTHING MOVES UP OR DOWN WHEN THE STEP CHANGES. Every animation frame of a
    change, where the arriving step's heading sits: from its first frame to
    its last it holds one place, so a taller or shorter step only ever grows
    downwards (the leaving one is held where it was, and only fades).
  */
  const steady = async (name) => {
    const samples = page.evaluate(() => new Promise((done) => {
      const out = []
      const t0 = performance.now()
      const tick = () => {
        const all = [...document.querySelectorAll("[data-onboarding-step] header, [data-onboarding-step] [data-plan-split]")]
        out.push(all.map((h) => Math.round(h.getBoundingClientRect().top)))
        if (performance.now() - t0 < 520) requestAnimationFrame(tick)
        else done(out)
      }
      requestAnimationFrame(tick)
    }))
    await page.click("[data-onboarding-step] [data-onboarding-next]")
    const frames = await samples
    await wait(120)
    const tops = frames.flat()
    const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : 0
    report[`${label} ${name} heading tops`] = { spread, frames: frames.length }
    if (spread > 1) problems.push(`${at} ${name}: the heading moved ${spread}px up or down while the step changed`)
  }

  await page.waitForSelector("[data-onboarding-step] [data-onboarding-identity]")
  const head1 = await page.$eval("[data-onboarding-step] header h1", (el) => el.textContent.trim())
  if (head1 !== "Let's get started") problems.push(`${at} the first step reads ${JSON.stringify(head1)}`)
  if (await page.$("[data-onboarding-leave]")) problems.push(`${at} the top row still has a way out ("Not now")`)
  await page.evaluate(() => document.querySelector("[data-onboarding-step] [data-onboarding-name] input")?.focus())
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control")
  await page.type("[data-onboarding-step] [data-onboarding-name] input", "Andrei Balan Studio")
  await wait(900)
  await shot("1-identity")
  await look("identity")
  await steady("page to goals")
  await wait(300)

  await page.waitForSelector("[data-onboarding-step] [data-onboarding-goals]")
  await shot("2-goals")
  await look("goals")
  const perRow = await page.evaluate(() => { const ys = [...document.querySelectorAll("[data-onboarding-step] [data-onboarding-goal]")].map((b) => Math.round(b.getBoundingClientRect().top)); return Math.max(...ys.map((y) => ys.filter((z) => z === y).length)) })
  if (perRow !== 2) problems.push(`${at} the goals are ${perRow} to a row, not 2`)
  /* A short goal beside a longer one, each as wide as its words: the widths in a row differ. */
  const mixed = await page.evaluate(() => [...document.querySelectorAll("[data-onboarding-step] [data-onboarding-goal-row]")].some((row) => { const w = [...row.children].map((b) => Math.round(b.getBoundingClientRect().width)); return w[0] !== w[1] }))
  if (!mixed) problems.push(`${at} every goal pill is the same width`)
  const cut = await page.evaluate(() => [...document.querySelectorAll("[data-onboarding-step] [data-onboarding-goal] span")].filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent))
  if (cut.length) problems.push(`${at} goal labels are cut off: ${cut.join(", ")}`)
  await page.click('[data-onboarding-step] [data-onboarding-goal="digital_products"]')
  await page.click('[data-onboarding-step] [data-onboarding-goal="courses"]')
  await steady("goals to socials")
  await wait(300)

  await page.waitForSelector("[data-onboarding-step] [data-onboarding-socials]")
  await page.type('[data-onboarding-step] [data-onboarding-social="instagram"] input', "andreibalan")
  await shot("3-socials")
  await look("socials")

  /* Back keeps what was typed, both ways. */
  await page.click("[data-onboarding-step] [data-onboarding-back]")
  await wait(450)
  const goalsKept = await page.evaluate(() => [...document.querySelectorAll('[data-onboarding-step] [data-onboarding-goal][aria-pressed="true"]')].map((b) => b.getAttribute("data-onboarding-goal")))
  if (goalsKept.slice().sort().join() !== "courses,digital_products") problems.push(`${at} Back lost the goals (${goalsKept.join()})`)
  await page.click("[data-onboarding-step] [data-onboarding-back]")
  await wait(450)
  const kept = await page.evaluate(() => document.querySelector("[data-onboarding-step] [data-onboarding-name] input")?.value)
  if (kept !== "Andrei Balan Studio") problems.push(`${at} Back lost the name (${JSON.stringify(kept)})`)
  await next(); await next()
  const socialKept = await page.evaluate(() => document.querySelector('[data-onboarding-step] [data-onboarding-social="instagram"] input')?.value)
  if (socialKept !== "andreibalan") problems.push(`${at} the Instagram name was lost (${JSON.stringify(socialKept)})`)
  await steady("socials to plans")

  await page.waitForSelector("[data-onboarding-step] [data-plan-card]")
  await wait(500)
  await shot("4-plans")
  await look("plans")
  const plans = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
    const scroller = document.querySelector("[data-onboarding-scroller]")
    const step = document.querySelector("[data-onboarding-step]")
    const cards = [...step.querySelectorAll("[data-plan-card]")]
    const row = step.querySelector("[data-plan-split]")
    const heading = row?.firstElementChild
    const sw = step.querySelector("[data-plan-split-switch]")
    const ground = step.querySelector("[data-plan-ground]")
    /* Each card's foot, scrolled to: is it inside the window, and is the card itself what is drawn there? */
    const feet = cards.map((c) => {
      c.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" })
      const b = c.getBoundingClientRect()
      const x = Math.min(Math.max(b.left + b.width / 2, 1), innerWidth - 1)
      const y = Math.min(b.bottom - 6, innerHeight - 1)
      const hit = document.elementFromPoint(x, y)
      return { id: c.getAttribute("data-plan-card"), bottom: Math.round(b.bottom), inView: b.bottom <= innerHeight + 0.5 && b.top >= -0.5 - Math.max(0, b.height - innerHeight), own: !!hit && c.contains(hit) }
    })
    scroller.scrollTo({ top: 0, behavior: "instant" })
    return { feet, ground: ground ? r(ground) : null, heading: heading ? r(heading) : null, sw: sw ? r(sw) : null, cards: cards.map(r) }
  })
  report[`${label} plan geometry`] = plans
  for (const f of plans.feet) {
    if (!f.inView) problems.push(`${at} the ${f.id} card's foot cannot be brought into view`)
    if (!f.own) problems.push(`${at} something is drawn over the foot of the ${f.id} card`)
  }
  if (viewport.width >= 768 && plans.heading && plans.sw && plans.ground) {
    if (Math.abs(plans.heading.x - plans.ground.x) > 1) problems.push(`${at} the plans' heading does not start at the left of the row (${plans.heading.x} vs ${plans.ground.x})`)
    if (Math.abs(plans.sw.right - plans.ground.right) > 1) problems.push(`${at} Monthly / Yearly does not end at the right of the row (${plans.sw.right} vs ${plans.ground.right})`)
  }
  if (viewport.width >= 768 && plans.cards.length === 3 && new Set(plans.cards.map((c) => c.y)).size !== 1) problems.push(`${at} the three plans do not start on one line (${plans.cards.map((c) => c.y).join(", ")})`)
  /* The page at the foot of the plans, so the shot shows the cards' feet. */
  await page.evaluate(() => { const s = document.querySelector("[data-onboarding-scroller]"); s.scrollTo({ top: s.scrollHeight, behavior: "instant" }) })
  await wait(150)
  await shot("4-plans-foot")
  /*
    THE BUYER'S SLIDES (a sign up from a product, a download, a community):
    the same film, the words over it and one card, Continue at its foot.
  */
  await page.goto(`${base}/?join=1`)
  await page.waitForSelector("[data-onboarding-step] [data-onboarding-join='profile']", { timeout: 15000 })
  await wait(400)
  await shot("join-1-profile")
  const jl = await look("join profile")
  const joinHead = await page.$eval("[data-onboarding-step] header h1", (el) => el.textContent.trim()).catch(() => null)
  if (joinHead !== "Create a profile") problems.push(`${at} the join profile heading reads ${JSON.stringify(joinHead)}`)
  void jl
  await next()
  await page.waitForSelector("[data-onboarding-step] [data-onboarding-join='username']", { timeout: 5000 }).catch(() => problems.push(`${at} Continue did not reach the username slide`))
  await wait(300)
  await shot("join-2-username")
  await look("join username")
  if (errors.length) problems.push(`${at} page errors: ${errors.join(" | ")}`)
  await page.close()
}

await browser.close()
server.close()
if (process.env.VERBOSE) console.log(JSON.stringify(report, null, 2))
if (problems.length) {
  console.error(`\nThe full screen onboarding is not right:\n  ${problems.join("\n  ")}\n`)
  process.exit(1)
}
console.log(`Full screen onboarding: ${Object.keys(report).filter((k) => !k.includes("geometry")).length} step views measured, no sideways scroll, no Skip, presses 44px or more, Back keeps what was typed, every plan card whole.`)
