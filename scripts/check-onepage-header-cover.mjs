/** Actual Header settings and cover upload/crop/remove + preview/public geometry. */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { mkdirSync, readFileSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
let theme = {},
  savedBlocks
const blocks = [
  {
    id: "header",
    type: "header",
    enabled: true,
    sort_order: 0,
    data: { show_avatar: true, show_name: true, show_bio: true },
  },
  {
    id: "email",
    type: "email_capture",
    enabled: true,
    sort_order: 1,
    data: {
      headline: "My newsletter",
      description: "Monthly updates",
      button_text: "Subscribe",
    },
  },
]
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-avatar-audit.tsx",
  statics: { "/audit-images/": process.cwd() + "/public/" },
  api(req, body) {
    if (req.url === "/audit-state")
      return {
        body: {
          uploadFixture: true,
          avatar: "/audit-images/icon-light-32x32.png",
          blocks: savedBlocks || blocks,
          theme,
        },
      }
    if (req.url === "/api/onepage" && req.method === "PUT") {
      const b = JSON.parse(body)
      theme = b.theme
      savedBlocks = b.draft_blocks
      return { body: { ok: true } }
    }
    if (req.url.startsWith("/_next/image"))
      return { status: 503, body: { error: "Original fallback" } }
    return null
  },
})
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
})
const click = async (page, text) => {
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === text && b.getClientRects().length,
      ),
    {},
    text,
  )
  await page.evaluate(
    (text) =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === text && b.getClientRects().length)
        .click(),
    text,
  )
}
const save = async (page) => {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url() === base + "/api/onepage" &&
        r.request().method() === "PUT" &&
        r.ok(),
    ),
    click(page, "Save"),
  ])
  await page.waitForFunction(() => document.body.textContent.includes("Saved"))
}
const geometry = async (page, width) => {
  await page.waitForSelector("[data-cover-image] img")
  await page.waitForFunction(
    () => document.querySelector("[data-cover-image] img").naturalWidth > 0,
  )
  const g = await page.evaluate(() => {
    const c = document
        .querySelector("[data-cover-image]")
        .getBoundingClientRect(),
      a = document.querySelector("[data-page-avatar]").getBoundingClientRect()
    return {
      bottom: c.bottom,
      top: a.top,
      height: a.height,
      cw: c.width,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  assert.ok(
    Math.abs(g.bottom - g.top - g.height / 2) < 2,
    `${width}: avatar overlaps cover by 50% ${JSON.stringify(g)}`,
  )
  assert.equal(g.overflow, false)
}
try {
  for (const width of [1440, 390, 320]) {
    theme = {}
    savedBlocks = null
    const context = await browser.createBrowserContext(),
      page = await context.newPage(),
      errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("dialog", (d) => void d.accept())
    await page.setViewport({ width, height: 900 })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = new URL(r.url())
      if (
        u.hostname === "storelib.com" &&
        u.pathname.startsWith("/media/covers/")
      )
        return void r.respond({
          status: 200,
          contentType: "image/jpeg",
          body: readFileSync("public/placeholder.jpg"),
        })
      if (u.hostname === "placeholder.supabase.co")
        return void r.respond({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "POST, OPTIONS",
          },
          contentType: "application/json",
          body: "{}",
        })
      void r.continue()
    })
    await page.goto(base + "/app/onepage?live")
    await page.waitForSelector("[data-page-avatar]")
    assert.equal(
      await page.$("[data-cover-image]"),
      null,
      "Existing no-cover layout preserved",
    )
    await page.goto(base + "/app/onepage#links")
    await page.waitForSelector("[data-onepage-loader]", { hidden: true })
    await page.waitForSelector('[data-block-open="header"]')
    await page.click('[data-block-open="header"]')
    await page.waitForSelector("[data-header-cover-editor]")
    await (
      await page.$("[data-header-cover-editor] input[type=file]")
    ).uploadFile("public/placeholder.jpg")
    await page.waitForSelector(
      "[data-header-cover-editor] [data-cover-crop-frame]",
    )
    await page.waitForFunction(
      () =>
        !document.querySelector(
          "[data-header-cover-editor] [data-upload-empty-band]",
        ),
    )
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-header-cover-editor] img")].some(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    )
    await page.waitForSelector(
      "[data-header-cover-editor] [data-cover-crop-frame][role=group]",
    )
    const crop = await page.$(
      "[data-header-cover-editor] [data-cover-crop-frame][role=group]",
    )
    await crop.focus()
    await page.waitForFunction(
      () =>
        document.querySelector(
          "[data-header-cover-editor] [data-cover-crop-frame] img",
        )?.naturalWidth > 0,
    )
    await page.keyboard.press("Equal")
    await new Promise((r) => setTimeout(r, 400))
    await page.keyboard.press("ArrowRight")
    await new Promise((r) => setTimeout(r, 600))
    await save(page)
    assert.ok(theme.cover_image_url)
    assert.ok(
      theme.cover_crop.zoom > 1,
      "Crop zoom persists " +
        JSON.stringify(theme.cover_crop) +
        " " +
        (await page.evaluate(() =>
          document.activeElement?.outerHTML.slice(0, 300),
        )),
    )
    assert.equal(theme.cover_profile_layout, true)
    if (width < 640) await click(page, "Preview")
    const frame = await page.waitForFrame((f) =>
      f.url().includes("/onepage-preview"),
    )
    await geometry(frame, width)
    await page.goto(base + "/app/onepage?live")
    await geometry(page, width)
    if (shots)
      await page.screenshot({
        path: `${shots}/cover-${width}.png`,
        fullPage: false,
      })
    await page.reload()
    await geometry(page, width)
    await page.goto(base + "/app/onepage#links")
    await page.waitForSelector("[data-onepage-loader]", { hidden: true })
    await page.click('[data-block-open="header"]')
    await page.waitForSelector("[data-header-cover-editor]")
    await (
      await page.$("[data-header-cover-editor] input[type=file]")
    ).uploadFile("public/icon-light-32x32.png")
    await page.waitForFunction(
      () =>
        !document.querySelector(
          "[data-header-cover-editor] [role=progressbar]",
        ),
    )
    await new Promise((r) => setTimeout(r, 900))
    await save(page)
    assert.equal(theme.cover_crop.zoom, 1, "Replacement resets crop safely")
    await page.click(
      '[data-header-cover-editor] button[aria-label="Remove image"]',
    )
    await save(page)
    assert.equal(theme.cover_image_url, null)
    await page.goto(base + "/app/onepage?live")
    await page.waitForSelector("[data-page-avatar]")
    assert.equal(await page.$("[data-cover-image]"), null)
    assert.ok(
      await page.$("[data-page-avatar] img"),
      "Removing cover preserves avatar",
    )
    await page.goto(base+"/app/onepage#links")
    await page.waitForSelector("[data-onepage-loader]",{hidden:true})
    await page.click('[data-block-open="email"]')
    const clearField=async label=>{
      const selector=await page.evaluate(label=>{const node=[...document.querySelectorAll('label')].find(e=>e.textContent===label&&e.getClientRects().length)?.parentElement.querySelector('input');if(!node)return null;node.dataset.auditClear=label;return `[data-audit-clear="${label}"]`},label)
      assert.ok(selector,label)
      const input=await page.waitForSelector(selector,{visible:true});await input.click({clickCount:3});await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.press('Backspace');assert.equal(await input.evaluate(e=>e.value),'')
    }
    await clearField('Headline');await clearField('Description');await save(page)
    assert.equal(savedBlocks.find(b=>b.id==='email').data.headline,'');assert.equal(savedBlocks.find(b=>b.id==='email').data.description,'')
    await page.reload();await page.waitForSelector('[data-onepage-loader]',{hidden:true});await page.click('[data-block-open="email"]');await clearField('Headline');await clearField('Description')
    await page.goto(base+'/app/onepage?live');await page.waitForSelector('[data-page-avatar]');assert.ok(!(await page.evaluate(()=>document.body.textContent)).includes('My newsletter'))
    assert.deepEqual(errors, [])
    await context.close()
    console.log(
      `ok ${width}px: Header upload, replace, remove, crop, 50% overlap, preview/live parity, refresh and independent avatar`,
    )
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
