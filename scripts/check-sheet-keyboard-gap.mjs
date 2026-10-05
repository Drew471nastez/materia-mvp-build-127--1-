/**
 * ===========================================================================
 *  NOTHING OF THE PAGE UNDER A SHEET ON THE KEYBOARD (image 66)
 * ===========================================================================
 * An iPhone on storelib.com: a community post open in the phone sheet, the
 * comment field tapped, the keyboard up, and between the bottom edge of the
 * sheet and the top of the keys a strip of the page showing through. The
 * cause is in lib/ui/keyboard-safe-sheet: Safari's visual viewport stops
 * above the floating form accessory bar, so `--kb-inset` is the keys plus
 * that bar, and a sheet that moves its whole panel up by it ends above the
 * keys with real screen underneath.
 *
 * This renders the real BottomSheet with `aboveKeyboard`, over a page of dark
 * photographs, and models three platforms the only honest way a headless
 * browser can:
 *
 *   safari     visualViewport.height shrinks and offsetTop may be > 0,
 *              window.innerHeight shrinks with it, and the layout probe (a
 *              fixed element, which is what ViewportVars measures) does NOT.
 *              An `over` setting makes the reported inset bigger than the
 *              keys by the accessory bar, which is image 66 exactly.
 *   webview    a WKWebView that reports nothing at all: the estimate floor
 *              in ViewportVars stands in, at half the screen, well over the
 *              real keyboard.
 *   android    the window itself resizes, so everything shrinks together and
 *              the inset is 0.
 *
 * In every one of them:
 *   - every pixel from the bottom of the sheet's content to the foot of the
 *     screen is the sheet's own white, read off a screenshot
 *   - the comment field and its send button are clear of the keys
 *   - the sheet's top edge is where the geometry says
 *   - opening and closing the keyboard four times leaves no gap and no jump,
 *     sampled every frame
 *
 *   PROBE_CSS=source node scripts/check-sheet-keyboard-gap.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-kbgap-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const W = 390
const H = 844
/* The keys themselves, and the floating accessory bar Safari counts as part
   of the obscured area but draws as a pill the page shows around. */
const KEYS = 336
const ACCESSORY = 74

const css = await appCss(root)
const fonts = interFaces(root)
const { build } = await import("esbuild")
const out = mkdtempSync(join(tmpdir(), "storelib-kbgap-build-"))
await build({
  entryPoints: [join(root, "scripts/render-sheet-keyboard-gap.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": "." },
  loader: { ".css": "empty" },
  outfile: join(out, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(out, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
writeFileSync(join(out, "index.html"), html)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

/**
 * The platform, installed before anything of the app runs so ViewportVars
 * measures it from its first reading. `__kb(px)` moves the modelled keyboard.
 */
const model = (kind) => `
  (() => {
    const vv = window.visualViewport
    const FULL = ${H}
    let keys = 0
    let over = 0
    let top = 0
    const realInnerHeight = window.innerHeight
    if (${JSON.stringify(kind)} !== "android") {
      Object.defineProperty(vv, "height", { configurable: true, get: () => ${JSON.stringify(kind)} === "webview" ? FULL : FULL - top - keys - over })
      Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => ${JSON.stringify(kind)} === "webview" ? 0 : top })
      Object.defineProperty(window, "innerHeight", { configurable: true, get: () => ${JSON.stringify(kind)} === "webview" ? FULL : FULL - keys - over })
    }
    /* A phone, so ViewportVars' floor is allowed to apply at all. */
    const mm = window.matchMedia.bind(window)
    window.matchMedia = (q) => (q === "(hover: none) and (pointer: coarse)" ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q))
    window.__kb = (k, extra = 0, panned = 0) => {
      keys = k
      over = k > 0 ? extra : 0
      top = k > 0 ? panned : 0
      vv.dispatchEvent(new Event("resize"))
      vv.dispatchEvent(new Event("scroll"))
    }
    /* What the user can really see: the top of the keys, in screen coordinates. */
    window.__keysTop = () => FULL - keys
    window.__real = () => ({ keys, over, top, innerHeight: window.innerHeight, vvHeight: vv.height, vvTop: vv.offsetTop, realInnerHeight })
  })()
`

const openSheet = async (p) => {
  await p.evaluate(() => window.__sheet.open())
  await sleep(600)
}

/**
 * Every pixel row of a band, from a screenshot: is it the sheet's white?
 *
 * The whole viewport, never a `clip`: a clipped screenshot captures beyond
 * the viewport, which resizes it, which is a `resize` event, which is
 * ViewportVars re-reading the keyboard. The picture then shows a layout the
 * measurements were never taken in.
 */
const bandIsWhite = async (p, fromY, toY) => {
  if (toY <= fromY) return { rows: 0, worst: 255, firstBad: null }
  const buf = await p.screenshot({ encoding: "base64" })
  return await p.evaluate(
    (b64, w, h, fromY) =>
      new Promise((res) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement("canvas")
          c.width = w
          c.height = h
          const x = c.getContext("2d")
          x.drawImage(img, 0, fromY, w, h, 0, 0, w, h)
          const d = x.getImageData(0, 0, w, h).data
          let worst = 255
          let firstBad = null
          for (let y = 0; y < h; y++) {
            for (let px = 0; px < w; px += 2) {
              const o = (y * w + px) * 4
              const v = Math.min(d[o], d[o + 1], d[o + 2])
              if (v < worst) worst = v
              if (v < 230 && firstBad === null) firstBad = { y: fromY + y, x: px, rgb: [d[o], d[o + 1], d[o + 2]] }
            }
          }
          res({ rows: h, worst, firstBad })
        }
        img.src = "data:image/png;base64," + b64
      }),
    buf,
    W,
    toY - fromY,
    fromY,
  )
}

const geometry = (p) =>
  p.evaluate(() => {
    const panel = document.querySelector("[data-sheet-panel]")
    const b = panel.getBoundingClientRect()
    const cs = getComputedStyle(panel)
    const pad = Math.round(Number.parseFloat(cs.paddingBottom))
    const field = document.querySelector("[data-comment-field]").getBoundingClientRect()
    const send = document.querySelector("[data-comment-send]").getBoundingClientRect()
    const scroller = (document.querySelector("[data-sheet-scroll]") ?? document.querySelector("[data-post-overlay]")).getBoundingClientRect()
    const kb = Math.round(Number.parseFloat(document.documentElement.style.getPropertyValue("--kb-inset")) || 0)
    /* Where `bottom: 0` lands, read off ViewportVars' own fixed probe rather
       than a number this file believes about the window. */
    const probe = document.querySelector("[data-viewport-probe]")
    const foot = probe ? Math.round(probe.getBoundingClientRect().bottom) : Math.round(window.innerHeight)
    const vvh = Math.round(Number.parseFloat(document.documentElement.style.getPropertyValue("--vv-h")) || 0)
    return {
      panelTop: Math.round(b.top),
      panelBottom: Math.round(b.bottom),
      columnBottom: Math.round(b.bottom - pad),
      pad,
      scrollerBottom: Math.round(scroller.bottom),
      fieldBottom: Math.round(field.bottom),
      sendBottom: Math.round(send.bottom),
      kb,
      vvh,
      foot,
      keysTop: window.__keysTop ? window.__keysTop() : null,
      radius: getComputedStyle(document.querySelector("[data-sheet-panel]")).borderTopLeftRadius,
      handle: (() => {
        const h = document.querySelector("[data-sheet-handle]")
        return h ? Math.round(h.getBoundingClientRect().top) : null
      })(),
    }
  })

/*
  The three platforms with the post sheet, then the two other shapes a sheet
  comes in on this phone: one sized by what is in it (the pickers, an order's
  sheet) and one that lays itself out and scrolls itself (the GIF picker).
*/
for (const [kind, shape] of [["safari", ""], ["webview", ""], ["android", ""], ["safari", "short"], ["safari", "fill"], ["safari", "noskirt"]]) {
  console.log(`\n── ${kind}${shape ? ` (${shape})` : ""} ──────────────────────────────────────────────`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await p.evaluateOnNewDocument(model(kind))
  await p.goto("file://" + join(out, "index.html") + (shape && shape !== "noskirt" ? `?${shape}` : ""), { waitUntil: "networkidle0" })
  /*
    ── A BROWSER THAT PAINTS NOTHING OUTSIDE THE PANEL'S BOX ───────────────
    The sheet carries a skirt: 160px of its own colour drawn BELOW its bottom
    edge, out of the layout, for a pull upward and for a phone whose safe
    area turns out to be bigger than it said. On the iPhone in image 66 that
    skirt was not painted. The sheet's white stopped dead at the panel's own
    bottom edge, 74pt above the keys, while the skirt would have carried it
    160px further and past them, so nothing of the page could have shown at
    all. WebKit composites a `contain`ed layer at its own box and does not
    expand it for what a child paints outside; Chromium does, which is why
    this has to be asked for rather than observed.

    Asked for, it is the honest test of the rule: a sheet may not depend on
    paint outside its own box to keep the page out of sight.
  */
  if (shape === "noskirt") await p.addStyleTag({ content: "[data-sheet-panel] > [aria-hidden] { display: none !important }" })
  await openSheet(p)

  const flat = await geometry(p)
  expect(flat.kb === 0 && flat.panelBottom === flat.foot, "no keyboard: the sheet's box ends at the foot of the screen", { kb: flat.kb, bottom: flat.panelBottom, foot: flat.foot })

  if (kind === "android") {
    /* The window itself shrinks: everything moves together and the inset is 0. */
    await p.setViewport({ width: W, height: H - KEYS, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await sleep(500)
  } else if (kind === "webview") {
    /* Nothing is reported. ViewportVars waits its deadline and stands in the floor. */
    await p.evaluate(() => document.querySelector("[data-comment-field]").focus())
    await sleep(900)
  } else {
    await p.evaluate(() => document.querySelector("[data-comment-field]").focus())
    await p.evaluate((k, a) => window.__kb(k, a), KEYS, ACCESSORY)
    await sleep(600)
  }

  /* The field is brought back into sight in its scroller, which is what
     keep-in-sight.ts does for the real comment box when the viewport moves. */
  await p.evaluate(() => document.querySelector("[data-comment-box]").scrollIntoView({ block: "end" }))
  await p.evaluate(() => { const s = document.querySelector("[data-sheet-scroll]") ?? document.querySelector("[data-post-overlay]"); if (s) s.scrollTop = s.scrollHeight })
  await sleep(100)
  const up = await geometry(p)
  const screenBottom = up.foot
  const keysTop = up.foot - (kind === "android" ? 0 : KEYS)
  const label = `${kind}${shape ? `-${shape}` : ""}`
  await p.screenshot({ path: join(shots, `${label}-keyboard.png`) })

  expect(up.panelBottom === screenBottom, "the sheet's box still reaches the foot of the screen with the keyboard up", { bottom: up.panelBottom, screenBottom, kb: up.kb })
  const band = await bandIsWhite(p, up.columnBottom, screenBottom)
  if (band.firstBad) await p.screenshot({ path: join(shots, `${label}-band-FAIL.png`) })
  expect(band.firstBad === null, "and every pixel from the end of its content to the foot of the screen is the sheet's own white", { rows: band.rows, worst: band.worst, firstBad: band.firstBad })
  expect(up.fieldBottom <= keysTop && up.sendBottom <= keysTop, "the comment field and its send button are above the top of the keys", { field: up.fieldBottom, send: up.sendBottom, keysTop })
  expect(up.columnBottom <= keysTop, "the content column ends above the keys", { columnBottom: up.columnBottom, keysTop })
  /* The post sheet asks for --vv-h less the status bar and a little: its top
     edge is the foot of the column less that height, exactly as when the
     whole panel was lifted. */
  if (shape === "short") {
    /* Sized by what is in it: the top edge is the content's own height above
       the column's foot, and the keyboard moves it by the inset exactly as a
       lifted panel did. */
    expect(up.panelTop === flat.panelTop - up.kb, "sized by its content, the sheet rises by the inset and no more", { top: up.panelTop, flat: flat.panelTop, kb: up.kb })
  } else {
    const column = Math.min(up.vvh - 12 - 8, up.vvh - 24)
    const wantTop = Math.max(0, screenBottom - column - up.kb)
    expect(Math.abs(up.panelTop - wantTop) <= 2, "the sheet's top edge is where the height it asked for puts it", { top: up.panelTop, wantTop, vvh: up.vvh, kb: up.kb })
  }
  expect(up.radius === "20px", "the rounded top corners are still 20px", up.radius)
  expect(up.handle !== null && up.handle >= up.panelTop && up.handle <= up.panelTop + 20, "the drag handle is still at the top edge", { handle: up.handle, top: up.panelTop })

  /* ── The keyboard opens and closes four times, sampled every frame ── */
  if (kind !== "android") {
    const frames = await p.evaluate(
      async (keys, extra, kind) => {
        const panel = document.querySelector("[data-sheet-panel]")
        const seen = []
        const sample = () => {
          const b = panel.getBoundingClientRect()
          const pad = Number.parseFloat(getComputedStyle(panel).paddingBottom)
          seen.push({ t: performance.now(), bottom: Math.round(b.bottom), top: Math.round(b.top), column: Math.round(b.bottom - pad) })
        }
        let stop = false
        const loop = () => { if (!stop) { sample(); requestAnimationFrame(loop) } }
        requestAnimationFrame(loop)
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        for (let i = 0; i < 4; i++) {
          if (kind === "webview") document.querySelector("[data-comment-field]").focus()
          else window.__kb(keys, extra)
          await wait(700)
          if (kind === "webview") document.querySelector("[data-comment-field]").blur()
          else window.__kb(0, 0)
          await wait(700)
        }
        stop = true
        return seen
      },
      KEYS,
      ACCESSORY,
      kind,
    )
    const bottoms = [...new Set(frames.map((f) => f.bottom))]
    expect(bottoms.length === 1 && bottoms[0] === up.foot, "four opens and closes: the sheet's painted bottom never leaves the foot of the screen", { bottoms, foot: up.foot, frames: frames.length })
    /* Only pairs a frame apart: a container under load drops frames, and two
       samples 120ms apart say nothing about how the browser drew what was in
       between. */
    let worstJump = 0
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].t - frames[i - 1].t > 24) continue
      worstJump = Math.max(worstJump, Math.abs(frames[i].column - frames[i - 1].column), Math.abs(frames[i].top - frames[i - 1].top))
    }
    const ends = [Math.min(...frames.map((f) => f.column)), Math.max(...frames.map((f) => f.column))]
    const between = frames.filter((f) => f.column > ends[0] + 4 && f.column < ends[1] - 4).length
    /*
      THE MOVE IS INTERPOLATED, which is the thing a container under load can
      still say honestly: eight keyboard moves, several drawn frames in each
      of them rather than one step from one value to the other. How big the
      largest step was is reported but not asserted, because a dropped frame
      on a busy machine makes that number the machine's and not the sheet's.
      The transition itself, which is what guarantees it on a phone, is
      checked on the panel below.
    */
    const moves = await p.evaluate(() => getComputedStyle(document.querySelector("[data-sheet-panel]")).transitionProperty)
    expect(
      between >= 3 * 8 && /padding-bottom/.test(moves) && /height/.test(moves),
      "and the content moves with the keyboard over frames rather than in one",
      { between, largestStep: worstJump, transitions: moves, frames: frames.length },
    )
    const tops = [...new Set(frames.map((f) => f.top))]
    /* The post sheet is as tall as the room, so its top edge stands still
       while the keyboard takes the room away from the bottom. A sheet sized
       by its content, or by a fixed height, rises with the keyboard exactly
       as it did when the whole panel was lifted. */
    if (!shape || shape === "noskirt") expect(tops.length === 1, "while the sheet's top edge does not move at all", { tops })
    else expect(Math.max(...tops) - Math.min(...tops) <= flat.panelTop + 4, "while the sheet's top edge rises by no more than the room it had", { span: Math.max(...tops) - Math.min(...tops), flat: flat.panelTop })
  }

  /* ── Safari's pan: the page scrolled under an open keyboard ── */
  if (kind === "safari") {
    await p.evaluate((k, a) => window.__kb(k, a, 0), KEYS, ACCESSORY)
    await sleep(500)
    await p.evaluate((k, a) => window.__kb(k, a, 90), KEYS, ACCESSORY)
    await sleep(500)
    const panned = await geometry(p)
    await p.screenshot({ path: join(shots, `${label}-panned.png`) })
    expect(panned.panelBottom === panned.foot, "panned 90px under the keyboard, the sheet still paints to the foot of the screen", { bottom: panned.panelBottom, foot: panned.foot, kb: panned.kb })
    const pb = await bandIsWhite(p, panned.columnBottom, panned.foot)
    expect(pb.firstBad === null, "and still nothing of the page under it", { worst: pb.worst, firstBad: pb.firstBad })
  }

  expect(errors.length === 0, "no page error", errors)
  await p.close()
}

await browser.close()
console.log(`\nPictures: ${shots}`)
if (broken) {
  console.error(`\n${broken} failed.\n`)
  process.exit(1)
}
console.log("\nAll good.\n")
