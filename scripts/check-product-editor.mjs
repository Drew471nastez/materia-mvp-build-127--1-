/**
 * ===========================================================================
 *  THE PRODUCT EDITOR, MEASURED
 * ===========================================================================
 * The real editor, mounted from the rows the server page hands it, inside a
 * copy of the /app frame with a stand-in for the phone's navigation pill.
 *
 *   FIRST FRAME. The product's name, pictures and files are in the first
 *   commit, with no request made to get them, and nothing moves after.
 *   THE BAR. One bar at the top with Cancel and Save, the same height on
 *   every frame, and no bar at the foot of the screen for the pill to cover.
 *   THE PILL. The last section clears it; nothing is left reserved for the
 *   old bar.
 *   SAVE. Greyed while there is nothing to save, "Unsaved changes" once there
 *   is, gone again when the change is undone, and Cmd or Ctrl and S saves.
 *
 *   node scripts/check-product-editor.mjs
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
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face, which is wider)")
const stubs = join(root, ".product-editor-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-editor-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh: () => log("refresh") }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  execFileSync("npx", [
    "esbuild", "scripts/render-product-editor.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    "--banner:js=var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};",
    "--alias:next/navigation=./.product-editor-probe/navigation.js", "--alias:next/link=./.product-editor-probe/link.jsx", "--alias:next/image=./.product-editor-probe/image.jsx",
    "--loader:.css=empty",
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  /* Watches from before the bundle runs: when the form's name field first
     holds the product's name, when every picture has decoded, and every
     layout shift from the first frame on. */
  const watch = `<script>
    window.__shifts = []; window.__t = {}
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push(+e.value.toFixed(4)) }).observe({ type: "layout-shift", buffered: true })
    const mo = new MutationObserver(() => {
      const t = document.querySelector("#title")
      if (t && !window.__t.form) window.__t.form = { at: +performance.now().toFixed(1), value: t.value }
    })
    mo.observe(document, { subtree: true, childList: true })
  </script>`
  /* With Inter, the bundle runs once the face has loaded: the app preloads
     it, and a swap the harness caused is not a shift the editor made. */
  const run = inter
    ? `<script type="text/plain" id="bundle">${js.replace(/<\/script/gi, "<\\/script")}</script><script>document.fonts.load("16px Inter").finally(function () { window.__t.script = +performance.now().toFixed(1); var s = document.createElement("script"); s.textContent = document.getElementById("bundle").textContent; document.body.appendChild(s) })</script>`
    : `<script>window.__t.script = +performance.now().toFixed(1)</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script>`
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>${watch}</head><body><div id="app"></div>${run}</body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const runs = [
    ["phone-390", phone(390), ""],
    ["phone-360", phone(360), ""],
    ["phone-430", phone(430), ""],
    ["phone-390-new", phone(390), "?new"],
    ["phone-390-layer", phone(390), "?layer"],
    ["phone-360-new-layer", phone(360), "?new&layer"],
    ["desktop-1440", { width: 1440, height: 900 }, ""],
    ["desktop-1440-new", { width: 1440, height: 900 }, "?new"],
    ["wide-1920", { width: 1920, height: 1080 }, ""],
  ]
  for (const [label, vp, query] of runs) {
    const isPhone = label.startsWith("phone")
    const isNew = query.includes("new")
    const isLayer = query.includes("layer")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    const requests = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("file:") || u.startsWith("data:")) return r.continue()
      requests.push(u.replace(/\?.*/, ""))
      r.abort()
    })
    await p.setViewport(vp)
    /* An iPhone's status bar: 47px of safe area at the top. A browser has none;
       Chromium can pretend, where the protocol has the call. */
    let inset = 0
    let insetBottom = 0
    if (isPhone) {
      try {
        const cdp = await p.createCDPSession()
        await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34 } })
        inset = 47
        insetBottom = 34
      } catch {
        console.log("        (this Chromium cannot pretend to have a safe area: measured with none)")
      }
    }
    await p.goto(`file://${join(stubs, "index.html")}${query}`)
    await sleep(900)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    /* First frame */
    const first = await p.evaluate(() => window.__t)
    const shifts = await p.evaluate(() => window.__shifts)
    const cls = +shifts.reduce((a, b) => a + b, 0).toFixed(4)
    if (!isNew) {
      expect(first.form && /Portrait retouching presets/.test(first.form.value), "the product's name is in the form's first commit", first.form)
      const pics = await p.$$eval("[data-product-editor] .aspect-video img", (i) => i.length)
      expect(pics === 3, "and its three pictures, each in a fixed 16:9 box", pics)
      const files = await p.evaluate(() => document.body.innerText.includes("portrait-presets-capture-one.zip"))
      expect(files, "and its files", files)
    }
    expect(cls === 0, "nothing shifts after the first frame", { cls, shifts })
    expect(requests.length === 0, "and no request is made to draw it", requests)
    console.log(`        (form mounted ${first.form ? (first.form.at - first.script).toFixed(1) : "?"}ms after the script began)`)

    /* The bar */
    const bar = await p.evaluate(() => {
      const pane = document.querySelector("[data-product-editor]")
      const b = document.querySelector("[data-editor-bar]")
      const buttons = [...b.querySelectorAll("button, a")].filter((x) => x.getBoundingClientRect().width > 0)
      const save = buttons.find((x) => x.textContent.trim() === "Save")
      const cancel = buttons.find((x) => x.textContent.trim() === "Cancel")
      return {
        top: Math.round(b.getBoundingClientRect().top - pane.getBoundingClientRect().top),
        h: Math.round(b.getBoundingClientRect().height),
        save: save ? { h: Math.round(save.getBoundingClientRect().height), disabled: save.disabled, right: Math.round(window.innerWidth - save.getBoundingClientRect().right) } : null,
        cancel: cancel ? Math.round(cancel.getBoundingClientRect().height) : null,
        heading: b.querySelector("h1").textContent,
        headingShown: b.querySelector("h1").getBoundingClientRect().width > 1,
        named: /Portrait retouching/.test(b.innerText),
        status: b.querySelector("[data-editor-state]").textContent,
        statusSize: getComputedStyle(b.querySelector("[data-editor-state]")).fontSize,
        statusCenter: Math.round(b.querySelector("[data-editor-state]").getBoundingClientRect().left + b.querySelector("[data-editor-state]").getBoundingClientRect().width / 2),
        padTop: Math.round(parseFloat(getComputedStyle(b).paddingTop)),
      }
    })
    expect(bar.top === 0, "the bar is at the top of the page", bar.top)
    expect(bar.h === (isPhone ? 56 + bar.padTop : 108), `and is ${isPhone ? "56px under any safe area" : "64px, with a 44px row of section tabs,"}`, bar.h)
    expect(!!bar.save && !!bar.cancel, "with Cancel and Save in it", { save: bar.save, cancel: bar.cancel })
    expect(isPhone ? bar.save?.h === 40 && bar.cancel === 44 : bar.save?.h === 32, `Save is ${isPhone ? "40px, Cancel a 44px target" : "32px"}`, { save: bar.save?.h, cancel: bar.cancel })
    expect(bar.save?.disabled === true, "Save is greyed out while there is nothing to save", bar.status)
    expect(!bar.named && !bar.headingShown, "the bar shows no product name: it is in the title field", { named: bar.named, heading: bar.heading })
    expect(bar.heading === (isNew ? "New product" : "Edit product"), "a screen reader still hears which page this is", bar.heading)
    expect(isNew ? bar.status === "New product" : bar.status === "Live", "the bar says what state it is in, in small text", { status: bar.status, size: bar.statusSize })
    expect(bar.statusSize === "13px", "13px", bar.statusSize)
    if (isPhone) expect(Math.abs(bar.statusCenter - vp.width / 2) <= 1, "centred on the screen, between Cancel and Save", { center: bar.statusCenter, screen: vp.width / 2 })
    if (isPhone) {
      const want = isLayer ? inset : 0
      expect(bar.padTop === want, isLayer ? `first on the screen, it starts below the status bar (${inset}px of safe area)` : "under the app's header it adds no safe area of its own", { padTop: bar.padTop, inset })
    }
    const footBars = await p.evaluate(() => [...document.querySelectorAll("[data-product-editor] *")].filter((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return (cs.position === "fixed" || (cs.position === "sticky" && cs.bottom !== "auto")) && cs.visibility !== "hidden" && r.bottom >= window.innerHeight - 1 && r.height > 20 && r.height < 200
    }).map((el) => el.className.toString().slice(0, 80)))
    expect(footBars.length === 0, "no bar at the foot of the screen", footBars)

    /* Room */
    const room = await p.evaluate(() => {
      const pane = document.querySelector("[data-product-editor]")
      return { sideways: pane.scrollWidth - pane.clientWidth, pb: getComputedStyle(pane).paddingBottom, column: Math.round(pane.querySelector("[data-editor-bar] + div").getBoundingClientRect().width) }
    })
    expect(room.sideways === 0, "nothing scrolls sideways", room.sideways)
    if (isPhone) {
      if (isLayer) {
        expect(room.pb === `${32 + insetBottom}px`, "a layer has no pill under it: 32px at its foot, over the home indicator's safe area", room.pb)
      } else {
        expect(room.pb === `${104 + insetBottom}px`, "the page keeps 104px at its foot for the pill (over the safe area), and nothing more", room.pb)
      }
      await p.$eval("[data-product-editor]", (el) => { el.scrollTop = el.scrollHeight })
      await sleep(250)
      const clear = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-product-editor] .rounded-2xl")]
        const last = cards[cards.length - 1].getBoundingClientRect()
        const pill = document.getElementById("pill")
        const pillShown = getComputedStyle(pill.parentElement).visibility !== "hidden"
        const edge = pillShown ? pill.getBoundingClientRect().top : window.innerHeight
        return { lastBottom: Math.round(last.bottom), pillShown, edge: Math.round(edge), gap: Math.round(edge - last.bottom) }
      })
      expect(clear.pillShown === !isLayer, isLayer ? "the pill is hidden under the layer" : "the pill is there", clear.pillShown)
      expect(clear.gap >= 16 + (isLayer ? insetBottom : 0), isLayer ? "scrolled to the end, the last section clears the home indicator" : "scrolled to the end, the last section clears the pill", clear)
      const barAfter = await p.$eval("[data-editor-bar]", (b) => ({ top: Math.round(b.getBoundingClientRect().top), h: Math.round(b.getBoundingClientRect().height) }))
      expect(barAfter.top === (isLayer ? 0 : 68) && barAfter.h === bar.h, "and the bar is still at the top, the same size", barAfter)
      await p.screenshot({ path: join(shots, `${label}-end.png`) })
      await p.$eval("[data-product-editor]", (el) => { el.scrollTop = 0 })
      await sleep(150)
      const fields = await p.$$eval("[data-product-editor] input:not([type=checkbox]):not([type=file]), [data-product-editor] select, [data-product-editor] textarea", (els) =>
        els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ id: e.id || e.placeholder, size: getComputedStyle(e).fontSize, h: Math.round(e.getBoundingClientRect().height) })))
      expect(fields.every((f) => f.size === "16px"), "every field is 16px, so iOS does not zoom", fields.filter((f) => f.size !== "16px"))
      const money = await p.$$eval("#price, #comparePrice", (els) => els.map((e) => e.inputMode))
      expect(money.every((m) => m === "decimal"), "prices bring up the decimal keypad", money)
      const switches = await p.$$eval("[data-product-editor] [role=switch]", (s) => s.map((x) => Math.round(x.getBoundingClientRect().height)))
      expect(switches.length >= 3, "the settings are switches", switches)
      await p.evaluate(() => {
        const pane = document.querySelector("[data-product-editor]")
        const s = [...pane.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Settings")
        pane.scrollTop += s.getBoundingClientRect().top - 140
      })
      await sleep(150)
      await p.screenshot({ path: join(shots, `${label}-settings.png`) })
      await p.$eval("[data-product-editor]", (el) => { el.scrollTop = 0 })
    } else {
      expect(room.column === 760, "the form is one 760px column", room.column)
    }
    await p.screenshot({ path: join(shots, `${label}-top.png`) })

    /* Where everything in the bar is, to see that a change of state moves none of it. */
    const geometry = () => p.evaluate(() => {
      const b = document.querySelector("[data-editor-bar]")
      const parts = [...b.querySelectorAll("button, a")].filter((x) => x.getBoundingClientRect().width > 0).map((x) => {
        const r = x.getBoundingClientRect()
        return `${x.textContent.trim() || x.getAttribute("aria-label")}@${Math.round(r.left)}+${Math.round(r.width)}x${Math.round(r.height)}`
      })
      return [...parts, `bar ${Math.round(b.getBoundingClientRect().height)}`].join(" ")
    })
    const resting = await geometry()

    /* Save */
    if (isNew) {
      await p.click("#title", { clickCount: 1 })
      await p.keyboard.type("Film presets")
      await sleep(150)
      const typed = await p.evaluate(() => document.querySelector("[data-editor-state]").textContent)
      const moved = await geometry()
      expect(typed === "Unsaved changes" && !/Film presets/.test(await p.$eval("[data-editor-bar]", (b) => b.innerText)), "typing a name says Unsaved changes, and the name stays out of the bar", typed)
      expect(moved === resting, "and nothing in the bar moves or changes size", { resting, moved })
      await p.screenshot({ path: join(shots, `${label}-typed.png`) })
    }
    if (!isNew) {
      await p.click("#title", { clickCount: 1 })
      await p.keyboard.press("End")
      await p.keyboard.type("!")
      await sleep(150)
      const dirty = await p.evaluate(() => ({ status: document.querySelector("[data-editor-state]").textContent, disabled: [...document.querySelectorAll("[data-editor-bar] button")].find((b) => b.textContent.trim() === "Save").disabled }))
      expect(dirty.status === "Unsaved changes" && dirty.disabled === false, "a change says Unsaved changes and Save lights up", dirty)
      const moved = await geometry()
      expect(moved === resting, "and nothing in the bar moves or changes size", { resting, moved })
      if (isPhone) {
        const state = await p.$eval("[data-editor-state]", (s) => {
          const r = s.getBoundingClientRect()
          const more = document.querySelector("[data-editor-bar] button[aria-label='More actions'] svg").getBoundingClientRect()
          return { center: Math.round(r.left + r.width / 2), gapToMore: Math.round(more.left - r.right), cut: s.scrollWidth > s.clientWidth }
        })
        expect(Math.abs(state.center - vp.width / 2) <= 1 && state.gapToMore >= 16 && !state.cut, "the longest state, Unsaved changes, is still centred, whole, and 16px or more from the more button's dots", state)
      }
      await p.screenshot({ path: join(shots, `${label}-dirty.png`) })
      await p.keyboard.press("Backspace")
      await sleep(150)
      const clean = await p.evaluate(() => ({ status: document.querySelector("[data-editor-state]").textContent, disabled: [...document.querySelectorAll("[data-editor-bar] button")].find((b) => b.textContent.trim() === "Save").disabled }))
      expect(clean.status === "Live" && clean.disabled === true, "undone, it is saved again", clean)
      await p.keyboard.type("!")
      const before = requests.length
      await p.keyboard.down("Control")
      await p.keyboard.press("s")
      await p.keyboard.up("Control")
      await sleep(400)
      const tried = requests.slice(before).filter((u) => /\/rest\/v1\/products/.test(u)).length
      expect(tried > 0, "Ctrl and S saves", { requests: requests.slice(before) })
    }
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
