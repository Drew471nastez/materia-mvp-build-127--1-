/**
 * ===========================================================================
 *  ROUND 3: SOCIAL ICONS, BLOCK ICON STYLES, THE STORY PICTURE (measured)
 * ===========================================================================
 * scripts/render-onepage-social-r3.tsx draws the page; this reads it in headless Chromium at 390 and 1440:
 *
 *   disc     Brand colours on Solid (a new page's default) is a white disc per icon, each mark the brand's own:
 *            Instagram's gradient, X near black, LinkedIn's blue "in", TikTok's note over its cyan and red copies
 *   row      a few icons sit centred and do not scroll; sixteen fill the column, scroll sideways (the scroll is
 *            the browser's: snap on x, no scrollbar), fade the edge with more behind it, and a sideways wheel
 *            (a trackpad swipe) moves them, after which both edges fade
 *   looks    Layout › Icon style on the Instagram, TikTok and YouTube blocks, the Instagram link and the
 *            followers block: Original draws no look tile, Solid a tint, Outline a 2px ring, Glass a blur,
 *            on three themes
 *   story    the story picture is a 1080 x 1920 PNG on a dark, a light and a gradient ground, and with no photo
 *   share    the visitor's share sheet has Story and no Facebook
 *
 * Screenshots go to SHOTS (default: the system temp folder, r3-social-shots).
 *
 *   node scripts/check-onepage-social-r3.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const SHOTS = process.env.SHOTS || join(tmpdir(), "r3-social-shots")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const notes = []
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    problems.push(name)
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-social-r3.tsx" })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })

async function open(query, width) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: width < 800 ? 900 : 1000, deviceScaleFactor: 2 })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(`${base}/app?${query}`)
  return { page, errors }
}

const readRow = (page) =>
  page.evaluate(() => {
    const row = document.querySelector("[data-op-social-row]")
    const icons = [...document.querySelectorAll("[data-op-social-icon]")]
    const col = row?.parentElement?.getBoundingClientRect()
    const r = row?.getBoundingClientRect()
    const first = icons[0]?.getBoundingClientRect()
    const last = icons[icons.length - 1]?.getBoundingClientRect()
    const cs = row ? getComputedStyle(row) : null
    return {
      n: icons.length,
      rowWidth: r?.width,
      colWidth: col?.width,
      scrollWidth: row?.scrollWidth,
      clientWidth: row?.clientWidth,
      scrollLeft: row?.scrollLeft,
      fade: row?.getAttribute("data-fade"),
      snap: cs?.scrollSnapType,
      scrollbar: cs?.scrollbarWidth,
      overflowX: cs?.overflowX,
      leftGap: first && r ? first.left - r.left : null,
      rightGap: last && r ? r.right - last.right : null,
      tiles: icons.map((a) => {
        const s = getComputedStyle(a)
        const svg = a.querySelector("svg")
        const paths = [...(svg?.querySelectorAll("path") || [])].map((p) => getComputedStyle(p).fill)
        return { platform: a.getAttribute("data-op-social-icon"), bg: s.backgroundColor, mark: svg?.getAttribute("data-mark"), tone: svg?.getAttribute("data-tone"), fill: svg ? getComputedStyle(svg).fill : null, color: svg ? getComputedStyle(svg).color : null, paths }
      }),
    }
  })

console.log("\ndisc: Brand colours on Solid")
for (const width of [390, 1440]) {
  const { page, errors } = await open("social=few&icons=filled/brand", width)
  await page.waitForSelector("[data-op-social-icon]")
  /* The desktop card and its blocks rise in; read and shoot them once they have. */
  await sleep(1800)
  const row = await readRow(page)
  check(`${width}: five icons, each on a white disc`, row.n === 5 && row.tiles.every((t) => t.bg === "rgb(255, 255, 255)"), row.tiles.map((t) => t.bg))
  const by = Object.fromEntries(row.tiles.map((t) => [t.platform, t]))
  check(`${width}: Instagram is its gradient`, /url\(/.test(by.instagram?.paths?.[0] || ""), by.instagram)
  check(`${width}: X is near black`, by.twitter?.color === "rgb(17, 17, 19)", by.twitter)
  check(`${width}: LinkedIn is the blue "in"`, by.linkedin?.color === "rgb(10, 102, 194)" && by.linkedin?.tone === "brand", by.linkedin)
  check(`${width}: YouTube is red`, by.youtube?.color === "rgb(255, 0, 0)", by.youtube)
  check(`${width}: TikTok is its note over cyan and red`, by.tiktok?.mark === "tiktok" && by.tiktok.paths.length === 3 && by.tiktok.paths[0] === "rgb(37, 244, 238)" && by.tiktok.paths[1] === "rgb(254, 44, 85)" && by.tiktok.paths[2] === "rgb(17, 17, 19)", by.tiktok)
  check(`${width}: a few icons are centred and do not scroll`, Math.abs(row.leftGap - row.rightGap) <= 2 && row.scrollWidth <= row.clientWidth + 1 && !row.fade, { leftGap: row.leftGap, rightGap: row.rightGap, sw: row.scrollWidth, cw: row.clientWidth })
  const el = await page.$("[data-op-social-row]")
  await el.screenshot({ path: join(SHOTS, `social-few-${width}.png`) })
  await page.screenshot({ path: join(SHOTS, `page-few-${width}.png`) })
  check(`${width}: no page errors`, errors.length === 0, errors)
  await page.close()
}

console.log("\nrow: sixteen icons slide")
for (const width of [390, 1440]) {
  const { page, errors } = await open("social=many&icons=filled/brand", width)
  await page.waitForSelector("[data-op-social-icon]")
  /* The desktop card and its blocks rise in; read and shoot them once they have. */
  await sleep(1800)
  const row = await readRow(page)
  check(`${width}: sixteen icons on one line, the column's full width`, row.n === 16 && Math.abs(row.rowWidth - row.colWidth) <= 1, { rowWidth: row.rowWidth, colWidth: row.colWidth })
  check(`${width}: they overflow and scroll sideways (snap on x, no scrollbar)`, row.scrollWidth > row.clientWidth && row.overflowX === "auto" && /x/.test(row.snap) && row.scrollbar === "none", row)
  check(`${width}: the far edge fades at rest`, row.fade === "end", row.fade)
  const el = await page.$("[data-op-social-row]")
  await el.screenshot({ path: join(SHOTS, `social-many-${width}.png`) })
  const box = await el.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel({ deltaX: 40 })
    await sleep(30)
  }
  await sleep(600)
  const after = await readRow(page)
  check(`${width}: a sideways swipe moves the row, and both edges fade`, after.scrollLeft > 60 && after.fade === "both", { scrollLeft: after.scrollLeft, fade: after.fade })
  await el.screenshot({ path: join(SHOTS, `social-many-${width}-swiped.png`) })
  /* Glass and Outline on a busy row, for the eye. */
  check(`${width}: no page errors`, errors.length === 0, errors)
  await page.close()
}
{
  const { page } = await open("social=many&icons=outline/brand", 390)
  await page.waitForSelector("[data-op-social-icon]")
  /* The desktop card and its blocks rise in; read and shoot them once they have. */
  await sleep(1800)
  await (await page.$("[data-op-social-row]")).screenshot({ path: join(SHOTS, "social-many-390-outline-brand.png") })
  await page.close()
}

console.log("\nlooks: Layout › Icon style on the blocks")
const ids = await (async () => {
  const { page } = await open("social=few", 390)
  await page.waitForFunction(() => Array.isArray(window.__themeIds))
  const list = await page.evaluate(() => window.__themeIds)
  await page.close()
  return list
})()
const themes = [null, ids.find((id) => /dark|night|noir|midnight/i.test(id)) || ids[3], ids[Math.floor(ids.length / 2)]]
for (const t of themes) {
  for (const look of ["original", "solid", "outline", "glass"]) {
    const { page, errors } = await open(`social=few&look=${look}${t ? `&t=${t}` : ""}`, 390)
    await page.waitForSelector("[data-onepage-app]")
    await sleep(1500)
    const r = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll("[data-icon-look]")].map((e) => {
        const s = getComputedStyle(e)
        return { look: e.getAttribute("data-icon-look"), bg: s.backgroundColor, border: s.borderTopWidth, blur: s.backdropFilter || s.webkitBackdropFilter }
      })
      return { tiles, apps: document.querySelectorAll("[data-onepage-app]").length }
    })
    const tag = `${t || "default"} / ${look}`
    if (look === "original") check(`${tag}: no look tile, the services' own`, r.tiles.length === 0, r.tiles.length)
    else {
      /* The Instagram and TikTok blocks, the link's icon and three followers marks (the YouTube card here draws no mark). */
      check(`${tag}: every mark wears it (6)`, r.tiles.length === 6 && r.tiles.every((x) => x.look === look), r.tiles.length)
      if (look === "solid") check(`${tag}: a tint behind`, r.tiles.every((x) => x.bg !== "rgba(0, 0, 0, 0)" && x.border === "0px"), r.tiles[0])
      if (look === "outline") check(`${tag}: a 2px ring`, r.tiles.every((x) => x.bg === "rgba(0, 0, 0, 0)" && x.border === "2px"), r.tiles[0])
      if (look === "glass") check(`${tag}: frosted`, r.tiles.every((x) => /blur/.test(x.blur || "")), r.tiles[0])
    }
    const first = await page.$("[data-onepage-app]")
    const last = await page.$("[data-onepage-followers]")
    const a = await first.boundingBox()
    const b = await last.boundingBox()
    await page.screenshot({ path: join(SHOTS, `looks-${t || "default"}-${look}.png`), clip: { x: 0, y: a.y - 8, width: 390, height: b.y + b.height - a.y + 16 } })
    check(`${tag}: no page errors`, errors.length === 0, errors)
    await page.close()
  }
}

console.log("\nstory: the picture")
const pngSize = (dataUrl) => {
  const buf = Buffer.from(dataUrl.split(",")[1], "base64")
  return { png: buf.subarray(1, 4).toString() === "PNG", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), buf }
}
for (const q of ["story=dark", "story=light", "story=gradient", "story=dark&noavatar"]) {
  const { page, errors } = await open(q, 390)
  await page.waitForFunction(() => typeof window.__story === "string", { timeout: 15000 })
  const url = await page.evaluate(() => window.__story)
  const ok = url.startsWith("data:image/png")
  const s = ok ? pngSize(url) : null
  check(`${q}: a 1080 x 1920 PNG`, ok && s.png && s.w === 1080 && s.h === 1920, ok ? { w: s.w, h: s.h } : url.slice(0, 80))
  if (ok) writeFileSync(join(SHOTS, `story-${q.replace(/[=&]/g, "-")}.png`), s.buf)
  check(`${q}: no page errors`, errors.length === 0, errors)
  await page.close()
}

console.log("\nshare: Story in place of Facebook")
for (const width of [390, 1440]) {
  const { page, errors } = await open("share", width)
  await page.waitForSelector("[data-share-target]")
  await sleep(500)
  const names = await page.evaluate(() => [...document.querySelectorAll("[data-share-target]")].map((e) => e.getAttribute("data-share-target")))
  check(`${width}: Copy link, X, Story, WhatsApp`, names.join(",") === "Copy link,X,Story,WhatsApp", names)
  await page.screenshot({ path: join(SHOTS, `share-${width}.png`) })
  check(`${width}: no page errors`, errors.length === 0, errors)
  await page.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${SHOTS}`)
for (const n of notes) console.log(`note: ${n}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s)`)
  process.exit(1)
}
console.log("\nall good")
