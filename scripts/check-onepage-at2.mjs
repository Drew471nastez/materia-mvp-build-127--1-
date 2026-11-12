/**
 * ROUND AT, TRACK 2: THE ONEPAGE EDITOR AND ITS PREVIEW ON A PHONE, MEASURED.
 *
 * The real editor (scripts/render-onepage-editor.tsx) and its real preview frame
 * (/onepage-preview, components/onepage/preview-document), at 390x844 with touch
 * and at 1440x900 with a mouse.
 *
 *   subscribe  the newsletter's Subscribe at full strength with an empty box, on the
 *              live page and in the preview frame; a press with nothing typed shows
 *              the inline error and posts nothing; typing clears it
 *   rows       every row of the Links list: which carry a picture (a map, a still, a
 *              cover, a preview image, a product, the creator's photo, a brand mark)
 *   add        + Add on a phone: a scroll that starts on it never tints it and never
 *              opens the sheet; a tap opens it; a mouse's hover still tints it
 *   share      Share your OnePage: one native haptic in the app (a stubbed bridge),
 *              nothing in a browser
 *   bar        the preview frame on a phone in the app (StorelibApp, a 47px notch):
 *              the frame is marked embedded, has no app class and no shield, the
 *              profile bar is 60px at the frame's top, never taller while scrolling,
 *              shown only once the name has gone, and the frame's layout shift (CLS)
 *   switch     Preview and Edit: time from the tap to the page drawn, frames with the
 *              layer up and nothing drawn, and the tab's scroll kept
 *   sticky     a Design panel scrolled by a touch gesture at 390: frames over 25ms,
 *              the sticky bar's height and its top against the column's every frame
 *   period     a block's stats period: a sheet over the stats on a phone, wholly on
 *              screen and on top; a popover inside the window on a computer
 *
 *   CHROMIUM=... node scripts/check-onepage-at2.mjs
 *   REPORT=1 prints without failing. SHOTS=<dir> saves screenshots. ONLY=bar,switch picks.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.cwd()
const report = !!process.env.REPORT
const shots = process.env.SHOTS || null
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
if (shots) mkdirSync(shots, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}
const want = (k) => !only || only.has(k)
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) })
}

/* The head script's own words (app/(storelib)/layout.tsx), run in every frame as the app runs them: the frame's mark and the app class. */
const layout = readFileSync(join(root, "app/(storelib)/layout.tsx"), "utf8")
const markAt = layout.indexOf("try{if(window.self!==window.top")
const mark = layout.slice(markAt, layout.indexOf("catch(e){}", markAt) + "catch(e){}".length)
const appAt = layout.indexOf("try{var _ua=navigator.userAgent")
const appEnd = layout.indexOf("h.classList.add('capacitor');", appAt) + "h.classList.add('capacitor');".length
const headScript = (mark + layout.slice(appAt, appEnd) + "}}catch(e){}").replace(/\\\\/g, "\\")

/* A stand-in for a map tile (the sandbox does not fetch OpenStreetMap): streets on paper, so a screenshot reads as a map. */
const TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f2efe9"/><path d="M0 70 L256 90 M0 180 L256 160 M60 0 L80 256 M190 0 L170 256" stroke="#fff" stroke-width="10"/><path d="M0 120 C80 100 160 150 256 120" stroke="#aad3df" stroke-width="18" fill="none"/><rect x="100" y="100" width="50" height="40" fill="#c8facc"/></svg>`
const art = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue},55%,58%)"/><circle cx="100" cy="90" r="46" fill="hsl(${hue},60%,82%)"/></svg>`

const BLOCKS = [
  { id: "hd", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "mp", type: "map", enabled: true, sort_order: 0, data: { title: "See", address: "44.407097,26.153009", show_button: true } },
  { id: "ma", type: "map", enabled: true, sort_order: 1, data: { title: "Studio", address: "350 5th Ave, New York" } },
  { id: "vd", type: "video", enabled: true, sort_order: 2, data: { title: "Studio tour", url: "https://youtu.be/dQw4w9WgXcQ" } },
  { id: "mu", type: "music", enabled: true, sort_order: 3, data: { title: "Late mix", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", artwork_url: "https://probe.storelib.test/art/1.svg" } },
  { id: "lk", type: "link_button", enabled: true, sort_order: 4, data: { label: "Read the guide", url: "https://example.com/guide", link_preview: { enabled: true, url: "https://example.com/guide", title: "The guide", image: "https://probe.storelib.test/art/2.svg" } } },
  { id: "pr", type: "product", enabled: true, sort_order: 5, data: { product_title: "Print pack", product_price_cents: 1200, product_thumbnail: "https://probe.storelib.test/art/3.svg" } },
  { id: "ap", type: "app", enabled: true, sort_order: 6, data: { provider: "tiktok", url: "https://tiktok.com/@satori" } },
  { id: "em", type: "email_capture", enabled: true, sort_order: 7, data: { headline: "Join my newsletter", description: "Get updates and exclusive content", placeholder: "Enter your email", button_preset: "subscribe", custom_button_text: "", layout_type: "default", animation_type: "none" } },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, type: "link_button", enabled: true, sort_order: 8 + i, data: { label: `Link ${i + 1}`, url: `https://example.com/${i}` } })),
]

const posted = []
const api = (req) => {
  if (req.url.startsWith("/api/onepage/leads")) posted.push(req.url)
  return null
}
const { base, server } = await serveEditorProbe({ blocks: BLOCKS, api })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] })
const vp390 = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const vp1440 = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }

async function open(viewport, path, { app = false, notch = 0, stubHaptics = false } = {}) {
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  await page.setViewport(viewport)
  if (app) await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StorelibApp")
  /* Run as soon as <html> is there, before any of the page's own scripts, as the head script runs in the app. */
  await page.evaluateOnNewDocument(`(() => { const run = () => { ${headScript} }; if (document.documentElement) return run(); new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); run() } }).observe(document, { childList: true }) })()`)
  if (stubHaptics) {
    await page.evaluateOnNewDocument(() => {
      window.__haptics = []
      window.__vibrations = 0
      navigator.vibrate = () => { window.__vibrations++; return true }
      if (window.__stubApp) window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Haptics: { impact: (o) => { window.__haptics.push(o); return Promise.resolve() }, selectionChanged: () => Promise.resolve() } } }
    })
  }
  if (notch) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: notch, topMax: notch, left: 0, leftMax: 0, bottom: 34, bottomMax: 34, right: 0, rightMax: 0 } }).catch((e) => console.log("   (no safe area override in this Chromium:", String(e.message).slice(0, 80), ")"))
  }
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "tile.openstreetmap.org") return void r.respond({ status: 200, contentType: "image/svg+xml", body: TILE })
    if (u.hostname === "probe.storelib.test") return void r.respond({ status: 200, contentType: "image/svg+xml", body: art(Number(u.pathname.replace(/\D/g, "")) * 70) })
    if (u.hostname === "i.ytimg.com") return void r.respond({ status: 200, contentType: "image/svg+xml", body: art(0) })
    /* Next's image optimizer is not in the harness: it answers for the picture it was asked to size (a YouTube still, say). */
    if (u.hostname === "127.0.0.1" && u.pathname === "/_next/image") return void r.respond({ status: 200, contentType: "image/svg+xml", body: art(20) })
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 404, body: "" })
    void r.continue()
  })
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" })
  return page
}

const editorReady = async (page) => {
  await page.waitForSelector("[data-block-id]", { timeout: 20000 })
  await page.waitForSelector("[data-onepage-loader]", { hidden: true, timeout: 20000 }).catch(() => null)
  await sleep(600)
}
const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length)`
const frameOf = async (page) => {
  const handle = await page.waitForSelector("[data-onepage-mobile-preview] iframe[data-onepage-preview-frame]", { timeout: 15000 })
  return handle.contentFrame()
}

try {
  /* ── subscribe ── */
  if (want("subscribe")) {
    console.log("\n── subscribe")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      const page = await open(vp, "/app/onepage?live")
      await page.waitForSelector("[data-email-submit]")
      await page.$eval("[data-email-submit]", (b) => b.scrollIntoView({ block: "center" }))
      await sleep(900)
      const look = await page.$eval("[data-email-submit]", (b) => {
        const cs = getComputedStyle(b)
        const f = /opacity\(([\d.]+)\)/.exec(cs.filter)
        return { disabled: b.disabled, shown: Math.round(Number(cs.opacity) * (f ? Number(f[1]) : 1) * 1000) / 1000 }
      })
      check(!look.disabled && look.shown === 1, `${label} live: Subscribe at full strength with nothing typed (disabled ${look.disabled}, ${look.shown})`)
      const before = posted.length
      await page.click("[data-email-submit]")
      await sleep(200)
      const err = await page.evaluate(() => ({ text: document.querySelector("[data-email-error]")?.textContent ?? null, focused: document.activeElement?.getAttribute("type") }))
      check(err.text === "Enter a valid email address." && err.focused === "email" && posted.length === before, `${label} live: the press says what is wrong under the form, the box takes the focus, nothing is sent (${JSON.stringify(err)})`)
      await shot(page, `subscribe-error-${label}`)
      await page.type("[data-email-form] input[type=email]", "anna@site")
      const cleared = await page.evaluate(() => !document.querySelector("[data-email-error]"))
      check(cleared, `${label} live: typing clears the error`)
      await page.close()
    }
    /* The same block in the editor's preview frame on a phone. */
    const page = await open(vp390, "/app/onepage#links")
    await editorReady(page)
    await page.click("[data-onepage-preview-toggle]")
    const frame = await frameOf(page)
    await frame.waitForSelector("[data-email-submit]", { timeout: 15000 })
    await frame.$eval("[data-email-submit]", (b) => b.scrollIntoView({ block: "center" }))
    await sleep(900)
    const f = await frame.$eval("[data-email-submit]", (b) => ({ disabled: b.disabled, opacity: Number(getComputedStyle(b).opacity), filter: getComputedStyle(b).filter }))
    check(!f.disabled && f.opacity === 1 && f.filter === "none", `390 preview: Subscribe at full strength in the frame (${JSON.stringify(f)})`)
    await frame.$eval("[data-email-submit]", (b) => b.click())
    await sleep(200)
    const fe = await frame.evaluate(() => document.querySelector("[data-email-error]")?.textContent ?? null)
    check(fe === "Enter a valid email address.", `390 preview: the same inline error in the frame (${fe})`)
    await shot(page, "subscribe-preview-390")
    await page.close()
  }

  /* ── rows ── */
  if (want("rows")) {
    console.log("\n── rows")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      const page = await open(vp, "/app/onepage#links")
      await editorReady(page)
      await page.evaluate(() => document.querySelectorAll("[data-row-picture] img").forEach((i) => i.scrollIntoView()))
      await page.evaluate(() => document.querySelector("[data-scroll-container]").scrollTop = 0)
      await sleep(1200)
      const rows = await page.evaluate(() => {
        const out = {}
        for (const card of document.querySelectorAll("[data-block-id]")) {
          const id = card.getAttribute("data-block-id")
          const tile = card.querySelector("[data-block-fade]")
          const pic = tile?.querySelector("[data-row-picture]")
          const img = pic?.querySelector("img") ?? (pic?.tagName === "IMG" ? pic : null)
          out[id] = { picture: pic?.getAttribute("data-row-picture") ?? null, loaded: img ? img.complete && img.naturalWidth > 0 : null, brand: !pic && !!tile?.querySelector("svg") && !tile?.hasAttribute("data-row-tile") }
        }
        return out
      })
      console.log(`   ${label} ${JSON.stringify(rows)}`)
      check(rows.mp?.picture === "map" && rows.mp.loaded, `${label}: the Google Maps block (a point) shows its map`)
      check(rows.ma?.picture === "map-drawn", `${label}: a typed address shows the drawn map with its pin`)
      check(rows.vd?.picture === "image" && rows.vd.loaded, `${label}: the YouTube video shows its still`)
      check(rows.mu?.picture === "image" && rows.mu.loaded, `${label}: music shows its cover`)
      check(rows.lk?.picture === "image" && rows.lk.loaded, `${label}: a link shows its preview image`)
      check(rows.pr?.picture === "image" && rows.pr.loaded, `${label}: a product shows its picture`)
      check(rows.ap?.picture === null && rows.ap.brand, `${label}: an app block keeps its brand mark`)
      check(rows.hd?.picture === "image" && rows.hd.loaded, `${label}: the header's row shows the creator's photo`)
      check(["x0", "x1"].every((k) => rows[k]?.picture === null), `${label}: a plain link with no picture keeps its glyph`)
      await page.evaluate(() => document.querySelector('[data-block-id="mp"]').scrollIntoView({ block: "start" }))
      await sleep(300)
      await shot(page, `rows-${label}`)
      await page.close()
    }
  }

  /* ── add ── */
  if (want("add")) {
    console.log("\n── add")
    const page = await open(vp390, "/app/onepage#links")
    await editorReady(page)
    await page.$eval("[data-add-block]", (b) => b.scrollIntoView({ block: "center" }))
    await sleep(300)
    const box = await page.$eval("[data-add-block]", (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, bg: getComputedStyle(b).backgroundColor } })
    await page.evaluate(() => {
      window.__addLook = []
      const b = document.querySelector("[data-add-block]")
      const tick = () => { window.__addLook.push({ bg: getComputedStyle(b).backgroundColor, pressed: b.hasAttribute("data-pressed"), open: !!document.querySelector('[data-app-sheet="open"]') }); window.__addRaf = requestAnimationFrame(tick) }
      tick()
    })
    const cdp = await page.createCDPSession()
    /* A scroll that starts on the button: down, then 12px a step up the screen. */
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] })
    for (let i = 1; i <= 14; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x, y: box.y - i * 12 }] })
      await sleep(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(500)
    const scrolled = await page.evaluate(() => { cancelAnimationFrame(window.__addRaf); return window.__addLook })
    const tinted = scrolled.filter((s) => s.bg !== scrolled[0].bg || s.pressed).length
    const opened = scrolled.some((s) => s.open)
    check(tinted === 0 && !opened, `390: a scroll that starts on + Add tints it in ${tinted} of ${scrolled.length} frames and opens nothing (${opened})`)
    /* A tap. */
    await page.$eval("[data-add-block]", (b) => b.scrollIntoView({ block: "center" }))
    await sleep(300)
    const at = await page.$eval("[data-add-block]", (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.touchscreen.tap(at.x, at.y)
    const tapped = await page.waitForSelector('[data-app-sheet="open"]', { timeout: 3000 }).then(() => true, () => false)
    check(tapped, "390: a tap on + Add opens the sheet")
    await shot(page, "add-tap-390")
    await page.close()
    /* Headless Chromium has no pointing device, so (hover: hover) is false: a browser of its own that says it has a mouse, as a computer does. */
    const mouseBrowser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })
    const desk = await mouseBrowser.newPage()
    await desk.setViewport(vp1440)
    await desk.goto(`${base}/app/onepage#links`, { waitUntil: "domcontentloaded" })
    const emulated = await desk.evaluate(() => matchMedia("(hover: hover)").matches)
    await editorReady(desk)
    const hoverRule = await desk.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        const walk = (list, media) => {
          for (const r of list) {
            if (r.media && r.cssRules) { const m = walk(r.cssRules, r.media.mediaText); if (m) return m }
            else if (r.cssRules) { const m = walk(r.cssRules, media); if (m) return m }
            if (r.selectorText && r.selectorText.includes("hover\\:bg-\\[\\#7c3aed\\]")) {
              /* Tailwind 4 nests it: the class, then &:hover, then the media rule. */
              const inner = (list) => { for (const x of list) { if (x.media) return x.media.mediaText; if (x.cssRules) { const m = inner(x.cssRules); if (m) return m } } return null }
              return media || inner(r.cssRules || []) || "none"
            }
          }
          return null
        }
        const m = walk(rules, null)
        if (m) return m
      }
      return null
    })
    check(/hover:\s*hover/.test(hoverRule || ""), `the hover tint only applies under @media (${hoverRule})`)
    const rest = await desk.$eval("[data-add-block]", (b) => getComputedStyle(b).backgroundColor)
    await desk.hover("[data-add-block]")
    await sleep(400)
    const hover = await desk.$eval("[data-add-block]", (b) => getComputedStyle(b).backgroundColor)
    check(!emulated || rest !== hover, `1440: a mouse's hover still tints it (${rest} -> ${hover}${emulated ? "" : ", not emulated"})`)
    await mouseBrowser.close()
  }

  /* ── share ── */
  if (want("share")) {
    console.log("\n── share")
    for (const app of [false, true]) {
      const page = await open(vp390, "/app/onepage#links", { stubHaptics: true, app })
      if (app) await page.evaluate(() => { window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { Haptics: { impact: (o) => { window.__haptics.push(o); return Promise.resolve() }, selectionChanged: () => Promise.resolve() } } } })
      await editorReady(page)
      await page.evaluate(() => { window.__haptics = []; window.__vibrations = 0 })
      const at = await page.$eval("[data-onepage-share]", (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      await page.touchscreen.tap(at.x, at.y)
      await sleep(400)
      const felt = await page.evaluate(() => ({ haptics: window.__haptics.length, style: window.__haptics[0]?.style ?? null, vibrations: window.__vibrations, sheet: !!document.querySelector('[data-app-sheet="open"]') }))
      if (app) check(felt.haptics === 1 && felt.sheet, `390 app: Share your OnePage gives one native haptic (${JSON.stringify(felt)})`)
      else check(felt.haptics === 0 && felt.vibrations === 0 && felt.sheet, `390 browser: Share opens its sheet and nothing buzzes (${JSON.stringify(felt)})`)
      await page.close()
    }
  }

  /* ── bar ── */
  if (want("bar")) {
    console.log("\n── bar (the preview frame in the app, a 47px notch)")
    const page = await open(vp390, "/app/onepage#links", { app: true, notch: 47 })
    await editorReady(page)
    const top = await page.evaluate(() => ({ cls: document.documentElement.classList.contains("capacitor"), inset: getComputedStyle(document.documentElement).getPropertyValue("--op-safe-top").trim() }))
    await page.click("[data-onepage-preview-toggle]")
    const frame = await frameOf(page)
    await frame.waitForSelector("[data-op-topbar]", { timeout: 15000 })
    await sleep(1200)
    const inFrame = await frame.evaluate(() => {
      const d = document.documentElement
      const shield = getComputedStyle(d, "::before")
      return { embedded: d.hasAttribute("data-onepage-embedded"), cls: d.classList.contains("capacitor"), shield: shield.content !== "none" && shield.content !== "normal" ? shield.height : null, inset: getComputedStyle(d).getPropertyValue("--op-safe-top").trim() }
    })
    console.log(`   editor ${JSON.stringify(top)} frame ${JSON.stringify(inFrame)}`)
    check(inFrame.embedded && !inFrame.cls && !inFrame.shield, `the frame is marked embedded, with no app class and no status bar shield (${JSON.stringify(inFrame)})`)
    await frame.evaluate(() => {
      window.__cls = 0
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
    })
    await sleep(300)
    const frameTop = await page.$eval("[data-onepage-mobile-preview]", (e) => Math.round(e.getBoundingClientRect().top))
    const editorBarBottom = await page.$eval("header", (e) => Math.round(e.getBoundingClientRect().bottom))
    const samples = await frame.evaluate(async () => {
      const frameTick = () => new Promise((r) => requestAnimationFrame(() => r()))
      const bar = document.querySelector("[data-op-topbar]")
      const name = [...document.querySelectorAll("[data-op-bar-anchor]")].find((e) => e.getClientRects().length)
      const out = []
      const end = 900
      for (let y = 0; y <= end; y += 8) { window.scrollTo(0, y); await frameTick(); await frameTick(); const r = bar.getBoundingClientRect(); out.push({ y, top: Math.round(r.top), h: Math.round(r.height), o: Number(getComputedStyle(bar).opacity), name: name ? Math.round(name.getBoundingClientRect().bottom) : null }) }
      for (let y = end; y >= 0; y -= 8) { window.scrollTo(0, y); await frameTick(); await frameTick(); const r = bar.getBoundingClientRect(); out.push({ y, top: Math.round(r.top), h: Math.round(r.height), o: Number(getComputedStyle(bar).opacity), name: name ? Math.round(name.getBoundingClientRect().bottom) : null }) }
      return out
    })
    const cls = await frame.evaluate(() => Math.round(window.__cls * 10000) / 10000)
    const heights = [...new Set(samples.map((s) => s.h))]
    const firstShown = samples.find((s) => s.o > 0.02)
    console.log(`   bar heights ${JSON.stringify(heights)}, tops ${JSON.stringify([...new Set(samples.map((s) => s.top))])}, first seen at scroll ${firstShown?.y} with the name's foot at ${firstShown?.name}, frame top ${frameTop}, editor bar foot ${editorBarBottom}`)
    check(heights.length === 1 && heights[0] === 60, `the bar is ${heights.join("/")}px through ${samples.length} frames of scroll (60 wanted, never taller)`)
    check(samples.every((s) => s.top === 0), "it sits at the frame's top every frame, under the editor's own bar (no second band)")
    check(frameTop >= editorBarBottom, `the frame starts under the editor's bar (${frameTop} >= ${editorBarBottom})`)
    check(samples[0].o === 0 && !!firstShown && firstShown.name !== null && firstShown.name < 60 + 64 + 1, `it appears only as the name goes under it (first seen at scroll ${firstShown?.y})`)
    check(cls === 0, `layout shift in the frame while scrolling: CLS ${cls}`)
    await frame.evaluate(() => window.scrollTo(0, 700))
    await sleep(400)
    await shot(page, "bar-preview-390-app")
    await page.close()
  }

  /* ── switch ── */
  if (want("switch")) {
    console.log("\n── switch")
    for (const warm of [false, true]) {
      const page = await open(vp390, "/app/onepage#links")
      await editorReady(page)
      if (warm) await page.waitForFunction(() => !!document.querySelector('[data-onepage-mobile-layer="warm"] iframe[data-drawn]'), { timeout: 8000 }).catch(() => console.log("   (not warmed in 8s)"))
      await page.evaluate(() => { const sc = document.querySelector("[data-scroll-container]"); sc.scrollTop = 420 })
      await sleep(200)
      const timing = async () => page.evaluate(() => new Promise((resolve) => {
        const t0 = performance.now()
        const frames = []
        const tick = (now) => {
          const layer = document.querySelector("[data-onepage-mobile-layer]")
          const shown = layer?.getAttribute("data-onepage-mobile-layer") === "shown" && getComputedStyle(layer).visibility === "visible"
          const drawn = !!layer?.querySelector("iframe[data-drawn]")
          const fadeIn = layer?.querySelector("iframe")?.getAnimations?.().some((a) => a.playState === "running") ?? false
          frames.push({ t: Math.round(now - t0), shown, drawn, fadeIn })
          if ((shown && drawn && !fadeIn) || now - t0 > 6000) return resolve(frames)
          requestAnimationFrame(tick)
        }
        document.querySelector("[data-onepage-preview-toggle]").click()
        requestAnimationFrame(tick)
      }))
      const frames = await timing()
      const done = frames.at(-1)
      const blank = frames.filter((f) => f.shown && !f.drawn).length
      check(warm ? done.t <= 50 && blank === 0 : true, `${warm ? "warm" : "cold"}: Preview tapped to the page drawn in ${done.t}ms over ${frames.length} frames, ${blank} frames with the layer up and nothing drawn`)
      await shot(page, `switch-${warm ? "warm" : "cold"}-preview-390`)
      const back = await page.evaluate(() => new Promise((resolve) => {
        const t0 = performance.now()
        document.querySelector("[data-onepage-preview-toggle]").click()
        const tick = (now) => {
          const panels = document.querySelector("[data-onepage-panels]")
          if (getComputedStyle(panels).visibility === "visible" || now - t0 > 2000) return resolve({ t: Math.round(now - t0), scrollTop: document.querySelector("[data-scroll-container]").scrollTop })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }))
      check(back.t <= 50 && back.scrollTop === 420, `${warm ? "warm" : "cold"}: Edit back in ${back.t}ms with the list where it was (scrollTop ${back.scrollTop})`)
      const again = await timing()
      check(again.at(-1).t <= 50 && again.filter((f) => f.shown && !f.drawn).length === 0, `${warm ? "warm" : "cold"}: the second Preview in ${again.at(-1).t}ms, nothing blank`)
      await page.close()
    }
  }

  /* ── sticky ── */
  if (want("sticky")) {
    console.log("\n── sticky")
    const page = await open(vp390, "/app/onepage#design")
    await page.waitForSelector('[data-nav-row="buttons"]', { visible: true, timeout: 20000 })
    await page.waitForSelector("[data-onepage-loader]", { hidden: true, timeout: 20000 }).catch(() => null)
    await sleep(900)
    await page.$eval('[data-nav-row="buttons"]', (b) => b.click())
    await page.waitForSelector("[data-sticky-back]", { timeout: 5000 })
    await sleep(800)
    await page.evaluate(() => {
      const sc = document.querySelector("[data-sticky-back]").closest("[data-scroll-container]")
      const bar = document.querySelector("[data-sticky-back]")
      const scTop = sc.getBoundingClientRect().top
      window.__stick = { frames: [], last: 0, on: true }
      const tick = (now) => {
        const s = window.__stick
        const r = bar.getBoundingClientRect()
        s.frames.push({ dt: s.last ? Math.round((now - s.last) * 10) / 10 : 0, y: sc.scrollTop, top: Math.round((r.top - scTop) * 10) / 10, h: Math.round(r.height), o: Number(getComputedStyle(bar).opacity) })
        s.last = now
        if (s.on) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const cdp = await page.createCDPSession()
    await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 600, yDistance: -1400, speed: 900, gestureSourceType: "touch", repeatCount: 1 })
    await sleep(300)
    await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 300, yDistance: 1400, speed: 900, gestureSourceType: "touch", repeatCount: 1 })
    await sleep(300)
    const frames = await page.evaluate(() => { window.__stick.on = false; return window.__stick.frames })
    const slow = frames.filter((f) => f.dt > 25)
    const stuck = frames.filter((f) => f.o > 0.99)
    const tops = [...new Set(stuck.map((f) => f.top))]
    const heights = [...new Set(frames.map((f) => f.h))]
    console.log(`   ${frames.length} frames, max scroll ${Math.max(...frames.map((f) => f.y))}, slow ${JSON.stringify(slow.map((f) => f.dt))}, heights ${JSON.stringify(heights)}, tops while shown ${JSON.stringify(tops)}`)
    check(slow.length === 0, `390: ${slow.length} frames over 25ms of ${frames.length} while a panel scrolls by touch`)
    check(heights.length === 1 && heights[0] === 56, `the sticky bar is ${heights.join("/")}px every frame (56 wanted)`)
    check(stuck.length > 10 && tops.length === 1 && tops[0] === 0, `shown, it is at the column's top every frame (${stuck.length} frames, tops ${JSON.stringify(tops)})`)
    await page.evaluate(() => { document.querySelector("[data-sticky-back]").closest("[data-scroll-container]").scrollTop = 700 })
    await sleep(400)
    await shot(page, "sticky-390")
    await page.close()
  }

  /* ── period ── */
  if (want("period")) {
    console.log("\n── period")
    for (const [label, vp] of [["390", vp390], ["1440", vp1440]]) {
      const page = await open(vp, "/app/onepage#links")
      await editorReady(page)
      await page.evaluate(() => [...document.querySelectorAll('[data-block-id="lk"] button[title="View Stats"]')].find((e) => e.getClientRects().length)?.click())
      await page.waitForSelector("[data-link-stats]", { timeout: 8000 })
      await sleep(1300)
      await page.evaluate(() => [...document.querySelectorAll("[data-stats-head] button[data-filter-set]")].find((e) => e.getClientRects().length)?.click())
      await sleep(700)
      const seen = await page.evaluate((phone) => {
        const vh = innerHeight
        const vw = innerWidth
        if (phone) {
          const sheets = [...document.querySelectorAll('[data-app-sheet="open"]')]
          const top = sheets.find((s) => s.querySelector("[data-row]"))
          const panel = top?.querySelector("[data-sheet-panel]")
          if (!panel) return { sheets: sheets.length }
          const r = panel.getBoundingClientRect()
          const row = panel.querySelector('[data-row="last_30_days"]') ?? panel.querySelector("[data-row]")
          const rr = row.getBoundingClientRect()
          const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2)
          return { sheets: sheets.length, z: getComputedStyle(top).zIndex, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh, vw, onTop: !!hit && panel.contains(hit), rows: panel.querySelectorAll("[data-row]").length }
        }
        const el = [...document.querySelectorAll("[data-drp-overlay]")].find((e) => e.getClientRects().length)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30)
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh, vw, onTop: !!hit && el.contains(hit), scroll: el.scrollHeight > el.clientHeight + 1 }
      }, vp.width < 640)
      console.log(`   ${label} ${JSON.stringify(seen)}`)
      if (vp.width < 640) check(!!seen && seen.sheets === 2 && Number(seen.z) > 200 && seen.top >= 0 && seen.bottom <= seen.vh && seen.left >= 0 && seen.right <= seen.vw && seen.onTop && seen.rows >= 8, `390: the period is a sheet over the stats sheet (z ${seen?.z}), wholly on screen (${seen?.top}..${seen?.bottom} of ${seen?.vh}) and on top`)
      else check(!!seen && seen.top >= 0 && seen.bottom <= seen.vh && seen.left >= 0 && seen.right <= seen.vw && seen.onTop, `1440: the period is a popover inside the window (${seen?.top}..${seen?.bottom} of ${seen?.vh}) and on top`)
      await shot(page, `period-${label}`)
      if (vp.width < 640) {
        await page.evaluate(() => { const s = [...document.querySelectorAll('[data-app-sheet="open"]')].find((x) => x.querySelector("[data-row]")); s.querySelector('[data-row="last_30_days"]').click() })
        await sleep(900)
        const after = await page.evaluate(() => ({ sheets: document.querySelectorAll('[data-app-sheet="open"]').length, label: [...document.querySelectorAll("[data-stats-head] button[data-filter-set]")].find((e) => e.getClientRects().length)?.textContent }))
        check(after.sheets === 1 && /30/.test(after.label || ""), `390: a pick closes the period sheet only, and the stats say it (${JSON.stringify(after)})`)
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed")
if (failures.length && !report) process.exit(1)
