/**
 * ===========================================================================
 *  SETTINGS › CUSTOMER EMAILS, DRIVEN IN CHROMIUM
 * ===========================================================================
 * The real panel and editor (scripts/render-customer-emails-probe.tsx) on a
 * computer (1440x900) and a phone (390x844, touch, the CPU slowed four
 * times). What the owner asked for, measured:
 *
 *   computer   every email listed opens with its preview drawn and its four
 *              words filled in (the Button never empty); typing changes the
 *              preview without reloading its frame or blanking it; a
 *              placeholder goes in where the cursor is; Save sends the
 *              words and the row says Edited; Reset puts the default back;
 *              the dialog has no focus ring around it and fades in over
 *              several frames
 *   phone      the shared bottom sheet; Preview and Edit switch without the
 *              sheet's top edge moving a pixel, the panes sliding over
 *              several frames; with a keyboard up (the inset ViewportVars
 *              publishes) the field typed in and the Save bar are above it
 *              and do not overlap; fields are 16px, so iOS does not zoom
 *
 *   node scripts/check-customer-emails.mjs      (SHOTS_DIR=... keeps the screenshots)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-customer-emails-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const ORIGIN = "https://storelib.test"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The Emails page's list imports Next's router and link: the two stand-ins it needs, nothing else. */
writeFileSync(join(out, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export function redirect() {}
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
execFileSync(
  "npx",
  ["esbuild", "scripts/render-customer-emails-probe.tsx", `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="x"', "--bundle", "--format=iife", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined", "--define:process.env.NEXT_PUBLIC_APP_URL=undefined", "--alias:@=.", `--outfile=${join(out, "app.js")}`, "--log-level=error"],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const css = await appCss(root)
const js = readFileSync(join(out, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
async function open(phone, path = "/app/settings?tab=emails") {
  const p = await browser.newPage()
  if (phone) await p.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await p.setViewport({ width: 1440, height: 900 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
  await p.goto(`${ORIGIN}${path}`)
  await p.waitForSelector("[data-customer-email]", { timeout: 10000 })
  await sleep(300)
  return { p, errors }
}

/* Click into a field and select what is in it, as a person does before typing over it. */
const selectAll = async (p, field) => {
  await p.click(`[data-email-field="${field}"]`)
  await p.evaluate((f) => document.querySelector(`[data-email-field="${f}"]`).select(), field)
}

const frameText = (p) =>
  p.evaluate(() => {
    const f = document.querySelector("[data-email-sheet] [data-email-frame], [data-email-frame]")
    return f?.contentDocument?.body?.innerText ?? ""
  })

/* ── A computer ─────────────────────────────────────────────────────────── */
console.log("\nOn a computer (1440x900)\n")
{
  const { p, errors } = await open(false)
  const ids = await p.$$eval("[data-customer-email]", (els) => els.map((e) => e.getAttribute("data-customer-email")))
  expect(ids.length === 19, "every customer email is listed (19 with physical commerce on)", ids.length)
  const opened = []
  for (const id of ids) {
    await p.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 4000 }).catch(() => {})
    await p.click(`[data-customer-email="${id}"]`)
    await p.waitForSelector(`[data-email-sheet="${id}"]`, { timeout: 4000 }).catch(async () => {
      await p.click(`[data-customer-email="${id}"]`)
      await p.waitForSelector(`[data-email-sheet="${id}"]`, { timeout: 4000 })
    })
    await sleep(350)
    const state = await p.evaluate(() => {
      const val = (f) => document.querySelector(`[data-email-field="${f}"]`)?.value ?? null
      const frame = document.querySelector("[data-email-frame]")
      return { subject: val("subject"), heading: val("heading"), button: val("button"), drawn: (frame?.contentDocument?.body?.innerText ?? "").length, h: frame?.getBoundingClientRect().height ?? 0 }
    })
    opened.push({ id, ...state })
    await p.keyboard.press("Escape")
    await p.waitForFunction(() => !document.querySelector("[data-email-sheet]"), { timeout: 4000 }).catch(() => {})
    await sleep(250)
  }
  expect(opened.every((o) => o.drawn > 80), "each opens with its preview drawn", opened.filter((o) => o.drawn <= 80).map((o) => o.id))
  expect(opened.every((o) => o.subject && o.heading && o.button), "each has its subject, heading and button filled in (the Button is never empty)", opened.filter((o) => !(o.subject && o.heading && o.button)).map((o) => o.id))
  expect(opened.find((o) => o.id === "order_confirmation")?.button === "View your order", "Order confirmation's button reads View your order", opened.find((o) => o.id === "order_confirmation")?.button)

  /* The editor on Order confirmation: depth, no ring, a fade in. */
  await p.evaluate(() => {
    window.__op = []
    const t0 = performance.now()
    const tick = () => {
      const d = document.querySelector('[role="dialog"]')
      if (d) window.__op.push(Number(getComputedStyle(d).opacity))
      if (performance.now() - t0 < 600) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await p.click('[data-customer-email="order_confirmation"]')
  await p.waitForSelector('[data-email-sheet="order_confirmation"]')
  await sleep(700)
  const op = await p.evaluate(() => window.__op)
  /* Headless Chromium rasterises in software: the preview's first paint is one long frame here (about 100ms) that a GPU does not have, so two frames between 0 and 1 is the bar. */
  expect(op.filter((o) => o > 0.02 && o < 0.98).length >= 2, "the dialog fades in through frames between, not at once", op.map((o) => Math.round(o * 100) / 100))
  const ring = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const s = getComputedStyle(d)
    return { outline: s.outlineStyle, shadow: s.boxShadow.length > 20 }
  })
  expect(ring.outline === "none" && ring.shadow, "no focus ring drawn around the dialog, and it has its shadow", ring)
  await p.screenshot({ path: join(shots, "desktop-order-confirmation.png") })

  /* Live preview: typing changes the frame's document in place, never reloading it. */
  await p.evaluate(() => {
    const f = document.querySelector("[data-email-frame]")
    window.__loads = 0
    f.addEventListener("load", () => window.__loads++)
    window.__blank = 0
    const t0 = performance.now()
    const tick = () => {
      if ((f.contentDocument?.body?.innerText ?? "").length < 40) window.__blank++
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await selectAll(p, "heading")
  await p.keyboard.type("Thanks so much, {{customer_name}}!", { delay: 25 })
  await sleep(500)
  const live = await p.evaluate(() => ({ loads: window.__loads, blank: window.__blank, h1: document.querySelector("[data-email-frame]").contentDocument.querySelector("h1")?.textContent }))
  expect(live.h1 === "Thanks so much, Maria!", "the preview follows the typing, placeholders filled", live.h1)
  expect(live.loads === 0 && live.blank === 0, "the frame never reloads or goes blank while typing", live)

  /* A placeholder goes where the cursor is. */
  await p.click('[data-email-field="body"]')
  await p.evaluate(() => {
    const t = document.querySelector('[data-email-field="body"]')
    t.setSelectionRange(3, 3)
    t.dispatchEvent(new Event("select", { bubbles: true }))
  })
  await p.click('[data-placeholder="order_number"]')
  await sleep(150)
  const placed = await p.evaluate(() => {
    const t = document.querySelector('[data-email-field="body"]')
    return { value: t.value.slice(0, 24), caret: t.selectionStart, focused: document.activeElement === t }
  })
  expect(placed.value.startsWith("Hi {{order_number}}"), "the placeholder goes in at the cursor", placed.value)
  expect(placed.caret === 3 + "{{order_number}}".length && placed.focused, "and the cursor stands after it, still in the field", placed)

  /* The button's words, saved. */
  await selectAll(p, "button")
  await p.keyboard.type("Track my order")
  await sleep(300)
  const btnPreview = await p.evaluate(() => [...document.querySelector("[data-email-frame]").contentDocument.querySelectorAll("a")].some((a) => a.textContent.trim() === "Track my order"))
  expect(btnPreview, "the button's new words are on the preview's button")
  await p.click("[data-email-save]")
  await sleep(500)
  const saved = await p.evaluate(() => ({ put: window.__requests.filter((r) => r.method === "PUT").at(-1)?.body, saved: window.__saved.order_confirmation, edited: !!document.querySelector('[data-customer-email="order_confirmation"] [data-email-edited]') }))
  expect(saved.saved?.button === "Track my order" && saved.saved?.heading === "Thanks so much, {{customer_name}}!" && saved.saved?.body?.startsWith("Hi {{order_number}}"), "Save sends the four words and they are kept", saved.saved)
  expect(saved.edited, "the row says Edited")
  await p.screenshot({ path: join(shots, "desktop-saved.png") })

  /* Reset. */
  await p.click("[data-email-reset]")
  await sleep(500)
  const reset = await p.evaluate(() => ({ saved: window.__saved.order_confirmation ?? null, button: document.querySelector('[data-email-field="button"]').value, heading: document.querySelector('[data-email-field="heading"]').value }))
  expect(reset.saved === null && reset.button === "View your order" && reset.heading === "Thank you for your purchase!", "Reset to default puts the default words back and saves", reset)
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}

/* ── A phone ────────────────────────────────────────────────────────────── */
console.log("\nOn a phone (390x844, touch, CPU 4x slower)\n")
{
  const { p, errors } = await open(true)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const row = await p.$('[data-customer-email="order_confirmation"]')
  const box = await row.boundingBox()
  await p.touchscreen.tap(box.x + 40, box.y + box.height / 2)
  await p.waitForSelector('[data-email-sheet="order_confirmation"]', { timeout: 6000 })
  await sleep(900)
  const inSheet = await p.evaluate(() => !!document.querySelector("[data-sheet-panel] [data-email-sheet]"))
  expect(inSheet, "the editor is the app's bottom sheet on a phone")
  await p.screenshot({ path: join(shots, "phone-preview.png") })

  /* Preview to Edit and back: the sheet's top edge, every frame. */
  const switchFrames = async (to) => {
    await p.evaluate(() => {
      window.__sw = []
      const t0 = performance.now()
      const tick = () => {
        const panel = document.querySelector("[data-sheet-panel]")
        const track = document.querySelector("[data-email-panes] > div")
        window.__sw.push({ top: panel.getBoundingClientRect().top, h: panel.getBoundingClientRect().height, x: new DOMMatrixReadOnly(getComputedStyle(track).transform).m41 })
        if (performance.now() - t0 < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const tab = await p.$(`[data-email-tab="${to}"]`)
    const b = await tab.boundingBox()
    await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    await sleep(1000)
    return p.evaluate(() => window.__sw)
  }
  const toEdit = await switchFrames("edit")
  const tops = toEdit.map((f) => Math.round(f.top))
  const heights = toEdit.map((f) => Math.round(f.h))
  const xs = toEdit.map((f) => Math.round(f.x))
  expect(Math.max(...tops) - Math.min(...tops) === 0 && Math.max(...heights) - Math.min(...heights) === 0, "switching to Edit moves the sheet's edge by 0px", { tops: [Math.min(...tops), Math.max(...tops)], heights: [Math.min(...heights), Math.max(...heights)] })
  const between = xs.filter((x) => x < -2 && x > Math.min(...xs) + 2).length
  expect(between >= 3, "the panes slide across over several frames, not a jump", { frames: xs.length, between })
  await p.screenshot({ path: join(shots, "phone-edit.png") })
  const back = await switchFrames("preview")
  const backTops = back.map((f) => Math.round(f.top))
  expect(Math.max(...backTops) - Math.min(...backTops) === 0, "and back to Preview the same", [Math.min(...backTops), Math.max(...backTops)])
  await switchFrames("edit")

  const fonts = await p.$$eval("[data-email-field]", (els) => els.map((e) => getComputedStyle(e).fontSize))
  expect(fonts.every((f) => f === "16px"), "fields are 16px on a phone, so iOS does not zoom into them", fonts)

  /* A keyboard of 336px comes up while the text is being typed in. */
  const field = await p.$('[data-email-field="body"]')
  const fb = await field.boundingBox()
  await p.touchscreen.tap(fb.x + 20, fb.y + 20)
  await p.evaluate(() => {
    const h = document.documentElement
    h.style.setProperty("--kb-inset", "336px")
    h.style.setProperty("--vv-h", "508px")
  })
  /* The sheet rides up on the keyboard's own curve (bottom-sheet KEYBOARD_MOVE): wait for it to settle. */
  await sleep(1200)
  /* What KeyboardGuard (components/platform/keyboard-guard.tsx) does once the keyboard is up: the focused field centred in its own scroller. */
  await p.evaluate(() => {
    const a = document.activeElement
    let s = a.parentElement
    while (s && !(/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight)) s = s.parentElement
    if (!s) return
    const ar = a.getBoundingClientRect()
    const sr = s.getBoundingClientRect()
    s.scrollTop = Math.max(0, s.scrollTop + (ar.top - sr.top + ar.height / 2) - s.clientHeight / 2)
  })
  await sleep(400)
  const kb = await p.evaluate(() => {
    const visible = 844 - 336
    const r = (el) => el?.getBoundingClientRect()
    const footer = r(document.querySelector("[data-email-footer]"))
    const focused = r(document.activeElement)
    const panel = r(document.querySelector("[data-sheet-panel]"))
    return { visible, footerTop: footer.top, footerBottom: footer.bottom, fieldTop: focused.top, fieldBottom: focused.bottom, panelTop: panel.top, focused: document.activeElement?.getAttribute("data-email-field") }
  })
  expect(kb.footerBottom <= kb.visible + 1, "the Save bar sits above the keyboard", kb)
  expect(kb.fieldTop >= kb.panelTop && kb.fieldBottom <= kb.footerTop + 1 && kb.fieldTop < kb.footerTop, "the field typed in is above the keyboard and the Save bar, nothing over it", kb)
  await p.screenshot({ path: join(shots, "phone-keyboard.png") })
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}

/* ── Emails › Customer emails: the same list and editor ─────────────────── */
console.log("\nIn Emails, on its Customer emails tab\n")
for (const phone of [false, true]) {
  const { p, errors } = await open(phone, "/app/emails?tab=customer")
  await sleep(400)
  const seen = await p.evaluate(() => ({
    tab: document.querySelector('[data-tab="customer"]')?.getAttribute("aria-selected"),
    rows: document.querySelectorAll("[data-customer-email]").length,
    strip: [...document.querySelectorAll('section[aria-label="Email metrics"] *')].some((e) => e.textContent === "Replies go to"),
    wide: document.documentElement.scrollWidth <= window.innerWidth,
  }))
  expect(seen.tab === "true" && seen.rows === 19, `${phone ? "phone" : "computer"}: the tab lists every customer email`, seen)
  expect(seen.strip && seen.wide, `${phone ? "phone" : "computer"}: its strip says where replies go, and the page never scrolls sideways`, seen)
  await p.screenshot({ path: join(shots, `emails-tab-list-${phone ? "phone" : "desktop"}.png`) })
  if (phone) {
    await p.evaluate(() => document.querySelector('[data-customer-email="shipping_confirmation"]').scrollIntoView({ block: "center" }))
    await sleep(200)
    const r = await (await p.$('[data-customer-email="shipping_confirmation"]')).boundingBox()
    await p.touchscreen.tap(r.x + 40, r.y + r.height / 2)
  } else await p.click('[data-customer-email="shipping_confirmation"]')
  await p.waitForSelector('[data-email-sheet="shipping_confirmation"]', { timeout: 6000 })
  await sleep(900)
  const drawn = await p.evaluate(() => (document.querySelector("[data-email-frame]")?.contentDocument?.body?.innerText ?? "").includes("JD014600006281234567"))
  expect(drawn, `${phone ? "phone" : "computer"}: a row opens the same editor with its preview (the tracking number in it)`)
  await p.screenshot({ path: join(shots, `emails-tab-${phone ? "phone" : "desktop"}.png`) })
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}

await browser.close()
console.log(`\nscreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall passed")
