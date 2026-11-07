/**
 * OnePage header, cover, wallpaper and the Design tab's way back, measured
 * (round AL, track AL4).
 *
 *   node scripts/check-onepage-header-al4.mjs
 *   SHOTS=/some/dir  also writes screenshots
 *
 * The real public page, editor and preview frame (components/onepage/*),
 * bundled by scripts/onepage-probe-server.mjs, in headless Chromium.
 *
 *   1. COVER. The creator's own cover runs edge to edge: on a phone from the
 *      screen's left edge to its right and from the top of the page; on a
 *      computer across the page card's full width from its top. No corner
 *      rounding of its own, the 5:2 shape the crop editor uses, the avatar
 *      over its lower edge by half, fetched first (fetchpriority high), and
 *      no sideways scroll.
 *   2. PATTERN. With a pattern and see-through social icons, no pattern
 *      pixel is drawn beside the header or the social icons, and the
 *      pattern is there below them.
 *   3. GRADIENT DRIFT. With Animate on, one layer moves by a transform
 *      (its matrix changes over time), the page itself runs no background
 *      animation, the layer is not drawn with reduced motion, and it pauses
 *      while the tab is hidden.
 *   4. AVATAR. Pressing the photo opens the viewer, on the live page and in
 *      the editor's preview, and Escape closes it.
 *   5. DESIGN TAB. In Wallpaper, scrolled past the panel's header, the bar
 *      with the way back sits at the top of the editor's column, shown;
 *      scrolled back up it is hidden; pressed, it goes back to Design.
 */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { mkdirSync, readFileSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const COVER = "https://storelib.com/media/covers/probe/cover.jpg"
const AVATAR = "https://storelib.com/media/avatars/probe/avatar.jpg"
const header = { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } }
const socials = { id: "soc", type: "social_row", enabled: true, sort_order: 1, data: { platforms: [{ platform: "instagram", url: "https://instagram.com/x" }, { platform: "tiktok", url: "https://tiktok.com/@x" }, { platform: "youtube", url: "https://youtube.com/x" }] } }
const links = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: 2 + i, data: { title: `Link ${i + 1}`, url: `https://example.com/${i}` } }))
let state = { avatar: AVATAR, theme: {}, blocks: [header, socials, ...links] }

const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-avatar-audit.tsx",
  api(req) {
    if (req.url === "/audit-state") return { body: state }
    if (req.url.startsWith("/_next/image")) return { status: 503, body: { error: "original" } }
    return null
  },
})
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const results = []
const note = (s) => {
  results.push(s)
  console.log("  " + s)
}

async function openPage(width, theme, path = "/app/onepage?live", extra = {}) {
  state = { ...state, theme }
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.setViewport({ width, height: 900, ...extra })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "storelib.com" && u.pathname.startsWith("/media/"))
      return void r.respond({ status: 200, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" }, body: readFileSync(u.pathname.includes("avatar") ? "public/placeholder-user.jpg" : "public/placeholder.jpg") })
    void r.continue()
  })
  await page.goto(base + path)
  return { page, context, errors }
}
const shown = (page, sel) =>
  page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  }, sel)

const SOLID = { background_type: "solid", background_color: "#f5f1ea", text_color: "#1a1a2e" }
const OWN_COVER = { cover_image_url: COVER, cover_profile_layout: true, cover_crop: { x: 50, y: 50, zoom: 1 } }

try {
  /* 1. The cover, edge to edge. */
  console.log("\n1. cover")
  for (const width of [320, 390, 1280]) {
    for (const look of [{}, { header_align: "left" }]) {
      const { page, context, errors } = await openPage(width, { ...SOLID, ...OWN_COVER, ...look })
      await page.waitForFunction(() => [...document.querySelectorAll("[data-cover-image] img")].some((i) => i.getClientRects().length && i.naturalWidth > 0))
      /* Past the blocks' short arrival rise (a transform), so what is read is where they rest. */
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), { timeout: 5000 }).catch(() => {})
      await sleep(200)
      const band = await shown(page, "[data-cover-band]")
      const avatar = await shown(page, "[data-page-avatar]")
      const g = await page.evaluate(() => {
        const b = [...document.querySelectorAll("[data-cover-band]")].find((e) => e.getClientRects().length)
        const img = b.querySelector("img")
        const card = b.closest(".rounded-\\[40px\\]")
        const c = card ? card.getBoundingClientRect() : null
        return {
          radius: parseFloat(getComputedStyle(b).borderTopLeftRadius) || 0,
          priority: img.getAttribute("fetchpriority"),
          loading: img.getAttribute("loading"),
          card: c ? { left: c.left, right: c.right, top: c.top } : null,
          scrollX: document.documentElement.scrollWidth > innerWidth,
        }
      })
      const frame = g.card ?? { left: 0, right: width, top: 0 }
      const tag = `${width}px${look.header_align ? " left" : ""}`
      const overlap = (band.bottom - avatar.top) / avatar.height
      note(`${tag}: cover ${band.left.toFixed(1)}..${band.right.toFixed(1)} x top ${band.top.toFixed(1)}, frame ${frame.left.toFixed(1)}..${frame.right.toFixed(1)} top ${frame.top.toFixed(1)}, ${band.width.toFixed(0)}x${band.height.toFixed(0)} (${(band.width / band.height).toFixed(3)}:1), own radius ${g.radius}px, avatar overlap ${overlap.toFixed(3)}, fetchpriority ${g.priority}`)
      assert.ok(Math.abs(band.left - frame.left) <= 0.5 && Math.abs(band.right - frame.right) <= 0.5, `${tag}: the cover meets both edges`)
      assert.ok(Math.abs(band.top - frame.top) <= 0.5, `${tag}: the cover starts at the top`)
      assert.equal(g.radius, 0, `${tag}: no rounding of its own`)
      assert.ok(Math.abs(band.width / band.height - 2.5) < 0.02, `${tag}: the 5:2 band the editor crops`)
      assert.ok(Math.abs(overlap - 0.5) <= 0.04, `${tag}: the avatar over the cover's edge by half`)
      assert.equal(g.priority, "high")
      assert.equal(g.loading, "eager")
      assert.equal(g.scrollX, false, `${tag}: no sideways scroll`)
      assert.deepEqual(errors, [])
      if (shots && !look.header_align) await page.screenshot({ path: `${shots}/al4-cover-${width}.png` })
      await context.close()
    }
  }

  /* 2. The pattern keeps out from behind the header. */
  console.log("\n2. pattern")
  const PATTERN = { background_type: "solid", background_color: "#1a3a5a", text_color: "#ffffff", background_pattern: "grid", pattern_color: "#ffffffff", pattern_opacity: "very_hard", social_icon_style: "outline" }
  for (const width of [390, 1280]) {
    const { page, context, errors } = await openPage(width, PATTERN)
    await page.waitForSelector("[data-op-social-row]")
    await sleep(500)
    const soc = await shown(page, "[data-op-social-row]")
    const clear = await page.evaluate(() => {
      const p = [...document.querySelectorAll("[data-pattern-clears-header]")].find((e) => e.getClientRects().length)
      const box = p.parentElement
      return { v: parseFloat(getComputedStyle(box).getPropertyValue("--op-pattern-clear")), top: box.getBoundingClientRect().top, left: box.getBoundingClientRect().left }
    })
    /* Read the pixels: a 40px wide strip at the box's left edge, where only the wallpaper is drawn. Pattern pixels are near white. */
    for (const el of await page.$$("[data-share-button], [data-notification-bell]")) await el.evaluate((e) => (e.style.visibility = "hidden"))
    await page.evaluate(() => { for (const el of document.querySelectorAll("body *")) if (getComputedStyle(el).position === "fixed") el.style.visibility = "hidden" })
    const strip = async (y0, y1) => {
      const png = await page.screenshot({ clip: { x: clear.left + 2, y: y0, width: 40, height: y1 - y0 }, encoding: "base64" })
      return page.evaluate(async (png) => {
        const img = new Image()
        img.src = "data:image/png;base64," + png
        await img.decode()
        const c = document.createElement("canvas")
        c.width = img.width
        c.height = img.height
        const x = c.getContext("2d")
        x.drawImage(img, 0, 0)
        const d = x.getImageData(0, 0, c.width, c.height).data
        let light = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 3 * 150) light++
        return light
      }, png)
    }
    /* Below the card's 40px rounded corner on a computer, where the page around the card shows. */
    const above = await strip(Math.max(0, clear.top + 44), soc.bottom)
    const below = await strip(soc.bottom + 110, soc.bottom + 260)
    note(`${width}px: social row bottom ${(soc.bottom - clear.top).toFixed(1)}px into the page, --op-pattern-clear ${clear.v}px; pattern pixels beside the header ${above}, below it ${below}`)
    assert.ok(Math.abs(clear.v - (soc.bottom - clear.top)) <= 1.5, `${width}: the clearance is the social row's bottom`)
    assert.equal(above, 0, `${width}: no pattern beside the header and the icons`)
    assert.ok(below > 50, `${width}: the pattern is drawn below`)
    assert.deepEqual(errors, [])
    if (shots) await page.screenshot({ path: `${shots}/al4-pattern-${width}.png` })
    await context.close()
  }

  /* 3. The gradient drifting. */
  console.log("\n3. gradient drift")
  const GRAD = { background_type: "gradient", background_gradient: "linear-gradient(180deg, #f7c59f 0%, #c4553b 100%)", background_color: "#f7c59f", text_color: "#1a1a2e", animated_gradient: true }
  for (const width of [390, 1280]) {
    const { page, context, errors } = await openPage(width, GRAD)
    await page.waitForSelector("[data-wallpaper-drift-layer]")
    const read = () =>
      page.evaluate(() => {
        const layers = [...document.querySelectorAll("[data-wallpaper-drift-layer]")].filter((e) => e.getClientRects().length)
        const l = layers.at(-1)
        const cs = getComputedStyle(l)
        const live = [...document.querySelectorAll(".onepage-live")].find((e) => e.getClientRects().length)
        return { n: layers.length, name: cs.animationName, transform: cs.transform, state: cs.animationPlayState, page: getComputedStyle(live).animationName }
      })
    const a = await read()
    await sleep(1500)
    const b = await read()
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    const hidden = await read()
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    const back = await read()
    note(`${width}px: ${a.n} drift layer(s), animation ${a.name}, page animation ${a.page}; transform ${a.transform} then ${b.transform}; hidden tab ${hidden.state}, visible again ${back.state}`)
    assert.equal(a.name, "onepageDrift")
    assert.equal(a.page, "none", `${width}: the page itself repaints no background animation`)
    assert.notEqual(a.transform, b.transform, `${width}: the layer moves by a transform`)
    assert.equal(hidden.state, "paused")
    assert.equal(back.state, "running")
    assert.deepEqual(errors, [])
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const still = await page.evaluate(() => [...document.querySelectorAll("[data-wallpaper-drift]")].every((e) => getComputedStyle(e).display === "none"))
    note(`${width}px reduced motion: drift drawn ${still ? "no" : "yes"}`)
    assert.ok(still, `${width}: no drift with reduced motion`)
    await context.close()
  }

  /* 4. The avatar opens. */
  console.log("\n4. avatar viewer")
  for (const width of [390, 1280]) {
    const { page, context, errors } = await openPage(width, { ...SOLID, ...OWN_COVER })
    await page.waitForSelector("[data-page-avatar] img")
    await sleep(300)
    const a = await shown(page, "[data-page-avatar]")
    await page.mouse.click(a.left + a.width / 2, a.top + a.height / 2)
    await page.waitForSelector("[data-avatar-lightbox-photo]", { visible: true })
    await sleep(350)
    const photo = await shown(page, "[data-avatar-lightbox-photo]")
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => !document.querySelector("[data-avatar-lightbox-photo]"), { timeout: 3000 })
    note(`${width}px live: pressed the ${a.width.toFixed(0)}px photo, the viewer showed it ${photo.width.toFixed(0)}px wide, Escape closed it`)
    assert.ok(photo.width > a.width)
    assert.deepEqual(errors, [])
    await context.close()
  }
  {
    const { page, context, errors } = await openPage(1280, { ...SOLID, ...OWN_COVER }, "/app/onepage#links")
    const frame = await page.waitForFrame((f) => f.url().includes("/onepage-preview"))
    await frame.waitForSelector("[data-page-avatar] img")
    await sleep(500)
    await frame.evaluate(() => [...document.querySelectorAll("[data-page-avatar]")].find((e) => e.getClientRects().length).click())
    await frame.waitForSelector("[data-avatar-lightbox-photo]", { visible: true })
    note("1280px editor preview: pressing the photo opens the viewer in the preview")
    assert.deepEqual(errors, [])
    await context.close()
  }

  /* 5. The Design tab's way back. */
  console.log("\n5. sticky back")
  for (const [label, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const { page, context, errors } = await openPage(vp.width, SOLID, "/app/onepage#design", vp)
    await page.evaluate(() => { try { sessionStorage.clear() } catch {} })
    await page.waitForSelector('[data-nav-row="wallpaper"]', { visible: true })
    await sleep(600)
    await page.click('[data-nav-row="wallpaper"]')
    await page.waitForSelector("[data-sticky-back]", { timeout: 5000 }).catch(async (e) => { if (shots) await page.screenshot({ path: `${shots}/al4-sticky-fail-${label}.png` }); throw e })
    await sleep(700)
    const read = () =>
      page.evaluate(() => {
        const bar = document.querySelector("[data-sticky-back]")
        const sc = bar.closest("[data-scroll-container]")
        const r = bar.getBoundingClientRect()
        return { state: bar.getAttribute("data-sticky-back"), opacity: Number(getComputedStyle(bar).opacity), top: r.top, height: r.height, scTop: sc.getBoundingClientRect().top, scrollTop: sc.scrollTop, scrollMax: sc.scrollHeight - sc.clientHeight }
      })
    const atTop = await read()
    await page.evaluate(() => { const sc = document.querySelector("[data-sticky-back]").closest("[data-scroll-container]"); sc.scrollTop = 600 })
    await sleep(400)
    const down = await read()
    note(`${label}px: at the top the bar is ${atTop.state} (opacity ${atTop.opacity}); scrolled ${down.scrollTop}px of ${down.scrollMax} it is ${down.state} (opacity ${down.opacity}), its top ${down.top.toFixed(1)} against the column's ${down.scTop.toFixed(1)}, ${down.height.toFixed(0)}px tall`)
    assert.equal(atTop.state, "hidden")
    assert.equal(atTop.opacity, 0)
    assert.equal(down.state, "shown")
    assert.equal(down.opacity, 1)
    assert.ok(Math.abs(down.top - down.scTop) <= 1, `${label}: stuck to the column's top`)
    if (shots) await page.screenshot({ path: `${shots}/al4-sticky-${label}.png` })
    await page.evaluate(() => { const sc = document.querySelector("[data-sticky-back]").closest("[data-scroll-container]"); sc.scrollTop = 0 })
    await sleep(400)
    const up = await read()
    assert.equal(up.state, "hidden", `${label}: hidden again at the top`)
    await page.evaluate(() => { const sc = document.querySelector("[data-sticky-back]").closest("[data-scroll-container]"); sc.scrollTop = 600 })
    await sleep(400)
    await page.click("[data-sticky-back-button]")
    await page.waitForFunction(() => !document.querySelector("[data-sticky-back]"), { timeout: 3000 })
    await page.waitForSelector('[data-nav-row="wallpaper"]', { visible: true })
    note(`${label}px: pressing it went back to Design`)
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log(`\nok: ${results.length} measurements`)
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
