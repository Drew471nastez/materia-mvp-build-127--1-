/**
 * ROUND AR1: HOW A OnePage FEELS, MEASURED.
 *
 * The real PublicOnePage and the real preview frame (scripts/render-onepage-ar1.tsx),
 * at 390x844 with touch and at 1440x900 with a mouse. Chromium paints at 60Hz here,
 * so a frame is 16.7ms and "smooth" means no frame longer than 25ms.
 *
 *   sheets     tap to the first frame the sheet moves and to its content being
 *              visible: the Storelib form, the contact block, Privacy. Warm (the page
 *              idle for 2s first) and cold (tapped at once).
 *   keyboard   iOS's panned keyboard: a field focused on a touch phone, the visible
 *              height cut by the keys while the published inset is 0. The round Close
 *              must stay hidden through every viewport event.
 *   press      pointerdown to the button's first sunk frame, and the click still lands
 *              at once.
 *   back       a three step form in the sheet: Back (history) goes a step back, then
 *              closes; the document is never reloaded.
 *   hero       at scroll 0, half the hero, all of it: the dark layer, the picture held
 *              back, and the top bar shown or hidden; back up hides it.
 *   scroll     a scripted scroll down the page: frames over 25ms.
 *   preview    the real preview frame: a setting changed (a link's title, the shelf's
 *              title) replaces no block node and moves no block; a block removed folds
 *              away over several frames instead of one.
 *   animations every attention animation on the blocks that offer one is running.
 *
 *   ROOT=<checkout> CHROMIUM=... node scripts/check-onepage-ar1.mjs
 *   REPORT=1 prints without failing. SHOTS=<dir> saves screenshots.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const root = process.env.ROOT || process.cwd()
const { serveEditorProbe } = await import(join(root, "scripts/onepage-probe-server.mjs"))
const report = !!process.env.REPORT
const shots = process.env.SHOTS || null
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
if (shots) mkdirSync(shots, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const results = {}
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}
const record = (k, v) => {
  results[k] = v
  console.log(`   ${k}: ${JSON.stringify(v)}`)
}

const FORM = (steps) => ({
  id: "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  revision: 1,
  definition: {
    title: "Work with me",
    description: "",
    mode: "form",
    layout: steps ? "one_by_one" : "single",
    fields: [
      { id: "name", type: "text", label: "Your name", required: false },
      { id: "email", type: "email", label: "Email address", required: false },
      { id: "help", type: "textarea", label: "How can I help?", required: false },
    ],
    button_text: "Send",
    consent_text: "I agree that my answers and contact details may be used to respond to this request.",
    marketing_opt_in: false,
    completion: { kind: "message", message: "Thanks" },
  },
})

const SHELF = [
  { id: "p1", kind: "digital", title: "Film presets", href: "/p/a", image: "/images/onepage-themes/nature.webp", price_cents: 1900 },
  { id: "p2", kind: "digital", title: "Studio guide", href: "/p/b", image: "/images/onepage-themes/fusion.webp", price_cents: 0 },
]
const api = (req, body) => {
  if (req.url.startsWith("/api/onepage/blocks-live")) {
    const b = JSON.parse(body || "{}").blocks?.[0]
    return { body: { blocks: [{ ...b, data: { ...b.data, items: SHELF } }] } }
  }
  return null
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-ar1.tsx", statics: { "/images/": join(root, "public/images") }, api })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] })

/** A page on the live harness. `vv` installs a visualViewport the probe can drive (the iOS keyboard). */
async function live(viewport, { touch = false, query = "live", steps = false, vv = false } = {}) {
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
  if (vv) {
    await page.evaluateOnNewDocument(() => {
      const t = new EventTarget()
      const state = { height: innerHeight, offsetTop: 0, width: innerWidth, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 }
      const fake = Object.assign(t, {})
      for (const k of Object.keys(state)) Object.defineProperty(fake, k, { get: () => state[k] })
      Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake })
      window.__vv = (h, top) => { state.height = h; state.offsetTop = top; t.dispatchEvent(new Event("resize")); t.dispatchEvent(new Event("scroll")) }
    })
  }
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith("/api/forms/")) {
      return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ form: FORM(steps) }) }).catch(() => {}), 120)
    }
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#fff'></body>" })
    void r.continue()
  })
  await page.goto(`${base}/app?${query}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-op-block]")
  return page
}

const vp390 = { width: 390, height: 844 }
const vp1440 = { width: 1440, height: 900 }
const want = (k) => !only || only.has(k)

try {
  /* ── 1. sheets: tap to first moving frame, and to content visible ─────────── */
  if (want("sheets")) {
    console.log("\n── sheets")
    const OPEN = {
      form: { sel: "[data-op-block=form] a", content: "[data-block-sheet-panel] input" },
      contact: { sel: "[data-op-block=contact] [data-block-sheet-trigger]", content: "[data-block-sheet-panel] input, [data-block-sheet-panel] textarea" },
      privacy: { sel: "[data-onepage-legal] button:nth-child(2)", content: "[data-legal-reader], [data-onepage-dialog] h1, [data-sheet-panel] h1, [data-onepage-dialog-panel] article, [data-sheet-panel] article" },
    }
    for (const [label, vp, touch] of [["390", vp390, true], ["1440", vp1440, false]]) {
      for (const warm of [true, false]) {
        for (const [name, o] of Object.entries(OPEN)) {
          const page = await live(vp, { touch })
          if (warm) await sleep(2200)
          else await sleep(150)
          await page.$eval(o.sel, (el) => el.scrollIntoView({ block: "center" }))
          await sleep(warm ? 300 : 0)
          const r = await page.evaluate(
            (sel, content) =>
              new Promise((done) => {
                const el = document.querySelector(sel)
                const t0 = performance.now()
                let moved = null
                let shown = null
                let skeleton = false
                const tick = () => {
                  const t = performance.now() - t0
                  const panel = document.querySelector("[data-block-sheet-panel], [data-sheet-panel], [data-onepage-dialog-panel]")
                  if (panel && moved === null) {
                    const cs = getComputedStyle(panel)
                    if (parseFloat(cs.opacity) > 0.01 || (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)")) moved = Math.round(t)
                  }
                  if (document.querySelector("[data-form-loading]:not([data-form-loading=quiet]), [data-legal-loading] > div, .animate-pulse[role=status]")) skeleton = true
                  const c = document.querySelector(content)
                  if (c && shown === null && c.getClientRects().length && parseFloat(getComputedStyle(panel || c).opacity) > 0.01) shown = Math.round(t)
                  if ((moved !== null && shown !== null) || t > 3000) return done({ moved, shown, skeleton })
                  requestAnimationFrame(tick)
                }
                el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", isPrimary: true }))
                el.click()
                requestAnimationFrame(tick)
              }),
            o.sel,
            o.content,
          )
          record(`sheet ${label} ${warm ? "warm" : "cold"} ${name}`, r)
          if (warm) {
            check(r.moved !== null && r.moved <= 90, `${label} warm ${name}: the sheet moves within 5 frames of the tap (${r.moved}ms, ${(r.moved / 16.7).toFixed(1)} frames)`)
            check(r.shown !== null && r.shown <= 120, `${label} warm ${name}: its content is visible within 120ms (${r.shown}ms)`)
          }
          check(!r.skeleton, `${label} ${warm ? "warm" : "cold"} ${name}: no grey loading bars at any frame`)
          if (shots && warm && name === "form") await page.screenshot({ path: join(shots, `sheet-form-${label}.png`) })
          await page.close()
        }
      }
    }
  }

  /* ── 2. the keyboard: iOS panned, the round Close stays hidden ──────────── */
  if (want("keyboard")) {
    console.log("\n── keyboard")
    const page = await live(vp390, { touch: true, vv: true })
    await sleep(2200)
    await page.$eval("[data-op-block=form] a", (el) => el.click())
    await page.waitForSelector("[data-block-sheet-panel] textarea", { timeout: 4000 })
    await sleep(500)
    const foot = () => page.evaluate(() => { const f = document.querySelector("[data-block-sheet-foot]"); return !!f && f.getClientRects().length > 0 })
    const before = await foot()
    await page.$eval("[data-block-sheet-panel] textarea", (el) => el.focus())
    /* The keyboard rises (inset 336), then Safari pans to the field: the inset reads 0, the visible height stays cut. */
    await page.evaluate(() => window.__vv(508, 0))
    await sleep(120)
    const raised = await foot()
    await page.evaluate(() => window.__vv(508, 336))
    await sleep(120)
    const panned = await foot()
    await page.evaluate(() => window.__vv(508, 200))
    await sleep(120)
    const scrolled = await foot()
    const consent = await page.evaluate(() => {
      const label = [...document.querySelectorAll("[data-block-sheet-panel] label")].find((l) => /agree/.test(l.textContent || ""))
      const body = document.querySelector("[data-block-sheet-body]")
      if (!label || !body) return null
      body.scrollTop = body.scrollHeight
      const r = label.getBoundingClientRect()
      const b = body.getBoundingClientRect()
      return { labelBottom: Math.round(r.bottom), bodyBottom: Math.round(b.bottom), clipped: r.bottom > b.bottom + 0.5 }
    })
    if (shots) await page.screenshot({ path: join(shots, "keyboard-panned-390.png") })
    await page.evaluate(() => window.__vv(844, 0))
    await sleep(120)
    const gone = await foot()
    await page.$eval("[data-block-sheet-panel] textarea", (el) => el.blur())
    await sleep(120)
    const blurred = await foot()
    record("keyboard (foot bar shown?)", { before, raised, panned, scrolled, keysAwayFieldFocused: gone, blurred, consent })
    check(before && !raised && !panned && !scrolled, "390 touch: the round Close stays hidden while the keyboard is up, also once Safari has panned (inset 0)")
    check(gone && blurred, "390 touch: it comes back when the keys go (field still focused) and after blur")
    check(consent && !consent.clipped, `390: the consent line scrolls fully into the sheet above the keys (${JSON.stringify(consent)})`)
    await page.close()
  }

  /* ── 3. press ──────────────────────────────────────────────────────────── */
  if (want("press")) {
    console.log("\n── press")
    for (const [label, vp, touch] of [["390", vp390, true], ["1440", vp1440, false]]) {
      const page = await live(vp, { touch })
      await sleep(1500)
      const sel = "[data-op-block=link-none] a"
      await page.$eval(sel, (el) => el.scrollIntoView({ block: "center" }))
      await sleep(200)
      const box = await page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      await page.evaluate((sel) => {
        window.__clicked = null
        document.querySelector(sel).addEventListener("click", (e) => { e.preventDefault(); window.__clicked = performance.now() }, { once: true })
        window.__down = null
        document.addEventListener("pointerdown", () => { window.__down = performance.now() }, { once: true, capture: true })
      }, sel)
      const sample = page.evaluate((sel) => new Promise((done) => {
        const el = document.querySelector(sel)
        const out = []
        const tick = () => {
          const s = getComputedStyle(el).scale
          out.push({ t: performance.now(), s: s === "none" ? 1 : parseFloat(s) })
          if (out.length < 40) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }), sel)
      if (touch) {
        await page.touchscreen.touchStart(box.x, box.y)
        await sleep(90)
        await page.touchscreen.touchEnd()
      } else {
        await page.mouse.move(box.x, box.y)
        await page.mouse.down()
        await sleep(90)
        await page.mouse.up()
      }
      const frames = await sample
      const t = await page.evaluate(() => ({ down: window.__down, clicked: window.__clicked }))
      const firstSunk = frames.find((f) => f.s < 0.999)
      const min = Math.min(...frames.map((f) => f.s))
      const after = frames[frames.length - 1].s
      const r = { sunkAfterMs: firstSunk && t.down ? Math.round(firstSunk.t - t.down) : null, deepest: Math.round(min * 1000) / 1000, back: after, clickAfterUpMs: t.clicked && t.down ? Math.round(t.clicked - t.down - 90) : null }
      record(`press ${label}`, r)
      check(r.sunkAfterMs !== null && r.sunkAfterMs <= 34, `${label}: the button sinks within two frames of the press (${r.sunkAfterMs}ms, to ${r.deepest})`)
      check(Math.abs(after - 1) < 0.002, `${label}: and springs back (${after})`)
      check(r.clickAfterUpMs !== null && r.clickAfterUpMs < 50, `${label}: the click lands as the finger lifts, never held back (${r.clickAfterUpMs}ms)`)
      await page.close()
    }
  }

  /* ── 4. back in a form with steps ─────────────────────────────────────── */
  if (want("back")) {
    console.log("\n── back")
    const page = await live(vp390, { touch: true, steps: true })
    await sleep(2200)
    await page.evaluate(() => { window.__same = "kept"; window.__navs = 0; addEventListener("beforeunload", () => { window.__navs++ }) })
    await page.$eval("[data-op-block=form] a", (el) => el.click())
    await page.waitForSelector("[data-block-sheet-panel] input", { timeout: 4000 })
    await sleep(450)
    const step = () => page.evaluate(() => document.querySelector("[data-block-sheet-panel] [data-form-step]")?.getAttribute("data-form-step") ?? null)
    const next = async () => { await page.$eval("[data-block-sheet-panel] form button[type=submit]", (b) => b.click()); await sleep(300) }
    await next()
    await next()
    const at = await step()
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 3000 }).catch(() => {})
    await sleep(350)
    const afterOne = await step()
    await page.goBack({ timeout: 3000 }).catch(() => {})
    await sleep(350)
    const afterTwo = await step()
    await page.goBack({ timeout: 3000 }).catch(() => {})
    await sleep(500)
    const open = await page.evaluate(() => !!document.querySelector("[data-block-sheet-open]"))
    const kept = await page.evaluate(() => ({ same: window.__same, navs: window.__navs, url: location.pathname + location.search }))
    record("back", { atStep: at, afterBack1: afterOne, afterBack2: afterTwo, openAfterBack3: open, kept })
    check(at === "2" && afterOne === "1" && afterTwo === "0", `390: Back goes a step back inside the sheet (2 -> ${afterOne} -> ${afterTwo})`)
    check(!open, "390: Back from the first step closes the sheet")
    check(kept.same === "kept" && kept.navs === 0, "390: the page is never reloaded or left")
    await page.close()
  }

  /* ── 5. hero and its bar ──────────────────────────────────────────────── */
  if (want("hero")) {
    console.log("\n── hero")
    for (const [label, vp, touch] of [["390", vp390, true], ["1440", vp1440, false]]) {
      const page = await live(vp, { touch })
      await sleep(1500)
      const h = await page.evaluate(() => { const el = [...document.querySelectorAll("[data-hero-scroll]")].find((e) => e.getClientRects().length); const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), height: Math.round(r.height) } })
      const read = () => page.evaluate(() => {
        const el = [...document.querySelectorAll("[data-hero-scroll]")].find((e) => e.getClientRects().length)
        const shift = el.querySelector("[data-hero-shift]")
        const t = getComputedStyle(shift).translate
        return {
          y: Math.round(scrollY),
          dim: Math.round(parseFloat(getComputedStyle(el.querySelector("[data-hero-scrim]")).opacity) * 100) / 100,
          held: t === "none" ? 0 : Math.round(parseFloat(t.split(" ")[1] || "0")),
          bar: document.querySelector("[data-op-topbar]")?.getAttribute("data-op-topbar"),
          barOpacity: Math.round(parseFloat(getComputedStyle(document.querySelector("[data-op-topbar]")).opacity) * 100) / 100,
        }
      })
      const states = []
      for (const y of [0, Math.round(h.height / 2), h.height + h.top + 40, Math.round(h.height / 3), 0]) {
        await page.evaluate((y) => scrollTo(0, y), y)
        await sleep(400)
        states.push(await read())
        if (shots && states.length === 3) await page.screenshot({ path: join(shots, `hero-bar-${label}.png`) })
        if (shots && states.length === 2) await page.screenshot({ path: join(shots, `hero-half-${label}.png`) })
      }
      record(`hero ${label} (height ${h.height})`, states)
      const [top, half, past, back, home] = states
      check(top.dim <= 0.08 && half.dim > 0.15 && half.dim < past.dim + 0.001, `${label}: the picture darkens as it scrolls (${top.dim} -> ${half.dim} -> ${past.dim})`)
      check(half.held > 10, `${label}: the picture is held back while the content slides over it (${half.held}px at half)`)
      check(top.bar === "hidden" && half.bar === "hidden" && past.bar === "shown" && past.barOpacity > 0.95, `${label}: the top bar shows once the hero has gone (${top.bar}, ${half.bar}, ${past.bar} at ${past.barOpacity})`)
      check(back.bar === "hidden" && home.bar === "hidden" && home.barOpacity < 0.05, `${label}: scrolling back up to the picture hides it (${back.bar}, ${home.barOpacity})`)
      await page.close()
    }
  }

  /* ── 6. scroll smoothness ─────────────────────────────────────────────── */
  if (want("scroll")) {
    console.log("\n── scroll")
    for (const [label, vp, touch] of [["390", vp390, true], ["1440", vp1440, false]]) {
      const page = await live(vp, { touch })
      await sleep(2000)
      const cdp = await page.createCDPSession()
      const sampling = page.evaluate(() => new Promise((done) => {
        const ts = []
        let lt = 0
        try { new PerformanceObserver((l) => { for (const e of l.getEntries()) lt += e.duration }).observe({ type: "longtask" }) } catch {}
        const tick = (t) => { ts.push(t); if (ts.length < 150) requestAnimationFrame(tick); else done({ ts, lt }) }
        requestAnimationFrame(tick)
      }))
      if (touch) {
        /* A finger drawn up the screen and let go at speed (synthesizeScrollGesture's touch does not scroll in this headless build). */
        for (const [from, steps] of [[760, 22], [760, 22]]) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: from }] })
          for (let i = 1; i <= steps; i++) {
            await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: from - i * 28 }] })
            await sleep(16)
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
          await sleep(500)
        }
      } else {
        for (let i = 0; i < 20; i++) {
          await page.mouse.wheel({ deltaY: 120 })
          await sleep(60)
        }
      }
      const { ts, lt } = await sampling
      const gaps = ts.slice(1).map((t, i) => t - ts[i])
      const long = gaps.filter((g) => g > 25).length
      const r = { frames: gaps.length, over25ms: long, worstMs: Math.round(Math.max(...gaps)), medianMs: Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] * 10) / 10, longTaskMs: Math.round(lt), scrolledTo: await page.evaluate(() => Math.round(scrollY)) }
      record(`scroll ${label}`, r)
      check(r.over25ms <= 2, `${label}: a scripted scroll drops at most 2 of ${r.frames} frames at 60Hz (${r.over25ms}, worst ${r.worstMs}ms)`)
      await page.close()
    }
  }

  /* ── 7. the preview: a setting changed, a block removed ──────────────── */
  if (want("preview")) {
    console.log("\n── preview")
    const page = await browser.newPage()
    page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 300)))
    page.on("console", (m) => { if (m.type() === "error") console.log("   console", m.text().slice(0, 300)) })
    await page.setViewport({ ...vp390, deviceScaleFactor: 1 })
    await page.goto(`${base}/app?host`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__drawn, { timeout: 15000 })
    await sleep(2500)
    const frame = await (await page.$("[data-host-frame]")).contentFrame()
    await frame.waitForSelector("[data-onepage-shelf] a", { timeout: 5000 }).catch(() => {})
    const watch = () => frame.evaluate(() => {
      window.__removed = 0
      window.__imgsRemoved = 0
      window.__heights = []
      const mo = new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.removedNodes) {
          if (!(n instanceof Element)) continue
          if (n.matches("[data-op-block]") || n.querySelector("[data-op-block]")) window.__removed++
          if (n.matches("img") || n.querySelector("img")) window.__imgsRemoved++
        }
      })
      mo.observe(document.body, { childList: true, subtree: true })
      window.__mo = mo
      const track = () => {
        const tops = {}
        for (const el of document.querySelectorAll("[data-op-block]")) tops[el.getAttribute("data-op-block")] = Math.round(el.getBoundingClientRect().top)
        window.__heights.push(tops)
        if (window.__heights.length < 40) requestAnimationFrame(track)
      }
      requestAnimationFrame(track)
    })
    const settle = () => frame.evaluate(() => new Promise((r) => setTimeout(() => { window.__mo.disconnect(); r({ removed: window.__removed, imgsRemoved: window.__imgsRemoved, frames: window.__heights }) }, 900)))
    const maxStep = (frames, id) => {
      let worst = 0
      for (let i = 1; i < frames.length; i++) if (frames[i][id] !== undefined && frames[i - 1][id] !== undefined) worst = Math.max(worst, Math.abs(frames[i][id] - frames[i - 1][id]))
      return worst
    }
    const shelfCount = () => frame.evaluate(() => document.querySelectorAll("[data-onepage-shelf] a, [data-onepage-shelf] .animate-pulse").length + ":" + document.querySelectorAll("[data-onepage-shelf] .animate-pulse").length)
    const PAGE = await page.evaluate(() => window.__PAGE)
    const edit = (fn) => { const p = JSON.parse(JSON.stringify(PAGE)); fn(p); return p }
    for (const [name, fn] of [
      ["link title", (p) => { p.blocks.find((b) => b.id === "link-none").data.label = "Link renamed" }],
      ["shelf title", (p) => { p.blocks.find((b) => b.id === "shelf").data.title = "Shop now" }],
      ["shelf layout", (p) => { p.blocks.find((b) => b.id === "shelf").data.layout = "grid" }],
    ]) {
      const before = await shelfCount()
      await watch()
      await page.evaluate((p) => window.__post(p), edit(fn))
      const ghostsDuring = []
      for (let i = 0; i < 6; i++) { await sleep(100); ghostsDuring.push(await shelfCount()) }
      const r = await settle()
      const below = maxStep(r.frames, "pdf")
      record(`preview ${name}`, { blockNodesReplaced: r.removed, imgsReplaced: r.imgsRemoved, biggestMoveOfABlockBelowPx: below, shelfLinks_ghosts: [before, ...ghostsDuring] })
      check(r.removed === 0, `preview ${name}: no block node is replaced (${r.removed})`)
      check(!ghostsDuring.some((s) => !s.endsWith(":0")), `preview ${name}: the shelf never drops to grey stand-ins (${ghostsDuring.join(" ")})`)
    }
    /* A block removed: it folds away over several frames. */
    await watch()
    const removed = edit((p) => { p.blocks = p.blocks.filter((b) => b.id !== "link-bounce") })
    await page.evaluate((p) => window.__post(p), removed)
    const r = await settle()
    const below = r.frames.map((f) => f["link-shake"]).filter((v) => v !== undefined)
    let steps = 0
    let worst = 0
    for (let i = 1; i < below.length; i++) { const d = Math.abs(below[i] - below[i - 1]); if (d > 0.5) steps++; worst = Math.max(worst, d) }
    console.log("   debug", r.frames.length, JSON.stringify(r.frames[0]).slice(0, 300))
    record("preview remove", { frames: below.length, framesTheNextBlockMoved: steps, biggestStepPx: worst, total: below[0] - below[below.length - 1], gone: await frame.evaluate(() => !document.querySelector("[data-op-block=link-bounce]")) })
    check(steps >= 6 && worst < 25, `preview remove: the block under it glides up over ${steps} frames, biggest step ${worst}px (was one frame)`)
    await page.close()
  }

  /* ── 7b. the editor's list: Remove, then Delete, folds the card away ─── */
  if (want("editor")) {
    console.log("\n── editor")
    const ed = await serveEditorProbe({ root })
    try {
      for (const [label, vp] of [["1440", vp1440], ["390", vp390]]) {
        const page = await browser.newPage()
        page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
        page.on("error", (e) => console.log("   crash", String(e).slice(0, 200)))
        page.on("console", (m) => { if (m.type() === "error") console.log("   console", m.text().slice(0, 200)) })
        await page.setViewport({ ...vp, deviceScaleFactor: 1, isMobile: label === "390", hasTouch: label === "390" })
        await page.goto(`${ed.base}/app/onepage#links`, { waitUntil: "domcontentloaded" })
        await page.waitForSelector("[data-block-id=b1]", { timeout: 20000 })
        await sleep(1200)
        /* A real press: the menu opens on pointerdown. */
        if (label === "390") await page.tap("[data-block-id=b1] button[aria-label^='More actions']")
        else await page.click("[data-block-id=b1] button[aria-label^='More actions']")
        await sleep(600)
        const removeItem = await page.evaluateHandle(() => [...document.querySelectorAll("[role=menuitem], button")].find((e) => /^\s*Remove\s*$/.test(e.textContent || "") && e.getClientRects().length))
        await removeItem.asElement()?.click()
        await sleep(400)
        const sampling = page.evaluate(() => new Promise((done) => {
          const out = []
          const tick = () => {
            const el = document.querySelector("[data-block-id=b3]")
            out.push(el ? Math.round(el.getBoundingClientRect().top) : null)
            if (out.length < 40) requestAnimationFrame(tick)
            else done(out)
          }
          requestAnimationFrame(tick)
        }))
        await page.$eval("[data-block-delete]", (b) => b.click())
        const tops = (await sampling).filter((v) => v !== null)
        let steps = 0
        let worst = 0
        for (let i = 1; i < tops.length; i++) { const d = Math.abs(tops[i] - tops[i - 1]); if (d > 0.5) steps++; worst = Math.max(worst, d) }
        const gone = await page.evaluate(() => !document.querySelector("[data-block-id=b1]"))
        record(`editor remove ${label}`, { trace: tops.slice(0, 24).join(","), framesTheCardBelowMoved: steps, biggestStepPx: worst, total: tops[0] - tops[tops.length - 1], removed: gone })
        check(gone && steps >= 5 && worst < 30, `${label} editor: Delete folds the card away, the cards under it glide up over ${steps} frames (biggest step ${worst}px)`)
        await page.close()
      }
    } finally {
      ed.server.close()
    }
  }

  /* ── 8. animations ────────────────────────────────────────────────────── */
  if (want("animations")) {
    console.log("\n── animations")
    for (const [where, url] of [["live", "live"], ["preview", "host"]]) {
      const page = await browser.newPage()
      await page.setViewport({ ...vp390, deviceScaleFactor: 1 })
      await page.goto(`${base}/app?${url}`, { waitUntil: "domcontentloaded" })
      let ctx = page
      if (url === "host") {
        await page.waitForFunction(() => window.__drawn, { timeout: 15000 })
        ctx = await (await page.$("[data-host-frame]")).contentFrame()
      }
      await ctx.waitForSelector("[data-op-block]")
      await sleep(1500)
      const anims = await ctx.evaluate(() => {
        const out = {}
        for (const id of ["link-pulse", "link-bounce", "link-shake", "link-glow", "link-swipe", "link-featured", "pdf", "email"]) {
          const box = document.querySelector(`[data-op-block="${id}"]`)
          if (!box) { out[id] = "missing"; continue }
          const el = box.querySelector("[class*=animate-onepage-]")
          if (!el) { out[id] = "no class"; continue }
          const cs = getComputedStyle(el)
          const after = getComputedStyle(el, "::after").animationName
          const running = el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").map((a) => a.animationName)
          out[id] = { name: cs.animationName !== "none" ? cs.animationName : after, running }
        }
        return out
      })
      record(`animations ${where}`, anims)
      for (const [id, v] of Object.entries(anims)) check(typeof v === "object" && v.running.some((n) => /onepage-/.test(n)), `${where} ${id}: its animation is running (${JSON.stringify(v)})`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log("\nRESULTS " + JSON.stringify(results))
if (failures.length && !report) {
  console.error(`\n${failures.length} failed`)
  process.exit(1)
}
console.log(failures.length ? `\n${failures.length} would fail (REPORT)` : "\nall passed")
