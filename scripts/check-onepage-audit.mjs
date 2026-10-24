/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR, ITS PREVIEW AND THE LIVE PAGE, CONTROL BY CONTROL
 * ===========================================================================
 * "Make sure everything displays well in the preview, accurate, and in the
 * live as well, accurate."
 *
 * The real editor (scripts/render-onepage-audit.tsx) on a page the stub server
 * keeps the way the real routes keep it (scripts/onepage-audit-server.mjs).
 * Each case works a control the way a creator does, then checks three things:
 *
 *   the control   it did what it says (the preview changed, the row saved)
 *   the preview   it changed straight away
 *   the live page what the published route draws from the saved row, at 390
 *                 (compared with the preview text run by text run: face,
 *                 size, weight, colour, left edge; every picture, link
 *                 target, and the box of every button, link and picture)
 *                 and at 1440 (a picture, to look at)
 *
 * Bugs it was written against (round 10), each a case below:
 *   prices in "lei" in the preview of a euro store, "€" live
 *   the social row's icons different on Links and on Design, and an edited
 *     handle kept at its old address on the live page
 *   a link typed as "example.com" opening storelib.me/example.com
 *   "Unsaved" and an Undo step on opening the editor, with nothing edited
 *   undo after Archive leaving the block on the page and in the archive
 *   undoing every edit leaving "Unsaved" on a page that is the saved one
 *
 *   node scripts/check-onepage-audit.mjs
 *   ONLY=load,themes node scripts/check-onepage-audit.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-audit.mjs
 *   PROBE_CSS=source    the stylesheet from source (no build needed)
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveAuditProbe } from "./onepage-audit-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-audit-"))
mkdirSync(SHOTS, { recursive: true })
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok || got === undefined ? "" : `\n          ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}

/* ── the page every case starts from ─────────────────────────────────────── */
const px = (n, w = 200, h = 200) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 47},55%,62%)"/></svg>`)}`
function fixture() {
  let order = 0
  const b = (id, type, data, extra = {}) => ({ id, type, enabled: true, sort_order: order++, data, ...extra })
  return {
    owner: { displayName: "Satori Owner", avatarUrl: px(3) },
    /* Not the platform's own currency, so a price drawn without the store's shows. */
    currency: "EUR",
    products: [
      { id: "p1", title: "A3 print", slug: "a3-print", price_cents: 2400, thumbnail_url: px(5), status: "published", archived: false },
      { id: "p2", title: "Old zine", slug: "old-zine", price_cents: 900, thumbnail_url: px(6), status: "archived", archived: true },
    ],
    onepage: {
      id: "op_audit", owner_id: "probe-user", slug: "satori", title: "Satori Studio", bio: "Prints, posters and a newsletter",
      avatar_url: px(3), seller_id: "seller_audit", creator_id: "seller_audit",
      theme: { template_id: "minimal_white", background_type: "solid", background_color: "#ffffff", background_gradient: null, background_image_url: null, text_color: "#000000", secondary_text_color: "#6b7280", button_style: "outline", button_color: "#ffffff", button_text_color: "#000000", button_border_radius: 8, button_border_width: 1, button_border_color: "#e5e7eb", button_hover_color: "#f9fafb", font_family: "Inter", card_width: "standard", spacing: "normal", gradient_direction: 135, header_layout: "classic" },
      settings: { show_branding: true, analytics_enabled: true, subscribe_enabled: true, subscribe_style: "white", share_enabled: true, share_style: "white", verified_badge_enabled: false, verified_badge_type: "verified_creator" },
      /* Instagram's handle edited since the social row copied it, YouTube removed, TikTok added. */
      social_links: { instagram: "https://instagram.com/satori", tiktok: "https://tiktok.com/@satori" },
      draft_blocks: [
        b("header", "header", { show_avatar: true, show_name: true, show_bio: true }),
        b("link1", "link_button", { label: "Shop the prints", url: "https://example.com/shop" }),
        b("prod1", "product", { product_id: "p1", show_price: true, show_description: true, cta_text: "Buy now", style: "button", product_title: "A3 print", product_thumbnail: px(5), product_price_cents: 2400, product_slug: "a3-print" }),
        b("prod2", "product", { product_id: "p2", show_price: true, cta_text: "Buy now", style: "button", product_title: "Old zine", product_thumbnail: px(6), product_price_cents: 900, product_slug: "old-zine" }),
        b("text1", "text", { content: "A letter every other Sunday.", alignment: "center" }),
        b("hidden1", "link_button", { label: "Hidden link", url: "https://example.com/hidden" }, { enabled: false }),
        b("later1", "link_button", { label: "Later link", url: "https://example.com/later" }, { schedule: { start_at: "2999-01-01T00:00:00.000Z", end_at: null } }),
        b("social1", "social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/old" }, { platform: "youtube", url: "https://youtube.com/@satori" }], style: "icons" }),
      ],
      archived_blocks: [],
      status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
    },
  }
}

const ctx = await serveAuditProbe({ root: process.cwd(), state: fixture(), fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(path, vp = DESKTOP) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  p.errors = []
  p.on("pageerror", (e) => p.errors.push(String(e).slice(0, 300)))
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT|Failed to load resource|net::/.test(m.text())) p.errors.push(m.text().slice(0, 300)) })
  await p.goto(`${ctx.base}${path}`)
  if (path.startsWith("/app")) await p.waitForFunction(() => document.querySelector("[data-onepage-preview-frame][data-drawn]") || innerWidth < 768, { timeout: 15000 }).catch(() => {})
  await sleep(900)
  return p
}
const clickText = (p, text, { exact = false, nth = 0 } = {}) => p.evaluate((text, exact, nth) => {
  const els = [...document.querySelectorAll("button, [role=button], a, [role=tab], [role=radio], [role=switch], label")].filter((b) => b.getClientRects().length)
  const hit = els.filter((b) => { const t = b.textContent.trim().replace(/\s+/g, " "); const a = b.getAttribute("aria-label") || ""; return exact ? t === text || a === text : t.includes(text) || a.includes(text) })[nth]
  if (hit) { hit.scrollIntoView({ block: "center" }); hit.click() }
  return !!hit
}, text, exact, nth)
const clickLeaf = (p, text) => p.evaluate((text) => {
  const el = [...document.querySelectorAll("p, span, div, h3, h4")].find((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === text))
  if (el) { el.scrollIntoView({ block: "center" }); el.click() }
  return !!el
}, text)
async function fill(p, match, text) {
  for (const h of await p.$$("input, textarea")) {
    const ok = await h.evaluate((e, m) => e.getClientRects().length > 0 && (e.value === m || e.getAttribute("placeholder") === m), match)
    if (!ok) continue
    await h.evaluate((e) => e.scrollIntoView({ block: "center" }))
    await h.focus()
    await h.evaluate((e) => e.select())
    await p.keyboard.press("Backspace")
    await p.keyboard.type(text)
    return true
  }
  return false
}
const says = (p, word) => p.evaluate((w) => [...document.querySelectorAll("*")].some((e) => e.childElementCount === 0 && e.getClientRects().length && e.textContent.trim() === w), word)
const canUndo = (p) => p.evaluate(() => { const b = document.querySelector('button[aria-label="Undo"]'); return !!b && !b.disabled })
const press = (p, label) => p.evaluate((l) => { const b = document.querySelector(`button[aria-label="${l}"]`); if (b && !b.disabled) { b.click(); return true } return false }, label)
const published = () => ctx.requests.filter((r) => r.path === "/api/onepage/publish").length

/* What a page draws, in the order it draws it. */
function FINGERPRINT() {
  const vis = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false } return el.getClientRects().length > 0 }
  const texts = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (w.nextNode()) {
    const t = w.currentNode, s = t.textContent.replace(/\s+/g, " ").trim()
    if (!s || !t.parentElement || t.parentElement.closest("script,style,noscript") || !vis(t.parentElement)) continue
    /* A countdown's seconds move between two readings. */
    if (t.parentElement.closest("[data-countdown]")) continue
    const cs = getComputedStyle(t.parentElement), r = t.parentElement.getBoundingClientRect()
    texts.push(`${s.slice(0, 50)} :: ${cs.fontFamily.split(",")[0].replace(/"/g, "")} ${cs.fontSize} ${cs.fontWeight} ${cs.color} x${Math.round(r.x)} w${Math.round(r.width)}`)
  }
  const imgs = [...document.querySelectorAll("img")].filter(vis).map((i) => (i.getAttribute("src") || "").slice(0, 80))
  const links = [...document.querySelectorAll("a[href]")].filter(vis).map((a) => a.getAttribute("href"))
  /* The page's own layers (its colour, gradient, wallpaper pattern) and the ring around the picture. */
  const layers = [...document.querySelectorAll("div, main, section")].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 300 && r.height >= 200 && vis(e) }).map((e) => { const cs = getComputedStyle(e); return /gradient\(|url\(/.test(cs.backgroundImage) ? cs.backgroundImage.slice(0, 80) : `${cs.backgroundColor} ${cs.backgroundImage.slice(0, 80)}` }).filter((x) => x !== "rgba(0, 0, 0, 0) none")
  const rings = [...document.querySelectorAll("img")].filter(vis).map((i) => [i, i.parentElement, i.parentElement?.parentElement].map((e) => e ? `${getComputedStyle(e).boxShadow.slice(0, 60)}|${getComputedStyle(e).borderTopColor}` : "").join(" "))
  const boxes = [...document.querySelectorAll("a, button, img, form, input")].filter(vis).map((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} bg=${cs.backgroundColor} ${cs.backgroundImage.slice(0, 40)} br=${cs.borderRadius} b=${cs.borderTopWidth} ${cs.borderTopColor} sh=${cs.boxShadow.slice(0, 60)}` })
  return { texts, imgs, links, boxes, layers: [...new Set(layers)], rings }
}
/* The phone's screen as drawn: a change a measurement cannot name (a glow, a pattern) still changes these pixels. */
const shotOf = async (p) => Buffer.from(await (await p.$("[data-onepage-preview-frame]")).screenshot({ encoding: "binary" }))
async function changed(p, before, beforeShot) {
  if (differences(before, await previewOf(p)).length > 0) return true
  return !beforeShot.equals(await shotOf(p))
}
async function previewOf(p) {
  const frame = await (await p.$("[data-onepage-preview-frame]")).contentFrame()
  return frame.evaluate(FINGERPRINT)
}
async function liveOf(name) {
  const p = await open("/live", { width: 390, height: 844, isMobile: true, hasTouch: true })
  const print = await p.evaluate(FINGERPRINT)
  await p.screenshot({ path: join(SHOTS, `${name}-live-390.png`), fullPage: true })
  print.errors = p.errors
  await p.close()
  const wide = await open("/live", DESKTOP)
  await wide.screenshot({ path: join(SHOTS, `${name}-live-1440.png`) })
  print.errors.push(...wide.errors)
  await wide.close()
  return print
}
function differences(a, b) {
  const out = []
  for (const k of ["texts", "imgs", "links", "boxes", "layers", "rings"]) {
    const n = Math.max(a[k].length, b[k].length)
    for (let i = 0; i < n && out.length < 6; i++) if (a[k][i] !== b[k][i]) out.push(`${k}[${i}] preview ${JSON.stringify(a[k][i])} | live ${JSON.stringify(b[k][i])}`)
  }
  return out
}
async function save(p) {
  const before = published()
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save" && x.getClientRects().length && x.getBoundingClientRect().top < 140); b?.click() })
  for (let i = 0; i < 40 && published() === before; i++) await sleep(100)
  await sleep(400)
  return published() > before
}
/* Save (unless already saved), then the preview against the live page. */
async function parity(p, name, { saveFirst = true } = {}) {
  await sleep(400)
  const preview = await previewOf(p)
  await p.screenshot({ path: join(SHOTS, `${name}-editor.png`) })
  if (saveFirst) expect(await save(p), `${name}: Save publishes`)
  const live = await liveOf(name)
  const d = differences(preview, live)
  expect(d.length === 0, `${name}: the live page draws what the preview drew`, d.join("\n          "))
  expect(live.errors.length === 0, `${name}: the live page logs no error`, live.errors)
  return { preview, live }
}
const has = (print, text) => print.texts.some((t) => t.startsWith(text))

const CASES = {
  async load() {
    const p = await open("/app/onepage#links")
    expect(!(await says(p, "Unsaved")), "opening the editor is not an edit: no Unsaved")
    expect(!(await canUndo(p)), "and no Undo step nobody made")
    const onLinks = await previewOf(p)
    await clickText(p, "Design", { exact: true }); await sleep(900)
    const onDesign = await previewOf(p)
    expect(differences(onLinks, onDesign).length === 0, "the preview is the same on Links and on Design", differences(onLinks, onDesign))
    expect(has(onLinks, "€24.00"), "a price in the store's currency in the preview", onLinks.texts.filter((t) => /24/.test(t)))
    expect(onLinks.links.includes("https://instagram.com/satori") && !onLinks.links.includes("https://instagram.com/old"), "the social row opens the edited handle")
    expect(!onLinks.links.some((l) => /youtube/.test(l)) && onLinks.links.includes("https://tiktok.com/@satori"), "a removed social is gone and a new one is in")
    expect(!has(onLinks, "Hidden link") && !has(onLinks, "Later link") && !has(onLinks, "Old zine"), "a hidden block, one not started and an archived product are not drawn")
    /* The page as published before this visit (its copy is the same draft): the live route draws it the same. */
    await parity(p, "load", { saveFirst: false })
    await p.close()
  },
  async link() {
    const p = await open("/app/onepage#links")
    expect(await clickLeaf(p, "Shop the prints"), "a link opens its editor")
    await sleep(700)
    await fill(p, "Shop the prints", "Shop all prints")
    const t0 = Date.now()
    await p.waitForFunction(() => {
      const f = document.querySelector("[data-onepage-preview-frame]")?.contentDocument
      return f && f.body.textContent.includes("Shop all prints")
    }, { timeout: 3000, polling: 16 }).catch(() => {})
    const took = Date.now() - t0
    expect(took < 300, `the preview shows a new label straight away (${took}ms)`)
    await fill(p, "https://example.com/shop", "example.com/all")
    await p.keyboard.press("Tab")
    const { live } = await parity(p, "link")
    expect(live.links.includes("https://example.com/all"), "a link typed without https opens on the web, not on storelib.me", live.links.slice(0, 3))
    await p.close()
  },
  async hide() {
    const p = await open("/app/onepage#links")
    await clickText(p, "Show Shop the prints"); await sleep(400)
    expect(!has(await previewOf(p), "Shop the prints"), "a link switched off leaves the preview")
    const { live } = await parity(p, "hide")
    expect(!has(live, "Shop the prints"), "and the live page")
    await p.close()
  },
  async order() {
    const p = await open("/app/onepage#links")
    await clickLeaf(p, "Shop the prints"); await sleep(700)
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.getClientRects().length && x.querySelector("svg.lucide-chevron-down"))?.click())
    await sleep(400)
    const { preview, live } = await parity(p, "order")
    const at = (print, t) => print.texts.findIndex((x) => x.startsWith(t))
    expect(at(preview, "Shop the prints") > at(preview, "Buy now") && at(live, "Shop the prints") > at(live, "Buy now"), "moved down: after the product in both")
    await p.close()
  },
  async archive() {
    const p = await open("/app/onepage#links")
    await clickLeaf(p, "Shop the prints"); await sleep(700)
    await clickText(p, "Delete", { exact: true }); await sleep(400)
    expect(await clickText(p, "Archive", { exact: true }), "Delete offers Archive")
    await sleep(500)
    expect(!has(await previewOf(p), "Shop the prints"), "an archived link leaves the preview")
    await press(p, "Undo"); await sleep(500)
    expect(has(await previewOf(p), "Shop the prints"), "undo brings it back")
    await save(p)
    const row = ctx.state.onepage
    expect(!(row.archived_blocks || []).some((x) => x.id === "link1") && row.draft_blocks.some((x) => x.id === "link1"), "and takes it out of the archive: on the page once, not in View archive", (row.archived_blocks || []).map((x) => x.id))
    await p.close()
  },
  async undo() {
    const p = await open("/app/onepage#links")
    const before = await previewOf(p)
    await clickLeaf(p, "Shop the prints"); await sleep(600)
    await fill(p, "Shop the prints", "Changed label"); await sleep(300)
    await clickText(p, "Show A3 print"); await sleep(300)
    const edited = await previewOf(p)
    expect(await says(p, "Unsaved"), "an edit says Unsaved")
    let n = 0
    while ((await press(p, "Undo")) && n < 20) { n++; await sleep(250) }
    await sleep(300)
    expect(differences(before, await previewOf(p)).length === 0, `undo (${n} steps) brings the preview back to the page as it was`)
    expect(!(await says(p, "Unsaved")), "and the page as saved is not Unsaved")
    while (await press(p, "Redo")) await sleep(250)
    await sleep(300)
    expect(differences(edited, await previewOf(p)).length === 0, "redo brings the edits back")
    expect(await says(p, "Unsaved"), "and they are unsaved again")
    await parity(p, "undo")
    const again = await open("/app/onepage#links")
    expect(differences(edited, await previewOf(again)).length === 0, "after a reload the editor opens on what was saved")
    await again.close()
    await p.close()
  },
  async themes() {
    for (const theme of ["Default", "Night", "Riso", "Fusion"]) {
      const p = await open("/app/onepage#design")
      await clickText(p, "Theme"); await sleep(600)
      const before = await previewOf(p)
      const beforeShot = await shotOf(p)
      expect(await clickText(p, `${theme} theme`), `${theme}: the theme is offered`)
      await sleep(700)
      if (theme !== "Default") expect(await changed(p, before, beforeShot), `${theme}: the preview changes`)
      await parity(p, `theme-${theme.toLowerCase()}`)
      await p.close()
      Object.assign(ctx.state, fixture())
    }
  },
  async design() {
    const steps = [
      ["Header", "Hero"], ["Header", "Glowing ring"], ["Wallpaper", "Gradient"], ["Wallpaper", "Dots"],
      ["Buttons", "Solid"], ["Buttons", "Strong"], ["Social icons", "Outline"], ["Footer", "Verified badge"], ["Footer", "Hide the Storelib badge"],
    ]
    for (const [section, control] of steps) {
      const name = `${section}-${control}`.toLowerCase().replace(/\W+/g, "-")
      const p = await open("/app/onepage#design")
      await clickText(p, section); await sleep(600)
      const before = await previewOf(p)
      const beforeShot = await shotOf(p)
      expect(await clickText(p, control), `${section} › ${control}: the control is there`)
      await sleep(600)
      expect(await changed(p, before, beforeShot), `${section} › ${control}: the preview changes`)
      await parity(p, name)
      await p.close()
      Object.assign(ctx.state, fixture())
    }
  },
  async settings() {
    const cases = [
      ["Basic info", async (p) => fill(p, "Satori Studio", "Satori Renamed"), (row, print) => row.published_profile?.title === "Satori Renamed" && has(print, "Satori Renamed")],
      ["Subscribe", async (p) => clickText(p, "Subscribe button"), (row) => row.settings.subscribe_enabled === false],
      ["Share", async (p) => clickText(p, "Share button"), (row) => row.settings.share_enabled === false],
      ["Verified badge", async (p) => clickText(p, "Verified badge", { nth: 1 }), (row) => row.settings.verified_badge_enabled === true],
    ]
    for (const [section, act, saved] of cases) {
      const p = await open("/app/onepage#settings")
      await clickText(p, section, { exact: true }); await sleep(600)
      const before = await previewOf(p)
      const beforeShot = await shotOf(p)
      await act(p); await sleep(500)
      expect(await changed(p, before, beforeShot), `Settings › ${section}: the preview changes before Save`)
      const sent = published()
      await p.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Save" && b.getClientRects().length && !b.disabled).pop()?.click())
      for (let i = 0; i < 30 && published() === sent; i++) await sleep(100)
      expect(published() > sent, `Settings › ${section}: its Save publishes`)
      const { live } = await parity(p, `settings-${section.toLowerCase().replace(/\W+/g, "-")}`, { saveFirst: false })
      expect(saved(ctx.state.onepage, live), `Settings › ${section}: saved and live`, { title: ctx.state.onepage.title, published: ctx.state.onepage.published_profile, settings: ctx.state.onepage.settings, live: live.texts.slice(0, 3) })
      await p.close()
      Object.assign(ctx.state, fixture())
    }
  },
  async phone() {
    const p = await open("/app/onepage#links", PHONE)
    await clickLeaf(p, "Shop the prints"); await sleep(900)
    expect(await fill(p, "Shop the prints", "Phone label"), "on a phone, a link's label can be edited")
    await sleep(300)
    await p.keyboard.press("Escape"); await sleep(500)
    expect(await clickText(p, "Preview", { exact: true }), "Preview opens on a phone")
    await sleep(1500)
    const preview = await previewOf(p)
    await p.screenshot({ path: join(SHOTS, "phone-preview.png") })
    expect(has(preview, "Phone label"), "and shows the edit")
    await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.getClientRects().length && x.querySelector("svg.lucide-save"))?.click())
    for (let i = 0; i < 30 && !ctx.state.onepage.published_blocks?.some((x) => x.data?.label === "Phone label"); i++) await sleep(100)
    const live = await liveOf("phone")
    expect(differences(preview, live).length === 0, "the phone's preview is the live page", differences(preview, live))
    expect(p.errors.length === 0, "the editor logs no error on a phone", p.errors)
    await p.close()
  },
}

for (const [name, run] of Object.entries(CASES)) {
  if (ONLY && !ONLY.includes(name)) continue
  console.log(`\n${name}`)
  for (const k of Object.keys(ctx.state)) delete ctx.state[k]
  Object.assign(ctx.state, fixture())
  ctx.requests.length = 0
  try {
    await run()
  } catch (e) {
    expect(false, `${name}: ran to the end`, String(e?.stack || e).split("\n").slice(0, 3).join(" | "))
  }
  for (const pg of await browser.pages()) if (pg.url() !== "about:blank") await pg.close().catch(() => {})
}

await browser.close()
ctx.server.close()
console.log(`\npictures in ${SHOTS}`)
if (broken) fail(`FAIL  ${broken} check${broken === 1 ? "" : "s"} failed`)
console.log("ok    the editor's controls, its preview and the live page agree")
