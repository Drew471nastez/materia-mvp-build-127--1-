/**
 * ===========================================================================
 *  A TOAST ON A PHONE IS SHORT AND SMALL, AND NEVER IN THE WAY, AT 390 AND 1440
 * ===========================================================================
 * "Be very aware: the toast notifications that appear on mobile devices can
 * have too much text, and that makes the toast feel too big instead of being
 * adapted, clean, shrunk text on mobile. Fix it across all."
 *
 * The real Toaster and the real nav pill in a shell shaped like
 * app/(storelib)/app/layout.tsx (scripts/render-toasts.tsx), with an iPhone's safe area
 * (Chromium's own override: 47px at the top, 34px at the foot), raising the
 * longest toasts the app really raises, through the real `toast()`:
 *
 *   ONE LINE OF TITLE        14px, never wrapped (a longer one ends in "...")
 *   AT MOST TWO OF DETAIL    13px, clamped
 *   SMALL                    on a phone no taller than its lines need: 42px
 *                            for a title alone, 78px with two lines of detail
 *   BETWEEN THE GUTTERS      16px or more clear of each edge of a phone
 *   OUT OF THE WAY           under the header and the status bar, and nothing
 *                            of it over the nav pill or the home indicator
 *   SWIPED AWAY              a finger dragging it up 80px puts it away on a
 *                            phone
 *   ON A COMPUTER            380px at most, 24px in from the bottom right
 *
 *   node scripts/check-toasts.mjs
 *   TOAST_BEFORE=<git ref> node scripts/check-toasts.mjs   the same, for the
 *     Toaster and the copy as they were at that ref (numbers only, no verdict)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const BEFORE = process.env.TOAST_BEFORE || null
const INSET = { top: 47, bottom: 34 }

/*
  The longest toasts the shared Toaster is given, as they read before this
  change and as they read now. The Stripe reason is the kind of sentence the
  account link route passes through from Stripe; it is the one piece of text
  here nobody in this codebase writes.
*/
const STRIPE_REASON = "You cannot create an account link for an account that has not completed onboarding. Finish setting up payouts in Stripe first."
const TOASTS = [
  { at: "app/(storelib)/app/payouts (account link)", before: { title: "Could not open account settings", description: STRIPE_REASON, variant: "destructive" }, after: { title: "Could not open Stripe", description: STRIPE_REASON, variant: "destructive" } },
  { at: "app/(storelib)/app/payouts (withdraw)", before: { title: "Withdrawal created!", description: "$1,240.00 is on its way to your bank." }, after: { title: "Withdrawal sent", description: "$1,240.00 is on its way to your bank." } },
  { at: "app/(storelib)/app/website-builder/themes", before: { title: "Portrait Studio Pro added to your library" }, after: { title: "Portrait Studio Pro added" } },
  { at: "components/app/dashboard-client (copy)", before: { title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" }, after: { title: "Could not copy the link", variant: "destructive" } },
  { at: "app/(storelib)/app/website-builder (import error)", before: { title: "Missing manifest.json — not a storelib export", variant: "destructive" }, after: { title: "Not a Storelib theme export", variant: "destructive" } },
  { at: "app/(storelib)/app/website-builder (import)", before: { title: "Imported Summer Market Autumn Edition with 12 pictures" }, after: { title: "Imported Summer Market Autumn Edition with 12 pictures" } },
]

const dir = join(root, ".toast-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/payouts"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export function openExternal() {}
export async function triggerHaptic() {}
export function nativePlatform() { return "web" }
export async function nativeLogOut() {}
`)
/* The Toaster as it was at TOAST_BEFORE, for the numbers to compare against. */
if (BEFORE) {
  for (const f of ["toast", "toaster"]) writeFileSync(join(dir, `${f}.tsx`), execFileSync("git", ["show", `${BEFORE}:components/ui/${f}.tsx`], { cwd: root, encoding: "utf8" }))
}
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-toasts.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    logLevel: "error",
    outfile: join(dir, "probe.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "next/navigation": join(dir, "navigation.js"), "next/link": join(dir, "link.jsx"), "@/lib/native-bridge": join(dir, "native-bridge.js"), "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: BEFORE ? [{
      name: "toaster-before",
      setup(b) { b.onResolve({ filter: /^@\/components\/ui\/toast(er)?$/ }, (a) => ({ path: join(dir, `${a.path.split("/").pop()}.tsx`) })) },
    }] : [],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
/* The old Toaster's classes are in no source file any more, so the
   stylesheet is compiled with its copy as a source too. */
let stylesheet = null
if (BEFORE) {
  stylesheet = join(dir, "globals.css")
  writeFileSync(stylesheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "${dir}";\n`)
}
const css = await appCss(root, stylesheet)
rmSync(dir, { recursive: true, force: true })

const faces = interFaces(root)
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>${js}</script></body></html>`
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = { toaster: BEFORE ? `as at ${BEFORE}` : "this checkout" }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [label, viewport, inset] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, INSET],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }, null],
]) {
  const phone = label === "390"
  const p = await browser.newPage()
  await p.setViewport(viewport)
  const cdp = await p.createCDPSession()
  if (inset) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: inset })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/payouts`)
  await p.waitForSelector("[data-app-nav-pill], main", { timeout: 8000 }).catch(() => fail(`${label}: the page did not render${errors.length ? `: ${errors[0]}` : ""}`))
  await wait(300)
  /* Inter when a build is there to take it from and the page may load it; otherwise the fallback, which is wider, so a line that fits here fits in Inter too. */
  report[`font${label}`] = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Inter" && f.status === "loaded") ? "Inter" : "fallback (wider than Inter)" })
  const rows = []
  for (const t of TOASTS) {
    const copy = BEFORE ? t.before : t.after
    await p.evaluate((c) => window.__toast(c), copy)
    await wait(450)
    const m = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight
      const r1 = (n) => Math.round(n * 10) / 10
      const el = document.querySelector("[data-toast], li[data-state='open']")
      if (!el) return null
      const box = el.getBoundingClientRect()
      const text = [...el.children].find((c) => c.tagName === "DIV")
      const [title, desc] = text ? [...text.children] : []
      const lines = (n) => {
        if (!n) return 0
        const lh = parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.25
        return Math.round(n.getBoundingClientRect().height / lh)
      }
      const probe = document.createElement("div")
      probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);width:env(safe-area-inset-bottom,0px)"
      document.body.appendChild(probe)
      const sat = probe.getBoundingClientRect().height, sab = probe.getBoundingClientRect().width
      probe.remove()
      const header = [...document.querySelectorAll("[data-probe-header]")].find((h) => getComputedStyle(h).display !== "none")
      const pillEl = document.querySelector("[data-app-nav-pill]")
      /* The pill as drawn: the union of what inside it has a size and is showing. */
      let pill = null
      if (pillEl && getComputedStyle(pillEl).display !== "none") {
        for (const c of pillEl.querySelectorAll("*")) {
          const r = c.getBoundingClientRect()
          if (!r.width || !r.height || getComputedStyle(c).visibility === "hidden") continue
          pill = pill ? { top: Math.min(pill.top, r.top), bottom: Math.max(pill.bottom, r.bottom), left: Math.min(pill.left, r.left), right: Math.max(pill.right, r.right) } : { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
        }
      }
      const overlap = (a, b) => (!a || !b ? 0 : Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)))
      return {
        W, H, sat, sab,
        box: { x: r1(box.left), y: r1(box.top), w: r1(box.width), h: r1(box.height) },
        gutters: { left: r1(box.left), right: r1(W - box.right) },
        fromBottom: r1(H - box.bottom),
        title: title ? { px: getComputedStyle(title).fontSize, lines: lines(title), cut: title.scrollWidth > title.clientWidth + 1 } : null,
        description: desc ? { px: getComputedStyle(desc).fontSize, lines: lines(desc), clamped: desc.scrollHeight > desc.clientHeight + 1 } : null,
        underHeader: r1(box.top - (header ? header.getBoundingClientRect().bottom : 0)),
        overStatusBar: r1(Math.max(0, sat - box.top)),
        overPill: r1(overlap(box, pill)),
        overHomeIndicator: r1(overlap(box, { top: H - sab, bottom: H, left: 0, right: W })),
        pill: pill ? { top: r1(pill.top), bottom: r1(pill.bottom) } : null,
      }
    })
    if (!m) { problems.push(`${label} ${t.at}: no toast showed`); continue }
    /* TOAST_SHOTS=<dir>: a picture of each, for the eye. */
    if (process.env.TOAST_SHOTS) await p.screenshot({ path: join(process.env.TOAST_SHOTS, `${BEFORE ? "before" : "after"}-${label}-${TOASTS.indexOf(t) + 1}.png`) })
    const row = { at: t.at, title: copy.title, ...m }
    delete row.W; delete row.H; delete row.sat; delete row.sab
    rows.push(row)
    if (BEFORE) continue
    const at = `${label} ${t.at}:`
    if (!m.title || m.title.px !== "14px" || m.title.lines !== 1) problems.push(`${at} the title is ${m.title?.px} over ${m.title?.lines} lines, not one line at 14px`)
    if (m.description && (m.description.px !== "13px" || m.description.lines > 2)) problems.push(`${at} the detail is ${m.description.px} over ${m.description.lines} lines, not two at most at 13px`)
    const need = 22 + 20 + 18 * (m.description?.lines ?? 0)
    if (phone && (m.box.h > need + 0.5 || m.box.h > 78.5)) problems.push(`${at} the toast is ${m.box.h}px tall on a phone, for ${1 + (m.description?.lines ?? 0)} lines (${need}px)`)
    if (phone && (m.gutters.left < 16 || m.gutters.right < 16)) problems.push(`${at} the toast is ${m.gutters.left}px and ${m.gutters.right}px from the edges, inside the 16px gutters`)
    if (m.underHeader < 0) problems.push(`${at} the toast is ${-m.underHeader}px over the header`)
    if (m.overStatusBar > 0) problems.push(`${at} the toast is ${m.overStatusBar}px under the status bar`)
    if (m.overPill > 0) problems.push(`${at} the toast covers ${m.overPill}px² of the nav pill`)
    if (m.overHomeIndicator > 0) problems.push(`${at} the toast covers ${m.overHomeIndicator}px² of the home indicator`)
    if (!phone && m.box.w > 380) problems.push(`${at} the toast is ${m.box.w}px wide on a computer`)
    if (!phone && (Math.abs(m.gutters.right - 24) > 0.5 || Math.abs(m.fromBottom - 24) > 0.5)) problems.push(`${at} on a computer the toast should sit 24px in from the bottom right, not ${m.gutters.right}px and ${m.fromBottom}px`)
  }
  /* A finger drags the last one up and lets go. */
  let swipe = null
  if (phone) {
    const r = await p.evaluate(() => { const b = document.querySelector("[data-toast], li[data-state='open']")?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null })
    if (r) {
      await p.touchscreen.touchStart(r.x, r.y)
      for (let k = 1; k <= 8; k++) { await p.touchscreen.touchMove(r.x, r.y - k * 10); await wait(16) }
      await p.touchscreen.touchEnd()
      await wait(600)
      swipe = await p.evaluate(() => ({ open: !!document.querySelector("li[data-state='open']") }))
      if (!BEFORE && swipe.open) problems.push(`${label}: dragging the toast up 80px did not put it away`)
    }
  }
  if (errors.length) problems.push(`${label}: the page threw: ${errors[0]}`)
  report[label] = { toasts: rows, ...(swipe ? { swipedUp: swipe.open ? "still there" : "gone" } : {}) }
  await p.close()
}

/*
  THE WEBSITE BUILDER'S EDITORS use sonner (components/ui/editor-toaster.tsx,
  mounted by app/(storelib)/website-builder/layout.tsx), at the foot of the screen. The
  longest of the code editor's own toasts, before and now.
*/
const FILE = "featured-collection-with-slider.liquid"
const SONNER = [
  { at: "code editor (protected source)", before: ["message", "The theme's own code cannot be copied from the editor. Export the theme to keep a copy."], after: ["message", "This code cannot be copied", "Export the theme to keep a copy."] },
  { at: "code editor (fix not applied)", before: ["message", `You moved off sections/${FILE}, so the fix was not applied.`], after: ["message", "Fix not applied", `You moved off sections/${FILE}.`] },
  { at: "code editor (did not compile)", before: ["error", `${FILE} did not compile — not saved`], after: ["error", "Did not compile. Not saved.", FILE] },
  { at: "code editor (copy refused)", before: ["error", "Could not copy. Select the text and copy it instead."], after: ["error", "Could not copy", "Select the text and copy it."] },
  { at: "code editor (saved as draft)", before: ["success", "Saved. Publish to put it on the site"], after: ["success", "Saved. Publish to go live"] },
]
for (const [label, viewport, inset] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, INSET],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }, null],
]) {
  const phone = label === "390"
  const p = await browser.newPage()
  await p.setViewport(viewport)
  const cdp = await p.createCDPSession()
  if (inset) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: inset })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/website-builder/code/x?editor=1${BEFORE ? "&plain=1" : ""}`)
  await wait(400)
  const rows = []
  for (const t of SONNER) {
    const [kind, title, description] = BEFORE ? t.before : t.after
    await p.evaluate(() => window.__sonner.dismiss())
    await wait(500)
    await p.evaluate((kind, title, description) => window.__sonner[kind](title, description ? { description, duration: 60000 } : { duration: 60000 }), kind, title, description ?? null)
    await wait(700)
    const m = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight
      const r1 = (n) => Math.round(n * 10) / 10
      const el = [...document.querySelectorAll("[data-sonner-toast]")].find((e) => e.getAttribute("data-removed") !== "true")
      if (!el) return null
      const box = el.getBoundingClientRect()
      const title = el.querySelector("[data-title]")
      const desc = el.querySelector("[data-description]")
      const lines = (n) => (n ? Math.round(n.getBoundingClientRect().height / (parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.25)) : 0)
      const probe = document.createElement("div")
      probe.style.cssText = "position:fixed;top:0;width:env(safe-area-inset-bottom,0px)"
      document.body.appendChild(probe)
      const sab = probe.getBoundingClientRect().width
      probe.remove()
      return {
        box: { x: r1(box.left), y: r1(box.top), w: r1(box.width), h: r1(box.height) },
        gutters: { left: r1(box.left), right: r1(W - box.right) },
        title: title ? { px: getComputedStyle(title).fontSize, lines: lines(title), cut: title.scrollWidth > title.clientWidth + 1 } : null,
        description: desc ? { px: getComputedStyle(desc).fontSize, lines: lines(desc), clamped: desc.scrollHeight > desc.clientHeight + 1 } : null,
        aboveHomeIndicator: r1(H - sab - box.bottom),
        overHomeIndicator: r1(Math.max(0, box.bottom - (H - sab)) * box.width),
      }
    })
    if (!m) { problems.push(`sonner ${label} ${t.at}: no toast showed`); continue }
    if (process.env.TOAST_SHOTS) await p.screenshot({ path: join(process.env.TOAST_SHOTS, `${BEFORE ? "before" : "after"}-sonner-${label}-${SONNER.indexOf(t) + 1}.png`) })
    rows.push({ at: t.at, title, ...m })
    if (BEFORE) continue
    const at = `sonner ${label} ${t.at}:`
    if (!m.title || m.title.px !== "14px" || m.title.lines !== 1) problems.push(`${at} the title is ${m.title?.px} over ${m.title?.lines} lines, not one line at 14px`)
    if (m.description && (m.description.px !== "13px" || m.description.lines > 2)) problems.push(`${at} the detail is ${m.description.px} over ${m.description.lines} lines`)
    if (phone && (m.gutters.left < 16 || m.gutters.right < 16)) problems.push(`${at} the toast is ${m.gutters.left}px and ${m.gutters.right}px from the edges`)
    if (m.overHomeIndicator > 0) problems.push(`${at} the toast covers ${m.overHomeIndicator}px² of the home indicator`)
  }
  if (errors.length) problems.push(`sonner ${label}: the page threw: ${errors[0]}`)
  report[`sonner ${label}`] = { toasts: rows }
  await p.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (BEFORE) process.exit(0)
if (problems.length) fail(problems.join("\n"))
console.log("ok: at 390 every toast is one line of 14px title and at most two of 13px detail, 42px tall for a title and 78px with two lines of detail, between the 16px gutters, under the header and clear of the pill and the home indicator, and swipes away upward; at 1440 the same type, 380px wide at most, 24px in from the bottom right; the website builder's toasts keep the same lines and stay clear of the home indicator")
