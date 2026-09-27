/**
 * ===========================================================================
 *  THE TOOLBAR ROWS THAT SCROLL SIDEWAYS, MEASURED AT 360, 390, 768, 1280
 * ===========================================================================
 * "Add an arrow plus a smooth, clean edge fade at the horizontal scroll of
 * the toolbar buttons at the corner of the rich text editor." Every
 * formatting row in the app is components/app/rich-text/scroll-row.tsx;
 * this mounts the three that use it (scripts/render-rich-text-probe.tsx:
 * the description field, the Emails automation body, the email composer's
 * bar and the website builder's field) in Chromium and checks:
 *
 *   ends        where the row has more past an end, that end fades and an
 *               arrow shows in the fade, a 32px or larger target inside the
 *               window; where it has none, neither; a row that fits (the
 *               field from 640px, which wraps) has no fade and no arrow
 *   motion      the fade slides in over several frames (mask-position), it
 *               does not switch; an arrow press scrolls the row over
 *               several frames, not in one jump, and far enough to show
 *               what was cut off
 *   the caret   a press on an arrow, by mouse or by finger, keeps the
 *               selection in the text; Bold pressed afterwards bolds it; a
 *               keyboard shortcut lights its control at once
 *   layout      the controls do not move when the arrows come and go; the
 *               page never scrolls sideways
 *   the link    at 390 the link form is inside the window, 16px, 44px tall
 *
 *   node scripts/check-toolbar-scroll.mjs    (SHOTS_DIR=... keeps screenshots)
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const dir = join(root, ".toolbar-scroll-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-toolbar-scroll-")), "shots")
mkdirSync(shots, { recursive: true })

let server
const browsers = []
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PHONE = (width, height) => ({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

try {
  const css = await appCss(root)
  const fontDir = /url\(file:\/\/([^)]*\/media)\//.exec(interFaces(root))?.[1] ?? null
  const faces = fontDir ? interFaces(root).split(`file://${fontDir}/`).join("/__font/") : ""
  const bundle = join(dir, "probe.js")
  execFileSync(
    join(root, "node_modules/.bin/esbuild"),
    [
      join(root, "scripts/render-rich-text-probe.tsx"),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
      '--define:process.env.NODE_ENV="production"',
      `--alias:@=${root}`, "--loader:.css=empty",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  )
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (fontDir && req.url.startsWith("/__font/")) {
      const file = join(fontDir, req.url.slice(8).replace(/[^\w.-]/g, ""))
      if (existsSync(file)) {
        res.writeHead(200, { "content-type": "font/woff2" })
        return res.end(readFileSync(file))
      }
    }
    if (req.url.startsWith("/probe.js")) {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  /* A phone is a touch screen with no hover; a computer has a mouse. */
  const launch = (touch) => puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", ...(touch ? ["--blink-settings=availableHoverTypes=1,primaryHoverType=1,availablePointerTypes=2,primaryPointerType=2"] : [])],
  })
  const touchBrowser = await launch(true)
  const mouseBrowser = await launch(false)
  browsers.push(touchBrowser, mouseBrowser)

  const open = async (vp, query) => {
    const p = await (vp.hasTouch ? touchBrowser : mouseBrowser).newPage()
    const errors = []
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.setViewport(vp)
    await p.goto(`${origin}/?${query}`)
    await p.waitForFunction(() => window.__ready === true)
    await sleep(300)
    return { p, errors }
  }

  /** The state of the first scroll row inside `scope`: its fade, both arrows, the mask. */
  const ends = (p, scope) => p.evaluate((scope) => {
    const row = document.querySelector(`${scope} [data-scroll-row] > div`)
    const wrap = row.parentElement
    const arrow = (side) => {
      const a = wrap.querySelector(`[data-scroll-arrow=${side}]`)
      const r = a.getBoundingClientRect()
      const s = getComputedStyle(a)
      return { op: s.opacity, pe: s.pointerEvents, w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right) }
    }
    const cs = getComputedStyle(row)
    return {
      fade: row.dataset.fade,
      mask: cs.maskPosition || cs.webkitMaskPosition,
      x: Math.round(row.scrollLeft),
      max: row.scrollWidth - row.clientWidth,
      start: arrow("start"),
      end: arrow("end"),
    }
  }, scope)

  /** Frames of a property while something moves, read once per frame. */
  const frames = (p, scope, what, ms = 500) => p.evaluate((scope, what, ms) => new Promise((done) => {
    const row = document.querySelector(`${scope} [data-scroll-row] > div`)
    const out = []
    const t0 = performance.now()
    const tick = () => {
      out.push(what === "x" ? Math.round(row.scrollLeft) : getComputedStyle(row).maskPosition)
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else done(out)
    }
    requestAnimationFrame(tick)
  }), scope, what, ms)

  const toolBox = (p, scope, label) => p.$eval(`${scope} button[aria-label="${label}"]`, (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: Math.round(r.left), r: Math.round(r.right) } })
  const arrowAt = (p, scope, side) => p.$eval(`${scope} [data-scroll-arrow=${side}]`, (a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  const press = async (p, at) => (p.viewport().hasTouch ? p.touchscreen.tap(at.x, at.y) : p.mouse.click(at.x, at.y))
  const selection = (p) => p.evaluate(() => ({ text: String(document.getSelection()), inField: !!document.activeElement?.isContentEditable }))
  const sideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
  const shoot = async (p, scope, name) => {
    const el = await p.$(scope)
    await el.screenshot({ path: join(shots, `${name}.png`) })
  }

  /* ── The description field ── */
  const FIELD = ".rich-text-toolbar"
  const TEXT = ".rich-text-field [role=textbox]"
  for (const [label, vp] of [["360", PHONE(360, 740)], ["390", PHONE(390, 844)], ["768", { width: 768, height: 900 }], ["1280", { width: 1280, height: 900 }]]) {
    console.log(`\nThe description field, ${label}px`)
    const { p, errors } = await open(vp, "view=editor")
    const at0 = await ends(p, FIELD)
    const narrow = vp.width < 640
    if (narrow) {
      expect(at0.fade === "end" && at0.end.op === "1" && at0.end.pe === "auto" && at0.start.op === "0" && at0.start.pe === "none",
        "the far end fades with an arrow in it; the near end has neither", at0)
      expect(at0.end.w >= 32 && at0.end.h >= 32 && at0.end.r <= vp.width, "the arrow is a 32px or larger target, inside the window", at0.end)
      expect(/-48px/.test(at0.mask.split(",")[1] ?? ""), "the end's fade layer is slid over the edge", at0.mask)
      await shoot(p, FIELD, `field-${label}-start`)

      /* The controls do not move when the arrows come and go. */
      const before = await p.$$eval(`${FIELD} [data-toolbar-strip] > *`, (xs) => xs.map((x) => Math.round(x.getBoundingClientRect().left)))

      /* The fade slides in over frames, not in one step. */
      const sliding = frames(p, FIELD, "mask", 400)
      await p.evaluate((s) => { document.querySelector(`${s} [data-toolbar-strip]`).scrollLeft = 60 }, FIELD)
      const masks = await sliding
      const startLayer = [...new Set(masks.map((m) => m.split(",")[0].trim()))]
      expect(startLayer.length >= 3, "the start's fade slides in over several frames", startLayer)
      const mid = await ends(p, FIELD)
      expect(mid.fade === "both" && mid.start.op === "1" && mid.end.op === "1", "part way along, both ends fade and both arrows show", mid)
      await shoot(p, FIELD, `field-${label}-middle`)
      await p.evaluate((s) => { document.querySelector(`${s} [data-toolbar-strip]`).scrollLeft = 0 }, FIELD)
      await sleep(300)
      const after = await p.$$eval(`${FIELD} [data-toolbar-strip] > *`, (xs) => xs.map((x) => Math.round(x.getBoundingClientRect().left)))
      expect(JSON.stringify(before) === JSON.stringify(after), "and nothing on the row moved", { before: before.slice(0, 4), after: after.slice(0, 4) })

      /* A word selected, the arrow pressed: the row slides, the selection stays. */
      await p.click(TEXT)
      await p.keyboard.type("Hello world")
      for (let i = 0; i < 5; i++) await p.keyboard.down("Shift"), await p.keyboard.press("ArrowLeft"), await p.keyboard.up("Shift")
      const picked = await selection(p)
      expect(picked.text === "world", "the word is selected", picked)
      const moving = frames(p, FIELD, "x", 700)
      await press(p, await arrowAt(p, FIELD, "end"))
      const xs = await moving
      const steps = [...new Set(xs)]
      const end1 = await ends(p, FIELD)
      expect(steps.length >= 4 && end1.x > 150, "the end arrow slides the row along by most of a screen, over several frames", { frames: steps.length, x: end1.x, max: end1.max })
      expect(end1.start.op === "1", "and the start's arrow comes", end1.start)
      const kept = await selection(p)
      expect(kept.text === "world" && kept.inField, "the selection is still in the text after the arrow", kept)
      /* The last control, cut off before, is whole a press or two later. */
      for (let i = 0; i < 4 && (await ends(p, FIELD)).end.op === "1"; i++) await press(p, await arrowAt(p, FIELD, "end")), await sleep(700)
      const redo = await toolBox(p, FIELD, "Redo")
      const atEnd = await ends(p, FIELD)
      expect(atEnd.fade === "start" && atEnd.end.op === "0" && redo.r <= vp.width, "at the end the end's arrow and fade go, and Redo is whole", { fade: atEnd.fade, end: atEnd.end.op, redo })
      await shoot(p, FIELD, `field-${label}-end`)
      for (let i = 0; i < 4 && (await ends(p, FIELD)).start.op === "1"; i++) await press(p, await arrowAt(p, FIELD, "start")), await sleep(700)
      const back = await ends(p, FIELD)
      expect(back.x === 0 && back.fade === "end", "the start arrow brings it back", back)
      await press(p, await toolBox(p, FIELD, "Bold"))
      await sleep(120)
      const v = await p.evaluate(() => window.__value)
      expect(/Hello <(b|strong)>world<\/(b|strong)>/.test(v), "Bold after the arrows bolds the selected word", v)
    } else {
      expect(at0.fade === "none" && at0.start.op === "0" && at0.end.op === "0" && at0.start.pe === "none" && at0.end.pe === "none",
        "the row fits: no fade and no arrows, and nothing to press where they would be", at0)
      await p.click(TEXT)
      await p.keyboard.type("Hello world")
      for (let i = 0; i < 5; i++) await p.keyboard.down("Shift"), await p.keyboard.press("ArrowLeft"), await p.keyboard.up("Shift")
      await press(p, await toolBox(p, FIELD, "Bold"))
      await sleep(120)
      const v = await p.evaluate(() => window.__value)
      expect(/Hello <(b|strong)>world<\/(b|strong)>/.test(v), "Bold keeps the selection and bolds it", v)
      await p.keyboard.down("Control")
      await p.keyboard.press("i")
      await p.keyboard.up("Control")
      await sleep(120)
      const italic = await p.$eval(`${FIELD} button[aria-label="Italic"]`, (b) => b.getAttribute("aria-pressed"))
      expect(italic === "true" && /<i>world<\/i>|<i><(b|strong)>world|<(b|strong)><i>world/.test(await p.evaluate(() => window.__value)), "Ctrl and I italicises it, and Italic shows as pressed straight away", { italic, v: await p.evaluate(() => window.__value) })
      await shoot(p, FIELD, `field-${label}`)
    }
    expect((await sideways(p)) <= 0, "the page never scrolls sideways", await sideways(p))

    if (vp.width === 390) {
      /* The link form, under the toolbar, inside the window. Link is off
         the end of the row at first: the arrow brings it into reach. */
      for (let i = 0; i < 4; i++) {
        const [link, arrow] = [await toolBox(p, FIELD, "Link"), (await ends(p, FIELD)).end]
        if (arrow.op === "0" || link.r <= arrow.l) break
        await press(p, await arrowAt(p, FIELD, "end"))
        await sleep(700)
      }
      await press(p, await toolBox(p, FIELD, "Link"))
      await sleep(200)
      const form = await p.evaluate((w) => {
        const g = document.querySelector(".rich-text-field [role=group][aria-label=Link]")
        const parts = [g, ...g.querySelectorAll("input,button")].map((x) => x.getBoundingClientRect())
        const inputs = [...g.querySelectorAll("input")].map((x) => ({ fs: parseFloat(getComputedStyle(x).fontSize), h: Math.round(x.getBoundingClientRect().height) }))
        return { inside: parts.every((r) => r.left >= 0 && r.right <= w && r.width > 0), inputs, focus: document.activeElement?.getAttribute("aria-label") }
      }, vp.width)
      expect(form.inside && form.inputs.every((i) => i.fs >= 16 && i.h >= 44) && form.focus === "Link address", "the link form and each of its parts are inside the window, 16px, 44px tall, the address focused", form)
      await p.screenshot({ path: join(shots, `link-${label}.png`) })
    }
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  /* ── The Emails automation body: its own tools, and a word at the end ── */
  console.log("\nThe Emails automation body, 360px")
  {
    const { p, errors } = await open(PHONE(360, 740), "view=email&value=" + encodeURIComponent("<p>Hi {{first_name}},</p>"))
    const at0 = await ends(p, FIELD)
    const firstName = await p.$$eval(`${FIELD} button`, (bs) => { const b = bs.find((x) => x.textContent.trim() === "First name"); const r = b.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) } })
    expect(at0.fade === "end" && at0.end.op === "1", "the row is wider than the phone, so its end fades with an arrow", at0)
    await press(p, await arrowAt(p, FIELD, "end"))
    await sleep(700)
    const firstName2 = await p.$$eval(`${FIELD} button`, (bs) => { const b = bs.find((x) => x.textContent.trim() === "First name"); const r = b.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) } })
    const strip = await p.$eval(`${FIELD} [data-toolbar-strip]`, (s) => Math.round(s.getBoundingClientRect().right))
    expect(firstName2.r <= strip && firstName2.l < firstName.l, "one press on it brings First name whole into view", { before: firstName, after: firstName2, strip })
    await shoot(p, FIELD, "email-body-360")
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  /* ── The email composer's one bar ── */
  const BAR = "[data-format-bar]"
  for (const [label, vp, w] of [["360", PHONE(360, 740), null], ["768", { width: 768, height: 900 }, 720], ["768 narrow", { width: 768, height: 900 }, 520], ["1280, beside the preview", { width: 1280, height: 900 }, 600]]) {
    console.log(`\nThe email composer's bar, ${label}`)
    const { p, errors } = await open(vp, `view=bar${w ? `&w=${w}` : ""}`)
    const text = "[data-block-id=a] [data-email-text]"
    await p.click(text)
    await p.keyboard.press("End")
    for (let i = 0; i < 6; i++) await p.keyboard.down("Shift"), await p.keyboard.press("ArrowLeft"), await p.keyboard.up("Shift")
    await sleep(350)
    const at0 = await ends(p, BAR)
    await shoot(p, BAR, `bar-${label.split(",")[0]}-start`)
    if (at0.max <= 2) {
      expect(at0.fade === "none" && at0.start.op === "0" && at0.end.op === "0" && at0.end.pe === "none", "the bar fits: no fade and no arrows", at0)
    } else {
      expect(at0.fade === "end" && at0.end.op === "1" && at0.end.w >= 32 && at0.end.h >= 32 && at0.end.r <= vp.width, "the bar's row is cut at the end, so it fades there with a 32px or larger arrow", at0)
      const moving = frames(p, BAR, "x", 700)
      await press(p, await arrowAt(p, BAR, "end"))
      const steps = [...new Set(await moving)]
      const at1 = await ends(p, BAR)
      expect(steps.length >= 4 && at1.x > 0 && at1.start.op === "1", "the arrow slides it along over several frames, and the start's arrow comes", { frames: steps.length, x: at1.x })
      const kept = await selection(p)
      expect(kept.text === "studio" && kept.inField, "the selection stays in the text", kept)
      await shoot(p, BAR, `bar-${label.split(",")[0]}-end`)
    }
    for (let i = 0; i < 4 && (await ends(p, BAR)).start.op === "1"; i++) await press(p, await arrowAt(p, BAR, "start")), await sleep(700)
    await press(p, await toolBox(p, BAR, "Bold"))
    await sleep(150)
    const v = await p.evaluate(() => window.__value)
    expect(/<(b|strong)>studio<\/(b|strong)>/.test(v), "and Bold then bolds it", v)
    expect((await sideways(p)) <= 0 && errors.length === 0, "no sideways scroll, nothing in the console", { sideways: await sideways(p), errors })
    await p.close()
  }

  /* ── The website builder's field, in a narrow sidebar ── */
  for (const w of [220, 320]) {
    console.log(`\nThe website builder's field, ${w}px wide`)
    const { p, errors } = await open({ width: 1280, height: 800 }, `view=builder&w=${w}`)
    const at0 = await ends(p, "[data-builder-rich-text]")
    const fits = at0.max <= 2
    expect(fits ? at0.fade === "none" && at0.end.op === "0" : at0.fade === "end" && at0.end.op === "1", fits ? "it fits: no fade, no arrow" : "cut at the end: a fade and an arrow", at0)
    await shoot(p, "[data-builder-rich-text]", `builder-${w}`)
    expect(errors.length === 0, "nothing in the console", errors)
    await p.close()
  }

  console.log(`\nScreenshots: ${shots}`)
} finally {
  for (const b of browsers) await b.close().catch(() => {})
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
