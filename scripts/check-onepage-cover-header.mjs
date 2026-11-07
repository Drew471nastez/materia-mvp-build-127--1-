/**
 * OnePage cover and header, measured (round AK, track AK4).
 *
 *   PROBE_CSS=source node scripts/check-onepage-cover-header.mjs
 *   SHOTS=/some/dir  also writes a screenshot of every case
 *
 * The real public page (components/onepage/public-onepage.tsx), the real
 * editor and its preview frame, bundled by scripts/onepage-probe-server.mjs.
 * The pictures are drawn here, in the browser, in flat known colours, so a
 * dark row at an edge can only be a bar the page drew, never the photo.
 *
 * What it measures, at 390px and 1280px:
 *   1. the avatar overlaps the cover's bottom edge by half its height, for the
 *      centred and left headers, every avatar size, round and square, the
 *      creator's cover on Classic and on Hero, the theme's full width cover,
 *      and every wallpaper (solid, dark, gradient, image, pattern)
 *   2. no dark rows or columns at the edges of a cover or a hero picture
 *   3. a hero picture, the profile photo or the creator's cover, ends in the
 *      page's own colour, with no step between two rows larger than a soft
 *      fade makes
 *   4. the crop: the part of the source picture that shows is the same in
 *      the editor's crop frame, the editor's preview and the public page
 */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { mkdirSync, writeFileSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })

const COVER = "https://storelib.com/media/covers/probe/cover.png"
const AVATAR = "https://storelib.com/media/avatars/probe/avatar.png"
const WALL = "https://storelib.com/media/wallpapers/probe/wall.png"
let state = { avatar: AVATAR, theme: {}, blocks: null }

const header = { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } }
const link = { id: "l1", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints", url: "https://example.com/shop" } }

const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-avatar-audit.tsx",
  api(req, body) {
    if (req.url === "/audit-state") return { body: { ...state, blocks: state.blocks || [header, link] } }
    if (req.url === "/api/onepage" && req.method === "PUT") {
      const b = JSON.parse(body)
      state.theme = b.theme
      return { body: { ok: true } }
    }
    return null
  },
})

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

/* The test pictures, drawn once: a cover in four coloured quarters (so a crop is visible), a flat avatar, a flat wallpaper. */
const pictures = await (async () => {
  const page = await browser.newPage()
  const out = await page.evaluate(() => {
    const draw = (w, h, paint) => {
      const c = document.createElement("canvas")
      c.width = w
      c.height = h
      paint(c.getContext("2d"), w, h)
      return c.toDataURL("image/png").split(",")[1]
    }
    return {
      cover: draw(1600, 900, (g, w, h) => {
        g.fillStyle = "#ff8a00"; g.fillRect(0, 0, w / 2, h / 2)
        g.fillStyle = "#ffb000"; g.fillRect(w / 2, 0, w / 2, h / 2)
        g.fillStyle = "#ff6a3d"; g.fillRect(0, h / 2, w / 2, h / 2)
        g.fillStyle = "#ffc94d"; g.fillRect(w / 2, h / 2, w / 2, h / 2)
      }),
      avatar: draw(800, 1000, (g, w, h) => { g.fillStyle = "#3fa7ff"; g.fillRect(0, 0, w, h) }),
      wall: draw(1200, 1600, (g, w, h) => { g.fillStyle = "#d9e7d4"; g.fillRect(0, 0, w, h) }),
    }
  })
  await page.close()
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Buffer.from(v, "base64")]))
})()

const serveImages = async (page) => {
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    /* The optimiser is not in the probe: the page falls back to the original, as it does when the optimiser fails. */
    const target = u.pathname.startsWith("/_next/image") ? new URL(u.searchParams.get("url") || "", "https://storelib.com") : u
    if (target.hostname === "storelib.com" && target.pathname.startsWith("/media/")) {
      const body = target.pathname.includes("/covers/") ? pictures.cover : target.pathname.includes("/avatars/") ? pictures.avatar : pictures.wall
      return void r.respond({ status: 200, contentType: "image/png", body })
    }
    if (u.hostname === "placeholder.supabase.co") return void r.respond({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, contentType: "application/json", body: "{}" })
    void r.continue()
  })
}

/* Rows and columns of pixels from a screenshot of one box, read back in the page through a canvas. */
/* Read twice until two reads agree: an image that has just been swapped for its original can still be fading in. */
const pixels = async (page, rect, inset = 0) => {
  let last = await pixelsOnce(page, rect, inset)
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 200))
    const next = await pixelsOnce(page, rect, inset)
    const moved = Math.max(...next.rows.map((v, k) => Math.abs(v - (last.rows[k] ?? 0))), ...next.cols.map((v, k) => Math.abs(v - (last.cols[k] ?? 0))))
    last = next
    if (moved < 1) break
  }
  return last
}
const pixelsOnce = async (page, rect, inset = 0) => {
  /* Only what is on the page: a full width cover starts above the document's top, under the status bar, and that part is never drawn. */
  const y = Math.max(0, rect.y), x = Math.max(0, rect.x)
  const png = await page.screenshot({ clip: { x, y, width: rect.width - (x - rect.x), height: rect.height - (y - rect.y) }, encoding: "base64", captureBeyondViewport: true })
  if (process.env.DEBUG_CLIPS) writeFileSync(`${process.env.DEBUG_CLIPS}/clip-${Date.now()}.png`, Buffer.from(png, "base64"))
  return page.evaluate(async (png, inset) => {
    const img = new Image()
    img.src = "data:image/png;base64," + png
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    const rows = [], cols = []
    /* A rounded box's corners are the page, not the picture: each row and column is read between them. */
    const i0 = Math.min(inset, c.width / 2 - 1), j0 = Math.min(inset, c.height / 2 - 1)
    for (let y = 0; y < c.height; y++) { let s = 0, n = 0; for (let x = i0; x < c.width - i0; x++, n++) s += lum((y * c.width + x) * 4); rows.push(s / n) }
    for (let x = 0; x < c.width; x++) { let s = 0, n = 0; for (let y = j0; y < c.height - j0; y++, n++) s += lum((y * c.width + x) * 4); cols.push(s / n) }
    /* Each row's mean colour too, for the fade's last row against the page. */
    const rowRgb = (y) => { const t = [0, 0, 0]; for (let x = 0; x < c.width; x++) for (let k = 0; k < 3; k++) t[k] += d[(y * c.width + x) * 4 + k]; return t.map((v) => v / c.width) }
    return { rows, cols, last: rowRgb(c.height - 1), first: rowRgb(0), rgbAt: Array.from({ length: Math.min(c.height, 32) }, (_, y) => rowRgb(y)) }
  }, png, inset)
}

/* Which part of the source picture shows in a box: the visible window as fractions of the picture, for an object-fit: cover image. */
const visibleWindow = (frame, imgSel, boxSel) =>
  frame.evaluate((imgSel, boxSel) => {
    const img = document.querySelector(imgSel)
    const box = (boxSel ? document.querySelector(boxSel) : img.parentElement).getBoundingClientRect()
    const r = img.getBoundingClientRect()
    const cs = getComputedStyle(img)
    const nw = img.naturalWidth, nh = img.naturalHeight
    /* object-fit: cover inside the img's own box, at its object-position. */
    const s = Math.max(r.width / nw, r.height / nh)
    const dw = nw * s, dh = nh * s
    const [px, py] = cs.objectPosition.split(" ").map((v) => parseFloat(v) / 100)
    const ox = r.left + (r.width - dw) * px, oy = r.top + (r.height - dh) * py
    return {
      x0: (box.left - ox) / dw, x1: (box.right - ox) / dw,
      y0: (box.top - oy) / dh, y1: (box.bottom - oy) / dh,
      aspect: box.width / box.height,
    }
  }, imgSel, boxSel)

const results = []
const note = (line) => { results.push(line); console.log(line) }

/* What a phone and a laptop show of one page. */
const openLive = async (width, theme, blocks = null) => {
  state = { avatar: AVATAR, theme, blocks }
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.setViewport({ width, height: 1000 })
  await serveImages(page)
  await page.goto(base + "/app/onepage?live")
  await page.waitForSelector("[data-op-header], [data-hero-header]")
  await page.waitForFunction(() => [...document.querySelectorAll("[data-cover-image] img, [data-hero-media] img, [data-page-avatar] img")].filter((i) => i.getClientRects().length).every((i) => i.complete && i.naturalWidth > 0))
  /* The page fades in on load: measure it once nothing is moving (endless glows and spinners aside). */
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 150))
  return { page, context, errors }
}

/* The visible copy of an element: the page draws a desktop and a phone layout and hides one. */
const visible = (page, sel) =>
  page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }, sel)

const DARK = 60

/* A picture that fades into the page: its last row against the page under it, and the largest jump between two rows on the way. */
const fadeOf = async (page, box, wname) => {
  const px = await pixels(page, box, 40)
  const below = await pixels(page, { x: box.x, y: box.y + box.height, width: box.width, height: 24 }, 40)
  /* The page's next row, or on a pattern the row one tile (16px) further down, where the dots are in the same place. */
  const twin = wname === "pattern" ? below.rgbAt[15] : below.first
  const lastVsPage = Math.max(...px.last.map((v, k) => Math.abs(v - twin[k])))
  let step = 0
  for (let y = 1; y < px.rows.length; y++) step = Math.max(step, Math.abs(px.rows[y] - px.rows[y - 1]))
  return { px, lastVsPage, step }
}

try {
  /* 1 and 2: overlap and clean edges, across layouts, avatar looks and wallpapers. */
  const wallpapers = {
    solid: { background_type: "solid", background_color: "#ffffff", text_color: "#1a1a2e" },
    dark: { background_type: "solid", background_color: "#101014", text_color: "#f4f4f5" },
    gradient: { background_type: "gradient", background_gradient: "linear-gradient(180deg, #fdf2f8 0%, #e0e7ff 100%)", background_color: "#fdf2f8", text_color: "#1a1a2e" },
    pattern: { background_type: "solid", background_color: "#f5f1ea", background_pattern: "dots", pattern_color: "#1a1a2e", pattern_opacity: "medium", text_color: "#1a1a2e" },
    image: { background_type: "image", background_image_url: WALL, background_color: "#d9e7d4", text_color: "#1a1a2e" },
  }
  const looks = [
    { name: "centre, medium, round", t: {} },
    { name: "left, medium, round", t: { header_align: "left" } },
    { name: "centre, large, square", t: { avatar_size: "large", avatar_shape: "square" } },
    { name: "centre, small, round", t: { avatar_size: "small" } },
  ]
  const covers = [
    { name: "own cover", t: { cover_image_url: COVER, cover_profile_layout: true, cover_crop: { x: 50, y: 50, zoom: 1 } } },
    { name: "theme cover", t: { cover_image_url: COVER } },
    { name: "hero cover", t: { header_layout: "hero", cover_image_url: COVER, cover_profile_layout: true, cover_crop: { x: 50, y: 50, zoom: 1 } } },
  ]
  for (const width of [390, 1280]) {
    for (const [wname, wall] of Object.entries(wallpapers)) {
      for (const look of looks) {
        for (const cover of covers) {
          if (cover.name === "theme cover" && look.name !== looks[0].name) continue
          if (process.env.ONLY && !`${width}px ${wname}, ${look.name}, ${cover.name}`.includes(process.env.ONLY)) continue
          const { page, context, errors } = await openLive(width, { ...wall, ...look.t, ...cover.t })
          const c = await visible(page, "[data-cover-image] > div")
          const a = await visible(page, "[data-page-avatar]")
          assert.ok(c && a, `${width} ${wname} ${look.name} ${cover.name}: a cover and an avatar`)
          const ratio = (c.bottom - a.top) / a.height
          if (shots) await page.screenshot({ path: `${shots}/cover-${width}-${wname}-${look.name.replace(/\W+/g, "-")}-${cover.name.replace(/\W+/g, "-")}.png`, clip: { x: 0, y: 0, width, height: Math.min(900, a.y + a.height + 160) } })
          const radius = await page.evaluate(() => parseFloat(getComputedStyle([...document.querySelectorAll("[data-cover-image] > div")].find((e) => e.getClientRects().length)).borderTopLeftRadius) || 0)
          /* The page card on a computer rounds the corners of a full width cover too. */
          const px = await pixels(page, c, Math.max(40, Math.ceil(radius)))
          const hero = cover.name === "hero cover"
          /* A Hero cover's last row is the page itself: it is read below, as a fade. */
          const edge = hero ? [px.rows[0], px.cols[0], px.cols.at(-1)] : [px.rows[0], px.rows.at(-1), px.cols[0], px.cols.at(-1)]
          const darkest = Math.min(...edge)
          let fade = ""
          if (hero) {
            await page.evaluate(() => {
              const css = document.createElement("style")
              css.textContent = "[data-page-avatar], [data-op-header] > :not([data-cover-image]) { visibility: hidden !important }"
              document.head.append(css)
            })
            const f = await fadeOf(page, c, wname)
            fade = `, fade: last row vs page ${f.lastVsPage.toFixed(1)}/255, largest row step ${f.step.toFixed(1)}`
            assert.ok(f.lastVsPage <= 6, `${width}px ${wname} ${look.name} hero cover: the cover ends in the page's colour (${f.lastVsPage})`)
            if (wname !== "pattern" && wname !== "image") assert.ok(f.step <= 6, `${width}px ${wname} ${look.name} hero cover: no hard edge in the fade (${f.step})`)
          }
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
          const tag = `${width}px ${wname}, ${look.name}, ${cover.name}`
          note(`${tag}: overlap ${ratio.toFixed(3)} of the avatar, edge rows/cols luminance min ${darkest.toFixed(0)}, avatar ${a.width.toFixed(0)}px, cover ${c.width.toFixed(0)}x${c.height.toFixed(0)}${fade}`)
          assert.ok(Math.abs(ratio - 0.5) <= 0.04, `${tag}: the avatar overlaps the cover by half (${ratio})`)
          assert.ok(darkest > DARK, `${tag}: no dark bar at the cover's edges (${edge.map((v) => v.toFixed(0))})`)
          assert.equal(overflow, false, `${tag}: no sideways scroll`)
          assert.deepEqual(errors, [], tag)
          await context.close()
        }
      }
    }
  }

  /* 3: the hero picture fades into the page, softly, with no dark rows. */
  for (const width of [390, 1280]) {
    for (const [wname, wall] of Object.entries(wallpapers)) {
      if (wname === "image") continue
      const { page, context, errors } = await openLive(width, { ...wall, header_layout: "hero" })
      const h = await visible(page, "[data-hero-media]")
      assert.ok(h, `${width} ${wname}: a hero picture`)
      if (shots) await page.screenshot({ path: `${shots}/hero-${width}-${wname}.png`, clip: { x: 0, y: 0, width, height: Math.min(1000, h.y + h.height + 200) } })
      /* The fade itself: the name and bio over it, and the floating buttons, are hidden while it is read. */
      await page.evaluate(() => {
        const css = document.createElement("style")
        css.textContent = "[data-hero-header] > :not([data-hero-media]) { visibility: hidden !important }"
        document.head.append(css)
        for (const el of document.querySelectorAll("body *")) if (getComputedStyle(el).position === "fixed") el.style.visibility = "hidden"
      })
      const { px, lastVsPage, step } = await fadeOf(page, h, wname)
      const sideDark = Math.min(px.cols[0], px.cols.at(-1), px.rows[0])
      const tag = `${width}px hero on ${wname}`
      note(`${tag}: last row vs page ${lastVsPage.toFixed(1)}/255, largest row step ${step.toFixed(1)}, edge luminance min ${sideDark.toFixed(0)}, picture ${h.width.toFixed(0)}x${h.height.toFixed(0)}`)
      assert.ok(lastVsPage <= 6, `${tag}: the picture ends in the page's colour (${lastVsPage})`)
      /* On a pattern the dots themselves are rows of contrast: the fade is read on the plain wallpapers. */
      if (wname !== "pattern") assert.ok(step <= 6, `${tag}: no hard edge in the fade (${step})`)
      assert.ok(sideDark > DARK || wname === "dark", `${tag}: no dark bar at the picture's edges`)
      assert.deepEqual(errors, [], tag)
      await context.close()
    }
  }

  /* 4: one crop in the editor's frame, its preview and the public page. */
  for (const [width, layout] of [[390, "classic"], [1280, "classic"], [390, "hero"], [1280, "hero"]]) {
    const crop = { x: 22, y: 71, zoom: 1.8 }
    const theme = { background_type: "solid", background_color: "#ffffff", text_color: "#1a1a2e", header_layout: layout, cover_image_url: COVER, cover_profile_layout: true, cover_crop: crop }
    state = { avatar: AVATAR, theme, blocks: null }
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.setViewport({ width, height: 1000 })
    await serveImages(page)
    await page.goto(base + "/app/onepage#links")
    await page.waitForSelector("[data-onepage-loader]", { hidden: true })
    await page.waitForSelector('[data-block-open="header"]')
    await page.click('[data-block-open="header"]')
    await page.waitForSelector("[data-header-cover-editor] [data-cover-crop-frame] img")
    await page.waitForFunction(() => document.querySelector("[data-header-cover-editor] [data-cover-crop-frame] img").naturalWidth > 0)
    await new Promise((r) => setTimeout(r, 300))
    const editor = await visibleWindow(page, "[data-header-cover-editor] [data-cover-crop-frame] img", "[data-header-cover-editor] [data-cover-crop-frame]")
    if (width < 640) {
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Preview" && b.getClientRects().length)?.click())
    }
    const frame = await page.waitForFrame((f) => f.url().includes("/onepage-preview"))
    await frame.waitForFunction(() => [...document.querySelectorAll("[data-cover-image] img")].some((i) => i.getClientRects().length && i.naturalWidth > 0))
    const previewSel = await frame.evaluate(() => {
      const all = [...document.querySelectorAll("[data-cover-image] img")]
      const i = all.findIndex((e) => e.getClientRects().length)
      all[i].setAttribute("data-probe-visible", "")
      return "[data-cover-image] img[data-probe-visible]"
    })
    const preview = await visibleWindow(frame, previewSel, null)
    await context.close()
    const live = await openLive(width, theme)
    const liveSel = await live.page.evaluate(() => {
      const i = [...document.querySelectorAll("[data-cover-image] img")].find((e) => e.getClientRects().length)
      i.setAttribute("data-probe-visible", "")
      return "[data-cover-image] img[data-probe-visible]"
    })
    const pub = await visibleWindow(live.page, liveSel, null)
    await live.context.close()
    const diff = (a, b) => Math.max(...["x0", "x1", "y0", "y1"].map((k) => Math.abs(a[k] - b[k])))
    const fmt = (w) => `[${w.x0.toFixed(3)}..${w.x1.toFixed(3)}] x [${w.y0.toFixed(3)}..${w.y1.toFixed(3)}] at ${w.aspect.toFixed(2)}:1`
    note(`${width}px ${layout} crop ${JSON.stringify(crop)}: editor ${fmt(editor)}, preview ${fmt(preview)}, public ${fmt(pub)}; editor vs public ${diff(editor, pub).toFixed(4)}, preview vs public ${diff(preview, pub).toFixed(4)}`)
    assert.ok(diff(editor, pub) <= 0.01, `${width} ${layout}: the editor's frame shows the public crop`)
    assert.ok(diff(preview, pub) <= 0.01, `${width} ${layout}: the preview shows the public crop`)
    assert.ok(Math.abs(editor.aspect - pub.aspect) < 0.02, `${width} ${layout}: the editor's frame has the page's shape`)
  }
  console.log(`\nok: ${results.length} measurements`)
  if (shots) writeFileSync(`${shots}/cover-header.txt`, results.join("\n") + "\n")
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
