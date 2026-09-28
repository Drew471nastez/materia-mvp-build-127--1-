/**
 * ===========================================================================
 *  THE PRODUCT EDITOR, MEASURED
 * ===========================================================================
 * The real editor, mounted from the rows the server page hands it, inside a
 * copy of the /app frame with a stand-in for the phone's navigation pill.
 *
 *   FIRST FRAME. The product's name, pictures and files are in the first
 *   commit, with no request made to get them, and nothing moves after.
 *   NO SECTION TABS, at any width.
 *   THE BAR, BELOW 1024 (390 to 430, and 1000). One bar at the top, Cancel at
 *   the start and the more button and Save at the end, nothing written in the
 *   middle, one height for all three and a shade under Cancel and more; no
 *   bar at the foot of the screen for the pill to cover; one column of cards.
 *   FROM 1024 (1280, 1440, 1920). No top bar. A page header (back, the name,
 *   Live, more) and two columns in the 1200px page container, the main one
 *   two thirds, each card where it belongs; a white foot bar, sticky on the
 *   bottom edge across the content area and not the rail, with the state in
 *   words, Cancel and Save on the column edges; still on the edge half way
 *   down, and at the end the last card ends 32px above it. No sideways
 *   scroll, the rail whole. The header's back arrow asks before a change
 *   is thrown away, as Cancel does.
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
 *   mouse and by the keyboard, and the save writes the new order. So do the
 *   photos and videos: a swipe over the tiles scrolls, a hold lifts one
 *   where it is, a touchcancel restores, the remove button still removes,
 *   and the save writes the gallery and the cover in the new order.
 *   CANCEL AND BACK. Back on a saved product with nothing changed, Cancel
 *   after a change (which asks), Back and a grey Saved after a save.
 *   THE WAY OUT AND IN (`?route`, at 390 and 1280). The editor drops away over
 *   the list and rises over it as one view transition each way, stepped
 *   through a fifth at a time: no blank frame, 280 to 380ms, the list already
 *   drawn. (scripts/check-layer-motion.mjs times the same moves frame by frame
 *   on a slowed CPU.)
 *   Screenshots are named products-exit-*, products-enter-*.
 *   THE DESCRIPTION. A title change saves it untouched; typing in it lights
 *   Save, and the save sends it through the clean once and writes the result.
 *   The clean is a server action; here it is a stand-in that counts calls.
 *
 *   node scripts/check-product-editor.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

/* Save's colour when it can be pressed. Violet (#8b5cf6) until 7ea799ec made
   the app's primary actions near black (#1a1a2e, primaryDepth). */
const SAVE_INK = "rgb(26, 26, 46)"
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
/*
  WHICH BAR HOLDS SAVE. Below 1024px the top bar; from 1024 (lg) the foot bar
  along the bottom of the pane, and the more menu is in the page header. Set
  for each run by useBar().
*/
let BAR = "[data-editor-bar]"
let MORE = "[data-editor-bar] button[aria-label='More actions']"
let saveButton = `${BAR} [data-save-button]`
/* The bar's first button holds both of its words (Cancel and Back), one unseen, so it is found by its attribute. */
let leaveButton = `${BAR} [data-leave-button]`
const useBar = (width) => {
  const wide = width >= 1024
  BAR = wide ? "[data-editor-foot]" : "[data-editor-bar]"
  MORE = wide ? "[data-editor-head] button[aria-label='More actions']" : "[data-editor-bar] button[aria-label='More actions']"
  saveButton = `${BAR} [data-save-button]`
  leaveButton = `${BAR} [data-leave-button]`
}
/* This harness never leaves the page, where a real press takes the editor away: each press starts from an editor shown again (pageshow), which is what lifts the lock the last one left. */
const pressLeave = async (p) => {
  await p.evaluate(() => window.dispatchEvent(new Event("pageshow")))
  await new Promise((r) => setTimeout(r, 30))
  return p.$eval(leaveButton, (b) => b.click())
}
const leaveMode = (p) => p.$eval(leaveButton, (b) => b.dataset.mode)
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
  /* Opened directly (no list behind it in this harness), the way out puts the list in its place. */
  const pushes = () => p.evaluate(() => (window.__router || []).filter(([k, a]) => (k === "replace" && a === "/app/products") || k === "back" || k === "push").length)
  /* Open means seen: on a phone the sheet is built ahead and kept (BottomSheet keepMounted), so at rest it is in the page, invisible and unmarked. */
  const open = () => p.evaluate(() => {
    const s = document.querySelector("[data-confirm-sheet]")
    if (!s || getComputedStyle(s).visibility === "hidden") return false
    const layer = s.closest("[data-app-sheet]")
    return !layer || layer.dataset.appSheet === "open"
  })

  const p0 = await pushes()
  const restMode = await leaveMode(p)
  expect(restMode === "back", "with nothing changed on a saved product, the first button is Back", restMode)
  await pressLeave(p)
  await sleep(650)
  expect((await pushes()) === p0 + 1 && !(await open()), "and it goes straight back to Products", { pushes: (await pushes()) - p0 })
  /* The press is answered at once: the button holds a spinner and takes no second press. */
  const answered = await p.evaluate((sel) => !!document.querySelector(`${sel}[data-leaving] [role=status]`), leaveButton)
  expect(answered, "the press is answered at once, with a spinner in the button", answered)
  /* A real Back takes the editor away; this harness stays. Shown again (the back cache's pageshow), the editor comes back to life. */
  await p.evaluate(() => window.dispatchEvent(new Event("pageshow")))
  await sleep(50)

  /* The more menu names the state the bar used to. */
  await p.click(MORE)
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
  const dirtyMode = await leaveMode(p)
  expect(dirtyMode === "cancel", "a change turns Back into Cancel", dirtyMode)
  await pressLeave(p)
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
    expect(/inset/.test(keep?.shadow ?? "") && discard?.bg === "rgb(26, 26, 46)", "Keep editing has the same depth as Cancel, Discard is near black, never red", { keep: keep?.shadow, discard: discard?.bg })
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
    await pressLeave(p)
    await sleep(700)
    const cdp = await p.createCDPSession()
    const grab = await p.evaluate(() => {
      /* The open sheet's handle: the others are built ahead and kept, out of sight. */
      const h = document.querySelector('[data-app-sheet="open"] [data-sheet-handle]').getBoundingClientRect()
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

  /* From lg the page header's back arrow is a way out too, and asks the same question. */
  if (vp.width >= 1024) {
    await p.click("[data-editor-head] button[aria-label='Back to products']")
    await sleep(400)
    const asked = await p.evaluate(() => document.querySelector("[data-confirm-sheet]")?.closest("[data-sheet-panel]")?.querySelector("h2")?.textContent ?? document.querySelector("[data-confirm-sheet] h2")?.textContent ?? null)
    expect(asked === "Discard changes?" && (await pushes()) === p1, "the header's back arrow asks before a change is thrown away", { asked, pushes: (await pushes()) - p1 })
    await pressText(p, "[data-confirm-sheet] button", "Keep editing")
    await sleep(600)
    expect(!(await open()) && (await pushes()) === p1, "and Keep editing stays", { pushes: (await pushes()) - p1 })
  }

  await pressLeave(p)
  await sleep(isPhone ? 700 : 400)
  await pressText(p, "[data-confirm-sheet] button", "Discard")
  await sleep(650)
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
  /* The FAQ card is folded to one line until it is opened. */
  const folded = await p.evaluate(() => ({ list: !!document.querySelector("[data-faq-list]"), show: !!document.querySelector("[data-faq-show]") }))
  expect(!folded.list && folded.show, "the questions are folded to one line until Show", folded)
  await p.evaluate(() => document.querySelector("[data-faq-show]")?.click())
  await sleep(250)
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

/* The media grid's order, as the hue of each test picture (render-product-editor: 260, 20, 160). */
const mediaOrder = (p) => p.$$eval("[data-media-grid] > [data-media-id]", (els) => els.map((e) => {
  const src = decodeURIComponent(e.querySelector("img").getAttribute("src"))
  return (src.match(/hsl\((\d+)/) || [])[1] || "?"
}))
const gridAt = (p, y) => p.evaluate((y) => {
  const pane = document.querySelector("[data-product-editor]")
  const grid = document.querySelector("[data-media-grid]")
  pane.scrollTop += grid.getBoundingClientRect().top - y
}, y)
const tiles = (p) => p.$$eval("[data-media-grid] > [data-media-id]", (els) => els.map((e) => {
  const r = e.getBoundingClientRect()
  return { id: e.dataset.mediaId, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height }
}))

/**
 * THE PHOTOS AND VIDEOS, REORDERED. On a phone with real touch events: a
 * quick swipe over the tiles scrolls the page; a 300ms hold lifts a tile,
 * which follows the finger one to one in both directions; the drop commits;
 * a touchcancel puts it back; a tap on the remove button still removes. On a
 * computer, a mouse drag and the keyboard. Then the save writes the order.
 */
async function mediaReorder(p, label, vp, isPhone, ctx) {
  console.log(`  -- The photos and videos, reordered`)
  const start = await mediaOrder(p)
  expect(same(start, ["260", "20", "160"]), "three pictures to move", start)
  let want
  if (isPhone) {
    const cdp = await p.createCDPSession()
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] })
    const ta = await p.$eval("[data-media-handle]", (h) => getComputedStyle(h).touchAction)
    expect(ta === "manipulation", "a tile leaves vertical swipes to the browser (touch-action: manipulation, was none)", ta)

    /* A swipe up over the pictures, no hold. */
    await gridAt(p, 420)
    await sleep(100)
    let t = await tiles(p)
    const s0 = await paneTop(p)
    await touch("touchStart", t[1].x, t[1].y)
    let liftedBySwipe = false
    for (let k = 1; k <= 10; k++) {
      await sleep(16)
      await touch("touchMove", t[1].x, t[1].y - k * 24)
      liftedBySwipe ||= !!(await p.$("[data-media-grid] [data-lifted]"))
    }
    await touch("touchEnd")
    await sleep(700)
    const s1 = await paneTop(p)
    expect(s1 - s0 >= 100 && !liftedBySwipe && same(await mediaOrder(p), start), "a quick swipe over the tiles scrolls the page and moves no picture", { scrolled: s1 - s0, lifted: liftedBySwipe })

    /* A hold on the first, then to where the third is: down a row. */
    await gridAt(p, 220)
    await sleep(100)
    t = await tiles(p)
    const sA = await paneTop(p)
    const dx = t[2].x - t[0].x
    const dy = t[2].y - t[0].y
    await touch("touchStart", t[0].x, t[0].y)
    await sleep(150)
    const early = !!(await p.$("[data-media-grid] [data-lifted]"))
    await sleep(250)
    const lifted = await p.evaluate(() => {
      const el = document.querySelector("[data-media-grid] [data-lifted]")
      return el ? el.dataset.mediaId : null
    })
    expect(!early && lifted === t[0].id, "not lifted at 150ms, lifted by 400ms", { at150: early, at400: lifted })
    await sleep(200)
    const look = await p.$eval("[data-media-grid] [data-lifted] [data-media-tile]", (e) => ({ scale: getComputedStyle(e).scale, shadow: /rgba\(17, 24, 39, 0\.35\)/.test(getComputedStyle(e).boxShadow), opacity: getComputedStyle(e.parentElement).opacity }))
    expect(look.scale === "1.03" && look.shadow && look.opacity === "1", "it lifts where it is: 3% larger, a shadow, fully visible (it used to leave a dashed hole)", look)
    const steps = 16
    const samples = []
    for (let k = 1; k <= steps; k++) {
      const fx = Math.round((dx * k) / steps)
      const fy = Math.round((dy * k) / steps)
      await touch("touchMove", t[0].x + fx, t[0].y + fy)
      await sleep(16)
      if (k % 4 === 0) {
        samples.push(await p.evaluate((fx, fy) => {
          const m = new DOMMatrix(getComputedStyle(document.querySelector("[data-media-grid] [data-lifted]")).transform)
          return { fx, fy, tx: Math.round(m.m41), ty: Math.round(m.m42), scroll: Math.round(document.querySelector("[data-product-editor]").scrollTop) }
        }, fx, fy))
      }
    }
    await sleep(250)
    await p.screenshot({ path: join(shots, `${label}-media-dragging.png`) })
    const worst = Math.max(...samples.map((s) => Math.max(Math.abs(s.tx - s.fx), Math.abs(s.ty - (s.fy + s.scroll - sA)))))
    expect(worst <= 1, "the tile follows the finger one to one", { worstPx: worst, samples: samples.slice(-2) })
    expect(samples.every((s) => s.scroll === sA), "and the page does not scroll under it", { from: sA, to: samples.map((s) => s.scroll) })
    await touch("touchEnd")
    await sleep(500)
    want = [start[1], start[2], start[0]]
    expect(same(await mediaOrder(p), want), "dropped, the first picture is third and the second is the thumbnail", await mediaOrder(p))
    const thumb = await p.evaluate(() => [...document.querySelectorAll("[data-media-grid] > [data-media-id]")].findIndex((e) => /Thumbnail/.test(e.textContent)))
    expect(thumb === 0, "the Thumbnail label stays on the first tile", thumb)

    /* A touchcancel mid drag. */
    await gridAt(p, 220)
    await sleep(100)
    t = await tiles(p)
    await touch("touchStart", t[0].x, t[0].y)
    await sleep(400)
    for (let k = 1; k <= 10; k++) {
      await touch("touchMove", t[0].x + k * 10, t[0].y + k * 12)
      await sleep(16)
    }
    await touch("touchCancel")
    await sleep(500)
    expect(same(await mediaOrder(p), want) && !(await p.$("[data-media-grid] [data-lifted]")), "a touchcancel puts the pictures back as they were", await mediaOrder(p))

    /* A tap on a picture does nothing; a tap on its remove button removes it. */
    await gridAt(p, 220)
    await sleep(100)
    t = await tiles(p)
    await touch("touchStart", t[1].x, t[1].y)
    await sleep(60)
    await touch("touchEnd")
    await sleep(300)
    expect(same(await mediaOrder(p), want), "a tap on a picture moves nothing", await mediaOrder(p))
    const x = await p.$$eval("[data-media-grid] [data-media-remove]", (bs) => {
      const r = bs[2].getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    await touch("touchStart", x.x, x.y)
    await sleep(60)
    await touch("touchEnd")
    await sleep(400)
    want = want.slice(0, 2)
    expect(same(await mediaOrder(p), want), "a tap on the remove button still removes that picture", await mediaOrder(p))
  } else {
    await gridAt(p, 220)
    await sleep(100)
    const t = await tiles(p)
    await p.mouse.click(t[0].x, t[0].y)
    await sleep(200)
    expect(same(await mediaOrder(p), start) && !(await p.$("[data-media-grid] [data-lifted]")), "a click on a picture moves nothing")
    await p.mouse.move(t[0].x, t[0].y)
    await p.mouse.down()
    for (let k = 1; k <= 12; k++) {
      await p.mouse.move(t[0].x + Math.round(((t[1].x - t[0].x) * k) / 12), t[0].y)
      await sleep(16)
    }
    await sleep(250)
    const scale = await p.evaluate(() => {
      const e = document.querySelector("[data-media-grid] [data-lifted] [data-media-tile]")
      return e ? getComputedStyle(e).scale : null
    })
    await p.screenshot({ path: join(shots, `${label}-media-dragging.png`) })
    await p.mouse.up()
    await sleep(500)
    const m1 = await mediaOrder(p)
    expect(scale === "1.03" && same(m1, [start[1], start[0], start[2]]), "a mouse drags a picture across, lifted, and drops it second", { scale, order: m1 })
    await p.focus("[data-media-grid] [data-media-handle]")
    await p.keyboard.press("Space")
    await sleep(300)
    await p.keyboard.press("ArrowDown")
    await sleep(350)
    await p.keyboard.press("Space")
    await sleep(500)
    want = await mediaOrder(p)
    expect(same(want, [m1[1], m1[2], m1[0]]), "and the keyboard moves one down a row: Space, Down, Space", want)
    const live = await p.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).find((x) => /Photo/.test(x)) ?? "")
    expect(/position 3 of 3/.test(live), "in words a screen reader can use", live)
  }

  /* The save writes that order: the gallery, and the first as the cover. */
  ctx.fakeDb = true
  ctx.writes.length = 0
  await p.$eval(saveButton, (b) => b.click())
  let patch = null
  for (let i = 0; i < 60 && !patch; i++) {
    await sleep(50)
    patch = ctx.writes.find((w) => w.method === "PATCH" && /\/rest\/v1\/products$/.test(w.url))
  }
  ctx.fakeDb = false
  let body = {}
  try { body = JSON.parse(patch?.body ?? "{}") } catch {}
  const hue = (u) => (decodeURIComponent(u || "").match(/hsl\((\d+)/) || [])[1] || "?"
  const gallery = (body.gallery_urls ?? []).map(hue)
  expect(same(gallery, want) && hue(body.thumbnail_url) === want[0], "the save writes the pictures in that order, the first as the cover", { gallery, cover: hue(body.thumbnail_url), want })
  await sleep(1500)
}

/**
 * THE DESCRIPTION (components/app/rich-text-editor.tsx). Saving with only the
 * title changed sends the stored description back untouched, with no trip to
 * the clean. Typing in the description marks the form changed, and the save
 * sends it through cleanDescription (stood in for by the harness, which
 * counts its calls) and writes what comes back.
 */
async function describe(p, ctx) {
  console.log(`  -- The description`)
  const box = '[data-product-editor] [role="textbox"][contenteditable]'
  const cleans = () => p.evaluate(() => window.__descriptionCleans || 0)
  const saveOnce = async () => {
    ctx.fakeDb = true
    ctx.writes.length = 0
    await p.$eval(saveButton, (b) => b.click())
    let patch = null
    for (let i = 0; i < 80 && !patch; i++) {
      await sleep(50)
      patch = ctx.writes.find((w) => w.method === "PATCH" && /\/rest\/v1\/products$/.test(w.url))
    }
    for (let i = 0; i < 100 && (await p.$eval(saveButton, (b) => b.dataset.phase)) !== "idle"; i++) await sleep(50)
    ctx.fakeDb = false
    try { return JSON.parse(patch?.body ?? "null") } catch { return null }
  }

  const stored = await p.$eval(box, (e) => e.innerText.trim().slice(0, 80))
  expect(/^Forty presets made on real client sessions/.test(stored), "the saved description is in the editor", stored)

  /* Only the title changed: the stored description goes back as it is. */
  await p.click("#title", { clickCount: 1 })
  await p.keyboard.press("End")
  await p.keyboard.type("!")
  await sleep(150)
  const before = await cleans()
  const titleOnly = await saveOnce()
  expect(!!titleOnly && (await cleans()) === before && /Forty presets made on real client sessions/.test(titleOnly.description), "a title change saves the description untouched, without cleaning it again", { cleans: (await cleans()) - before })

  /* Typing in the description. */
  await p.$eval(box, (e) => e.scrollIntoView({ block: "center" }))
  await sleep(150)
  const clean0 = await p.$eval(saveButton, (b) => b.disabled)
  await p.focus(box)
  await p.evaluate((sel) => {
    const e = document.querySelector(sel)
    const r = document.createRange()
    r.selectNodeContents(e)
    r.collapse(false)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }, box)
  await p.keyboard.type(" Tested on film scans too.")
  await sleep(250)
  const dirty = await p.$eval(saveButton, (b) => b.disabled)
  expect(clean0 === true && dirty === false, "typing in the description marks the form changed: Save lights up", { before: clean0, after: dirty })
  const c0 = await cleans()
  const saved = await saveOnce()
  const sent = saved?.description ?? ""
  expect((await cleans()) === c0 + 1, "Save sends the description through the clean once", { cleans: (await cleans()) - c0 })
  expect(/Tested on film scans too\./.test(sent) && /^<p>/.test(sent) && !/contenteditable|<div|style=/.test(sent), "and writes the cleaned HTML, with the new words in it", sent.slice(-120))
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

/**
 * THE WAY BACK, AND IN AGAIN, FRAME BY FRAME. The routed harness (`?route`)
 * draws the editor in its PageLayer with a two address router, so Back runs
 * the real moveLayer against a real commit. The move's own animations are
 * paused as soon as it is ready and stepped through by hand: at each fifth a
 * screenshot, and in it the share of the content area (under the header,
 * over the pill) that is not bare page or white, which is what a blank frame
 * would be. The list must already be in the DOM under the move's first
 * frame, the layer gone, and the duration on the iOS curve within 280 to 380ms.
 */
const PAGE_BG = [248, 249, 250]
/* Decoded in the page itself, off the DOM: a second tab would hide this one, and a hidden page skips its view transition. */
async function inkOf(p, png, top, bottom) {
  return p.evaluate(async (b64, top, bottom, bg) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(img.width, img.height)
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    const scale = img.width / innerWidth
    const y0 = Math.round(top * scale)
    const y1 = Math.round(bottom * scale)
    const d = g.getImageData(0, y0, c.width, y1 - y0).data
    let ink = 0
    const near = (i, [r, gg, bb]) => Math.abs(d[i] - r) <= 6 && Math.abs(d[i + 1] - gg) <= 6 && Math.abs(d[i + 2] - bb) <= 6
    for (let i = 0; i < d.length; i += 4) if (!near(i, bg) && !near(i, [255, 255, 255])) ink++
    return +(ink / (d.length / 4)).toFixed(4)
  }, png, top, bottom, PAGE_BG)
}

async function watchMoves(p) {
  await p.evaluate(() => {
    window.__moves = []
    const start = document.startViewTransition?.bind(document)
    if (!start) return
    document.startViewTransition = (cb) => {
      const t = start(cb)
      const m = { at: performance.now() }
      window.__moves.push(m)
      t.ready.then(() => { m.ready = performance.now() }, () => { m.skipped = true })
      t.finished.then(() => { m.done = performance.now() })
      return t
    }
  })
}

/** Waits for the move that just began to be ready, pauses it, and walks it. */
async function walkMove(p, browser, label, name, vp, which, before) {
  let m = null
  for (let i = 0; i < 60; i++) {
    m = await p.evaluate((n) => window.__moves[n] ?? null, before)
    if (m && (m.ready || m.skipped)) break
    await sleep(20)
  }
  const out = { ready: !!m?.ready, skipped: !!m?.skipped, waited: m?.ready ? +(m.ready - m.at).toFixed(1) : null }
  if (!m?.ready) return out
  const info = await p.evaluate(() => {
    const all = document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith("::view-transition"))
    for (const a of all) a.pause()
    return all.map((a) => {
      const t = a.effect.getTiming()
      return { el: a.effect.pseudoElement, name: a.animationName, dur: t.duration, easing: a.effect.getKeyframes()[0]?.easing ?? t.easing, frames: a.effect.getKeyframes().map((k) => ({ transform: k.transform, opacity: k.opacity })) }
    })
  })
  out.animations = info
  out.under = await p.evaluate(() => ({
    layer: !!document.querySelector("[data-page-layer]"),
    rows: document.querySelectorAll("[data-list] > [data-row]:not([hidden]), tbody > [data-row]:not([hidden])").length,
    motion: document.documentElement.dataset.layerMotion ?? null,
    path: window.__path,
    /* The edited product's row, read as the move begins: its tint runs 1.5s, less than stepping through the move can take. */
    tinted: (() => {
      const row = [...document.querySelectorAll(`[data-row="8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6"]`)].find((r) => r.getClientRects().length > 0)
      return row ? [row, ...row.children].some((el) => el.getAnimations().some((a) => a.effect.getKeyframes().some((k) => k.backgroundColor))) : false
    })(),
  }))
  const moving = info.find((a) => a.el === which)
  const dur = moving ? Number(moving.dur) : 0
  out.frames = []
  const cdp = await p.createCDPSession()
  const top = vp.width >= 768 ? 70 : 80
  const bottom = vp.height - (vp.width >= 768 ? 10 : 90)
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    await p.evaluate((ms) => {
      for (const a of document.getAnimations()) if (a.effect?.pseudoElement?.startsWith("::view-transition")) a.currentTime = ms
    }, f * dur)
    /* The protocol's own capture: puppeteer's screenshot() waits on a frame the paused move never asks for. */
    const { data: png } = await cdp.send("Page.captureScreenshot", { format: "png" })
    const file = `products-${name}-${label}-${String(Math.round(f * 100)).padStart(3, "0")}.png`
    writeFileSync(join(shots, file), Buffer.from(png, "base64"))
    out.frames.push({ at: f, ink: await inkOf(p, png, top, bottom) })
  }
  await p.evaluate(() => {
    for (const a of document.getAnimations()) if (a.effect?.pseudoElement?.startsWith("::view-transition")) a.play()
  })
  for (let i = 0; i < 50; i++) {
    const done = await p.evaluate(() => window.__moves[window.__moves.length - 1]?.done ?? null)
    if (done) break
    await sleep(20)
  }
  return out
}

/** What is on the screen now, the same reading walkMove takes under a move's first frame. */
async function readUnder(p) {
  return p.evaluate(() => ({
    layer: !!document.querySelector("[data-page-layer]"),
    rows: document.querySelectorAll("[data-list] > [data-row]:not([hidden]), tbody > [data-row]:not([hidden])").length,
    motion: document.documentElement.dataset.layerMotion ?? null,
    path: window.__path,
    tinted: (() => {
      const row = [...document.querySelectorAll(`[data-row="8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6"]`)].find((r) => r.getClientRects().length > 0)
      return row ? [row, ...row.children].some((el) => el.getAnimations().some((a) => a.effect.getKeyframes().some((k) => k.backgroundColor))) : false
    })(),
  }))
}

/*
  FROM 768px THERE IS NO MOVE. The editor is a page in the shell there, under
  the header and beside the rail (components/app/page-layer.tsx phoneOnly),
  and a view transition would take the header and the rail with it: moveLayer
  navigates at once and the stage lands the page as it lands any other. So
  on a computer each way is read once it has landed: no transition started,
  the page there, and the same list state as on a phone.
*/
async function landedWithoutMove(p, from) {
  const seen = p.evaluate(() => new Promise((resolve) => {
    let moved = false
    const t0 = performance.now()
    const tick = () => {
      if (document.getAnimations().some((a) => /page-layer/.test(a.effect?.pseudoElement || ""))) moved = true
      if (performance.now() - t0 > 240) resolve(moved)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
  const layerMoved = await seen
  return { moves: (await p.evaluate(() => window.__moves.length)) - from, layerMoved, under: await readUnder(p) }
}

async function routeTrip(p, browser, label, vp, isPhone) {
  console.log(`  -- Back to the list, and in again, frame by frame`)
  await watchMoves(p)
  const pre = await p.evaluate(() => (window.__router || []).filter(([k]) => k === "prefetch").map(([, a]) => a))
  expect(pre.includes("/app/products full"), "the editor fetches the list ahead, in full, as it opens", pre)
  expect((await leaveMode(p)) === "back", "a saved product with nothing changed opens with Back", await leaveMode(p))

  const moveCount = () => p.evaluate(() => window.__moves.length)
  let n = await moveCount()
  const calls = () => p.evaluate(() => (window.__router || []).filter(([k]) => k === "push" || k === "replace" || k === "back").map(([k, a]) => (a ? `${k} ${a}` : k)))
  const hist = () => p.evaluate(() => ({ stack: [...window.__hist.stack], at: window.__hist.at, path: location.pathname }))
  let c0 = (await calls()).length
  await pressLeave(p)
  const back = isPhone ? await walkMove(p, browser, label, "exit", vp, "::view-transition-old(page-layer)", n) : await landedWithoutMove(p, n)
  const first = { calls: (await calls()).slice(c0), hist: await hist() }
  expect(first.calls.join() === "replace /app/products" && first.hist.stack.join() === "/app/products" && first.hist.at === 0 && first.hist.path === "/app/products",
    "opened directly, with no list behind it, Back puts the list in the editor's place: nothing to come back to", first)
  if (isPhone) expect(back.ready && !back.skipped, "Back runs as one move, ready without waiting on anything", { ready: back.ready, skipped: back.skipped, waitedMs: back.waited })
  else expect(!back.layerMoved && !back.under.layer && back.under.rows > 0 && back.under.path === "/app/products" && back.under.motion === null,
    "on a computer Back is no move: the list lands in the shell like any other page", back)
  if (isPhone && back.ready) {
    const old = back.animations.find((a) => a.el === "::view-transition-old(page-layer)")
    const neu = back.animations.find((a) => a.el === "::view-transition-new(root)")
    console.log(`        (exit: ${JSON.stringify(old)})`)
    expect(!!old && old.dur >= 280 && old.dur <= 380 && /0\.32, 0\.72, 0, 1/.test(old.easing), "the editor leaves in 280 to 380ms on the iOS curve", old && { ms: old.dur, easing: old.easing })
    expect(!!old && old.frames.every((k) => k.transform !== undefined || k.opacity !== undefined), "on transform and opacity alone", old?.frames)
    expect(/translateY\(100%\)/.test(JSON.stringify(old?.frames)) && !/translateX/.test(JSON.stringify(old?.frames)), "on a phone it drops to the bottom edge, never sideways", old?.frames)
    expect(!neu || neu.name === "none" || neu.frames.length === 0, "the list under it holds still", neu)
    expect(!back.under.layer && back.under.rows > 0 && back.under.path === "/app/products" && back.under.motion === "leave", "the list is already drawn under the move's first frame, and the layer is gone", back.under)
    const inks = back.frames.map((f) => f.ink)
    const floor = Math.min(inks[0], inks[inks.length - 1]) * 0.5
    expect(inks.every((v) => v >= floor && v > 0.01), "no blank frame: every fifth of the move has the editor, the list or both in it", { inks, floor: +floor.toFixed(4) })
  }
  await sleep(120)
  const after = await p.evaluate((id) => {
    const row = [...document.querySelectorAll(`[data-row="${id}"]`)].find((r) => r.getClientRects().length > 0)
    const tinted = row ? [row, ...row.children].some((el) => el.getAnimations().some((a) => a.effect.getKeyframes().some((k) => k.backgroundColor))) : false
    return { path: window.__path, motion: document.documentElement.dataset.layerMotion ?? null, tinted, rows: document.querySelectorAll("[data-row]:not([hidden])").length }
  }, "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6")
  expect(after.path === "/app/products" && after.motion === null, "then the list is the page, and the move has cleaned up after itself", after)
  expect(back.under?.tinted === true, "the row just edited is tinted as the list comes back", back.under?.tinted)
  await p.screenshot({ path: join(shots, `products-exit-${label}-landed.png`) })

  /* The list keeps its view across the trip. */
  await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Draft")?.click())
  await sleep(350)

  /* In again: a press on a row. */
  n = await moveCount()
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => r.getClientRects().length > 0)
    const r = rows[0]
    if (r.tagName === "TR") r.querySelector("td:nth-child(2)").click()
    else r.querySelector("a").click()
  })
  const into = isPhone ? await walkMove(p, browser, label, "enter", vp, "::view-transition-new(page-layer)", n) : await landedWithoutMove(p, n)
  if (isPhone) expect(into.ready && !into.skipped, "opening a product is the same move the other way", { ready: into.ready, waitedMs: into.waited })
  else expect(!into.layerMoved && into.under.layer && into.under.motion === null, "and opening a product is no move either: the editor lands in the shell", into)
  if (isPhone && into.ready) {
    const neu = into.animations.find((a) => a.el === "::view-transition-new(page-layer)")
    console.log(`        (enter: ${JSON.stringify(neu)})`)
    expect(!!neu && neu.dur >= 280 && neu.dur <= 380 && /0\.32, 0\.72, 0, 1/.test(neu.easing) && /translateY\(100%\)/.test(JSON.stringify(neu.frames)), "it rises from the bottom edge in 280 to 380ms on the same curve", neu && { ms: neu.dur, easing: neu.easing, frames: neu.frames })
    expect(into.under.layer, "the editor is committed under the move's first frame", into.under)
    const inks = into.frames.map((f) => f.ink)
    const floor = Math.min(inks[0], inks[inks.length - 1]) * 0.5
    expect(inks.every((v) => v >= floor && v > 0.01), "and no blank frame on the way in", { inks, floor: +floor.toFixed(4) })
  }
  await sleep(150)
  const opened = await hist()
  expect(opened.stack.join() === "/app/products,/app/products/p2" && opened.at === 1, "a row pushes the editor one entry after the list", opened)
  n = await moveCount()
  c0 = (await calls()).length
  await pressLeave(p)
  const again = isPhone ? await walkMove(p, browser, label, "exit2", vp, "::view-transition-old(page-layer)", n) : await landedWithoutMove(p, n)
  const second = { calls: (await calls()).slice(c0), hist: await hist() }
  expect(second.calls.join() === "back" && second.hist.at === 0 && second.hist.stack[1] === "/app/products/p2",
    "opened from the list, Back goes back in history: the list is the entry you are on, the editor is forward", second)
  if (isPhone) expect(again.ready && !again.skipped && again.under?.rows > 0 && !again.under?.layer, "the same move, with the list drawn under its first frame", { ready: again.ready, under: again.under })
  else expect(!again.layerMoved && again.under.rows > 0 && !again.under.layer, "no move again on a computer, and the list is there", again)
  await sleep(150)
  const kept = await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.getAttribute("aria-selected") === "true")?.textContent.trim())
  expect(kept === "Draft", "back again, the list is on the view it was left on", kept)

  /* Forward reopens the editor; the browser's back to the list is a return; the sidebar or the pill is a fresh visit. */
  const tabNow = () => p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.getAttribute("aria-selected") === "true")?.textContent.trim())
  await p.evaluate(() => history.forward())
  await sleep(400)
  const forward = await p.evaluate(() => ({ path: location.pathname, layer: !!document.querySelector("[data-page-layer]") }))
  expect(forward.path === "/app/products/p2" && forward.layer, "the browser's forward from the list reopens the editor, as it would anywhere", forward)
  await p.evaluate(() => history.back())
  await sleep(400)
  const popped = await tabNow()
  expect(popped === "Draft", "the browser's back from the editor to the list is a return: still on Draft", popped)
  await p.evaluate(() => window.__navigate("/app/orders", "push"))
  await sleep(200)
  await p.evaluate(() => history.back())
  await sleep(400)
  const fromOrders = await tabNow()
  expect(fromOrders === "Draft", "and so is the browser's back from another page", fromOrders)
  await p.evaluate(() => window.__navigate("/app/orders", "push"))
  await sleep(200)
  await p.evaluate(() => window.__navigate("/app/products", "push"))
  await sleep(400)
  const fresh = await p.evaluate(() => ({ tab: [...document.querySelectorAll("[role=tab]")].find((t) => t.getAttribute("aria-selected") === "true")?.textContent.trim(), search: document.querySelector("input[type=search]")?.value }))
  expect(fresh.tab === "All" && fresh.search === "", "opened fresh from the sidebar or the pill, the list starts at All with no search", fresh)

  /* Reduced motion: no move, the page swaps as before. */
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const moves = await p.evaluate(() => window.__moves.length)
  /* React may still run a view transition with nothing named in it as the layer's boundary mounts; what matters is that no layer moves. */
  const watching = landedWithoutMove(p, moves)
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => r.getClientRects().length > 0)
    const r = rows[0]
    if (r.tagName === "TR") r.querySelector("td:nth-child(2)").click()
    else r.querySelector("a").click()
  })
  const still = await watching
  expect(!still.layerMoved && still.under.layer, "with reduced motion there is no move: the editor is simply there", { layerMoved: still.layerMoved, layer: still.under.layer })
  await p.emulateMediaFeatures([])
}

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => { log("push", h); if (window.__navigate) window.__navigate(h, "push") }, replace: (h) => { log("replace", h); if (window.__navigate) window.__navigate(h, "replace") }, prefetch: (h, o) => log("prefetch", h + (o && o.kind ? " " + o.kind : "")), back: () => { log("back"); if (window.__back) window.__back() }, refresh: () => log("refresh") }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  /*
    The description is cleaned by a server action (description-action.ts,
    "use server"), which in the real app is a network call. Bundled for the
    browser as it is, it pulls in server-only code and throws. Here it is
    stood in for by what the action answers for a signed-in owner: the HTML
    back, cleaned by the same display cleaner the page uses.
  */
  writeFileSync(join(stubs, "description-action.js"), `import { cleanStoredHtml } from "${join(root, "lib/rich-text/html.ts").replace(/\\/g, "/")}"
export async function cleanDescription(html) { window.__descriptionCleans = (window.__descriptionCleans || 0) + 1; return { ok: true, html: cleanStoredHtml(String(html ?? "")) } }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-product-editor.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      /* The React the app router runs (Next's own build), which has <ViewTransition>: the layer's rise is React's own view transition. */
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": "./.product-editor-probe/navigation.js",
      "next/link": "./.product-editor-probe/link.jsx",
      "next/image": "./.product-editor-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [{
      name: "server-action-stub",
      setup(b) {
        b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
      },
    }],
  })
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
    ? `<script type="text/plain" id="bundle">${js.replace(/<\/script/gi, "<\\/script")}</script><script>document.fonts.load("16px Inter").catch(function () {}).finally(function () { window.__t.script = +performance.now().toFixed(1); var s = document.createElement("script"); s.textContent = document.getElementById("bundle").textContent; document.body.appendChild(s) })</script>`
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
    /* A tablet held upright, or a narrow window: in the shell, one column, the top bar. */
    ["tablet-1000", { width: 1000, height: 900 }, ""],
    ["desktop-1280", { width: 1280, height: 800 }, ""],
    ["desktop-1280-new", { width: 1280, height: 800 }, "?new"],
    ["desktop-1440", { width: 1440, height: 900 }, ""],
    ["desktop-1440-new", { width: 1440, height: 900 }, "?new"],
    ["wide-1920", { width: 1920, height: 1080 }, ""],
    /* A new Video course, from the question before a new product: its Lessons card right under the title. */
    ["phone-390-course", phone(390), "?new&course"],
    ["desktop-1280-course", { width: 1280, height: 800 }, "?new&course"],
    ["phone-390-route", phone(390), "?route"],
    ["desktop-1280-route", { width: 1280, height: 800 }, "?route"],
  ]
  /* ONLY=phone-390,desktop-1280 runs just those. */
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null
  for (const [label, vp, query] of runs.filter(([l]) => !only || only.includes(l))) {
    const isPhone = label.startsWith("phone")
    /* From 1024 the page is laid out for a computer: the foot bar holds Save. */
    const wide = vp.width >= 1024
    useBar(vp.width)
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
      /* The routed harness is served at an http address, so its history can hold /app/... paths. */
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: readFileSync(join(stubs, "index.html"), "utf8") })
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
    await p.goto(query.includes("route") ? `http://probe.test/app/products/8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6${query}` : `file://${join(stubs, "index.html")}${query}`)
    await sleep(900)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    if (query.includes("course")) {
      /* THE COURSE'S ORDER: About (the title a lesson needs), then Lessons, then the pictures; the page says New course. */
      const course = await p.evaluate(() => {
        const main = document.querySelector("[data-editor-main]")
        const cards = [...main.children].map((c) => c.querySelector("h2")?.textContent?.trim()).filter(Boolean)
        const titles = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim())
        return { cards: cards.slice(0, 4), titles, placeholder: document.getElementById("title")?.getAttribute("placeholder"), empty: !!document.querySelector("[data-course-editor]") && /No lessons yet/.test(document.querySelector("[data-course-editor]").innerText), included: [...document.querySelectorAll("[data-included-row]")].map((r) => r.innerText.replace(/\s+/g, " ").replace(/ Default$/, "")), scroll: document.scrollingElement.scrollWidth }
      })
      expect(course.cards[0] === "About" && course.cards[1] === "Lessons" && course.cards[2] === "Photos and video", "COURSE: Lessons right under About, before the pictures", course.cards)
      expect(course.titles.includes("New course") && course.placeholder === "Course title", "COURSE: the page says New course, the field Course title", { titles: course.titles, placeholder: course.placeholder })
      expect(course.empty, "COURSE: the Lessons card starts empty, with Add a module")
      expect(!course.included.some((t) => /download/i.test(t)), "COURSE: What's included says nothing about downloads", course.included)
      expect(course.scroll <= vp.width, "COURSE: nothing scrolls sideways", course.scroll)
      /* A lesson needs a name for its product: Add a module with none asks for the title. */
      await p.evaluate(() => [...document.querySelectorAll("[data-course-editor] button")].find((b) => /Add a module/.test(b.textContent)).click())
      await sleep(500)
      const asked = await p.evaluate(() => document.body.innerText.includes("Add a title first"))
      expect(asked, "COURSE: Add a module before a title asks for the title")
      await p.screenshot({ path: join(shots, `${label}.png`) })
      if (errors.length) expect(false, "nothing threw", errors)
      await p.close()
      continue
    }
    if (query.includes("route")) {
      await routeTrip(p, browser, label.replace(/-route$/, ""), vp, isPhone)
      if (errors.length) expect(false, "nothing threw on the way", errors)
      await p.close()
      continue
    }

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

    /* No row of section tabs on any width: "there should not be the About / Media / Content / Settings / SEO". */
    const tabs = await p.evaluate(() => ({
      roles: document.querySelectorAll("[data-product-editor] [role=tablist], [data-product-editor] [role=tab]").length,
      words: [...document.querySelectorAll("[data-product-editor] button")].filter((b) => b.getClientRects().length > 0 && ["About", "Media", "Content", "Settings", "SEO"].includes(b.textContent.trim())).length,
    }))
    expect(tabs.roles === 0 && tabs.words === 0, "no row of section tabs", tabs)
    const announced = await p.evaluate(() => {
      const a = document.querySelector("[data-editor-announce]")
      return a ? { live: a.getAttribute("aria-live"), w: a.getBoundingClientRect().width, shown: a.getClientRects().length > 0 } : null
    })
    expect(announced?.live === "polite" && announced.w <= 1 && announced.shown, "a screen reader still hears Saving and Saved, from a hidden line that is there at every width", announced)

    if (!wide) {
    /* The bar */
    const bar = await p.evaluate(() => {
      const pane = document.querySelector("[data-product-editor]")
      const b = document.querySelector("[data-editor-bar]")
      const buttons = [...b.querySelectorAll("button, a")].filter((x) => x.getBoundingClientRect().width > 0)
      const save = b.querySelector("[data-save-button]")
      const cancel = b.querySelector("[data-leave-button]")
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
        padTop: Math.round(parseFloat(getComputedStyle(b).paddingTop)),
        /* The pane's content area: its box less the scrollbar column it keeps from md (app/globals.css). */
        area: { left: pane.getBoundingClientRect().left + pane.clientLeft, width: pane.clientWidth, right: window.innerWidth - (pane.getBoundingClientRect().left + pane.clientLeft + pane.clientWidth) },
      }
    })
    const H = isPhone ? 40 : 32
    /* The column is centred in the content area, which from md stops at the scrollbar's column. */
    /* On a phone the bar takes the /app gutter, which is 10px (--app-gutter, app/globals.css), not its own 16. */
    const edge = isPhone ? 10 : Math.max(0, Math.round((bar.area.width - 760) / 2)) + 24
    const pad = isPhone ? 10 : Math.round(bar.area.left) + edge
    const padEnd = isPhone ? 10 : Math.round(bar.area.right) + edge
    expect(bar.top === 0, "the bar is at the top of the page", bar.top)
    expect(bar.h === (isPhone ? 56 + bar.padTop : 64), `and is ${isPhone ? "56px under any safe area" : "64px"}, with no row of tabs under it`, bar.h)
    expect(!!bar.save && !!bar.cancel, "with Cancel and Save in it", { save: bar.save, cancel: bar.cancel })
    expect(!bar.oldState && bar.loose.length === 0, "and no state in the middle: no Unsaved changes, Live, Draft or New product to read", { oldState: bar.oldState, loose: bar.loose })
    expect(bar.cancel.left === pad, "Cancel is at the start of the bar, on the column's edge (the 10px phone gutter)", { left: bar.cancel.left, want: pad })
    expect(bar.save.right === padEnd, "Save is at the end", { right: bar.save.right, want: padEnd })
    expect(bar.cancel.h === H && bar.save.h === H, `Cancel and Save are both ${H}px`, { cancel: bar.cancel.h, save: bar.save.h })
    if (!isNew) expect(bar.more && bar.more.h === H && bar.more.w === H && bar.save.left - (bar.more.left + bar.more.w) === 8, `the more button is a ${H}px square, 8px before Save`, bar.more)
    expect(/inset/.test(bar.cancel.shadow) && bar.cancel.border === "1px" && bar.cancel.bg === "rgb(255, 255, 255)", "Cancel has depth: white, a hairline, a shade at its foot", { shadow: bar.cancel.shadow, border: bar.cancel.border, bg: bar.cancel.bg })
    if (!isNew) expect(/inset/.test(bar.more.shadow) && bar.more.border === "1px", "and so does the more button", { shadow: bar.more.shadow, border: bar.more.border })
    expect(bar.save?.disabled === true && !/rgba\(\d+, \d+, \d+, 0\.[1-9]|rgb\(/.test(bar.save.shadow.replace(/rgba\(0, 0, 0, 0\)/g, "")) && bar.save.bg !== SAVE_INK, "Save is flat and grey while there is nothing to save", { disabled: bar.save.disabled, bg: bar.save.bg, shadow: bar.save.shadow })
    expect(!bar.named && !bar.headingShown, "the bar shows no product name: it is in the title field", { named: bar.named, heading: bar.heading })
    expect(bar.heading === (isNew ? "New product" : "Edit product"), "a screen reader still hears which page this is", bar.heading)
    if (isPhone) {
      const want = isLayer ? inset : 0
      expect(bar.padTop === want, isLayer ? `first on the screen, it starts below the status bar (${inset}px of safe area)` : "under the app's header it adds no safe area of its own", { padTop: bar.padTop, inset })
      const reach = await p.evaluate(() => {
        const b = document.querySelector("[data-editor-bar]")
        const c = b.querySelector("[data-leave-button]")
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
    const header = await p.evaluate(() => document.querySelector("[data-editor-head]")?.getClientRects().length ?? -1)
    expect(header === 0, "and no page header: below 1024 the top bar is the page's only bar", header)

    /* Room */
    const room = await p.evaluate(() => {
      const pane = document.querySelector("[data-product-editor]")
      /* The pill's room as the stylesheet works it out at this width (--app-nav-room, app/globals.css). */
      const probe = document.createElement("div")
      probe.style.cssText = "position:absolute;visibility:hidden;height:var(--app-nav-room)"
      document.body.append(probe)
      const navRoom = getComputedStyle(probe).height
      probe.remove()
      return { sideways: pane.scrollWidth - pane.clientWidth, pb: getComputedStyle(pane).paddingBottom, navRoom, column: Math.round(pane.querySelector("[data-editor-page]").getBoundingClientRect().width) }
    })
    expect(room.sideways === 0, "nothing scrolls sideways", room.sideways)
    if (isPhone) {
      if (isLayer) {
        expect(room.pb === `${32 + insetBottom}px`, "a layer has no pill under it: 32px at its foot, over the home indicator's safe area", room.pb)
      } else {
        expect(room.pb === room.navRoom, "the page keeps the pill's room at its foot (--app-nav-room: the pill, the safe area under it, 40px over it), and nothing more", room)
      }
      await p.$eval("[data-product-editor]", (el) => { el.scrollTop = el.scrollHeight })
      await sleep(250)
      const clear = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-product-editor] .rounded-2xl")].filter((c) => c.getClientRects().length > 0)
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
      /* One column in the order the source reads, the Status card (a computer's) not drawn. */
      const order = await p.evaluate(() => [...document.querySelectorAll("[data-product-editor] h2")].filter((h) => h.getClientRects().length > 0 && h.closest(".rounded-2xl")).map((h) => h.textContent.trim()))
      /* The category is a field in Content, above the description, since the owner moved it there. */
      expect(same(order, ["About", "Photos and video", "Content", "What's Included", "Digital Files", "Variants", "Pricing", "FAQ", "Settings", "Search engine listing"]), "one column of cards, each under its own heading, with no Status card", order)
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
      const want = Math.min(760, Math.round(bar.area.width))
      expect(room.column === want, `the form is one column, ${want}px (760 at most), under the top bar`, { column: room.column, area: bar.area.width })
    }
    } else {
    /*
      FROM 1024: THE PAGE A COMPUTER GETS. The page header, two columns in the
      1200px page container, and the foot bar along the bottom of the pane,
      inside the content area, never over the rail.
    */
    const desk = await p.evaluate(() => {
      const pane = document.querySelector("[data-product-editor]")
      const pr = pane.getBoundingClientRect()
      const R = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
      }
      const shown = (el) => !!el && el.getClientRects().length > 0
      const head = document.querySelector("[data-editor-head]")
      const foot = document.querySelector("[data-editor-foot]")
      const main = document.querySelector("[data-editor-main]")
      const side = document.querySelector("[data-editor-side]")
      const titles = (col) => [...col.querySelectorAll("h2")].filter(shown).map((h) => h.textContent.trim())
      const fcs = getComputedStyle(foot)
      const save = foot.querySelector("[data-save-button]")
      const leave = foot.querySelector("[data-leave-button]")
      const state = foot.querySelector("[data-editor-state]")
      const rail = document.querySelector("[data-rail]")
      const railHits = rail ? [0.2, 0.5, 0.8].map((f) => rail.contains(document.elementFromPoint(120, rail.getBoundingClientRect().top + rail.getBoundingClientRect().height * f))) : []
      return {
        area: { left: Math.round(pr.left + pane.clientLeft), width: Math.round(pane.clientWidth), right: Math.round(pr.left + pane.clientLeft + pane.clientWidth), bottom: Math.round(pr.top + pane.clientHeight) },
        topBar: shown(document.querySelector("[data-editor-bar]")),
        head: shown(head) ? {
          ...R(head),
          h1: head.querySelector("h1").textContent.trim(),
          h1Size: getComputedStyle(head.querySelector("h1")).fontSize,
          badge: [...head.querySelectorAll("span")].find((s) => /^(Live|Draft)$/.test(s.textContent.trim()))?.textContent.trim() ?? null,
          back: shown(head.querySelector("button[aria-label='Back to products']")),
          more: shown(head.querySelector("button[aria-label='More actions']")),
        } : null,
        h1s: [...document.querySelectorAll("[data-product-editor] h1")].filter(shown).map((h) => h.textContent.trim()),
        page: R(document.querySelector("[data-editor-page]")),
        main: R(main),
        side: R(side),
        mainCards: titles(main),
        category: (() => {
          const f = main.querySelector("[data-editor-category]")
          const d = main.querySelector("[data-editor-category] ~ * [contenteditable], [data-editor-category] ~ * .ProseMirror")
          return !!f && !side.querySelector("[data-category-field]") && (!d || f.getBoundingClientRect().bottom <= d.getBoundingClientRect().top)
        })(),
        sideCards: titles(side),
        cardLook: (() => {
          const c = main.querySelector(".rounded-2xl")
          const cs = getComputedStyle(c)
          return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow }
        })(),
        foot: shown(foot) ? { ...R(foot), position: fcs.position, bottomProp: fcs.bottom, bg: fcs.backgroundColor, borderTop: `${fcs.borderTopWidth} ${fcs.borderTopColor}`, shadow: fcs.boxShadow } : null,
        save: save && { ...R(save), disabled: save.disabled, word: save.textContent.trim(), bg: getComputedStyle(save).backgroundColor },
        leave: leave && { ...R(leave), mode: leave.dataset.mode, bg: getComputedStyle(leave).backgroundColor, border: getComputedStyle(leave).borderTopWidth },
        state: state && { text: state.textContent.trim(), left: R(state).left },
        rail: rail && { ...R(rail), clipped: [...rail.querySelectorAll("[data-rail-label]")].filter((l) => l.scrollWidth > l.clientWidth).length, hits: railHits },
        doc: { w: document.scrollingElement.scrollWidth, x: document.scrollingElement.scrollLeft, inner: innerWidth },
        sideways: pane.scrollWidth - pane.clientWidth,
      }
    })
    const title = "Portrait retouching presets, the complete set for Lightroom and Capture One"
    expect(!desk.topBar, "the top bar is not drawn: from 1024 Save and Cancel are at the foot", desk.topBar)
    expect(!!desk.head && desk.head.h1 === (isNew ? "New product" : title) && desk.head.h1Size === "28px", "a page header, like the other /app pages: the product's name (or New product) at 28px", desk.head)
    expect(!!desk.head && desk.head.back && desk.head.badge === (isNew ? null : "Live") && desk.head.more === !isNew, isNew ? "with the way back to Products, and no status or more menu before the first save" : "with the way back to Products, its status as a badge and the more menu", desk.head)
    expect(desk.h1s.length === 1, "one heading for the page", desk.h1s)
    const wantPage = Math.min(1200, desk.area.width)
    expect(Math.abs(desk.page.w - wantPage) <= 1 && Math.abs((desk.page.left - desk.area.left) - (desk.area.right - desk.page.right)) <= 1, `the page container is ${wantPage}px, centred in the content area`, { page: desk.page, area: desk.area })
    expect(desk.main.left === desk.page.left + 32 && desk.side.right === desk.page.right - 32, "the columns sit inside its 32px gutters", { main: desk.main.left, side: desk.side.right, page: [desk.page.left, desk.page.right] })
    expect(desk.side.left - desk.main.right === 16 && desk.main.top === desk.side.top, "two columns, 16px apart, starting on one line", { gap: desk.side.left - desk.main.right, tops: [desk.main.top, desk.side.top] })
    expect(desk.side.w >= 272 && (desk.side.w === 272 || Math.abs(desk.main.w - 2 * desk.side.w) <= 2), "the main column two thirds, the side one third", { main: desk.main.w, side: desk.side.w })
    expect(same(desk.mainCards, ["About", "Photos and video", "Content", "What's Included", "Digital Files", "Variants", "Pricing", "FAQ"]), "the product itself in the main column", desk.mainCards)
    expect(same(desk.sideCards, ["Status", "Settings", "Search engine listing"]), "its status, settings and search listing beside it", desk.sideCards)
    expect(desk.category, "the category is a field in the main column, above the description", desk.category)
    expect(desk.cardLook.bg === "rgb(255, 255, 255)" && desk.cardLook.radius === "16px" && /0px 1px 3px/.test(desk.cardLook.shadow), "each card is the /app card: white, 16px corners, the faint shadow", desk.cardLook)
    expect(!!desk.foot && desk.foot.position === "sticky" && desk.foot.bottomProp === "0px", "a foot bar, sticky at the bottom of the pane that scrolls", desk.foot)
    expect(!!desk.foot && desk.foot.left === desk.area.left && desk.foot.w === desk.area.width && desk.foot.bottom === desk.area.bottom && desk.foot.bottom === vp.height, "across the content area and only it, on the bottom edge of the window", { foot: desk.foot, area: desk.area })
    expect(!!desk.foot && desk.foot.bg === "rgb(255, 255, 255)" && desk.foot.borderTop === "1px rgb(229, 231, 235)" && /-\d+px 16px/.test(desk.foot.shadow) && desk.foot.h === 65, "white, a hairline on top and a soft shadow upward, 64px and the hairline", desk.foot)
    expect(!!desk.state && desk.state.text === (isNew ? "Not saved yet" : "Live") && desk.state.left === desk.main.left, "the state in words on the left, on the column's edge", desk.state)
    expect(!!desk.save && desk.save.right === desk.side.right && desk.save.h === 32 && desk.save.disabled === true, "Save on the right, on the column's edge, grey until there is a change", desk.save)
    expect(!!desk.leave && desk.leave.right + 8 === desk.save.left && desk.leave.mode === (isNew ? "cancel" : "back") && desk.leave.bg === "rgb(255, 255, 255)" && desk.leave.border === "1px", "Cancel (Back with nothing to discard) just before it, white with a hairline", desk.leave)
    expect(!!desk.rail && desk.rail.left === 0 && desk.rail.w === 240 && desk.rail.clipped === 0 && desk.rail.hits.every(Boolean) && desk.area.left === 240, "the rail is whole and untouched beside it: 240px from the left edge, no label cut, nothing of the editor over it", desk.rail)
    expect(desk.doc.w === desk.doc.inner && desk.doc.x === 0 && desk.sideways === 0, "nothing scrolls sideways, the window or the pane", { doc: desk.doc, pane: desk.sideways })
    await p.screenshot({ path: join(shots, `${label}-top.png`) })

    /* Half way down, and at the end: the bar stays on the bottom edge and never covers a card. */
    const footAt = (where) => p.evaluate(async (where) => {
      const pane = document.querySelector("[data-product-editor]")
      pane.scrollTop = where === "end" ? pane.scrollHeight : (pane.scrollHeight - pane.clientHeight) / 2
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const f = document.querySelector("[data-editor-foot]").getBoundingClientRect()
      const last = (col) => {
        const cards = [...document.querySelector(col).querySelectorAll(":scope > .rounded-2xl")].filter((c) => c.getClientRects().length > 0)
        const r = cards[cards.length - 1].getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 4)
        return { bottom: Math.round(r.bottom), reached: !!hit && cards[cards.length - 1].contains(hit) }
      }
      return { top: Math.round(f.top), bottom: Math.round(f.bottom), scrolled: Math.round(pane.scrollTop), max: pane.scrollHeight - pane.clientHeight, main: last("[data-editor-main]"), side: last("[data-editor-side]") }
    }, where)
    const mid = await footAt("mid")
    expect(mid.bottom === vp.height && mid.scrolled > 0, "scrolled half way, the bar is still on the bottom edge", mid)
    const end = await footAt("end")
    await p.screenshot({ path: join(shots, `${label}-end.png`) })
    expect(end.bottom === vp.height && end.main.bottom <= end.top - 24 && end.side.bottom <= end.top - 24 && [end.main, end.side].every((c) => c.bottom < 0 || c.reached), "scrolled to the end, the last card of each column ends above the bar, and a click at its foot (where it is on screen) reaches it", end)
    expect(Math.max(end.main.bottom, end.side.bottom) === end.top - 32, "the room under the last card is the page's 32px, not a gap and not an overlap", { cards: Math.max(end.main.bottom, end.side.bottom), bar: end.top })
    await p.$eval("[data-product-editor]", (el) => { el.scrollTop = 0 })
    await sleep(150)
    }
    await p.screenshot({ path: join(shots, `${label}-top.png`) })

    /* Where everything in the bar is, to see that a change of state moves none of it. */
    const geometry = () => p.evaluate((BAR) => {
      const b = document.querySelector(BAR)
      const parts = [...b.querySelectorAll("button, a")].filter((x) => x.getBoundingClientRect().width > 0).map((x) => {
        const r = x.getBoundingClientRect()
        return `${x.textContent.trim() || x.getAttribute("aria-label")}@${Math.round(r.left)}+${Math.round(r.width)}x${Math.round(r.height)}`
      })
      return [...parts, `bar ${Math.round(b.getBoundingClientRect().height)}`].join(" ")
    }, BAR)
    const resting = await geometry()

    /* Save */
    const saveState = () => p.evaluate((BAR) => {
      const b = document.querySelector(`${BAR} [data-save-button]`)
      const leave = document.querySelector(`${BAR} [data-leave-button]`)
      const r = b.getBoundingClientRect()
      return {
        phase: b.dataset.phase,
        disabled: b.disabled,
        busy: b.getAttribute("aria-busy"),
        w: +r.width.toFixed(2),
        h: Math.round(r.height),
        bg: getComputedStyle(b).backgroundColor,
        /* The word, inside the box that holds "Saved"'s width. */
        label: getComputedStyle(b.querySelector("span > span")).opacity,
        spinner: !!b.querySelector("[data-activity-spinner]"),
        check: !!b.querySelector("[data-save-check]"),
        said: document.querySelector("[data-editor-announce]").textContent,
        word: b.textContent.trim(),
        leave: leave.dataset.mode,
        leaveName: leave.getAttribute("aria-label"),
        leaveDisabled: leave.disabled,
        /* The foot bar's words, from 1024 (null below it, where the top bar says nothing). */
        state: document.querySelector("[data-editor-foot]")?.getClientRects().length ? document.querySelector("[data-editor-state]").textContent.trim() : null,
      }
    }, BAR)
    if (isNew) {
      await p.click("#title", { clickCount: 1 })
      await p.keyboard.type("Film presets")
      await sleep(150)
      const moved = await geometry()
      const typed = await saveState()
      expect(typed.disabled === false && !/Film presets/.test(await p.$eval(BAR, (b) => b.innerText)), "typing a name lights Save up, and the name stays out of the bar", typed)
      if (wide) expect(typed.state === "Unsaved changes", "and the foot bar says Unsaved changes", typed.state)
      expect(moved === resting, "and nothing in the bar moves or changes size", { resting, moved })
      await p.screenshot({ path: join(shots, `${label}-typed.png`) })
    }
    if (!isNew) {
      await p.click("#title", { clickCount: 1 })
      await p.keyboard.press("End")
      await p.keyboard.type("!")
      await sleep(150)
      const dirty = await saveState()
      expect(dirty.disabled === false && dirty.bg === SAVE_INK, "a change lights Save up, in the app's near black", dirty)
      if (wide) expect(dirty.state === "Unsaved changes", "and the foot bar says Unsaved changes", dirty.state)
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
      await p.evaluate((sel) => {
        const b = document.querySelector(sel)
        b.click()
        b.click()
      }, saveButton)
      await sleep(250)
      const saving = await saveState()
      await p.screenshot({ path: join(shots, `${label}-saving.png`) })
      expect(saving.phase === "saving" && saving.busy === "true" && saving.spinner && saving.label === "0", "saving: a spinner in place of the word, aria-busy", saving)
      if (wide) expect(saving.state === "Saving", "the foot bar says Saving", saving.state)
      expect(saving.w === idle.w && saving.h === idle.h, "and Save keeps its size to the hundredth of a pixel", { idle: [idle.w, idle.h], saving: [saving.w, saving.h] })
      expect(saving.bg === SAVE_INK && saving.disabled === false, "and its colour: busy, not greyed", saving.bg)
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
      expect(after.phase === "idle" && after.disabled === true && after.w === idle.w, "and back to a grey button with nothing left to save", after)
      expect(after.word === "Saved" && after.leave === "back" && after.leaveName === "Back", "saved: the grey button says Saved and Cancel has become Back", { word: after.word, leave: after.leave, name: after.leaveName })
      if (wide) expect(after.state === "Saved", "and the foot bar says Saved", after.state)
      await sleep(200)
      await p.screenshot({ path: join(shots, `products-editor-${label}-settled.png`) })
      expect(saving.leave === "cancel" && saving.leaveDisabled === true, "while it saves, Cancel stays Cancel and is held", { leave: saving.leave, disabled: saving.leaveDisabled })
      expect(idle.leave === "cancel" && idle.word === "Save", "before it, with a change: Cancel and Save", { leave: idle.leave, word: idle.word })
      expect(held >= 600 && held <= 1100, "the check stays for about 900ms", { ms: held })
      ctx.fakeDb = false

      await p.keyboard.type("!")
      await sleep(150)
      const again = await saveState()
      expect(again.leave === "cancel" && again.word === "Save" && again.disabled === false, "the next change turns them back into Cancel and a violet Save", { leave: again.leave, word: again.word, bg: again.bg })
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
      await p.reload({ waitUntil: "domcontentloaded" })
      await sleep(900)
      await mediaReorder(p, label, vp, isPhone, ctx)
      await p.reload({ waitUntil: "domcontentloaded" })
      await sleep(900)
      await describe(p, ctx)
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
