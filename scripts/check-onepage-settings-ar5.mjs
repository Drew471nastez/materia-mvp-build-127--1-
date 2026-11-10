/**
 * ===========================================================================
 *  EVERY DESIGN TAB SETTING CHANGES THE PAGE, THE SAME WAY IN THE PREVIEW
 *  AND ON THE LIVE PAGE (round AR5)
 * ===========================================================================
 * The owner: "ensure all the themes, all the styling, all the custom things,
 * all the texts and fonts and colours and buttons and layouts and styles
 * apply very well and accurate ... the editor, preview and live page are
 * 1:1 in sync."
 *
 * The page (scripts/render-onepage-ar5.tsx) is drawn twice, side by side in
 * two tabs: as /l/<slug> builds it (the published copy) and as the editor's
 * preview frame builds it (the draft). For every setting the Design tab
 * writes, each tab draws the page with the setting at one value and then at
 * another, and reads a snapshot of the computed style of the parts that
 * setting is about (the page, the name, the bio, the photo, a link, its
 * words, a product, the social row, the wallpaper's layers).
 *
 *   CHANGES   the snapshot at the second value differs from the first: the
 *             setting reaches the page (a setting that changes nothing is a
 *             broken control)
 *   PARITY    the preview's snapshot equals the live page's, at both values
 *
 *   node scripts/check-onepage-settings-ar5.mjs
 *   WIDTH=1440 node scripts/check-onepage-settings-ar5.mjs   (the desktop layout)
 */
import { existsSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const WIDTH = Number(process.env.WIDTH || 390)

const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#7d8ca3"/><stop offset="1" stop-color="#2b3140"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="300" cy="300" r="140" fill="#e9d7b5"/></svg>')}`
const BASE = {
  template_id: "default",
  background_type: "solid", background_color: "#f6f4ef", background_gradient: "", background_image_url: "",
  text_color: "#1a1a2e", secondary_text_color: "#555566", title_color: "#1a1a2e",
  button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12, button_border_width: 0, button_border_color: "#1a1a2e",
  button_shadow: "none", button_hover_animation: "lift",
  font_family: "'Inter', sans-serif", spacing: "normal", card_width: "standard", header_layout: "classic",
}
const IMAGE = { background_type: "image", background_image_url: PHOTO, background_color: "#2b3140", text_color: "#ffffff", secondary_text_color: "#e5e7eb", title_color: "#ffffff" }
const VIDEO = { background_type: "video", background_video_url: "/probe/wallpaper.mp4", background_color: "#2b3140", text_color: "#ffffff", secondary_text_color: "#e5e7eb", title_color: "#ffffff" }

/* [name, the theme it starts from, the change]. Each change is a Design tab control. */
const SETTINGS = [
  ["Font", {}, { font_family: "'Lora', serif" }],
  ["Title font", {}, { title_font: "'Playfair Display', serif" }],
  ["Text colour", {}, { text_color: "#7a1f1f" }],
  ["Small print colour", {}, { secondary_text_color: "#1f5a7a" }],
  ["Title colour", {}, { title_color: "#0c3b35" }],
  ["Title size", {}, { title_size: "large" }],
  ["Title weight", {}, { title_weight: 500 }],
  ["Title spacing", {}, { title_tracking: "wide" }],
  ["Title capitals", {}, { title_case: "upper" }],
  ["Bio size", {}, { bio_size: "large" }],
  ["Bio weight", {}, { bio_weight: 600 }],
  ["Bio spacing", {}, { bio_tracking: "wide" }],
  ["Bio capitals", {}, { bio_case: "upper" }],
  ["Photo size", {}, { avatar_size: "large" }],
  ["Photo shape", {}, { avatar_shape: "square" }],
  ["Photo ring", {}, { avatar_border_width: 4, avatar_border_color: "#d42d17" }],
  ["Button colour", {}, { button_color: "#0c3b35" }],
  ["Button text colour", {}, { button_text_color: "#ffe9a8" }],
  ["Button style Soft", {}, { button_style: "soft" }],
  ["Button style Outline", {}, { button_style: "outline" }],
  ["Button style Glass", {}, { button_style: "glass" }],
  ["Button corners", {}, { button_border_radius: 999 }],
  ["Button border", {}, { button_border_width: 3, button_border_color: "#d42d17" }],
  ["Button shadow", {}, { button_shadow: "hard", button_shadow_color: "#d42d17" }],
  ["Button hover", {}, { button_hover_animation: "fill", button_hover_fill: "#d42d17", button_hover_text: "#ffffff" }],
  ["Button size", {}, { button_size: "large" }],
  ["Button text place", {}, { button_text_align: "left" }],
  ["Button icon side", {}, { button_icon_position: "right" }],
  ["Spacing", {}, { spacing: "comfortable" }],
  ["Header alignment", {}, { header_align: "left" }],
  ["Header Hero", {}, { header_layout: "hero" }],
  /* A cover must be an https address (lib/onepage/theme-layout coverImageOf); it need not load for its band to be drawn. */
  ["Cover picture", {}, { cover_image_url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1600&q=80" }],
  ["Links layout Grid", {}, { block_layout: "grid" }],
  ["Links layout Cards", {}, { block_layout: "cards" }],
  ["Links layout Compact", {}, { block_layout: "compact" }],
  ["Links layout Mixed", {}, { block_layout: "masonry" }],
  ["Products layout Grid", {}, { product_layout: "grid" }],
  ["Products layout Rows", {}, { product_layout: "rows" }],
  ["Social icon style", {}, { social_icon_style: "outline" }],
  ["Social icon colour", {}, { social_icon_color: "#d42d17" }],
  ["Social icon tone", {}, { social_icon_tone: "brand" }],
  ["Wallpaper colour", {}, { background_color: "#e8efe9" }],
  ["Wallpaper gradient", {}, { background_type: "gradient", background_gradient: "linear-gradient(180deg, #f6f4ef 0%, #e2d6c4 100%)" }],
  ["Gradient drift", { background_type: "gradient", background_gradient: "linear-gradient(180deg, #f6f4ef 0%, #e2d6c4 100%)" }, { animated_gradient: true }],
  ["Gradient grain", { background_type: "gradient", background_gradient: "linear-gradient(180deg, #f6f4ef 0%, #e2d6c4 100%)" }, { gradient_noise: true, noise_strength: 30 }],
  ["Pattern", {}, { background_pattern: "grid", pattern_color: "#00000066" }],
  ["Pattern strength", { background_pattern: "dots" }, { pattern_opacity: "hard" }],
  ["Photo wallpaper", {}, IMAGE],
  ["Photo brightness", IMAGE, { image_brightness: 60 }],
  ["Photo grain", IMAGE, { image_noise: true, noise_strength: 30 }],
  ["Photo effect Mono", IMAGE, { wallpaper_effect: "mono" }],
  ["Photo effect Blur", IMAGE, { wallpaper_effect: "blur", wallpaper_blur: 16 }],
  ["Photo blur amount", { ...IMAGE, wallpaper_effect: "blur", wallpaper_blur: 8 }, { wallpaper_blur: 24 }],
  ["Photo effect Halftone", IMAGE, { wallpaper_effect: "halftone" }],
  ["Photo effect Grain", IMAGE, { wallpaper_effect: "grain" }],
  ["Photo effect Duotone", IMAGE, { wallpaper_effect: "duotone", wallpaper_tint: "#0c3b35" }],
  ["Photo tint", IMAGE, { wallpaper_tint: "#d42d17", wallpaper_tint_strength: 40 }],
  ["Photo tint strength", { ...IMAGE, wallpaper_tint: "#d42d17", wallpaper_tint_strength: 20 }, { wallpaper_tint_strength: 60 }],
  ["Video wallpaper", {}, VIDEO],
  ["Video brightness", VIDEO, { video_brightness: 40 }],
  ["Video effect Mono", VIDEO, { wallpaper_effect: "mono" }],
  ["Video effect Blur", VIDEO, { wallpaper_effect: "blur", wallpaper_blur: 16 }],
  ["Video effect Halftone", VIDEO, { wallpaper_effect: "halftone" }],
  ["Video effect Grain", VIDEO, { wallpaper_effect: "grain" }],
  ["Video effect Duotone", VIDEO, { wallpaper_effect: "duotone", wallpaper_tint: "#0c3b35" }],
  ["Video tint", VIDEO, { wallpaper_tint: "#d42d17", wallpaper_tint_strength: 40 }],
]

/* What a snapshot reads: the first element for each part, and the computed properties a setting can change. */
const SNAPSHOT = String.raw`(() => {
  const root = document.querySelector(".onepage-live:not([hidden])") || document.querySelector(".onepage-live")
  const PARTS = {
    page: ".onepage-live",
    header: "[data-op-header], [data-hero-header]",
    hero: "[data-hero-header]",
    title: "[data-op-header] h1, [data-hero-header] h1",
    bio: "[data-op-header] p, [data-hero-header] p",
    avatar: "[data-page-avatar]",
    avatarFrame: "[data-page-avatar] .shadow-lg",
    cover: "[data-cover-image]",
    social: "[data-op-social-row]",
    socialIcon: "[data-op-social-row] a",
    socialMark: "[data-op-social-row] svg",
    link: "[data-op-block=link_plain] .op-btn, [data-op-block=link_plain] a",
    linkLabel: "[data-op-block=link_plain] [data-block-title]",
    linkThumb: "[data-op-block=link_thumb] img",
    linkThumbLabel: "[data-op-block=link_thumb] [data-block-title]",
    linkPro: "[data-op-block=link_pro] .op-btn, [data-op-block=link_pro] a",
    blocks: "[data-block-layout], [data-mixed-blocks]",
    pair: "[data-link-pair], [data-link-tile]",
    product: "[data-op-block=product_button] > *",
    productPair: "[data-product-pair]",
    heading: "[data-op-block=heading] h2, [data-op-block=heading] h3",
    text: "[data-op-block=text] p",
    photo: "[data-wallpaper-photo]",
    video: "[data-wallpaper-video]",
    effects: "[data-wallpaper-effect]",
    pattern: "[data-wallpaper-pattern]",
    noise: "[data-wallpaper-noise]",
    drift: "[data-wallpaper-drift]",
  }
  const PROPS = ["display", "grid-template-columns", "flex-direction", "align-items", "justify-content", "text-align", "color", "background-color", "background-image", "font-family", "font-size", "font-weight", "letter-spacing", "text-transform", "border-top-left-radius", "border-top-width", "border-top-color", "box-shadow", "padding-top", "padding-left", "width", "height", "filter", "scale", "transform", "opacity", "mix-blend-mode", "row-gap", "max-width", "--op-fill", "--op-fill-text", "--op-small-print"]
  const short = (v) => (v.length > 120 ? v.slice(0, 60) + "#" + v.length + "#" + v.slice(-40) : v)
  const out = {}
  for (const [name, sel] of Object.entries(PARTS)) {
    const list = [...(root || document).querySelectorAll(sel)]
    const el = list[0]
    if (!el) { out[name] = null; continue }
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const snap = { n: list.length, x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }
    for (const p of PROPS) snap[p] = short(s.getPropertyValue(p).trim())
    for (const a of ["data-hover", "data-shadow", "data-block-layout", "data-align"]) if (el.hasAttribute(a)) snap[a] = el.getAttribute(a)
    out[name] = snap
  }
  return out
})()`

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-ar5.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], protocolTimeout: 60000 })
const CALM = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}"
const open = async (view) => {
  const page = await browser.newPage()
  await page.setViewport({ width: WIDTH, height: WIDTH > 800 ? 1800 : 3200, deviceScaleFactor: 1, isMobile: WIDTH < 800, hasTouch: WIDTH < 800 })
  page.on("pageerror", (e) => console.error(`${view} pageerror`, e.message))
  await page.goto(`${base}/app/onepage${view === "preview" ? "?preview" : ""}`, { waitUntil: "load" })
  await page.waitForFunction(() => typeof window.__ar5Render === "function", { timeout: 20000 })
  await page.addStyleTag({ content: CALM })
  return page
}
/* A tab in the background gets no animation frames: the one being read is brought to the front first. */
const snap = async (page, theme) => {
  await page.bringToFront()
  await page.evaluate((t) => window.__ar5Render(t), theme)
  /* Faces settle first (a face still loading in one tab and not the other is not a difference between the renderers). */
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))))
  return page.evaluate(SNAPSHOT)
}
const diff = (a, b) => {
  const out = []
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k]
    if (x === null || y === null) { if (x !== y) out.push(`${k}: ${x ? "drawn" : "none"} -> ${y ? "drawn" : "none"}`); continue }
    for (const p of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[p] !== y[p]) out.push(`${k}.${p}: ${x[p]} -> ${y[p]}`)
  }
  return out
}

const live = await open("live")
const preview = await open("preview")
const rows = []
try {
  for (const [name, from, change] of SETTINGS) {
    const a = { ...BASE, ...from }
    const b = { ...a, ...change }
    const [la, pa] = [await snap(live, a), await snap(preview, a)]
    const [lb, pb] = [await snap(live, b), await snap(preview, b)]
    const changed = diff(la, lb)
    const driftA = diff(la, pa)
    const driftB = diff(lb, pb)
    rows.push({ name, changes: changed.length, sample: changed.slice(0, 3), drift: [...driftA, ...driftB].slice(0, 6), driftCount: driftA.length + driftB.length })
    console.log(`${changed.length ? "ok  " : "DEAD"} ${driftA.length + driftB.length ? "DRIFT" : "same "}  ${name.padEnd(24)} ${changed.length} props changed${changed.length ? `  (${changed.slice(0, 2).join("; ")})` : ""}${driftA.length + driftB.length ? `\n        drift: ${[...driftA, ...driftB].slice(0, 3).join("; ")}` : ""}`)
  }
  /*
    EVERY BLOCK'S BUTTONS WEAR THE PAGE'S BUTTON. A page with a 3px red
    border, square corners, a hard red shadow and the Fill hover: every
    button-like element in a block (a link or a button with words and a
    fill or a border of its own) is listed, with whether it took them.
  */
  const loud = { ...BASE, button_border_width: 3, button_border_color: "#d42d17", button_border_radius: 0, button_shadow: "hard", button_shadow_color: "#d42d17", button_hover_animation: "fill", button_hover_fill: "#d42d17", button_hover_text: "#ffffff" }
  for (const [view, page] of [["live", live], ["preview", preview]]) {
    await page.bringToFront()
    await page.evaluate((t) => window.__ar5Render(t), loud)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const found = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("[data-op-block] a, [data-op-block] button")) {
        const s = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        const text = (el.textContent || "").trim()
        if (!text || r.width < 40 || r.height < 24 || s.visibility === "hidden" || s.display === "none") continue
        const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0
        if (!filled) continue
        const block = el.closest("[data-op-block]").getAttribute("data-op-block")
        const border = s.borderTopColor === "rgb(212, 45, 23)" && s.borderTopWidth === "3px"
        const shadow = /212, 45, 23/.test(s.boxShadow)
        const hover = el.classList.contains("op-btn") && el.getAttribute("data-hover") === "fill"
        out.push({ block, text: text.slice(0, 28), border, shadow, hover, radius: s.borderTopLeftRadius })
      }
      return out
    })
    const off = found.filter((f) => !(f.border && f.shadow && f.hover))
    rows.push({ name: `buttons (${view})`, changes: found.length - off.length, sample: [], drift: [], driftCount: 0, off })
    console.log(`\n${view}: ${found.length} buttons in blocks, ${found.length - off.length} wear the page's border, shadow and hover${off.length ? "; not:" : ""}`)
    for (const f of off) console.log(`   ${f.block.padEnd(16)} "${f.text}"  border ${f.border ? "yes" : "no"}, shadow ${f.shadow ? "yes" : "no"}, hover ${f.hover ? "yes" : "no"}, corners ${f.radius}`)
  }
} finally {
  await browser.close()
  server.close()
}
const dead = rows.filter((r) => !r.changes)
const drift = rows.filter((r) => r.driftCount)
writeFileSync(process.env.OUT || "ar5-settings.json", JSON.stringify({ width: WIDTH, rows }, null, 2))
console.log(`\n${WIDTH}px: ${rows.length} settings, ${rows.length - dead.length} change the page, ${dead.length} change nothing${dead.length ? ` (${dead.map((r) => r.name).join(", ")})` : ""}; ${drift.length} differ between the preview and the live page${drift.length ? ` (${drift.map((r) => r.name).join(", ")})` : ""}`)
process.exit(dead.length || drift.length ? 1 : 0)
