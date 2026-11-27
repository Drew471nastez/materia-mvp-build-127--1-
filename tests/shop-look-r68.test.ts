/**
 * Round 68, the owner on Try the look (theme-packages/materia/base/sections/try-the-look.liquid, the "shop the look"
 * runway that Redline, templates/rail, opens with under its Boutique Rail) and on Redline's garment close:
 *
 *   "'In this look', sitting on the right side, should be sticky as I scroll down ... sometimes I scroll down the try
 *    the look but it gets caught there."  "The wall, view and drag and swipe, should feel more smooth and clean, not so
 *    direct."  "When the figure image of the try the look guy disappears, it should not be glitchy."  "Clicking should
 *    feel easy: sometimes when I want to click, it doesn't understand view or drag."  "If the product has variants, I
 *    can select variants, sizes, colours."  Redline: "When I close it, it goes back into its normal position of the
 *    garment hanging on the rail; make that more smooth and clean."
 *
 * Measured in Chromium on the Redline template's home page as the theme draws it:
 *
 *   sticky    on a computer (1440 and 1100 wide) the pieces panel keeps its place on screen (1 px) while the runway
 *             scrolls past, then leaves with the section; it has no scroll of its own (nothing to catch the wheel)
 *   scroll    a vertical wheel over the runway, even one that starts a little sideways, scrolls the page by all of it
 *             and leaves the looks alone; a phone's vertical swipe over it scrolls the page
 *   taps      clicks and taps with a few px of jitter always open the look in focus; drags never open it and always
 *             move the lineup; a click on a look beside brings it forward (mouse and touch, many of each)
 *   trackpad  a sideways two-finger swipe moves exactly one look
 *   frames    at 4x CPU, every animation frame: a look leaving the lineup fades out as it slides (it is never there one
 *             frame and gone the next), and the drag's release eases onto the look with no jump
 *   variants  a piece's options are rows (Size, Colour ...), a press always picks a variant (the closest one), the price,
 *             the picture, the button and the look's total follow it, a sold out one cannot be added, the panel and
 *             the opened look agree, and the bag gets the chosen variant (alone, and with the full look)
 *   close     Redline's garment flies back starting on the next frame (it waited ~440 ms at 4x CPU before), lands on its
 *             hanger, takes its shadow back softly, and turns to its side without being see-through: in every frame
 *             the front or the side view is drawn whole
 *
 *   Run: tests/shop-look-r68.test.ts (needs Chromium at /opt/pw-browsers/chromium or $CHROMIUM for the browser part)
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer, { type Page, type Browser } from "puppeteer-core"

import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { importTemplate, serve } from "../scripts/theme-templates/site"
import { auditSite } from "../scripts/theme-templates/fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : `\n       ${JSON.stringify(detail).slice(0, 700)}`}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

const TL = "theme-packages/materia/base/sections/try-the-look.liquid"
const BR = "theme-packages/materia/base/sections/boutique-rail.liquid"

function source() {
  const tl = readFileSync(TL, "utf8")
  const js = [...tl.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n")
  check("source: the panel is sticky on a computer, under the sticky header, and sticks by its bottom when taller than the window", /\.ttl__panel \{ position: sticky; top: min\(calc\(var\(--sticky-top, 0px\) \+ 24px\), calc\(100vh - var\(--ttl-ph, 0px\) - 24px\)\)/.test(tl) && /--ttl-ph/.test(js))
  check("  the section clips instead of hiding its overflow (a hidden overflow is a scroll box and the sticky never stuck)", /overflow: hidden; overflow: clip;/.test(tl))
  check("  the panel's list has no scroll of its own on a computer", /\.ttl__panel \.ttl__list \{ overflow: visible; flex: none; \}/.test(tl) && !/max-height: calc\(var\(--stage-h\) \+ 220px\)/.test(tl))
  check("  only a look's picture takes a press (the box around it does not)", /\.ttl__model \{[^}]*pointer-events: none;/.test(tl) && /\.ttl__model \.ttl__fit \{ pointer-events: auto; \}/.test(tl))
  check("  a look's opacity follows its place and reaches 0 at the stage's edge (no fade triggered by crossing a line)", /calc\(\(var\(--edge, 2\.01\) - var\(--a\)\) \* 2\.2\)/.test(tl) && !/\[data-far\] \{ opacity: 0/.test(tl))
  check("  drag, swipe and trackpad move the lineup through one spring; a press is a click until it moves 5 px (mouse) or 10 px (touch)", /spring\(\) \{/.test(js) && /kind === 'mouse' \? 5 : 10/.test(js) && /const k = held \? 900 : 200, c = 2 \* Math\.sqrt\(k\)/.test(js))
  check("  a trackpad gesture is read once at its start: only a clearly sideways one is taken from the page", /Math\.abs\(ax\) > Math\.abs\(ay\) \* 1\.5/.test(js) && /if \(axis !== 'x'\) return;/.test(js))
  check("  reduced motion: no spring, straight to the look", /if \(this\.calm\(\)\) \{ this\.stopSpring\(\); this\.go\(this\.i \+ n, true\); return n; \}/.test(js))
  const br = readFileSync(BR, "utf8")
  check("source (Redline): the page takes clicks two frames into the close, not before its first frame", /\.brail__focus\.is-closing\.is-through \{ pointer-events: none; \}/.test(br) && /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{ if \(d\.classList\.contains\('is-closing'\)\) d\.classList\.add\('is-through'\); \}\)\);/.test(br))
  check("  the facing pose is taken while the view is open, so the close does not restyle before it flies", /li\.classList\.add\('is-lifted'\); this\.pose\(li\);/.test(br))
}

/* ── Try the look ──────────────────────────────────────────────────── */
async function tryTheLook(browser: Browser, touchBrowser: Browser, base: string) {
  /* Sticky, at two computer widths */
  for (const w of [1440, 1100]) {
    const p = await browser.newPage()
    await p.setViewport({ width: w, height: 900 })
    await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 90000 })
    await p.evaluate(() => { document.querySelector("try-the-look")!.scrollIntoView(); scrollBy(0, -200) })
    await sleep(500)
    const rows: { top: number; bottom: number; grid: number }[] = []
    for (let k = 0; k < 24; k++) {
      await p.mouse.move(w * 0.3, 450); await p.mouse.wheel({ deltaY: 60 }); await sleep(90)
      rows.push(await p.evaluate(() => { const r = document.querySelector(".ttl__panel")!.getBoundingClientRect(), g = document.querySelector(".ttl__grid")!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, grid: g.bottom } }))
    }
    const free = rows.filter((r) => r.grid > r.bottom + 2), hold = Math.min(...free.map((r) => r.top))
    const stuck = free.filter((r) => Math.abs(r.top - hold) <= 1)
    const tops = stuck.map((r) => r.top)
    const ended = rows.filter((r) => r.grid <= r.bottom + 2)
    check(`sticky at ${w}: the pieces panel keeps its place while the runway scrolls past (${stuck.length} steps of 60 px, within 1 px), then leaves with the section`, stuck.length >= 4 && Math.max(...tops) - Math.min(...tops) <= 1 && ended.length > 0 && ended.every((r) => Math.abs(r.grid - r.bottom) <= 2), rows.map((r) => [Math.round(r.top), Math.round(r.grid - r.bottom)]))
    const inner = await p.evaluate(() => { const l = document.querySelector(".ttl__panel > .ttl__look:not([hidden]) .ttl__list")!; return { o: getComputedStyle(l).overflowY, sh: l.scrollHeight, ch: l.clientHeight } })
    check(`  at ${w} its list has no scroll of its own`, inner.o === "visible", inner)
    await p.close()
  }

  /* Mouse: taps, drags, a look beside, the wheel, the trackpad */
  {
    const p = await browser.newPage()
    await p.setViewport({ width: 1440, height: 900 })
    await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 90000 })
    await p.evaluate(() => { document.querySelector("try-the-look")!.scrollIntoView(); scrollBy(0, 150) })
    await sleep(600)
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    type T = { i: number; lb: HTMLDialogElement; models: Element[]; closeView: () => void }
    const state = () => p.evaluate(() => { const t = document.querySelector("try-the-look") as unknown as T; return { i: t.i, open: t.lb.open } })
    const shut = () => p.waitForFunction(() => !(document.querySelector("try-the-look") as unknown as T).lb.open, { timeout: 4000 }).catch(() => undefined)
    const closeLb = async () => { if ((await state()).open) { await p.keyboard.press("Escape"); await sleep(300); await shut() } }
    const fitAt = (side: number) => p.evaluate((side) => { const t = document.querySelector("try-the-look") as unknown as T; const n = t.models.length; const r = t.models[(t.i + side + n) % n].querySelector(".ttl__fit")!.getBoundingClientRect(); return [side === 0 ? r.x + r.width / 2 : side < 0 ? r.x + r.width * 0.3 : r.x + r.width * 0.7, r.y + r.height * 0.45] }, side)
    let ok = 0
    const TAPS = 16
    for (let k = 0; k < TAPS; k++) {
      await sleep(600)
      const [x, y] = await fitAt(0), j = rnd(0, 4), a = rnd(0, 6.28)
      await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + j * Math.cos(a), y + j * Math.sin(a), { steps: 2 }); await p.mouse.up()
      await sleep(450); if ((await state()).open) ok++; await closeLb()
    }
    check(`mouse at 4x CPU: a click with up to 4 px of jitter on the look in focus always opens it (${ok}/${TAPS})`, ok === TAPS)
    {
      const [x, y] = await fitAt(0); await p.mouse.click(x, y); await sleep(700)
      await p.keyboard.press("Escape"); await sleep(30); await p.mouse.click(x, y); await sleep(900)
      const again = await state()
      check("  a click on the look while its card is still closing opens it again (the press is not lost)", again.open, again)
      await closeLb()
    }
    let moved = 0, opened = 0
    const DRAGS = 10
    for (let k = 0; k < DRAGS; k++) {
      await sleep(600)
      await p.waitForFunction(() => !document.querySelector("try-the-look [data-stage]")!.classList.contains("is-drag"), { timeout: 4000 }).catch(() => undefined)
      const s0 = await state(), [x, y] = await fitAt(0), d = rnd(70, 220) * (k % 2 ? 1 : -1)
      await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + d, y + rnd(-10, 10), { steps: 8 }); await p.mouse.up()
      await sleep(1100); const s1 = await state(); if (s1.open) opened++; if (s1.i !== s0.i) moved++; await closeLb()
    }
    check(`  a drag of 70 to 220 px never opens the look and always moves the lineup (moved ${moved}/${DRAGS}, opened ${opened})`, moved === DRAGS && opened === 0)
    let side = 0
    for (let k = 0; k < 6; k++) { await sleep(900); const s0 = await state(), [x, y] = await fitAt(k % 2 ? 1 : -1); await p.mouse.click(x, y); await sleep(600); const s1 = await state(); if (!s1.open && s1.i !== s0.i) side++; await closeLb() }
    check(`  a click on a look beside brings it forward and does not open anything (${side}/6)`, side === 6)
    /* The wheel: vertical, with a little sideways noise, and a gesture whose first event is sideways */
    await sleep(900)
    const [sx, sy] = await fitAt(0); await p.mouse.move(sx, sy - 80)
    let y0 = await p.evaluate(() => scrollY), i0 = (await state()).i
    for (let k = 0; k < 12; k++) { await p.mouse.wheel({ deltaX: k % 3 === 0 ? 6 : 2, deltaY: 40 }); await sleep(30) }
    await sleep(500)
    const v1 = { scrolled: (await p.evaluate(() => scrollY)) - y0, moved: (await state()).i !== i0 }
    await p.evaluate(() => { document.querySelector("try-the-look")!.scrollIntoView(); scrollBy(0, 150) }); await sleep(400)
    const [sx2, sy2] = await fitAt(0); await p.mouse.move(sx2, sy2 - 80)
    y0 = await p.evaluate(() => scrollY); i0 = (await state()).i
    await p.mouse.wheel({ deltaX: 5, deltaY: 3 }); for (let k = 0; k < 10; k++) { await sleep(16); await p.mouse.wheel({ deltaX: 1, deltaY: 40 }) }
    await sleep(600)
    const v2 = { scrolled: (await p.evaluate(() => scrollY)) - y0, moved: (await state()).i !== i0 }
    check("  the wheel over the runway scrolls the page by all of it, also when the gesture starts a little sideways, and leaves the looks", v1.scrolled === 480 && !v1.moved && v2.scrolled === 403 && !v2.moved, { v1, v2 })
    await p.evaluate(() => { document.querySelector("try-the-look")!.scrollIntoView(); scrollBy(0, 150) }); await sleep(800)
    const [tx, ty] = await fitAt(0); await p.mouse.move(tx, ty)
    const before = (await state()).i, n = await p.evaluate(() => (document.querySelector("try-the-look") as unknown as T).models.length)
    for (let k = 0; k < 8; k++) { await p.mouse.wheel({ deltaX: 18, deltaY: 1 }); await sleep(16) }
    await sleep(1300)
    check("  a sideways trackpad swipe moves exactly one look", (await state()).i === (before + 1) % n, { before, after: (await state()).i })

    /* Frames: the next look by the arrow, then a drag let go, every animation frame at 4x CPU */
    await sleep(600)
    await p.evaluate(() => {
      const W = window as unknown as { __f: { o: number[]; x: number[] }[]; __on: boolean }
      W.__f = []; W.__on = true
      const ms = [...document.querySelectorAll("try-the-look [data-model]")]
      const tick = () => { if (!W.__on) return; W.__f.push({ o: ms.map((m) => +getComputedStyle(m).opacity), x: ms.map((m) => new DOMMatrix(getComputedStyle(m).transform).m41) }); requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await p.click("try-the-look [data-next]"); await sleep(1200)
    const fr1 = await p.evaluate(() => { const W = window as unknown as { __f: { o: number[]; x: number[] }[]; __on: boolean }; const f = W.__f; W.__f = []; return f })
    const vanish = (fr: { o: number[] }[]) => fr.slice(1).flatMap((f, k) => f.o.map((o, m) => ({ k, m, from: fr[k].o[m], to: o })).filter((d) => d.from > 0.3 && d.to < 0.02))
    const leaving = fr1.length ? fr1[0].o.map((_, m) => fr1.map((f) => f.o[m])).filter((s) => s[0] > 0.3 && s[s.length - 1] < 0.05) : []
    check(`frames: after an arrow, the look that leaves fades out as it slides, over several frames (never there one frame and gone the next) [${fr1.length} frames at 4x CPU]`, fr1.length > 5 && vanish(fr1).length === 0 && leaving.length === 1 && leaving[0].filter((o) => o > 0.05 && o < 0.7).length >= 2, { vanish: vanish(fr1).slice(0, 3), leaving })
    const step = await p.evaluate(() => { const t = document.querySelector("try-the-look") as unknown as T; return (t.models[t.i] as HTMLElement).offsetWidth * 0.55 })
    const [dx0, dy0] = await fitAt(0)
    await p.mouse.move(dx0, dy0); await p.mouse.down(); await p.mouse.move(dx0 - step * 0.6, dy0, { steps: 10 }); await p.mouse.up(); await sleep(1400)
    const fr2 = await p.evaluate(() => { const W = window as unknown as { __f: { o: number[]; x: number[] }[]; __on: boolean }; W.__on = false; return W.__f })
    const jumps = fr2.slice(1).flatMap((f, k) => f.x.map((x, m) => ({ k, m, d: Math.abs(x - fr2[k].x[m]), o: Math.max(f.o[m], fr2[k].o[m]) })).filter((d) => d.o > 0.05 && d.d > step * 0.5))
    check(`  a drag let go eases onto the next look: no visible look moves more than half a step in one frame, none vanishes [${fr2.length} frames at 4x CPU]`, fr2.length > 5 && jumps.length === 0 && vanish(fr2).length === 0, { jumps: jumps.slice(0, 3), vanish: vanish(fr2).slice(0, 3) })
    await p.close()
  }

  /* Touch: taps, drags, a vertical swipe scrolls the page */
  {
    const p = await touchBrowser.newPage()
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 90000 })
    await p.evaluate(() => { document.querySelector("try-the-look")!.scrollIntoView(); scrollBy(0, 60) })
    await sleep(600)
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const state = () => p.evaluate(() => { const t = document.querySelector("try-the-look") as unknown as { i: number; lb: HTMLDialogElement }; return { i: t.i, open: t.lb.open, y: scrollY } })
    const touch = async (pts: number[][], dt = 16) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1] }] })
      for (const q of pts.slice(1)) { await sleep(dt); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: q[0], y: q[1] }] }) }
      await sleep(dt); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    }
    const fitAt = () => p.evaluate(() => { const t = document.querySelector("try-the-look") as unknown as { i: number; models: Element[] }; const r = t.models[t.i].querySelector(".ttl__fit")!.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.4] })
    const closeLb = async () => { if ((await state()).open) { await p.evaluate(() => (document.querySelector("try-the-look") as unknown as { closeView: () => void }).closeView()); await sleep(300); await p.waitForFunction(() => !(document.querySelector("try-the-look") as unknown as { lb: HTMLDialogElement }).lb.open, { timeout: 4000 }).catch(() => undefined) } }
    let ok = 0
    for (let k = 0; k < 12; k++) { await sleep(700); const [x, y] = await fitAt(), j = rnd(0, 7); await touch([[x, y], [x + j, y + rnd(-3, 3)]], 30); await sleep(700); if ((await state()).open) ok++; await closeLb() }
    check(`touch at 4x CPU: a tap with up to 7 px of jitter always opens the look in focus (${ok}/12)`, ok === 12)
    let moved = 0, opened = 0
    const rest = () => p.waitForFunction(() => !document.querySelector("try-the-look [data-stage]")!.classList.contains("is-drag"), { timeout: 4000 }).catch(() => undefined)
    for (let k = 0; k < 8; k++) { await sleep(600); await rest(); const s0 = await state(), [x, y] = await fitAt(), d = rnd(70, 180) * (k % 2 ? 1 : -1); const pts: number[][] = []; for (let s = 0; s <= 8; s++) pts.push([x + (d * s) / 8, y + rnd(-6, 6)]); await touch(pts); await sleep(1100); const s1 = await state(); if (s1.open) opened++; if (s1.i !== s0.i) moved++; await closeLb() }
    check(`  a swipe never opens the look and always moves the lineup (moved ${moved}/8, opened ${opened})`, moved === 8 && opened === 0)
    await sleep(600)
    const s0 = await state(), [x, y] = await fitAt(); const pts: number[][] = []; for (let s = 0; s <= 10; s++) pts.push([x + rnd(-3, 3), y + 120 - s * 24])
    await touch(pts); await sleep(900)
    const s1 = await state()
    check("  a vertical swipe over the runway scrolls the page and leaves the looks", s1.y - s0.y >= 100 && s1.i === s0.i && !s1.open, { s0, s1 })
    await p.close()
  }

  /* Variants */
  {
    const p = await browser.newPage()
    await p.setViewport({ width: 1440, height: 900 })
    const posts: string[] = []
    await p.setRequestInterception(true)
    p.on("request", (r) => { if (/\/cart\/add\.js$/.test(new URL(r.url()).pathname)) { posts.push(r.postData() ?? ""); void r.respond({ status: 200, contentType: "application/json", body: '{"items":[]}' }) } else void r.continue() })
    await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 90000 })
    await p.evaluate(() => { document.querySelector("try-the-look")!.scrollIntoView(); scrollBy(0, 150) })
    await sleep(600)
    const setup = await p.evaluate(() => {
      const look = document.querySelector(".ttl__panel > .ttl__look:not([hidden])")!
      const it = look.querySelector<HTMLElement>('[data-item="1"]')!, other = look.querySelector<HTMLElement>('[data-item="2"]')!
      const pic = other.querySelector<HTMLImageElement>(".ttl__img img")!.currentSrc
      it.querySelector("[data-vjson]")!.textContent = JSON.stringify({ options: ["Size", "Colour"], variants: [
        { id: "va", available: true, price: "$10.00", cents: 1000, compare: null, options: ["S", "Black"], image: null },
        { id: "vb", available: false, price: "$12.00", cents: 1200, compare: null, options: ["M", "Black"], image: null },
        { id: "vc", available: true, price: "$14.00", cents: 1400, compare: "$20.00", options: ["L", "Olive"], image: pic },
      ] })
      it.dataset.vid = "va"; it.dataset.cents = "1000"; delete (it as unknown as { _g?: unknown })._g
      return { other: +other.dataset.cents!, otherId: other.dataset.vid ?? other.querySelector<HTMLElement>("[data-add]")!.dataset.add, pic }
    })
    await p.click(".ttl__panel > .ttl__look:not([hidden]) [data-item='1'] [data-pick]"); await sleep(600)
    const read = () => p.evaluate(() => {
      const it = document.querySelector<HTMLElement>(".ttl__panel > .ttl__look:not([hidden]) [data-item='1']")!
      return {
        rows: [...it.querySelectorAll(".ttl__og")].map((r) => r.querySelector(".ttl__og-n span")!.textContent + ":" + r.querySelector("[data-og-v]")!.textContent),
        pills: [...it.querySelectorAll<HTMLElement>(".ttl__opt")].map((b) => b.dataset.val + (b.getAttribute("aria-pressed") === "true" ? "*" : "") + (b.classList.contains("is-off") ? "~" : "") + (b.querySelector("i") ? "o" : "")),
        price: it.querySelector(".ttl__price")!.textContent, add: it.querySelector<HTMLButtonElement>("[data-opt-add]")!.textContent, addOff: it.querySelector<HTMLButtonElement>("[data-opt-add]")!.disabled,
        vid: it.dataset.vid, img: it.querySelector<HTMLImageElement>(".ttl__img img")!.getAttribute("src"),
        sum: [...it.closest("[data-look]")!.querySelectorAll("[data-sum]")].map((x) => x.textContent),
      }
    })
    const r0 = await read()
    check("variants: the picker shows a row per option, named with the value chosen, a pill per value (a colour with its swatch)", r0.rows.join() === "Size:S,Colour:Black" && r0.pills.join() === "S*,M~,L~,Black*o,Olive~o" && /\$10\.00$/.test(r0.add ?? ""), r0)
    await p.click(".ttl__panel > .ttl__look:not([hidden]) [data-item='1'] .ttl__opt[data-val='M']"); await sleep(200)
    const r1 = await read()
    check("  M (sold out in black) is chosen as it is: the button says sold out and cannot add", r1.vid === "vb" && r1.addOff && !/\$/.test(r1.add ?? "") && /\$12\.00/.test(r1.price ?? ""), r1)
    await p.click(".ttl__panel > .ttl__look:not([hidden]) [data-item='1'] .ttl__opt[data-val='L']"); await sleep(700)
    const r2 = await read()
    const want = new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format((1400 + setup.other) / 100)
    check("  L (only in olive) picks L olive: its price with the old one struck, its picture, the button's price and the look's total", r2.vid === "vc" && r2.pills.includes("L*") && r2.pills.includes("Olive*o") && r2.price === "$20.00$14.00" && r2.img === setup.pic && /\$14\.00$/.test(r2.add ?? "") && !r2.addOff && r2.sum.every((s) => s === want), { r2, want })
    await p.click(".ttl__panel > .ttl__look:not([hidden]) [data-item='1'] [data-opt-add]"); await sleep(900)
    check("  Add to bag sends the chosen variant, one of it", posts.length === 1 && JSON.parse(posts[0]).items.length === 1 && JSON.parse(posts[0]).items[0].id === "vc", posts)
    posts.length = 0
    /* The cart drawer opened over the page with that add: the rest is pressed in the page itself. */
    await p.evaluate(() => document.querySelector<HTMLElement>(".ttl__panel > .ttl__look:not([hidden]) [data-all]")!.click()); await sleep(900)
    const ids = posts.length ? (JSON.parse(posts[0]).items as { id: string }[]).map((x) => String(x.id)) : []
    check("  Add full look sends the chosen variant of each piece", ids.length === 2 && ids.includes("vc") && ids.includes(String(setup.otherId)), { ids, setup })
    /* The opened look carries the same choice; a choice there comes back to the panel */
    await p.evaluate(() => { const t = document.querySelector("try-the-look") as unknown as { i: number; models: Element[]; openView: (m: Element) => void }; t.openView(t.models[t.i]) }); await sleep(900)
    const card = await p.evaluate(() => { const it = document.querySelector<HTMLElement>("try-the-look [data-lb] [data-item='1']")!; return { vid: it.dataset.vid, price: it.querySelector(".ttl__price")!.textContent } })
    await p.click("try-the-look [data-lb] [data-item='1'] [data-pick]"); await sleep(700)
    await p.click("try-the-look [data-lb] [data-item='1'] .ttl__opt[data-val='S']"); await sleep(300)
    const back = await read()
    check("  the opened look shows the same choice, and a choice made there is the panel's too", card.vid === "vc" && card.price === "$20.00$14.00" && back.vid === "va" && back.price === "$10.00", { card, back })
    await p.close()
  }
}

/* ── Redline: the garment's close ───────────────────────────────────── */
async function redline(browser: Browser, base: string) {
  for (const rate of [1, 4]) {
    const p: Page = await browser.newPage()
    await p.setViewport({ width: 1280, height: 800 })
    await p.goto(`${base}/`, { waitUntil: "networkidle2", timeout: 90000 })
    await sleep(2200)
    const at = await p.evaluate(() => {
      const items = [...document.querySelectorAll("boutique-rail .brail__track:not([hidden]) .brail__item")]
      const li = items.slice(1).find((x) => { const r = x.querySelector(".brail__g")!.getBoundingClientRect(); return r.left > 60 && r.right < 1220 })!
      ;(window as unknown as { __li: Element }).__li = li
      const r = li.querySelector(".brail__g")!.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.45]
    })
    await p.mouse.move(at[0], at[1], { steps: 4 }); await sleep(900)
    await p.mouse.click(at[0], at[1]); await sleep(1600)
    await p.mouse.move(1270, 790); await sleep(300)
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate })
    await p.evaluate(() => {
      type F = { t: number; fly: boolean; front: number; side: number; vis: boolean; shadow: number }
      const W = window as unknown as { __li: Element; __s: F[]; __k: number; __on: boolean }
      W.__s = []; W.__on = true; W.__k = 0
      addEventListener("keydown", () => { W.__k = performance.now() }, { capture: true, once: true })
      const li = W.__li, fr = li.querySelector(".brail__front")!, sd = li.querySelector(".brail__side")!, pic = li.querySelector(".brail__pic")!
      const alpha = (f: string) => { const m = /rgba\(0, 0, 0, ([\d.]+)\)/.exec(f); return m ? +m[1] : /rgb\(0, 0, 0\)/.test(f) ? 1 : 0 }
      const tick = (t: number) => { if (!W.__on) return; W.__s.push({ t, fly: !!document.querySelector(".bf__fly"), front: +getComputedStyle(fr).opacity, side: +getComputedStyle(sd).opacity, vis: getComputedStyle(pic).visibility === "visible", shadow: alpha(getComputedStyle(fr).filter) }); requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await p.keyboard.press("Escape"); await sleep(3000)
    const r = await p.evaluate(() => { const W = window as unknown as { __s: { t: number; fly: boolean; front: number; side: number; vis: boolean; shadow: number }[]; __k: number; __on: boolean }; W.__on = false; return { s: W.__s, k: W.__k } })
    const first = r.s.find((f) => f.t > r.k)
    const wait = first ? first.t - r.k : 9999
    const landed = r.s.findIndex((f, i) => i > 0 && !f.fly && r.s[i - 1].fly)
    const after = r.s.slice(landed).filter((f) => f.vis)
    const thin = after.filter((f) => f.front < 0.95 && f.side < 0.95)
    check(`Redline close at ${rate}x CPU: the flight's first frame comes ${Math.round(wait)} ms after Escape (under ${rate === 1 ? 120 : 250} ms; before r68 about 190 ms at 1x and 440 ms at 4x)`, wait < (rate === 1 ? 120 : 250), { wait })
    check(`  it lands, then turns to its side with the front or the side view drawn whole in every frame (${after.length} frames)`, landed > 0 && after.length > 5 && thin.length === 0 && after[after.length - 1].side === 1 && after[after.length - 1].front === 0, thin.slice(0, 4))
    const sh = after.map((f) => f.shadow)
    check("  its shadow comes back softly after it lands (none in the frame it lands, rising, then whole)", sh.length > 3 && sh[0] < 0.02 && sh.slice(1).every((v, i) => v >= sh[i] - 0.001) && sh[sh.length - 1] > 0.13 && sh.some((v) => v > 0.02 && v < 0.12), sh)
    await p.close()
  }
}

async function main() {
  source()
  const chrome = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { console.log("(no Chromium: the browser part is skipped)"); return }
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/rail`)
  const built = auditSite(imported, "rail", false)
  const served = await serve(built, join("scripts", "theme-templates", "products", "rail"))
  const fine = ["--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"]
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage", ...fine] })
  const touchBrowser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    await tryTheLook(browser, touchBrowser, served.base)
    await redline(browser, served.base)
  } finally {
    await browser.close()
    await touchBrowser.close()
    served.server.close()
  }
}

main()
  .catch((e) => { failed++; console.error(e) })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed ? 1 : 0)
  })
