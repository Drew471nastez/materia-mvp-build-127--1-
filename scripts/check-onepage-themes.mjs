/**
 * ===========================================================================
 *  EVERY THEME CHANGES EVERY BLOCK, MEASURED
 * ===========================================================================
 * The real OnePage editor (scripts/onepage-probe-server.mjs), its real
 * preview frame, every theme card pressed in turn.
 *
 * The page starts the way the report found it: on Blocks (a grid pattern, a
 * hard black shadow), with a product block that kept a near black
 * background of its own from an earlier look. Then each of the eighteen
 * themes is pressed, and in the preview:
 *
 *   the product block wears the theme like the link beside it: the same
 *   fill (solid, or none for an outline or glass theme), the same corners,
 *   the same border;
 *   the product's title can be read on what it sits on (contrast 3:1 or more);
 *   nothing of the theme before is left: Blocks' grid is gone on a theme
 *   with no pattern, its hard shadow on a theme with none;
 *   the page's own background is the theme's.
 *
 *   node scripts/check-onepage-themes.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-themes.mjs   (a picture per theme)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-themes-"))
mkdirSync(shots, { recursive: true })

/* The theme catalogue, read from the Design tab itself: id, and what it sets. */
const src = readFileSync(join(root, "components/onepage/tabs/design-tab.tsx"), "utf8")
const THEMES = [...src.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",\n    name: "([^"]+)",[\s\S]*?theme_config: \{([\s\S]*?)\n    \},/g)].map((m) => ({
  id: m[1],
  name: m[2],
  pattern: (m[3].match(/background_pattern: "([a-z-]+)"/) || [])[1] || "none",
  shadow: (m[3].match(/button_shadow: "([a-z]+)"/) || [])[1] || "none",
  style: (m[3].match(/button_style: "([a-z]+)"/) || [])[1] || "filled",
}))
if (THEMES.length < 15) fail(`only ${THEMES.length} themes were read from the Design tab`)
const blocksTheme = src.match(/\n  \{\n    id: "blocks",[\s\S]*?theme_config: (\{[\s\S]*?\n    \}),/)

const { base, server } = await serveEditorProbe({
  root,
  fail,
  theme: {
    template_id: "blocks",
    background_color: "#ffd84d",
    background_pattern: "grid",
    button_color: "#ffffff",
    button_text_color: "#111111",
    button_shadow: "hard",
    button_shadow_color: "#111111",
    button_border_width: 2,
    button_border_color: "#111111",
  },
  blocks: [
    { id: "link", type: "link_button", enabled: true, sort_order: 1, data: { label: "My Link", url: "https://example.com" } },
    {
      id: "prod",
      type: "product",
      enabled: true,
      sort_order: 2,
      data: {
        product_id: "p1",
        product_title: "Probe Pack",
        product_description: "Forty drum loops",
        product_price_cents: 1900,
        product_slug: "probe-pack",
        style: "callout",
        cta_text: "Get it",
        /* What the report showed: a black block from an earlier look, no text colour of its own. */
        block_background_color: "#111111",
      },
    },
  ],
})
void blocksTheme

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const parse = (c) => {
  const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
}
const lum = ({ r, g, b }) => {
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(`${base}/app/onepage#design`)
await page.waitForSelector("[data-scroll-container]")
await sleep(1200)
await page.click('[data-nav-row="theme"]')
await sleep(600)

const preview = async () => {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((fr) => fr.url().includes("onepage-preview"))
    if (f) return f
    await sleep(100)
  }
  return null
}

/* What the preview draws: the product card, the link, the page under them. */
const read = (frame) =>
  frame.evaluate(() => {
    /* Only what is on screen: the page also keeps copies it does not show. */
    const shown = [...document.querySelectorAll("a,button")].filter((e) => e.getBoundingClientRect().width > 0)
    const byText = (t) => shown.find((e) => e.textContent && e.textContent.includes(t))
    const card = byText("Probe Pack")
    const link = shown.find((e) => e.textContent && e.textContent.trim() === "My Link") || byText("My Link")
    if (!card || !link) return null
    const title = [...card.querySelectorAll("p")].find((p) => p.textContent === "Probe Pack")
    document.querySelectorAll("[data-probe-card]").forEach((e) => e.removeAttribute("data-probe-card"))
    card.setAttribute("data-probe-card", "")
    const under = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg
      }
      return "rgb(255, 255, 255)"
    }
    const s = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, border: c.borderTopWidth, borderColor: c.borderTopColor, shadow: c.boxShadow } }
    const r = card.getBoundingClientRect()
    return {
      /* Where on the card to look: the title's line, right of the words, clear of the rounded corners (as fractions of the card). */
      spot: { fx: 0.75, fy: title ? (title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2 - r.top) / r.height : 0.5 },
      card: s(card),
      link: s(link),
      title: title ? getComputedStyle(title).color : null,
      under: under(card),
      pattern: document.querySelector("[data-wallpaper-pattern]")?.getAttribute("data-wallpaper-pattern") || "none",
    }
  })

/* The colour the screen shows at that spot of the card: found where the browser says the card is now, so where the preview has scrolled or slid it does not matter. */
async function paintedAt(frame, spot) {
  const el = await frame.$("[data-probe-card]")
  if (!el) return null
  /* The preview is the phone frame zoomed down, and the browser's own box for what is inside ignores the zoom: map it by hand. */
  const frameBox = await (await frame.frameElement())?.boundingBox()
  if (!frameBox) return null
  const inner = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth } })
  const zoom = frameBox.width / inner.vw
  const box = { x: frameBox.x + inner.x * zoom, y: frameBox.y + inner.y * zoom, width: inner.w * zoom, height: inner.h * zoom }
  const png = await page.screenshot()
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const cx = Math.round(box.x + box.width * spot.fx), cy = Math.round(box.y + box.height * spot.fy)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
    const i = (Math.min(Math.max(y, 0), info.height - 1) * info.width + Math.min(Math.max(x, 0), info.width - 1)) * 3
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  return { r: r / n, g: g / n, b: b / n, a: 1 }
}

const frame0 = await preview()
if (!frame0) fail("the preview frame never loaded")
const before = await read(frame0)
expect(before && parse(before.card.bg) && Math.round(lum(parse(before.card.bg)) * 100) < 5, "before: the product block is the black slab the report showed", before?.card.bg)

for (const t of THEMES) {
  await page.click(`[data-theme-card="${t.id}"]`)
  await sleep(700)
  /* A theme that asks for a layout change asks first: take it. */
  const confirmed = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent && x.textContent.trim() === "Update to Classic")
    if (b) { b.click(); return true }
    return false
  })
  if (confirmed) await sleep(700)
  const frame = await preview()
  const m = frame ? await read(frame) : null
  console.log(`\n${t.name} (${t.style}, shadow ${t.shadow}, pattern ${t.pattern})`)
  if (!m) { expect(false, "the preview draws the product and the link"); continue }
  expect(m.card.bg === m.link.bg, "the product block has the link's fill", `${m.card.bg} / ${m.link.bg}`)
  expect(m.card.radius === m.link.radius && m.card.border === m.link.border, "and its corners and border", `${m.card.radius} ${m.card.border} / ${m.link.radius} ${m.link.border}`)
  /* The colour really painted under the title: a patch of the card beside it, from a screenshot, so a gradient or a photo behind glass is measured as it is. */
  await sleep(900)
  const surface = await paintedAt(frame, m.spot)
  const ratio = m.title && parse(m.title) && surface ? contrast(parse(m.title), surface) : 0
  expect(ratio >= 3, "the product's title can be read on it", `${m.title} on painted rgb(${surface ? [surface.r, surface.g, surface.b].map(Math.round).join(",") : "?"}): ${ratio.toFixed(2)}:1`)
  expect(t.pattern !== "none" || m.pattern === "none", "no pattern left from the theme before", m.pattern)
  expect(t.shadow === "hard" || !/ 4px 4px 0px/.test(m.card.shadow), "no hard shadow left from the theme before", m.card.shadow)
  await page.screenshot({ path: join(shots, `theme-${t.id}.png`) })
}

expect(errors.length === 0, "no page errors", errors.slice(0, 3))
console.log(`\n${broken === 0 ? "every theme reaches every block" : `${broken} checks failed`}. Pictures: ${shots}`)
await browser.close()
server.close()
process.exit(broken === 0 ? 0 : 1)
