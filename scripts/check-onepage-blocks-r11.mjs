/**
 * ===========================================================================
 *  ROUND 11 IN A BROWSER: THE EMAIL SIGNUP'S LAYOUTS, GROUPS, THE PRODUCTS
 *  TAB AND THE INTEGRATIONS SECTION, AT 390 (TOUCH, CPU 4x) AND 1440
 * ===========================================================================
 * The real editor (scripts/render-onepage-editor.tsx through
 * ./onepage-probe-server.mjs), its preview frame, and the live page.
 *
 *   SIGNUP     each of the five layouts picked with a tap in the Layout tab
 *              reaches the preview at once, with and without an image; the
 *              picker's pictures are small (three across); every layout on
 *              the live page takes an address, and the call it makes is one
 *              storelib.me answers (lib/onepage/host-route onePageRoute, run
 *              for every request the live page makes).
 *   GROUP      Add Group; a link added inside it and given an address; a
 *              product card dragged onto it; one switched off; moved up; one
 *              moved out and back with Undo (never two blocks with one id);
 *              sliding; Save; the editor opened again from what was saved;
 *              the preview and the live page draw it, the switched-off one
 *              left out; Delete lets its blocks go back on the page.
 *   PRODUCTS   23 products, 2 on the page: the 2, then 5, then Show all; no
 *              box of its own scrolls; and the empty state.
 *   SETTINGS   the Integrations section and the page's own domain.
 *
 *   PROBE_CSS=source node scripts/check-onepage-blocks-r11.mjs
 *   SHOTS=/some/dir to keep the screenshots somewhere
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-r11-"))
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined || ok ? "" : `   (${JSON.stringify(got)?.slice(0, 400)})`}`)
  if (!ok) broken++
}

/* The proxy's own decision for storelib.me (lib/onepage/host-route), bundled so the probe can ask it about every request. */
const hostDir = join(root, `.onepage-r11-host-${process.pid}`)
mkdirSync(hostDir, { recursive: true })
execFileSync("pnpm", ["exec", "esbuild", "lib/onepage/host-route.ts", "--bundle", "--platform=node", "--format=esm", `--alias:@=${root}`, `--outfile=${join(hostDir, "host.mjs")}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
const { onePageRoute } = await import(join(hostDir, "host.mjs"))
rmSync(hostDir, { recursive: true, force: true })
const onMe = (path, method) => onePageRoute({ host: "storelib.me", pathname: path, search: "", method, userAgent: "Mozilla/5.0", mainDomain: "storelib.com", platformSubdomains: ["www", "app", "api"] })

const LAYOUTS = ["default", "pro", "cover", "bold", "minimal"]
const IMAGE = "/images/onepage-themes/nature.webp"
const header = { id: "h", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } }
const signup = (id, layout, image = null, order = 1) => ({ id, type: "email_capture", enabled: true, sort_order: order, data: { headline: "Join my newsletter", description: "One short email a week", button_preset: "subscribe", layout_type: layout, product_image: image } })
const PRODUCTS = Array.from({ length: 23 }, (_, i) => ({ id: `p${i}`, title: ["Pants Down", "SalajanyWood Club: Inncer", "Black Sleeves", "Free Ambience Sample Pack Vol", "Tech House Drum Kit Vol"][i % 5] + (i >= 5 ? ` ${i}` : ""), price_cents: i % 3 === 0 ? 0 : 990 + i * 100, status: "published", type: "digital", slug: `p${i}`, thumbnail_url: null, archived: false, creator_id: "c1", currency: "USD" }))

/* What the stub API was sent: Save's page, Publish's, and every signup. */
const sent = { saves: [], leads: [], published: [] }
const api = (req, body) => {
  const path = req.url.split("?")[0]
  if (req.method === "PUT" && path === "/api/onepage") { sent.saves.push(JSON.parse(body || "{}")); return { body: { ok: true } } }
  if (req.method === "POST" && path === "/api/onepage/publish") { sent.published.push(JSON.parse(body || "{}")); return { body: { success: true, published_at: new Date().toISOString() } } }
  if (req.method === "POST" && path === "/api/onepage/leads") { sent.leads.push(JSON.parse(body || "{}")); return { body: { success: true } } }
  if (path === "/api/store/integrations") return { body: { tracking: { ga4: "G-1A2B3C4D5E", meta_pixel: "1234567890123456" }, ready: true, ga: null } }
  if (path === "/api/store/integrations/marketing") return { body: { marketing: [{ provider: "klaviyo", connected: true, listName: "Newsletter" }, { provider: "omnisend", connected: false }] } }
  if (path === "/api/domains") return { body: { domains: [], primary: { website: null, creator_page: null }, purposes: ["website", "creator_page"] } }
  if (path === "/api/onepage/leads") return { body: { total: 128, leads: [] } }
  return null
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const VIEWPORTS = [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1440", { width: 1440, height: 900 }],
]

async function openEditor(vp, blocks, { hash = "links", products = null } = {}) {
  const { base, server } = await serveEditorProbe({ root, blocks, api, statics: { "/integrations/": join(root, "public/integrations") } })
  const page = await browser.newPage()
  await page.setViewport(vp)
  if (vp.isMobile) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  if (products) await page.evaluateOnNewDocument((p) => { window.PROBE_PRODUCTS = p }, products)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app/onepage#${hash}`)
  await page.waitForSelector("[data-scroll-container]")
  await sleep(1200)
  return { page, server, base, errors }
}
const frameOf = (page) => page.frames().find((f) => f.url().includes("/onepage-preview"))
const tap = async (page, selector) => {
  /* A panel the phone has just brought back can be laid out a frame late: pressed again, up to three times. */
  for (let i = 0; ; i++) {
    try {
      const el = await page.waitForSelector(selector, { visible: true, timeout: 8000 })
      await el.evaluate((e) => e.scrollIntoView({ block: "center" }))
      await sleep(200)
      await el.click()
      return
    } catch (e) {
      if (i >= 2) throw e
      await sleep(600)
    }
  }
}
/* A real press on the element whose words are `text` (Radix tabs answer the press, not a scripted click). */
const tapText = async (page, text, scope = "body") => {
  const handle = await page.evaluateHandle((text, scope) => {
    const el = [...(document.querySelector(scope)?.querySelectorAll("button, [role=tab], [role=button], a") ?? [])].find((b) => b.textContent.trim() === text && b.getClientRects().length)
    if (el) el.scrollIntoView({ block: "center" })
    return el || null
  }, text, scope)
  const el = handle.asElement()
  if (!el) return false
  await sleep(150)
  await el.click()
  return true
}
const openBlock = async (page, id) => {
  await tap(page, `[data-block-id="${id}"] .cursor-pointer`)
  await sleep(700)
}
/* The phone shows the editor or the preview; the bar's Preview and Edit swap them. */
const showPreview = async (page, phone) => {
  if (!phone) return
  if (await tapText(page, "Preview")) await sleep(1000)
}
const showEditor = async (page, phone) => {
  if (!phone) return
  if (await tapText(page, "Edit")) await sleep(700)
}

for (const [label, vp] of VIEWPORTS) {
  const phone = vp.width < 640
  console.log(`\n${label}`)

  /* ── SIGNUP: each layout, picked in the editor, reaches the preview, with and without an image ── */
  for (const image of [null, IMAGE]) {
    const tag = image ? "image" : "no-image"
    const { page, server, errors } = await openEditor(vp, [header, signup("em", "default", image)])
    await openBlock(page, "em")
    expect(await tapText(page, "Layout", '[data-block-id="em"]'), `${tag}: the Layout tab opens`)
    await sleep(500)
    const tiles = await page.$$eval("[data-email-layout-option]", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) } }))
    expect(tiles.length === 5, `${tag}: five layouts`, tiles.length)
    expect(tiles.every((t) => t.h <= 110) && new Set(tiles.slice(0, 3).map((t) => t.top)).size === 1, `${tag}: small pictures, three across (the 4:3 cards were ~230px tall)`, tiles)
    await page.screenshot({ path: join(shots, `${label}-signup-picker-${tag}.png`) })
    for (const layout of LAYOUTS) {
      await tap(page, `[data-email-layout-option="${layout}"]`)
      await sleep(600)
      const checked = await page.$eval(`[data-email-layout-option="${layout}"]`, (e) => e.getAttribute("aria-checked"))
      await showPreview(page, phone)
      /* The preview's frame draws on its own clock (the phone is slowed four times): waited for, up to 10s. */
      await frameOf(page)?.waitForFunction((l) => document.querySelector("[data-email-layout]")?.getAttribute("data-email-layout") === l, { timeout: 10000 }, layout).catch(() => null)
      await sleep(300)
      const frame = frameOf(page)
      const drawn = frame ? await frame.evaluate(() => {
        const el = document.querySelector("[data-email-layout]")
        if (!el) return null
        const imgs = [...el.querySelectorAll("img")].map((i) => ({ ok: i.complete && i.naturalWidth > 0 }))
        const r = el.getBoundingClientRect()
        return { layout: el.getAttribute("data-email-layout"), h: Math.round(r.height), email: !!el.querySelector('input[type="email"]'), imgs, mark: !!el.querySelector("[data-email-mark],[data-email-band]") }
      }) : null
      expect(checked === "true" && drawn?.layout === layout && drawn.email, `${tag}: ${layout} picked, and the preview draws it at once`, { checked, drawn })
      if (!image) expect(drawn && drawn.imgs.length === 0, `${tag}: ${layout} needs no image (no empty picture)`, drawn)
      else if (layout !== "default") expect(drawn && drawn.imgs.length === 1 && drawn.imgs[0].ok, `${tag}: ${layout} shows the image`, drawn)
      if (!image && (layout === "pro" || layout === "cover")) expect(drawn?.mark, `${tag}: ${layout} draws its mark where the picture would be`, drawn)
      const shotEl = frame ? await frame.$("[data-email-layout]") : null
      /* The block itself where the frame lets it be cut out, else the whole screen (the phone's preview fills it). */
      const shotPath = join(shots, `${label}-signup-${layout}-${tag}.png`)
      if (!shotEl || !(await shotEl.screenshot({ path: shotPath }).then(() => true, () => false))) await page.screenshot({ path: shotPath })
      await showEditor(page, phone)
    }
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await page.close()
    server.close()
  }

  /* ── SIGNUP, LIVE: every layout takes an address, through a page served on storelib.me ── */
  {
    const blocks = [header, ...LAYOUTS.map((l, i) => signup(`live_${l}`, l, null, i + 1))]
    const { base, server } = await serveEditorProbe({ root, blocks, liveTheme: { background_type: "solid", background_color: "#ffffff", text_color: "#111113", button_style: "filled", button_color: "#111113", button_text_color: "#ffffff", button_border_radius: 12 }, api })
    const page = await browser.newPage()
    await page.setViewport(vp)
    const refused = []
    page.on("request", (r) => {
      const u = new URL(r.url())
      if (u.origin !== base || !u.pathname.startsWith("/api/")) return
      const d = onMe(u.pathname, r.method())
      if (!d || d.kind !== "next") refused.push({ path: u.pathname, method: r.method(), d })
    })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    /* A device may join three lists in three days (the page's own limit); the probe joins five, so it says yes to the page's question. */
    page.on("dialog", (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss() })
    await page.evaluateOnNewDocument(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "onepage_subscription_limit") return; return set.call(this, k, v) } })
    sent.leads.length = 0
    await page.goto(`${base}/app/onepage?live`)
    await page.waitForSelector("[data-email-layout]")
    await sleep(5200) /* a person reads first: the form refuses a send faster than one (lib/onepage/creator-blocks signupLooksAutomated) */
    expect(onMe("/satori", "GET")?.kind === "rewrite", "storelib.me/satori is the OnePage", onMe("/satori", "GET"))
    await page.screenshot({ path: join(shots, `${label}-live-signups.png`), fullPage: true })
    for (const layout of LAYOUTS) {
      /* The one on screen (the page keeps a second, hidden copy for the other width). */
      const shown = (sel) => page.evaluateHandle((sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length) || null, sel)
      const box = (await shown(`[data-email-layout="${layout}"] input[type="email"]`)).asElement()
      await box.evaluate((e) => e.scrollIntoView({ block: "center" }))
      await sleep(250)
      await box.tap()
      await page.keyboard.type(`fan-${layout}@example.com`)
      await (await shown(`[data-email-layout="${layout}"] button[type="submit"]`)).asElement().tap()
      await sleep(900)
      const thanks = await page.evaluate((l) => [...document.querySelectorAll(`[data-email-layout="${l}"]`)].some((e) => e.getClientRects().length && e.querySelector("[data-email-thanks]")), layout)
      const lead = sent.leads.find((l) => l.email === `fan-${layout}@example.com`)
      expect(!!lead && lead.block_id === `live_${layout}` && thanks, `live ${layout}: the signup is sent, from its block, and says thanks`, { lead, thanks })
    }
    expect(refused.length === 0, "every call the live page made is one storelib.me answers", refused)
    expect(errors.length === 0, "no page errors on the live page", errors)
    await page.close()
    server.close()
  }

  /* ── GROUP: build, fill, hide, move, out and Undo, sliding, Save, open again, preview, live, Delete ── */
  {
    const blocks = [
      header,
      { id: "l1", type: "link_button", enabled: true, sort_order: 1, data: { label: "My studio", url: "https://example.com/studio" } },
      { id: "prd", type: "product", enabled: true, sort_order: 2, data: { product_id: "p1", product_title: "Brush pack", product_price_cents: 900, product_type: "digital", show_price: true } },
      { id: "l2", type: "link_button", enabled: true, sort_order: 3, data: { label: "Old shop", url: "https://example.com/old" } },
    ]
    sent.saves.length = 0
    const { page, server, errors } = await openEditor(vp, blocks, { products: PRODUCTS.slice(0, 3) })
    const ids = () => page.$$eval("[data-block-id]", (els) => els.map((e) => e.getAttribute("data-block-id")))
    const before = await ids()
    expect(await tapText(page, "Add Group"), "group: Add Group")
    await sleep(900)
    const groupId = (await ids()).find((id) => !before.includes(id))
    expect(!!groupId, "group: a new group on the page", await ids())
    const inGroup = (sel = "") => `[data-block-id="${groupId}"] ${sel}`
    /* A link added inside it, from its own Add Block. */
    expect(await tapText(page, "Add Block", `[data-block-id="${groupId}"]`), "group: its Add Block opens the sheet")
    await sleep(900)
    const offered = await page.$$eval("[data-picker-entry]", (els) => els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute("data-picker-entry")))
    expect(offered.includes("link") && offered.includes("product") && !offered.includes("email"), "group: the sheet offers links, images and products", offered.slice(0, 12))
    await tap(page, '[data-picker-entry="link"]')
    await sleep(1000)
    const rows = await page.$$eval(inGroup("[data-group-child-toggle]"), (els) => els.map((e) => e.getAttribute("data-group-child-toggle")))
    expect(rows.length === 1, "group: the link is in it", rows)
    const linkId = rows[0]
    /* Its address, in its own settings. */
    await page.evaluate((sel) => document.querySelector(sel)?.closest("[draggable]")?.click(), inGroup(`[data-group-child-toggle="${linkId}"]`))
    await sleep(600)
    const url = await page.$(inGroup("[data-link-url]"))
    if (url) { await url.click({ clickCount: 3 }); await url.type("https://example.com/new") }
    expect(!!url, "group: the link's settings open inside the group, with its address field")
    await sleep(500)
    /* The phone has no mouse to drag a card onto the group; it adds the product from the sheet instead. The desktop drags the product card in. */
    if (!phone) {
      /* The group closed first, so the cards are their resting size and both are on screen. */
      if (await page.$(inGroup('[role="tab"]'))) { await openBlock(page, groupId); await sleep(500) }
      const grip = await page.$('[data-reorder-grip="prd"]')
      const target = await page.$(`[data-block-id="${groupId}"]`)
      await target.evaluate((e) => e.scrollIntoView({ block: "center" }))
      await sleep(300)
      const g = await grip.boundingBox()
      const t = await target.boundingBox()
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 24; i++) { await page.mouse.move(g.x + g.width / 2 + ((t.x + t.width / 2 - g.x - g.width / 2) * i) / 24, g.y + g.height / 2 + ((t.y + t.height / 2 - g.y - g.height / 2) * i) / 24); await sleep(25) }
      await sleep(700)
      expect((await page.evaluate(() => document.querySelector("[data-drop-into]")?.getAttribute("data-block-id") ?? null)) === groupId, "group: brought up from below, the group says Drop to add (it used to slide away)")
      await page.mouse.up()
      await sleep(900)
      await openBlock(page, groupId)
    } else {
      /* A second link, from the group's own Add Block, given its address. */
      await tapText(page, "Add Block", `[data-block-id="${groupId}"]`)
      await sleep(900)
      await tap(page, '[data-picker-entry="link"]')
      await sleep(1000)
      const two = (await page.$$eval(inGroup("[data-group-child-toggle]"), (els) => els.map((e) => e.getAttribute("data-group-child-toggle")))).find((id) => id !== linkId)
      await page.evaluate((sel) => document.querySelector(sel)?.closest("[draggable]")?.click(), inGroup(`[data-group-child-toggle="${two}"]`))
      await sleep(600)
      const u2 = await page.$(inGroup("[data-link-url]"))
      if (u2) { await u2.click({ clickCount: 3 }); await u2.type("https://example.com/two") }
      await sleep(500)
    }
    const kids = await page.$$eval(inGroup("[data-group-child-toggle]"), (els) => els.map((e) => e.getAttribute("data-group-child-toggle")))
    expect(kids.length === 2, `group: ${phone ? "a second link added from the sheet" : "the product card dragged onto it goes in"}`, kids)
    if (!phone) expect(!(await ids()).includes("prd"), "group: and leaves the page's list (one place, one id)", await ids())
    /* One switched off, and moved up. */
    await tap(page, inGroup(`[data-group-child-toggle="${linkId}"]`))
    await sleep(400)
    expect((await page.$eval(inGroup(`[data-group-child-toggle="${linkId}"]`), (e) => e.getAttribute("aria-checked"))) === "false", "group: the link switched off")
    const second = kids[1]
    /* Open it (a press on an open row closes it, so it is pressed until its settings show, with Move up enabled). */
    for (let i = 0; i < 2; i++) {
      const up = await page.$(inGroup("[data-group-child-up]:not([disabled])"))
      if (up) break
      await page.evaluate((sel) => document.querySelector(sel)?.closest("[draggable]")?.click(), inGroup(`[data-group-child-toggle="${second}"]`))
      await sleep(600)
    }
    await tap(page, inGroup("[data-group-child-up]"))
    await sleep(500)
    const reordered = await page.$$eval(inGroup("[data-group-child-toggle]"), (els) => els.map((e) => e.getAttribute("data-group-child-toggle")))
    expect(reordered.join() === [second, linkId].join(), "group: moved up by tap", reordered)
    /* Out, then Undo: back in the group, and never two blocks with one id. */
    await tap(page, inGroup("[data-group-child-out]"))
    await sleep(700)
    const afterOut = await ids()
    expect(afterOut.includes(second), "group: moved out, onto the page under the group", afterOut)
    await tap(page, '[aria-label="Undo"]')
    await sleep(800)
    const afterUndo = await ids()
    const dupes = afterUndo.filter((id, i) => afterUndo.indexOf(id) !== i)
    expect(!afterUndo.includes(second) && dupes.length === 0, "group: one Undo puts it back in the group, one id once", { afterUndo, dupes })
    /* Sliding. */
    await openBlock(page, groupId)
    if (!(await page.$(inGroup('[role="tab"]')))) await openBlock(page, groupId)
    await tapText(page, "Layout", `[data-block-id="${groupId}"]`)
    await sleep(400)
    await tapText(page, "CarouselSwipe horizontal", `[data-block-id="${groupId}"]`) || (await page.evaluate((sel) => [...document.querySelectorAll(sel + " button")].find((b) => b.textContent.includes("Carousel"))?.click(), `[data-block-id="${groupId}"]`))
    await sleep(800)
    await page.screenshot({ path: join(shots, `${label}-group-editor.png`) })
    await showPreview(page, phone)
    await frameOf(page)?.waitForFunction(() => [...document.querySelectorAll(".snap-start")].some((e) => e.getClientRects().length), { timeout: 10000 }).catch(() => null)
    const previewGroup = await frameOf(page)?.evaluate(() => ({ slides: [...document.querySelectorAll(".snap-start")].filter((e) => e.getClientRects().length).length, links: [...document.querySelectorAll("a[href]")].filter((a) => a.getClientRects().length).map((a) => a.getAttribute("href")) }))
    expect(previewGroup && previewGroup.slides === 1 && !previewGroup.links.includes("https://example.com/new"), "group: the preview slides it, one block, not the switched-off link", previewGroup)
    await page.screenshot({ path: join(shots, `${label}-group-preview.png`) })
    await showEditor(page, phone)
    /* Save, and open the editor again from what was saved. */
    await tapText(page, "Save")
    await sleep(1500)
    const saved = sent.saves.at(-1)
    const sg = saved?.draft_blocks?.find((b) => b.id === groupId)
    expect(!!sg && sg.data.layout === "carousel" && sg.data.children.map((c) => c.id).join() === [second, linkId].join() && sg.data.children.find((c) => c.id === linkId).enabled === false && sg.data.children.find((c) => c.id === linkId).data.url === "https://example.com/new", "group: Save sends it sliding, in order, the link off with its address", sg && { layout: sg.data.layout, kids: sg.data.children.map((c) => [c.id, c.type, c.enabled, c.data.url]), want: [second, linkId] })
    expect(errors.length === 0, "group: no page errors", errors)
    await page.close()
    server.close()

    if (saved) {
      const again = await openEditor(vp, saved.draft_blocks, { products: PRODUCTS.slice(0, 3) })
      const sub = await again.page.$eval(`[data-block-id="${groupId}"]`, (e) => e.textContent)
      expect(/2 items/.test(sub) && /Carousel/.test(sub), "group: opened again, the same group (2 items, Carousel)", sub?.slice(0, 80))
      /* Delete: its blocks go back on the page. */
      await openBlock(again.page, groupId)
      await tapText(again.page, "Delete", `[data-block-id="${groupId}"]`)
      await sleep(400)
      const q = await again.page.$eval(`[data-block-id="${groupId}"] [data-delete-question]`, (e) => e.textContent).catch(() => null)
      expect(/blocks stay on your page/.test(q || ""), "group: Delete says its blocks stay", q)
      await again.page.evaluate((id) => [...document.querySelectorAll(`[data-block-id="${id}"] button`)].filter((b) => b.textContent.trim() === "Delete").pop()?.click(), groupId)
      await sleep(800)
      const left = await again.page.$$eval("[data-block-id]", (els) => els.map((e) => e.getAttribute("data-block-id")))
      expect(!left.includes(groupId) && left.includes(linkId) && left.includes(second), "group: deleted, its blocks back on the page", left)
      await again.page.close()
      again.server.close()

      /* Live, from what was saved: drawn, sliding, the switched-off one left out. */
      const live = await serveEditorProbe({ root, blocks: saved.draft_blocks, api })
      const lp = await browser.newPage()
      await lp.setViewport(vp)
      await lp.goto(`${live.base}/app/onepage?live`)
      await sleep(1800)
      const lg = await lp.evaluate(() => ({ slides: [...document.querySelectorAll(".snap-start")].filter((e) => e.getClientRects().length).length, links: [...document.querySelectorAll("a[href]")].filter((a) => a.getClientRects().length).map((a) => a.getAttribute("href")) }))
      expect(lg.slides === 1 && !lg.links.includes("https://example.com/new"), "group: live, it slides, one block, the switched-off link left out", lg)
      await lp.screenshot({ path: join(shots, `${label}-group-live.png`) })
      await lp.close()
      live.server.close()
    }
  }

  /* ── PRODUCTS TAB: the page's first, five more, Show all, no scroll of its own; and empty ── */
  {
    const onPage = [header, { id: "x1", type: "product", enabled: true, sort_order: 1, data: { product_id: "p3", product_title: PRODUCTS[3].title } }, { id: "gx", type: "group", enabled: true, sort_order: 2, data: { layout: "stack", children: [{ id: "x2", type: "product", enabled: true, sort_order: 0, data: { product_id: "p9", product_title: PRODUCTS[9].title } }] } }]
    const { page, server, errors } = await openEditor(vp, onPage, { hash: "products", products: PRODUCTS })
    await page.waitForSelector("[data-products-list]")
    await sleep(600)
    const state = await page.evaluate(() => {
      const tab = document.querySelector("[data-products-tab]")
      const scrollers = [...tab.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 })
      const group = (g) => [...document.querySelectorAll(`[data-products-group="${g}"] li`)].length
      return { onPage: group("on-page"), others: group("others"), more: document.querySelector("[data-products-more]")?.textContent?.trim(), scrollers: scrollers.length, height: Math.round(tab.getBoundingClientRect().height), search: !!document.querySelector("[data-products-search]") }
    })
    expect(state.onPage === 2 && state.others === 5, "products: the two on the page (one inside a group), then five", state)
    expect(state.more === "Show all 21", "products: Show all says how many", state.more)
    expect(state.scrollers === 0, "products: no box of its own scrolls", state.scrollers)
    expect(state.search, "products: a search, there being more than five")
    await page.screenshot({ path: join(shots, `${label}-products-default.png`) })
    await tap(page, "[data-products-more]")
    await sleep(500)
    const all = await page.$$eval('[data-products-group="others"] li', (els) => els.length)
    expect(all === 21, "products: Show all shows every other one", all)
    await page.type("[data-products-search]", "pants")
    await sleep(400)
    const found = await page.$$eval("[data-products-list] li", (els) => els.map((e) => e.textContent))
    expect(found.length === 5 && found.every((t) => /Pants Down/.test(t)), "products: a search looks through all of them", found.length)
    expect(errors.length === 0, "products: no page errors", errors)
    await page.close()
    server.close()

    const empty = await openEditor(vp, [header], { hash: "products", products: [] })
    await empty.page.waitForSelector("[data-products-empty]", { timeout: 12000 })
    const icon = await empty.page.$eval("[data-products-empty]", (e) => e.querySelectorAll("svg").length)
    expect(icon === 0, "products: the empty state is words and a button, no picture", icon)
    await (await empty.page.$("[data-products-tab]")).screenshot({ path: join(shots, `${label}-products-empty.png`) })
    await empty.page.close()
    empty.server.close()
  }

  /* ── SETTINGS: Integrations, Subscribe's destination, the domain ── */
  {
    const { page, server, errors } = await openEditor(vp, [header], { hash: "settings-integrations" })
    await page.waitForSelector("[data-settings-integrations]", { visible: true, timeout: 12000 }).catch(() => null)
    await sleep(900)
    const rows = await page.$$eval("[data-settings-integration]", (els) => els.filter((e) => e.getClientRects().length).map((e) => ({ id: e.getAttribute("data-settings-integration"), on: e.hasAttribute("data-on"), logo: !!e.querySelector("img") && e.querySelector("img").naturalWidth > 0 })))
    expect(rows.some((r) => r.id === "ga4" && r.on) && rows.some((r) => r.id === "meta_pixel" && r.on) && rows.some((r) => r.id === "klaviyo" && r.on) && rows.some((r) => r.id === "omnisend" && !r.on), "settings: the page's tags and email tools, as Storelib has them", rows)
    expect(rows.every((r) => r.logo), "settings: each with its own logo", rows)
    await page.screenshot({ path: join(shots, `${label}-settings-integrations.png`) })
    expect(errors.length === 0, "settings: no page errors", errors)
    await page.close()
    server.close()
  }
}

await browser.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
