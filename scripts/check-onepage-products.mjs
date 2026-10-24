/**
 * ===========================================================================
 *  THE ONEPAGE'S PRODUCTS, MEASURED (round 10)
 * ===========================================================================
 * scripts/render-onepage-products.tsx drawn at 390 (a phone: touch, the CPU
 * four times slower) and 1440, in a light, an outline, a glass and a dark
 * theme. For each it checks, and photographs:
 *
 *   LAYOUTS     every product layout is drawn, inside the page's width, with
 *               nothing spilling out; two tiles share a row
 *   HOVER       (1440) pointing at a card lifts its button a pixel and tints
 *               it, and the card itself does not move or change colour;
 *               (390) the device does not hover, so nothing sticks
 *   SHEET       a tap opens the product in a sheet (a window on a computer)
 *               with #product-<slug> in the address; Back closes it; the
 *               frames while it opens
 *   INSTANT     a tap opens the community's checkout window on the page,
 *               with the seller's head, the fields, and Powered by Stripe
 *   CLICKS      each tap was counted (/api/onepage/track), as before
 *   EDITOR      the edit buttons, When someone taps it, the draft and
 *               Unavailable notes and badges, the layouts, the Products tab
 *
 *   PROBE_CSS=source node scripts/check-onepage-products.mjs
 *   SHOTS=/some/dir    where the pictures go (default: the system temp folder, onepage-products-shots)
 *   THEMES=default,astrid
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || join((await import("node:os")).tmpdir(), "onepage-products-shots")
mkdirSync(SHOTS, { recursive: true })
const THEMES = (process.env.THEMES || "default,cream,aurora,astrid").split(",")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0
let failed = 0
const expect = (ok, name, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 600)}`}`)
}

/* The machine's load, printed: frame timings below mean little on a machine running other builds. */
console.log(`load average ${(await import("node:os")).loadavg().map((x) => x.toFixed(1)).join(" ")}`)
const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-products.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })

const VIEWS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}

async function open(view, path) {
  const p = await browser.newPage()
  await p.setViewport(VIEWS[view])
  if (view === "phone") {
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await p.setRequestInterception(true)
  /* Nothing leaves: this server and inline pictures only (Stripe's script is refused, so its card field stays a shimmer). */
  p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}${path}`, { waitUntil: "load" })
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  /*
    A MOUSE THAT HOVERS, FOR THE COMPUTER. This app's hover: sits inside @media (hover: hover) and (pointer: fine), and headless Chromium
    answers no whatever it is told (scripts/check-account-film.mjs found the same). So the computer's page answers yes,
    as a computer with a mouse does; the phone's keeps the query, and answers no, as a phone does.
  */
  if (view === "desktop") {
    await p.evaluate(() => document.querySelectorAll("style").forEach((s) => { s.textContent = s.textContent.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?/g, "@media all") }))
  }
  return { p, errors }
}

/** The first element for a selector that is really drawn (the page keeps a phone and a computer layout, one hidden). */
async function shown(p, sel) {
  const h = await p.evaluateHandle((s) => [...document.querySelectorAll(s)].find((el) => el.getBoundingClientRect().width > 0) || null, sel)
  return h.asElement()
}

/** The longest gap between frames while `act` runs and for `ms` after. */
async function frames(p, act, ms = 700) {
  await p.evaluate(() => {
    window.__gaps = []
    let last = performance.now()
    const tick = (t) => {
      window.__gaps.push(t - last)
      last = t
      if (window.__gaps.length < 400) window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
  })
  await act()
  await sleep(ms)
  return p.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const g = window.__gaps.slice(1)
    const sorted = [...g].sort((a, b) => a - b)
    return { frames: g.length, worst: Math.round(Math.max(0, ...g)), p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0), long: g.filter((x) => x > 34).length }
  })
}

for (const theme of THEMES) {
  for (const view of ["phone", "desktop"]) {
    console.log(`\n${theme} at ${VIEWS[view].width}`)
    const { p, errors } = await open(view, `/app/products?live&theme=${theme}`)
    await p.waitForSelector("[data-product-block]", { timeout: 15000 })
    await sleep(500)

    const layout = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const drawn = (el) => el.getBoundingClientRect().width > 0
      const blocks = [...document.querySelectorAll("[data-product-block]")].filter(drawn).map((el) => {
        const r = el.getBoundingClientRect()
        return { kind: el.getAttribute("data-product-block"), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height), spills: el.scrollWidth > el.clientWidth + 1 }
      })
      const pair = [...document.querySelectorAll("[data-product-pair]")].find(drawn)
      const tiles = pair ? [...pair.querySelectorAll("[data-product-block]")].map((el) => Math.round(el.getBoundingClientRect().top)) : []
      return { vw, blocks, tiles, hScroll: document.documentElement.scrollWidth > vw + 1 }
    })
    const kinds = [...new Set(layout.blocks.map((b) => b.kind))].sort().join(",")
    expect(kinds === "button,callout,minimal,overlay,preview,row,side,tile", "every layout is drawn", kinds)
    expect(layout.blocks.every((b) => b.left >= 0 && b.right <= layout.vw && b.height > 30), "inside the page, none collapsed", layout.blocks.filter((b) => b.left < 0 || b.right > layout.vw || b.height <= 30))
    expect(!layout.hScroll, "no sideways scroll")
    expect(layout.tiles.length === 2 && layout.tiles[0] === layout.tiles[1], "two tiles side by side", layout.tiles)
    await p.screenshot({ path: join(SHOTS, `live-${theme}-${view}.png`), fullPage: true })
    for (const kind of ["callout", "row", "preview", "side", "tile", "overlay", "minimal", "button"]) {
      const el = await shown(p, `[data-product-block="${kind}"]`)
      if (el) await el.screenshot({ path: join(SHOTS, `layout-${kind}-${theme}-${view}.png`) }).catch(() => {})
    }

    /* ── Hover ── */
    if (view === "desktop") {
      const card = await shown(p, '[data-product-block="callout"]')
      await card.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await sleep(300)
      const box = await card.boundingBox()
      const before = await p.evaluate(() => {
        const c = [...document.querySelectorAll('[data-product-block="callout"]')].find((el) => el.getBoundingClientRect().width > 0)
        const cta = c.querySelector("[data-product-cta]")
        return { card: JSON.stringify(c.getBoundingClientRect()), bg: getComputedStyle(c).backgroundColor, cta: getComputedStyle(cta).translate, tint: getComputedStyle(cta, "::before").opacity }
      })
      await p.mouse.move(box.x + 30, box.y + 20)
      await sleep(400)
      const after = await p.evaluate(() => {
        const c = [...document.querySelectorAll('[data-product-block="callout"]')].find((el) => el.getBoundingClientRect().width > 0)
        const cta = c.querySelector("[data-product-cta]")
        return { card: JSON.stringify(c.getBoundingClientRect()), bg: getComputedStyle(c).backgroundColor, cardTransform: getComputedStyle(c).transform, cta: getComputedStyle(cta).translate, tint: getComputedStyle(cta, "::before").opacity, shadow: getComputedStyle(cta, "::after").opacity, transition: getComputedStyle(cta).transitionProperty }
      })
      expect(after.cta === "0px -1px" && Number(after.tint) > 0 && Number(after.shadow) > 0.9, "pointing at the card lifts and tints its button", { before, after })
      expect(after.card === before.card && after.bg === before.bg && (after.cardTransform === "none" || !after.cardTransform), "the card itself does not move or change colour", { before: before.card, after: after.card, bg: [before.bg, after.bg] })
      expect(/translate/.test(after.transition), "the button's motion names translate", after.transition)
      await p.mouse.move(box.x + 30, box.y + 20)
      await p.screenshot({ path: join(SHOTS, `hover-${theme}.png`), clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 40, height: box.height + 40 } })
      await p.mouse.move(5, 5)
    } else {
      const hovers = await p.evaluate(() => matchMedia("(hover: hover)").matches)
      expect(!hovers, "a phone does not hover, so no hover can stick", { hovers })
    }

    /* ── The sheet ── */
    const sheetBlock = await shown(p, '[data-product-tap="sheet"]')
    await sheetBlock.evaluate((el) => el.scrollIntoView({ block: "center" }))
    /* As a visitor scrolls to it: the block reads its product while the page is idle. */
    await sleep(1500)
    /* A finger on a phone, a mouse on a computer. */
    const f = await frames(p, () => (view === "phone" ? sheetBlock.tap() : sheetBlock.click()), 800)
    await p.waitForSelector("[data-product-sheet]", { visible: true, timeout: 5000 }).catch(() => {})
    await sleep(500)
    const sheet = await p.evaluate(() => ({ open: !!document.querySelector("[data-product-sheet]"), hash: location.hash, title: document.querySelector("[data-product-sheet] h2")?.textContent, buy: document.querySelector("[data-product-sheet-buy]")?.textContent, pics: document.querySelectorAll("[data-product-sheet-gallery] img").length, was: !!document.querySelector("[data-product-sheet-price] s") }))
    expect(sheet.open && sheet.hash === "#product-tech-house" && /Tech House/.test(sheet.title || "") && sheet.pics === 3 && sheet.was, "a tap opens the product in a sheet, its pictures, its sale price, #product-<slug>", sheet)
    /*
      This headless browser draws without a GPU, so a dimmed layer over a whole themed page costs it frames that a
      phone's compositor does not. The page's own older sheet (the free quick checkout, a BottomSheet too) is measured
      the same way as the baseline: the product sheet may not be worse than it by more than its one tap frame.
    */
    const sheetFrames = f
    await p.screenshot({ path: join(SHOTS, `sheet-${theme}-${view}.png`) })
    await p.evaluate(() => history.back())
    await sleep(900)
    const closed = await p.evaluate(() => ({ hash: location.hash, shown: [...document.querySelectorAll("[data-product-sheet]")].some((el) => el.getBoundingClientRect().top < innerHeight - 40 && getComputedStyle(el).visibility !== "hidden") }))
    expect(closed.hash === "" && !closed.shown, "Back closes it", closed)

    /* ── Instant checkout ── */
    const instantBlock = await shown(p, '[data-product-tap="instant"]')
    await instantBlock.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await instantBlock.click()
    await p.waitForSelector("[data-instant-checkout] [data-instant-email]", { timeout: 6000 }).catch(() => {})
    await sleep(500)
    const win = await p.evaluate(() => {
      const w = document.querySelector("[data-instant-checkout]")
      const dlg = w?.querySelector('[role="dialog"]')
      const r = dlg?.getBoundingClientRect()
      return { open: !!w, head: !!w?.querySelector("[data-checkout-head]"), seller: w?.querySelector("h2")?.textContent, email: !!w?.querySelector("[data-instant-email]"), stripe: !!w?.querySelector("[data-powered-by]"), pay: !!w?.querySelector("[data-compact-pay]"), dark: w?.getAttribute("data-community-theme"), rect: r && { w: Math.round(r.width), h: Math.round(r.height) } }
    })
    expect(win.open && win.head && win.seller === "Satori Sounds" && win.email && win.stripe && win.pay, "instant checkout opens the community's window, with the seller, the fields and Powered by Stripe", win)
    expect(view === "phone" ? win.rect?.w === 390 : win.rect?.w === 520, "a page of its own on a phone, a 520 wide window on a computer", win.rect)
    await p.screenshot({ path: join(SHOTS, `instant-${theme}-${view}.png`) })
    await p.keyboard.press("Escape")
    await sleep(400)

    const clicks = await p.evaluate(() => window.__clicks)
    expect(clicks.includes("l_sheet") && clicks.includes("l_instant"), "each tap was counted", clicks)
    /* The baseline, on a fresh load: the page's own older sheet, opened the same way. */
    await p.reload({ waitUntil: "load" })
    if (view === "desktop") await p.evaluate(() => document.querySelectorAll("style").forEach((s) => { s.textContent = s.textContent.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?/g, "@media all") }))
    await p.waitForSelector("[data-product-block]")
    const quick = await shown(p, '[data-product-tap="navigate"][href*="p-free"]')
    let baseFrames = null
    if (quick) {
      await quick.evaluate((el) => el.scrollIntoView({ block: "center" }))
      await sleep(1500)
      baseFrames = await frames(p, () => (view === "phone" ? quick.tap() : quick.click()), 800)
    }
    /* On a quiet machine the product sheet has one long frame, the tap's own (measured alone at 4x: 57ms, then 17ms frames). A busy machine slows both sheets alike, so it is held to the baseline, with a frame's slack for noise. */
    const ok = sheetFrames.long <= 1 || (!!baseFrames && (sheetFrames.long <= baseFrames.long + 1 || sheetFrames.p95 <= baseFrames.p95 + 17))
    expect(ok, `the sheet slides smoothly (95th percentile ${sheetFrames.p95}ms, frames over 34ms: ${sheetFrames.long}; the page's own sheet here: ${baseFrames ? `${baseFrames.p95}ms, ${baseFrames.long}` : "n/a"})`, { sheet: sheetFrames, baseline: baseFrames })
    /* Stripe's own script is refused here on purpose (nothing leaves the probe), so its card field cannot load. */
    expect(errors.filter((e) => !/Failed to load Stripe\.js/.test(e)).length === 0, "no errors on the page", errors)
    await p.close()
  }
}

/* ── The editor ── */
for (const view of ["desktop", "phone"]) {
  console.log(`\neditor at ${VIEWS[view].width}`)
  const { p, errors } = await open(view, "/app/onepage#links")
  await sleep(2500)
  const badges = await p.evaluate(() => [...document.querySelectorAll("[data-product-state]")].map((el) => el.getAttribute("data-product-state")).sort().join(","))
  expect(badges === "draft,unavailable", "the blocks list marks the draft and the product that is gone", badges)
  const select = async (title) => {
    await p.evaluate((t) => {
      const el = [...document.querySelectorAll("p.font-medium.text-sm")].find((x) => x.textContent.trim() === t)
      el?.closest(".cursor-pointer")?.click()
    }, title)
    await sleep(900)
  }
  await select("Tech House Master Bundle 2025")
  const editor = await p.evaluate(() => ({ links: !!document.querySelector("[data-product-edit-links]"), tap: !!document.querySelector("[data-product-tap-setting]"), instant: !!document.querySelector("[data-instant-setting]"), product: document.querySelector("[data-edit-product]")?.getAttribute("href"), page: document.querySelector("[data-edit-product-page]")?.getAttribute("href") }))
  expect(editor.links && editor.product === "/app/products/p-live" && editor.page === "/creator-page?pageType=product", "Edit product and Edit product page, side by side, to the same places", editor)
  expect(editor.tap && editor.instant, "When someone taps it, with instant checkout", editor)
  const links = await p.$("[data-product-edit-links]")
  if (links) {
    await links.evaluate((el) => el.closest(".space-y-4")?.scrollIntoView({ block: "start" }))
    await sleep(300)
    const box = await (await p.$("[data-product-edit-links]")).evaluate((el) => {
      const c = el.closest(".space-y-4") || el
      const r = c.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    })
    await p.screenshot({ path: join(SHOTS, `editor-settings-${view}.png`), clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: Math.min(box.width + 24, VIEWS[view].width), height: Math.min(box.height + 24, 1600) } }).catch(() => p.screenshot({ path: join(SHOTS, `editor-settings-${view}.png`) }))
  }
  /* The layouts. */
  /* Radix's tabs switch on the press, not the click: a real one. */
  const layoutTab = (await p.evaluateHandle(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === "Layout" && b.getBoundingClientRect().width > 0) || null)).asElement()
  if (layoutTab) {
    await layoutTab.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await layoutTab.click()
  }
  await sleep(600)
  const layouts = await p.evaluate(() => document.querySelectorAll("[data-product-layout-choice]").length)
  expect(layouts === 8, "eight layouts to pick from", layouts)
  const picker = await p.$("[data-product-layouts]")
  if (picker) {
    await picker.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await sleep(200)
    await picker.screenshot({ path: join(SHOTS, `editor-layouts-${view}.png`) })
  }
  await p.keyboard.press("Escape")
  await sleep(400)
  await select("Deep Cuts Vol. 2")
  const draft = await p.evaluate(() => !!document.querySelector('[data-product-note="draft"]'))
  expect(draft, "a draft says how to show it")
  await p.keyboard.press("Escape")
  await sleep(400)
  await select("Old Sample Pack")
  const gone = await p.evaluate(() => ({ note: !!document.querySelector('[data-product-note="unavailable"]'), remove: !!document.querySelector("[data-product-remove]") }))
  expect(gone.note && gone.remove, "a product that is gone says so and offers Remove", gone)
  await p.screenshot({ path: join(SHOTS, `editor-unavailable-${view}.png`) })

  /* The Products tab. */
  await p.goto(`${base}/app/onepage#products`, { waitUntil: "load" })
  await sleep(2500)
  const tab = await p.evaluate(() => ({ rows: [...document.querySelectorAll("[data-products-row]")].map((r) => r.getAttribute("data-products-row")).join(","), onPage: document.querySelectorAll("[data-products-on-page]").length }))
  expect(tab.rows === "published,published,draft", "the Products tab lists published then drafts, never archived", tab)
  const t = await p.$("[data-products-tab]")
  if (t) await t.screenshot({ path: join(SHOTS, `products-tab-${view}.png`) })
  expect(errors.length === 0, "no errors in the editor", errors)
  await p.close()
}

await browser.close()
server.close()
console.log(`\n${passed} passed, ${failed} failed\npictures in ${SHOTS}\n`)
process.exit(failed ? 1 : 0)
