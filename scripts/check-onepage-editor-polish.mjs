/** Real editor: safe link-preview races and reusable product collection settings. */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const id = "11111111-1111-4111-8111-111111111111"
const items = [
  {
    id,
    kind: "digital",
    title: "Training plan",
    href: "/p/training",
    image: "/audit-images/icon-light-32x32.png",
    price_cents: 0,
  },
]
let blocks,
  theme,
  lookups = 0
const reset = () => {
  blocks = [
    {
      id: "header",
      type: "header",
      enabled: true,
      sort_order: 0,
      data: { show_avatar: true, show_name: true, show_bio: true },
    },
    {
      id: "link",
      type: "link_button",
      enabled: true,
      sort_order: 1,
      data: { url: "", label: "My Link" },
    },
    {
      id: "shelf",
      type: "storelib_shelf",
      enabled: true,
      sort_order: 2,
      data: { source: "digital", layout: "list", limit: 3, items },
    },
  ]
  theme = {}
}
reset()
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-avatar-audit.tsx",
  statics: { "/audit-images/": process.cwd() + "/public/" },
  api(req, body) {
    if (req.url === "/audit-state")
      return {
        body: { avatar: "/audit-images/icon-light-32x32.png", blocks, theme },
      }
    if (req.url === "/api/onepage" && req.method === "PUT") {
      const b = JSON.parse(body)
      blocks = b.draft_blocks
      theme = b.theme
      return { body: { ok: true } }
    }
    if (req.url === "/api/onepage/blocks-live") {
      const b = JSON.parse(body)
      return {
        body: {
          blocks: b.blocks.map((block) => ({
            ...block,
            data: { ...block.data, items },
          })),
        },
      }
    }
    if (req.url.startsWith("/_next/image"))
      return { status: 503, body: { error: "Original fallback" } }
    return null
  },
})
const browser = await puppeteer.launch({
  executablePath: "/tmp/chromium",
  args: ["--no-sandbox"],
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fill = async (page, selector, text) => {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.focus()
  await page.keyboard.down("Control")
  await page.keyboard.press("KeyA")
  await page.keyboard.up("Control")
  await page.keyboard.press("Backspace")
  if (text) await page.keyboard.type(text, { delay: 2 })
}
const save = async (page) => {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url() === base + "/api/onepage" &&
        r.request().method() === "PUT" &&
        r.ok(),
    ),
    page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find(
          (b) => b.textContent.trim() === "Save" && b.getClientRects().length,
        )
        ?.click(),
    ),
  ])
  await page.waitForFunction(() => document.body.textContent.includes("Saved"))
}
try {
  for (const width of [1440, 390, 320]) {
    reset()
    const context = await browser.createBrowserContext()
    const page = await context.newPage(),
      errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("dialog", (d) => d.accept())
    await page.setViewport({ width, height: 900 })
    await page.setRequestInterception(true)
    page.on("request", async (r) => {
      const u = new URL(r.url())
      if (u.pathname === "/api/onepage/link-preview") {
        lookups++
        const url = u.searchParams.get("url"),
          old = url.includes("old")
        await sleep(old ? 1000 : 60)
        return void r.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url,
            title: old ? "Old title" : "Training website",
            description: "Coaching and training",
            image: old
              ? "/audit-images/placeholder.jpg"
              : "/audit-images/icon-light-32x32.png",
          }),
        })
      }
      void r.continue()
    })
    await page.goto(base + "/app/onepage#links", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForSelector("[data-onepage-loader]", { hidden: true })
    await page.waitForSelector('[data-block-open="link"]', { visible: true })
    await sleep(450)
    await page.click('[data-block-open="link"]')
    await page.waitForSelector("[data-link-url]")
    const before = lookups
    await fill(page, "[data-link-url]", "https://example.com/training")
    await page.waitForFunction(
      () =>
        document.querySelector("[data-link-title]")?.value ===
        "Training website",
    )
    assert.equal(
      lookups - before,
      1,
      "Typing is debounced instead of fetching every character",
    )
    await fill(page, "[data-link-title]", "")
    await sleep(500)
    assert.equal(
      await page.$eval("[data-link-title]", (e) => e.value),
      "",
      "A cleared title remains cleared",
    )
    await fill(page, "[data-link-title]", "My own title")
    await fill(page, "[data-link-url]", "https://example.com/old")
    await sleep(420)
    await fill(page, "[data-link-url]", "https://example.com/latest")
    await sleep(1500)
    assert.equal(
      await page.$eval("[data-link-title]", (e) => e.value),
      "My own title",
    )
    assert.equal(
      await page.$eval("[data-link-url]", (e) => e.value),
      "https://example.com/latest",
    )
    await page.click('[role=switch][aria-label="Automatic link preview"]')
    await save(page)
    assert.equal(blocks.find((b) => b.id === "link").data.thumbnail_url, null)
    await page.click('[role=switch][aria-label="Automatic link preview"]')
    await page.waitForFunction(() =>
      document.querySelector("[data-link-thumbnail] img"),
    )
    assert.equal(
      await page.$("[data-block-appearance] summary"),
      null,
      "The old Appearance and description disclosure is gone",
    )
    assert.equal(
      await page.$(
        '[data-block-appearance] input[aria-label="Background image URL"]',
      ),
      null,
      "Uploading replaces manual URL controls",
    )
    await page.click('[data-block-appearance] [data-segment="featured"]')
    await fill(page, "[data-block-description]", "Tell me your goals")
    await save(page)
    assert.equal(
      blocks.find((b) => b.id === "link").style.presentation.variant,
      "featured",
    )
    await page.$eval('[data-block-open="shelf"]', (e) => e.focus())
    await page.keyboard.press("Enter")
    await page.waitForSelector("[data-shelf-product-settings]")
    assert.equal(
      await page.$$eval(
        "[data-shelf-product-settings] [data-product-layout-choice]",
        (els) => els.length,
      ),
      8,
      "Digital-product collections use the actual product layout picker",
    )
    await page.click(
      '[data-shelf-product-settings] [data-product-layout-choice="side"]',
    )
    await save(page)
    assert.equal(
      blocks.find((b) => b.id === "shelf").data.product_settings.style,
      "side",
    )
    await page.goto(base + "/app/onepage?live", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForSelector('[data-visual-link="featured"]')
    await page.waitForFunction(() =>
      document.body.textContent.includes("Training plan"),
    )
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    )
    assert.deepEqual(errors, [])
    await context.close()
    console.log(
      `ok ${width}px: metadata defaults, debounce, cleared/custom titles, stale responses, preview toggle, clean controls, reusable collection layouts and live rendering`,
    )
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
