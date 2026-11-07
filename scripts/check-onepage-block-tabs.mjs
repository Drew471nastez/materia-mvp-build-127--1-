/**
 * Round AK3, in the real editor and the real published page (headless Chromium):
 *
 *   1. Every block card the editor opens shows the same two tabs, Settings
 *      and Layout, and nowhere says "Appearance & description". The Layout
 *      tab of each holds that block's own layout controls.
 *   2. The public block layouts (the new link layouts, shelves of product
 *      cards and plain cards, posts as media tiles, a collection grid with its
 *      picture, a panel background) draw at 390px and 1280px with nothing
 *      wider than the page.
 *
 *   PROBE_CSS=source node scripts/check-onepage-block-tabs.mjs
 */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const img = "/audit-images/placeholder.jpg"
const items = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, kind: n % 2 ? "digital" : "physical", title: `Product number ${n} with a longer name`, href: `/p/item-${n}`, image: img, price_cents: n * 900 }))
const link = (id, presentation, data = {}) => ({ id, type: "link_button", enabled: true, sort_order: 0, data: { label: `Link ${id}`, url: "https://example.com/" + id, thumbnail_url: img, ...data }, ...(presentation ? { style: { presentation } } : {}) })
const editorBlocks = [
  { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  link("link", null),
  { id: "digital", type: "storelib_shelf", enabled: true, sort_order: 0, data: { source: "digital", layout: "carousel", limit: 3 } },
  { id: "physical", type: "storelib_shelf", enabled: true, sort_order: 0, data: { source: "physical", layout: "list", limit: 3, product_settings: { style: "side" } } },
  { id: "posts", type: "social_posts", enabled: true, sort_order: 0, data: { network: "youtube", post_urls: ["https://youtu.be/dQw4w9WgXcQ"] } },
  { id: "faq", type: "faq", enabled: true, sort_order: 0, data: { title: "Questions", items: [{ id: "q", question: "How long?", answer: "Six weeks." }] } },
  { id: "heading", type: "heading", enabled: true, sort_order: 0, data: { text: "Shop my picks", size: "medium", alignment: "center" } },
  { id: "signup", type: "email_capture", enabled: true, sort_order: 0, data: { headline: "Join", description: "Updates", button_preset: "subscribe" } },
].map((b, i) => ({ ...b, sort_order: i }))
const liveBlocks = [
  { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  link("cover", { variant: "featured", subtitle: "A tall card" }),
  link("photo", { variant: "image-first", fade: true, aspect: "4/5", subtitle: "Photo with a fade" }),
  link("profile", { variant: "profile" }, { url: "https://www.instagram.com/satori.studio/" }),
  link("tile", { variant: "tile", size: "half" }),
  link("compact", { variant: "compact", background: "#f3efe8", title_color: "#1a1a2e", radius: 6, shadow: "soft" }),
  { id: "digital", type: "storelib_shelf", enabled: true, sort_order: 0, data: { source: "digital", layout: "carousel", limit: 4, items, product_settings: { style: "overlay", style_chosen: true } } },
  { id: "physical", type: "storelib_shelf", enabled: true, sort_order: 0, data: { source: "physical", layout: "grid", limit: 4, items, product_settings: { style: "side" }, card_style: "simple" } },
  { id: "side", type: "storelib_shelf", enabled: true, sort_order: 0, data: { source: "all", layout: "list", limit: 2, items, product_settings: { style: "side", style_chosen: true } } },
  { id: "posts", type: "social_posts", enabled: true, sort_order: 0, data: { network: "youtube", presentation: "tile", layout: "grid", aspect: "1/1", post_urls: ["https://youtu.be/dQw4w9WgXcQ", "https://youtu.be/9bZkp7q19f0"] } },
  { id: "group", type: "group", enabled: true, sort_order: 0, data: { title: "My picks", description: "Things I use every day", image_url: img, layout: "grid", children: [link("g1", { variant: "tile" }), link("g2", { variant: "tile" })] } },
  { id: "faq", type: "faq", enabled: true, sort_order: 0, data: { title: "Questions", items: [{ id: "q", question: "How long?", answer: "Six weeks." }] }, style: { presentation: { background: "#ffffff", radius: 20, shadow: "soft", padding: 20 } } },
].map((b, i) => ({ ...b, sort_order: i }))

let blocks = editorBlocks
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-avatar-audit.tsx",
  statics: { "/audit-images/": process.cwd() + "/public/" },
  api(req, body) {
    if (req.url === "/audit-state") return { body: { avatar: "/audit-images/icon-light-32x32.png", blocks, theme: {} } }
    if (req.url === "/api/onepage" && req.method === "PUT") return { body: { ok: true } }
    if (req.url === "/api/onepage/blocks-live") {
      const b = JSON.parse(body)
      return { body: { blocks: b.blocks.map((block) => ({ ...block, data: { ...block.data, items: block.type === "storelib_shelf" ? items : [] } })) } }
    }
    if (req.url.startsWith("/_next/image")) return { status: 503, body: { error: "Original fallback" } }
    return null
  },
})
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const report = []
try {
  /* 1. The editor's block cards */
  for (const width of [1280, 390]) {
    blocks = editorBlocks
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.setViewport({ width, height: 900 })
    await page.goto(base + "/app/onepage#links", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-onepage-loader]", { hidden: true })
    await page.waitForSelector('[data-block-open="link"]', { visible: true })
    await sleep(400)
    const seen = []
    for (const id of ["link", "digital", "physical", "posts", "faq", "heading", "signup"]) {
      await page.$eval(`[data-block-open="${id}"]`, (e) => e.scrollIntoView({ block: "center" }))
      await page.$eval(`[data-block-open="${id}"]`, (e) => e.focus())
      await page.keyboard.press("Enter")
      const card = `[data-block-id="${id}"] [data-block-tabs]`
      await page.waitForSelector(card, { visible: true, timeout: 5000 })
      const tabs = await page.$$eval(`${card} [data-block-tab]`, (els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()))
      assert.deepEqual(tabs, ["Settings", "Layout"], `${id}: Settings and Layout tabs`)
      const old = await page.evaluate(() => document.body.innerText.includes("Appearance & description") || !!document.querySelector("[data-block-appearance]"))
      assert.equal(old, false, `${id}: no Appearance & description panel`)
      await page.click(`${card} [data-block-tab="layout"]`)
      await sleep(150)
      const layout = await page.evaluate((card) => {
        const panel = [...document.querySelectorAll(`${card} [role="tabpanel"]`)].find((p) => p.getClientRects().length)
        return {
          linkLayouts: panel?.querySelectorAll("[data-link-layout-choice]").length ?? 0,
          shelfCards: panel?.querySelectorAll("[data-shelf-card-choice]").length ?? 0,
          shelfArrange: !!panel?.querySelector("[data-shelf-layout]"),
          posts: !!panel?.querySelector("[data-posts-layout]"),
          style: !!panel?.querySelector("[data-block-style]"),
          emailLayouts: !!panel?.querySelector("[data-email-layouts]"),
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      }, card)
      if (id === "link") assert.equal(layout.linkLayouts, 8, "link: eight layouts as pictures")
      if (id === "digital" || id === "physical") assert.ok(layout.shelfArrange && layout.shelfCards === 8, `${id}: arrangement and Simple plus seven product card layouts`)
      if (id === "posts") assert.ok(layout.posts, "posts: show-as and arrangement")
      if (id === "signup") assert.ok(layout.emailLayouts, "signup keeps its eight layouts in the Layout tab")
      if (["faq", "heading", "link", "digital"].includes(id)) assert.ok(layout.style, `${id}: shared style rows`)
      assert.equal(layout.overflow, false, `${id}: editor fits ${width}px`)
      await page.click(`${card} [data-block-tab="settings"]`)
      const extras = await page.evaluate((card) => !!document.querySelector(`${card} [data-block-extras]`), card)
      assert.ok(extras, `${id}: Schedule lives in Settings`)
      seen.push(`${id}(${layout.linkLayouts || layout.shelfCards || "style"})`)
      await page.$eval(`[data-block-open="${id}"]`, (e) => e.click())
      await sleep(200)
    }
    assert.deepEqual(errors, [])
    report.push(`editor ${width}px: Settings|Layout on ${seen.join(", ")}; no Appearance & description`)
    await context.close()
  }

  /* 2. The published page */
  for (const width of [390, 1280]) {
    blocks = liveBlocks
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.setViewport({ width, height: 900 })
    await page.goto(base + "/app/onepage?live", { waitUntil: "domcontentloaded" })
    await page.waitForSelector('[data-visual-link="profile"]', { timeout: 15000 })
    await page.waitForSelector("[data-collection-intro]")
    await sleep(600)
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const wide = [...document.querySelectorAll("[data-visual-link],[data-onepage-shelf],[data-onepage-posts],[data-group-grid],[data-collection-intro],[data-block-presentation]")]
        .filter((e) => !e.closest("[data-group-carousel]") && !e.closest(".snap-x"))
        .map((e) => ({ k: e.getAttribute("data-visual-link") || e.getAttribute("data-onepage-shelf") || e.tagName, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.left < -0.5 || r.right > vw + 0.5)
        .map(({ k, r }) => `${k} ${Math.round(r.left)}..${Math.round(r.right)}`)
      const box = (sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect()
        return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null
      }
      const panel = document.querySelector('[data-block-surface="panel"][data-block-bg]')
      return {
        scroll: document.documentElement.scrollWidth,
        vw,
        wide,
        tile: box('[data-visual-link="tile"] [data-visual-link-action]'),
        photo: box('[data-visual-link="image-first"] [data-image-fade]'),
        profileImg: box('[data-visual-link="profile"] img, [data-visual-link="profile"] [aria-hidden]'),
        shelfGrid: document.querySelector('[data-shelf-arrange="grid"]') ? getComputedStyle(document.querySelector('[data-shelf-arrange="grid"]')).gridTemplateColumns.split(" ").length : 0,
        groupGrid: document.querySelector("[data-group-grid]") ? getComputedStyle(document.querySelector("[data-group-grid]")).gridTemplateColumns.split(" ").length : 0,
        panel: panel ? { bg: getComputedStyle(panel).backgroundColor, radius: getComputedStyle(panel).borderTopLeftRadius, pad: getComputedStyle(panel).paddingTop } : null,
        compactBg: getComputedStyle(document.querySelector('[data-visual-link="compact"] [data-visual-link-action]')).backgroundColor,
        overlayCards: document.querySelectorAll('[data-onepage-shelf="digital"] [data-product-style="overlay"], [data-onepage-shelf="digital"] [data-product-layout="overlay"]').length,
        postTiles: document.querySelectorAll('[data-onepage-posts] [data-visual-link="tile"]').length,
      }
    })
    assert.equal(m.scroll <= m.vw, true, `no horizontal page scroll at ${width}px (${m.scroll} > ${m.vw})`)
    assert.deepEqual(m.wide, [], `nothing wider than the page at ${width}px`)
    assert.ok(m.tile && Math.abs(m.tile.w - m.tile.h) <= 2, `a media tile is square (${JSON.stringify(m.tile)})`)
    assert.ok(m.photo && Math.abs(m.photo.w * 5 - m.photo.h * 4) <= 10, `the photo keeps 4:5 under its fade (${JSON.stringify(m.photo)})`)
    assert.equal(m.shelfGrid, 2, "plain cards two to a row")
    assert.equal(m.groupGrid, 2, "a collection grid is two to a row")
    assert.equal(m.postTiles, 2, "posts drawn as media tiles")
    assert.deepEqual(m.panel, { bg: "rgb(255, 255, 255)", radius: "20px", pad: "20px" }, "a panel block wears its background, corners and padding")
    assert.equal(m.compactBg, "rgb(243, 239, 232)", "a link's own background")
    assert.deepEqual(errors, [])
    report.push(`live ${width}px: scrollWidth ${m.scroll}/${m.vw}, tile ${m.tile.w}x${m.tile.h}, photo ${m.photo.w}x${m.photo.h}, shelf grid ${m.shelfGrid} cols, group grid ${m.groupGrid} cols, panel ${JSON.stringify(m.panel)}`)
    await context.close()
  }
  for (const line of report) console.log("ok " + line)
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
