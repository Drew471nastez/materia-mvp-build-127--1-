/**
 * ===========================================================================
 *  THE PRODUCT EDITOR, MEASURED
 * ===========================================================================
 * The real editor, mounted from the rows the server page hands it, inside a
 * copy of the /app frame with a stand-in for the phone's navigation pill.
 *
 *   FIRST FRAME. The product's name, pictures and files are in the first
 *   commit, with no request made to get them, and nothing moves after.
 *   THE BAR. One bar at the top, Cancel at the start and the more button and
 *   Save at the end, nothing written in the middle, one height for all three
 *   and a shade under Cancel and more; no bar at the foot of the screen for
 *   the pill to cover.
 *   THE PILL. The last section clears it; nothing is left reserved for the
 *   old bar.
 *   SAVE. Grey while there is nothing to save, violet once there is, grey
 *   again when the change is undone. A save (answered by a stand-in for the
 *   database after 1200ms) spins without changing Save's size, takes two
 *   presses as one, then shows a check for about 900ms. Cmd or Ctrl and S saves.
 *   AT 390 AND 1280. Cancel's question is a sheet on the bottom edge of the
 *   phone and a modal in the middle of the computer. The questions reorder
 *   by a held finger (real touch events: a swipe scrolls instead, a
 *   touchcancel puts them back, the bottom edge scrolls the pane), by a
 *   mouse and by the keyboard, and the save writes the new order.
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

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const saveButton = "[data-editor-bar] [data-save-button]"
const pressText = (p, scope, text) => p.evaluate((scope, text) => {
  const b = [...document.querySelectorAll(scope)].find((x) => x.textContent.trim() === text && x.getBoundingClientRect().width > 0)
  if (!b) return false
  b.click()
  return true
}, scope, text)

/**
 * CANCEL, AND THE QUESTION IT ASKS. Nothing changed: straight to Products.
 * Something changed: a sheet on the bottom edge of a phone, a modal in the
 * middle of a computer's screen, with Keep editing and Discard. On a phone it
 * also goes when pulled down, like every sheet. And the more menu says
 * whether the product is live.
 */
async function leaving(p, label, vp, isPhone) {
  console.log(`  -- Cancel, and the question`)
  const pushes = () => p.evaluate(() => (window.__router || []).filter(([k, a]) => k === "push" && a === "/app/products").length)
  const open = () => p.evaluate(() => !!document.querySelector("[data-confirm-sheet]") && (!document.querySelector("[data-app-sheet]") || document.querySelector("[data-app-sheet]").dataset.appSheet === "open"))

  const p0 = await pushes()
  await pressText(p, "[data-editor-bar] button", "Cancel")
  await sleep(250)
  expect((await pushes()) === p0 + 1 && !(await open()), "with nothing changed, Cancel goes straight back to Products", { pushes: (await pushes()) - p0 })

  /* The more menu names the state the bar used to. */
  await p.click("[data-editor-bar] button[aria-label='More actions']")
  await sleep(600)
  const menu = await p.evaluate(() => (document.querySelector("[data-action-sheet]") || document.querySelector("[data-action-list]"))?.innerText ?? "")
  expect(/Live on your page/.test(menu) && /Unpublish/.test(menu), "the more menu says the product is live, over Unpublish", menu.replace(/\n+/g, " | "))
  await p.keyboard.press("Escape")
  await sleep(600)

  await p.click("#title", { clickCount: 1 })
  await p.keyboard.press("End")
  await p.keyboard.type(" v2")
  await sleep(150)
  const p1 = await pushes()
  await pressText(p, "[data-editor-bar] button", "Cancel")
  await sleep(isPhone ? 700 : 400)
  const shape = await p.evaluate(() => {
    const s = document.querySelector("[data-confirm-sheet]")
    if (!s) return null
    const panel = s.closest("[data-sheet-panel]") || s
    const r = panel.getBoundingClientRect()
    const btns = [...s.querySelectorAll("button")].map((b) => {
      const br = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      return { text: b.textContent.trim(), h: Math.round(br.height), w: Math.round(br.width), top: Math.round(br.top), shadow: cs.boxShadow, bg: cs.backgroundColor }
    })
    return {
      surface: s.dataset.surface,
      left: Math.round(r.left), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
      title: panel.querySelector("h2")?.textContent,
      btns,
    }
  })
  await p.screenshot({ path: join(shots, `${label}-discard.png`) })
  expect(!!shape && shape.title === "Discard changes?", "with a change, Cancel asks: Discard changes?", shape?.title)
  if (shape) {
    const keep = shape.btns.find((b) => b.text === "Keep editing")
    const discard = shape.btns.find((b) => b.text === "Discard")
    expect(shape.btns.length === 2 && !!keep && !!discard, "two answers, Keep editing and Discard", shape.btns.map((b) => b.text))
    expect(/inset/.test(keep?.shadow ?? "") && discard?.bg === "rgb(196, 41, 12)", "Keep editing has the same depth as Cancel, Discard is red", { keep: keep?.shadow, discard: discard?.bg })
    if (isPhone) {
      expect(shape.surface === "sheet" && Math.abs(shape.bottom) <= 1 && shape.left === 0 && shape.right === 0, "on a phone it is the shared sheet, on the bottom edge, the full width", shape)
      expect(keep?.h === 48 && discard?.h === 48 && keep.top === discard.top && keep.w === discard.w, "its two buttons side by side, 48px, the same width", shape.btns)
    } else {
      expect(shape.surface === "modal" && Math.abs(shape.cx - vp.width / 2) <= 1 && Math.abs(shape.cy - vp.height / 2) <= 1, "on a computer it is a modal in the middle of the screen", { cx: shape.cx, cy: shape.cy, w: shape.w })
      expect(shape.w <= 420 && keep?.h === 32 && discard?.h === 32, "compact: 420px at most, 32px buttons", { w: shape.w, keep: keep?.h })
    }
  }
  await pressText(p, "[data-confirm-sheet] button", "Keep editing")
  await sleep(600)
  const stayed = await p.evaluate(() => document.querySelector("#title").value)
  expect(!(await open()) && (await pushes()) === p1 && / v2$/.test(stayed), "Keep editing closes it and keeps the change", { pushes: (await pushes()) - p1, title: stayed.slice(-10) })

  if (isPhone) {
    await pressText(p, "[data-editor-bar] button", "Cancel")
    await sleep(700)
    const cdp = await p.createCDPSession()
    const grab = await p.evaluate(() => {
      const h = document.querySelector("[data-sheet-handle]").getBoundingClientRect()
      return { x: Math.round(h.left + h.width / 2), y: Math.round(h.top + 8) }
    })
    const t = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: grab.x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] })
    await t("touchStart", grab.y)
    for (let k = 1; k <= 12; k++) {
      await sleep(16)
      await t("touchMove", grab.y + k * 22)
    }
    await t("touchEnd")
    await sleep(700)
    expect(!(await open()) && (await pushes()) === p1, "pulled down, it goes, and nothing is discarded", { open: await open() })
  }

  await pressText(p, "[data-editor-bar] button", "Cancel")
  await sleep(isPhone ? 700 : 400)
  await pressText(p, "[data-confirm-sheet] button", "Discard")
  await sleep(500)
  expect((await pushes()) === p1 + 1, "Discard goes back to Products", { pushes: (await pushes()) - p1 })
}

const order = (p) => p.$$eval("[data-faq-list] > [data-faq-id]", (els) => els.map((e) => e.querySelector("input").value))
const paneTop = (p) => p.$eval("[data-product-editor]", (e) => Math.round(e.scrollTop))
const faqAt = (p, y) => p.evaluate((y) => {
  const pane = document.querySelector("[data-product-editor]")
  const first = document.querySelector("[data-faq-list] > [data-faq-id]")
  pane.scrollTop += first.getBoundingClientRect().top - y
}, y)
const handleOf = (p, i) => p.evaluate((i) => {
  const h = document.querySelectorAll("[data-faq-list] [data-faq-handle]")[i]
  const r = h.getBoundingClientRect()
  return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }
}, i)
const cards = (p) => p.$$eval("[data-faq-list] > [data-faq-id]", (els) => els.map((e) => {
  const r = e.getBoundingClientRect()
  return { id: e.dataset.faqId, top: r.top, h: r.height }
}))

/**
 * HOLD TO DRAG. On a phone, with real touch events through the protocol: a
 * quick swipe on a handle scrolls; a 300ms hold lifts the card, which then
 * follows the finger one to one while the others slide; the drop commits;
 * a touchcancel puts it back; held near the bottom edge, the pane scrolls.
 * On a computer, a mouse drag and the keyboard.
 */
async function reorder(p, label, vp, isPhone) {
  console.log(`  -- The questions, reordered`)
  const start = await order(p)
  expect(start.length === 4, "four questions to move", start)
  if (isPhone) {
    const cdp = await p.createCDPSession()
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] })
    const ta = await p.$eval("[data-faq-handle]", (h) => getComputedStyle(h).touchAction)
    expect(ta === "manipulation", "the handle leaves vertical swipes to the browser (touch-action: manipulation)", ta)

    /* A swipe, no hold. */
    await faqAt(p, 300)
    await sleep(100)
    let h = await handleOf(p, 1)
    const s0 = await paneTop(p)
    await touch("touchStart", h.x, h.y)
    let liftedBySwipe = false
    for (let k = 1; k <= 10; k++) {
      await sleep(16)
      await touch("touchMove", h.x, h.y - k * 24)
      liftedBySwipe ||= !!(await p.$("[data-lifted]"))
    }
    await touch("touchEnd")
    await sleep(700)
    const s1 = await paneTop(p)
    expect(s1 - s0 >= 100 && !liftedBySwipe && same(await order(p), start), "a quick swipe up on a handle scrolls the page and moves no question", { scrolled: s1 - s0, lifted: liftedBySwipe })

    /* A hold, then a drag past two questions. */
    await faqAt(p, 180)
    await sleep(100)
    h = await handleOf(p, 0)
    const c = await cards(p)
    const dist = Math.round(c[2].top + c[2].h / 2 - (c[0].top + c[0].h / 2))
    const sA = await paneTop(p)
    await touch("touchStart", h.x, h.y)
    await sleep(150)
    const early = !!(await p.$("[data-lifted]"))
    await sleep(250)
    const lift = await p.evaluate(() => {
      const el = document.querySelector("[data-lifted]")
      return el ? { id: el.dataset.faqId } : null
    })
    expect(!early && lift?.id === c[0].id, "not lifted at 150ms, lifted by 400ms", { at150: early, at400: lift })
    await sleep(200)
    const look = await p.evaluate(() => {
      const card = document.querySelector("[data-lifted] [data-faq-card]")
      const cs = getComputedStyle(card)
      return { scale: cs.scale, shadow: cs.boxShadow }
    })
    expect(look.scale === "1.02" && /rgba/.test(look.shadow), "it lifts: 2% larger, with a shadow", look)
    await p.screenshot({ path: join(shots, `${label}-faq-lifted.png`) })
    const samples = []
    const steps = Math.ceil(dist / 12)
    for (let k = 1; k <= steps; k++) {
      const dy = Math.min(dist, k * 12)
      await touch("touchMove", h.x, h.y + dy)
      await sleep(16)
      if (k % 4 === 0 || k === steps) {
        samples.push(await p.evaluate((dy) => {
          const el = document.querySelector("[data-lifted]")
          const m = new DOMMatrix(getComputedStyle(el).transform)
          const pane = document.querySelector("[data-product-editor]")
          return { dy, ty: Math.round(m.m42), scroll: Math.round(pane.scrollTop) }
        }, dy))
      }
    }
    await sleep(250)
    const others = await p.evaluate(() => [...document.querySelectorAll("[data-faq-list] > [data-faq-id]:not([data-lifted])")].map((e) => Math.round(new DOMMatrix(getComputedStyle(e).transform).m42)))
    await p.screenshot({ path: join(shots, `${label}-faq-dragging.png`) })
    const worst = Math.max(...samples.map((s) => Math.abs(s.ty - (s.dy + s.scroll - sA))))
    expect(worst <= 1, "the card follows the finger one to one", { worstPx: worst, samples: samples.slice(-3) })
    expect(samples.every((s) => s.scroll === sA), "and the page does not scroll under it", { from: sA, to: samples.map((s) => s.scroll) })
    expect(others[0] < -100 && others[1] < -100 && others[2] === 0, "the two it passed have slid up out of its way", others)
    await touch("touchEnd")
    await sleep(500)
    const dropped = await order(p)
    const want = [start[1], start[2], start[0], start[3]]
    expect(same(dropped, want), "dropped, the question is third", dropped)
    const dirty = await p.$eval(saveButton, (b) => b.disabled)
    expect(dirty === false, "and the form has it: Save lights up", { disabled: dirty })

    /* A touchcancel mid drag. */
    await faqAt(p, 180)
    await sleep(100)
    h = await handleOf(p, 0)
    await touch("touchStart", h.x, h.y)
    await sleep(400)
    for (let k = 1; k <= 12; k++) {
      await touch("touchMove", h.x, h.y + k * 12)
      await sleep(16)
    }
    await touch("touchCancel")
    await sleep(500)
    expect(same(await order(p), want) && !(await p.$("[data-lifted]")), "a touchcancel puts the order back as it was", await order(p))

    /* Held near the bottom edge. */
    await faqAt(p, 180)
    await sleep(100)
    h = await handleOf(p, 0)
    const sB = await paneTop(p)
    await touch("touchStart", h.x, h.y)
    await sleep(400)
    const edge = vp.height - 24
    for (let y = h.y + 20; y <= edge; y += 20) {
      await touch("touchMove", h.x, y)
      await sleep(16)
    }
    await touch("touchMove", h.x, edge)
    await sleep(900)
    const sC = await paneTop(p)
    await touch("touchCancel")
    await sleep(500)
    expect(sC - sB >= 60, "held near the bottom edge, the pane scrolls by itself", { scrolled: sC - sB })
    expect(same(await order(p), want), "and a cancel there still puts it back", await order(p))
  } else {
    await faqAt(p, 180)
    await sleep(100)
    const c = await cards(p)
    /* One place down: two would put the pointer in the bottom edge's scrolling band at this height. */
    const dist = Math.round(c[1].top + c[1].h / 2 - (c[0].top + c[0].h / 2))
    const h = await handleOf(p, 0)
    /* A click is not a drag. */
    await p.mouse.click(h.x, h.y)
    await sleep(200)
    expect(same(await order(p), start) && !(await p.$("[data-lifted]")), "a click on the handle moves nothing")
    await p.mouse.move(h.x, h.y)
    await p.mouse.down()
    for (let dy = 6; dy < dist; dy += 12) {
      await p.mouse.move(h.x, h.y + dy)
      await sleep(16)
    }
    await p.mouse.move(h.x, h.y + dist)
    await sleep(250)
    const lifted = await p.evaluate(() => {
      const card = document.querySelector("[data-lifted] [data-faq-card]")
      return card ? getComputedStyle(card).scale : null
    })
    await p.screenshot({ path: join(shots, `${label}-faq-dragging.png`) })
    await p.mouse.up()
    await sleep(500)
    const want = [start[1], start[0], start[2], start[3]]
    expect(lifted === "1.02" && same(await order(p), want), "a mouse drags it from the handle, lifted, and drops it second", { lifted, order: await order(p) })

    /* The keyboard: Space, Down, Down, Space. */
    const k0 = await order(p)
    await p.focus("[data-faq-list] [data-faq-handle]")
    const role = await p.$eval("[data-faq-list] [data-faq-handle]", (b) => b.getAttribute("aria-roledescription"))
    await p.keyboard.press("Space")
    await sleep(300)
    await p.keyboard.press("ArrowDown")
    await sleep(350)
    await p.keyboard.press("ArrowDown")
    await sleep(350)
    await p.keyboard.press("Space")
    await sleep(500)
    const k1 = await order(p)
    expect(role === "sortable" && same(k1, [k0[1], k0[2], k0[0], k0[3]]), "and the keyboard moves it: Space, Down, Down, Space", { role, k1 })
    const live = await p.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).find((t) => /Question/.test(t)) ?? "")
    expect(/position 3 of 4/.test(live), "in words a screen reader can use", live)
  }
}

/** The save writes the questions in the order on screen. */
async function savedOrder(p, ctx) {
  const expected = await order(p)
  ctx.fakeDb = true
  ctx.writes.length = 0
  await p.$eval(saveButton, (b) => b.click())
  let patch = null
  for (let i = 0; i < 60 && !patch; i++) {
    await sleep(50)
    patch = ctx.writes.find((w) => w.method === "PATCH" && /\/rest\/v1\/products$/.test(w.url))
  }
  ctx.fakeDb = false
  let got = []
  try {
    got = (JSON.parse(patch?.body ?? "{}").faqs ?? []).map((f) => f.question)
  } catch {}
  return { ok: got.length === expected.length && same(got, expected), expected, got }
}

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
    ["desktop-1280", { width: 1280, height: 800 }, ""],
    ["desktop-1440", { width: 1440, height: 900 }, ""],
    ["desktop-1440-new", { width: 1440, height: 900 }, "?new"],
    ["wide-1920", { width: 1920, height: 1080 }, ""],
  ]
  /* ONLY=phone-390,desktop-1280 runs just those. */
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null
  for (const [label, vp, query] of runs.filter(([l]) => !only || only.includes(l))) {
    const isPhone = label.startsWith("phone")
    const isNew = query.includes("new")
    const isLayer = query.includes("layer")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    const requests = []
    p.on("pageerror", (e) => errors.push(e.message))
    /* A reload with a change not saved asks first (beforeunload): say yes. */
    p.on("dialog", (d) => d.accept().catch(() => {}))
    await p.setRequestInterception(true)
    /* No request reaches anything. While `ctx.fakeDb` is on, the database's
       REST calls are answered 1200ms later by a stand-in (one row for a
       `.single()`, an empty list otherwise), so a save runs to the end and
       what it wrote can be read back from `ctx.writes`. */
    const ctx = { fakeDb: false, writes: [] }
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("file:") || u.startsWith("data:")) return r.continue()
      requests.push(u.replace(/\?.*/, ""))
      if (ctx.fakeDb && /\/rest\/v1\//.test(u)) {
        const method = r.method()
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }
        if (method === "OPTIONS") return r.respond({ status: 204, headers: cors })
        if (method !== "GET" && method !== "HEAD") ctx.writes.push({ method, url: u.replace(/\?.*/, ""), body: r.postData() })
        const one = /vnd\.pgrst\.object/.test(r.headers()["accept"] || "")
        const row = { id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6", slug: "portrait-presets", status: "published", archived: false }
        setTimeout(() => r.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(one ? row : []) }).catch(() => {}), method === "PATCH" || method === "POST" ? 1200 : 0)
        return
      }
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
      const more = buttons.find((x) => x.getAttribute("aria-label") === "More actions")
      const box = (x) => {
        if (!x) return null
        const r = x.getBoundingClientRect()
        const cs = getComputedStyle(x)
        return { left: Math.round(r.left), right: Math.round(window.innerWidth - r.right), w: Math.round(r.width), h: Math.round(r.height), shadow: cs.boxShadow, border: cs.borderTopWidth, bg: cs.backgroundColor }
      }
      /* Every piece of text that can be seen in the bar's first row, other than the buttons' own words. */
      const row = b.querySelector("[data-editor-bar] > div")
      const loose = [...row.querySelectorAll("*")].filter((el) => {
        if (el.closest("button, a")) return false
        const r = el.getBoundingClientRect()
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        return own && r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden"
      }).map((el) => el.textContent.trim())
      const announce = b.querySelector("[data-editor-announce]")
      return {
        top: Math.round(b.getBoundingClientRect().top - pane.getBoundingClientRect().top),
        h: Math.round(b.getBoundingClientRect().height),
        save: box(save) && { ...box(save), disabled: save.disabled },
        cancel: box(cancel),
        more: box(more),
        heading: b.querySelector("h1").textContent,
        headingShown: b.querySelector("h1").getBoundingClientRect().width > 1,
        named: /Portrait retouching/.test(b.innerText),
        oldState: !!b.querySelector("[data-editor-state]"),
        loose,
        announce: announce ? { live: announce.getAttribute("aria-live"), w: announce.getBoundingClientRect().width } : null,
        padTop: Math.round(parseFloat(getComputedStyle(b).paddingTop)),
      }
    })
    const H = isPhone ? 40 : 32
    const pad = isPhone ? 16 : Math.round((vp.width - 760) / 2) + 24
    expect(bar.top === 0, "the bar is at the top of the page", bar.top)
    expect(bar.h === (isPhone ? 56 + bar.padTop : 108), `and is ${isPhone ? "56px under any safe area" : "64px, with a 44px row of section tabs,"}`, bar.h)
    expect(!!bar.save && !!bar.cancel, "with Cancel and Save in it", { save: bar.save, cancel: bar.cancel })
    expect(!bar.oldState && bar.loose.length === 0, "and no state in the middle: no Unsaved changes, Live, Draft or New product to read", { oldState: bar.oldState, loose: bar.loose })
    expect(bar.announce?.live === "polite" && bar.announce.w <= 1, "a screen reader still hears Saving and Saved, from a hidden line", bar.announce)
    expect(bar.cancel.left === pad, "Cancel is at the start of the bar, on the column's edge", { left: bar.cancel.left, want: pad })
    expect(bar.save.right === pad, "Save is at the end", { right: bar.save.right, want: pad })
    expect(bar.cancel.h === H && bar.save.h === H, `Cancel and Save are both ${H}px`, { cancel: bar.cancel.h, save: bar.save.h })
    if (!isNew) expect(bar.more && bar.more.h === H && bar.more.w === H && bar.save.left - (bar.more.left + bar.more.w) === 8, `the more button is a ${H}px square, 8px before Save`, bar.more)
    expect(/inset/.test(bar.cancel.shadow) && bar.cancel.border === "1px" && bar.cancel.bg === "rgb(255, 255, 255)", "Cancel has depth: white, a hairline, a shade at its foot", { shadow: bar.cancel.shadow, border: bar.cancel.border, bg: bar.cancel.bg })
    if (!isNew) expect(/inset/.test(bar.more.shadow) && bar.more.border === "1px", "and so does the more button", { shadow: bar.more.shadow, border: bar.more.border })
    expect(bar.save?.disabled === true && !/rgba\(\d+, \d+, \d+, 0\.[1-9]|rgb\(/.test(bar.save.shadow.replace(/rgba\(0, 0, 0, 0\)/g, "")) && bar.save.bg !== "rgb(139, 92, 246)", "Save is flat and grey while there is nothing to save", { disabled: bar.save.disabled, bg: bar.save.bg, shadow: bar.save.shadow })
    expect(!bar.named && !bar.headingShown, "the bar shows no product name: it is in the title field", { named: bar.named, heading: bar.heading })
    expect(bar.heading === (isNew ? "New product" : "Edit product"), "a screen reader still hears which page this is", bar.heading)
    if (isPhone) {
      const want = isLayer ? inset : 0
      expect(bar.padTop === want, isLayer ? `first on the screen, it starts below the status bar (${inset}px of safe area)` : "under the app's header it adds no safe area of its own", { padTop: bar.padTop, inset })
      const reach = await p.evaluate(() => {
        const b = document.querySelector("[data-editor-bar]")
        const c = [...b.querySelectorAll("button")].find((x) => x.textContent.trim() === "Cancel")
        const r = c.getBoundingClientRect()
        const hit = (y) => document.elementFromPoint(r.left + r.width / 2, y)
        return { above: c.contains(hit(r.top - 1.5)), below: c.contains(hit(r.bottom + 1.5)), under: hit(r.bottom + 1.5)?.outerHTML.slice(0, 90) }
      })
      expect(reach.above && reach.below, "on a phone each takes a press 2px beyond its edge: a 44px target", reach)
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
    const saveState = () => p.evaluate(() => {
      const b = [...document.querySelectorAll("[data-editor-bar] button")].find((x) => x.textContent.trim() === "Save")
      const r = b.getBoundingClientRect()
      return {
        phase: b.dataset.phase,
        disabled: b.disabled,
        busy: b.getAttribute("aria-busy"),
        w: +r.width.toFixed(2),
        h: Math.round(r.height),
        bg: getComputedStyle(b).backgroundColor,
        label: getComputedStyle(b.querySelector("span")).opacity,
        spinner: !!b.querySelector("[data-activity-spinner]"),
        check: !!b.querySelector("[data-save-check]"),
        said: document.querySelector("[data-editor-announce]").textContent,
      }
    })
    if (isNew) {
      await p.click("#title", { clickCount: 1 })
      await p.keyboard.type("Film presets")
      await sleep(150)
      const moved = await geometry()
      const typed = await saveState()
      expect(typed.disabled === false && !/Film presets/.test(await p.$eval("[data-editor-bar]", (b) => b.innerText)), "typing a name lights Save up, and the name stays out of the bar", typed)
      expect(moved === resting, "and nothing in the bar moves or changes size", { resting, moved })
      await p.screenshot({ path: join(shots, `${label}-typed.png`) })
    }
    if (!isNew) {
      await p.click("#title", { clickCount: 1 })
      await p.keyboard.press("End")
      await p.keyboard.type("!")
      await sleep(150)
      const dirty = await saveState()
      expect(dirty.disabled === false && dirty.bg === "rgb(139, 92, 246)", "a change lights Save up, in the violet", dirty)
      const moved = await geometry()
      expect(moved === resting, "and nothing in the bar moves or changes size", { resting, moved })
      await p.screenshot({ path: join(shots, `${label}-dirty.png`) })
      await p.keyboard.press("Backspace")
      await sleep(150)
      const clean = await saveState()
      expect(clean.disabled === true, "undone, it is saved again", clean)

      /* A save, answered after 1200ms by a stand-in for the database. */
      await p.keyboard.type("!")
      await sleep(100)
      const idle = await saveState()
      ctx.fakeDb = true
      ctx.writes.length = 0
      /* Two presses in the same moment: one save. */
      await p.evaluate(() => {
        const b = [...document.querySelectorAll("[data-editor-bar] button")].find((x) => x.textContent.trim() === "Save")
        b.click()
        b.click()
      })
      await sleep(250)
      const saving = await saveState()
      await p.screenshot({ path: join(shots, `${label}-saving.png`) })
      expect(saving.phase === "saving" && saving.busy === "true" && saving.spinner && saving.label === "0", "saving: a spinner in place of the word, aria-busy", saving)
      expect(saving.w === idle.w && saving.h === idle.h, "and Save keeps its size to the hundredth of a pixel", { idle: [idle.w, idle.h], saving: [saving.w, saving.h] })
      expect(saving.bg === "rgb(139, 92, 246)" && saving.disabled === false, "and its colour: busy, not greyed", saving.bg)
      expect(saving.said === "Saving", "a screen reader hears Saving", saving.said)
      let saved = saving
      for (let i = 0; i < 100 && saved.phase !== "saved"; i++) {
        await sleep(50)
        saved = await saveState()
      }
      expect(saved.phase === "saved" && saved.check && saved.w === idle.w, "then a check, the same size", saved)
      expect(saved.said === "Saved", "and Saved is read out", saved.said)
      await p.screenshot({ path: join(shots, `${label}-saved.png`) })
      const patches = ctx.writes.filter((w) => w.method === "PATCH" && /\/rest\/v1\/products$/.test(w.url))
      expect(patches.length === 1, "two presses made one save", { patches: patches.length })
      const t0 = Date.now()
      let after = saved
      while (after.phase === "saved" && Date.now() - t0 < 3000) {
        await sleep(50)
        after = await saveState()
      }
      const held = Date.now() - t0
      expect(after.phase === "idle" && after.disabled === true && after.w === idle.w, "and back to a grey Save with nothing left to save", after)
      expect(held >= 600 && held <= 1100, "the check stays for about 900ms", { ms: held })
      ctx.fakeDb = false

      await p.keyboard.type("!")
      const before = requests.length
      await p.keyboard.down("Control")
      await p.keyboard.press("s")
      await p.keyboard.up("Control")
      await sleep(400)
      const tried = requests.slice(before).filter((u) => /\/rest\/v1\/products/.test(u)).length
      expect(tried > 0, "Ctrl and S saves", { requests: requests.slice(before) })
    }

    if (label === "phone-390" || label === "desktop-1280") {
      await p.reload({ waitUntil: "domcontentloaded" })
      await sleep(900)
      await leaving(p, label, vp, isPhone, ctx)
      await p.reload({ waitUntil: "domcontentloaded" })
      await sleep(900)
      await reorder(p, label, vp, isPhone, ctx)
      const faqWrites = await savedOrder(p, ctx)
      expect(faqWrites.ok, "the new order is what the save writes", faqWrites)
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
