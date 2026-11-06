/**
 * ===========================================================================
 *  ROUND 53, MEASURED: THE PRODUCT SHEET'S GALLERY, ARROWS, QUESTIONS, VIDEO
 * ===========================================================================
 * scripts/render-product-sheet-r53.tsx in headless Chromium at 390 (a phone, touch, 3x) and 1280, in a light and a
 * dark theme. Every frame is sampled with requestAnimationFrame while something moves:
 *
 *   OPEN       from the tap until the sheet rests: the dots' count and place never change, the picture shown is
 *              drawn in every frame (no blank frame), its <img> is never swapped for a new one, the box never
 *              changes height. Also with the product read slowly (`delay`) and a block picture of its own (`thumb`).
 *   SWIPE      a real touch scroll gesture (CDP): the dot follows the scroll in every frame (its place is the
 *              scroll's place, within a dot), and never goes back.
 *   JUMP       a thumbnail four along: the dot only moves forward, never back to where it started.
 *   RATIO      the box follows the active media ratio on phones and computers.
 *   ARROWS     on a computer: drawn, their chevron against their disc at 4.5:1 or more and the disc against the
 *              picture's edge visible, in both themes.
 *   QUESTIONS  every line between and around them is the same colour and the same width.
 *   VIDEO      a product with a video: the slide is a <video> (not a broken <img>), muted, inline, looping, with its
 *              stored first frame as the poster and the box the same size as a picture's; it plays when shown and
 *              pauses when swiped away; its play button pauses it; a tap opens it full screen with arrows and a
 *              close; swipe and the arrows step across pictures and the video alike.
 *
 *   node scripts/check-product-sheet-r53.mjs
 *   SHOTS=/some/dir   (default: the system temp folder, product-sheet-r53-shots)
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import os from "node:os"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || join(os.tmpdir(), "product-sheet-r53-shots")
const MEDIA = process.env.MEDIA || join(os.tmpdir(), "product-sheet-r53-media")
mkdirSync(SHOTS, { recursive: true })
mkdirSync(MEDIA, { recursive: true })
/* A four-second clip and its first frame, named the way an upload stores them (lib/media/video.ts). */
const clip = join(MEDIA, "clip-1700000000-abc-4s.webm")
if (!existsSync(clip)) {
  const { execFileSync } = await import("node:child_process")
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x800:rate=30:duration=4", "-c:v", "libvpx-vp9", "-b:v", "600k", "-an", clip])
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", clip, "-frames:v", "1", clip.replace(/\.webm$/, ".poster.jpg")])
  } catch {
    fail("This probe makes its clip with ffmpeg, which is not installed. Set MEDIA to a folder holding clip-1700000000-abc-4s.webm and its .poster.jpg.")
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
let failed = 0
const expect = (ok, name, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-product-sheet-r53.tsx", statics: { "/__media/": MEDIA }, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--autoplay-policy=no-user-gesture-required"] })
const VIEWS = {
  390: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  1280: { width: 1280, height: 860, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}

/* In the page: one sample of the gallery, and a recorder that takes one every frame. */
const KIT = () => {
  const R = () => document.querySelector(`[data-product-sheet="${window.__id}"]`)
  window.__sample = () => {
    const r = R()
    const gal = r?.querySelector("[data-product-sheet-gallery]")
    const strip = gal?.querySelector("[data-product-sheet-strip]") || gal?.querySelector(".snap-x")
    const dotsRow = gal?.querySelector("[data-product-sheet-dots] > div")
    const spans = dotsRow ? [...dotsRow.querySelectorAll(":scope > span:not([data-product-sheet-dot-on])")] : []
    /* Where the dot that is lit stands, as a slide index: the moving one's centre, or the widest of the old ones. */
    let dot = null
    const on = dotsRow?.querySelector("[data-product-sheet-dot-on]")
    if (on && spans.length) {
      const c = on.getBoundingClientRect()
      const first = spans[0].getBoundingClientRect()
      const step = spans.length > 1 ? spans[1].getBoundingClientRect().left - first.left : 1
      dot = (c.left + c.width / 2 - (first.left + first.width / 2)) / step
    } else if (spans.length) {
      const ws = spans.map((s) => s.getBoundingClientRect().width)
      dot = ws.indexOf(Math.max(...ws))
    }
    const w = strip ? Math.max(1, strip.clientWidth) : 1
    const pos = strip ? strip.scrollLeft / w : null
    const slides = strip ? [...strip.children] : []
    const shown = slides[Math.round(pos ?? 0)]
    const media = shown?.matches?.("img,video") ? shown : shown?.querySelector?.("img,video")
    let drawn = false
    if (media?.tagName === "IMG") drawn = media.complete && media.naturalWidth > 0
    else if (media?.tagName === "VIDEO") {
      const poster = shown.querySelector("img")
      drawn = media.readyState >= 2 || (!!poster && poster.complete && poster.naturalWidth > 0)
    }
    if (media && !media.__seen) media.__seen = ++window.__mediaSeq
    const box = strip ? { height: strip.offsetHeight, top: strip.getBoundingClientRect().top } : null
    const dotsBox = gal?.querySelector("[data-product-sheet-dots]")
    return { fade: dotsBox ? Math.round(Number(getComputedStyle(dotsBox).opacity) * 100) / 100 : null, t: Math.round(performance.now()), pos: pos === null ? null : Math.round(pos * 1000) / 1000, dot: dot === null ? null : Math.round(dot * 1000) / 1000, dots: spans.length, drawn, media: media?.__seen ?? null, tag: media?.tagName ?? null, h: box ? Math.round(box.height * 10) / 10 : null, top: box ? Math.round(box.top) : null }
  }
  window.__mediaSeq = 0
  window.__record = () => {
    const out = []
    let live = true
    const tick = () => {
      if (!live) return
      out.push(window.__sample())
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__stop = () => {
      live = false
      return out
    }
  }
}

async function open(w, query = "", wait = 1500) {
  const p = await browser.newPage()
  await p.setViewport(VIEWS[w])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage?${query}`, { waitUntil: "load" })
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  await p.evaluate(KIT)
  await sleep(wait)
  p.errors = errors
  return p
}
async function tapProduct(p, id) {
  await p.evaluate((id) => {
    window.__id = id
    window.__record()
    document.querySelector(`[data-product-block][data-product-tap="sheet"][data-product-id="${id}"]`)?.click() ?? [...document.querySelectorAll('[data-product-block][data-product-tap="sheet"]')][id === "p-tee" ? 0 : 1]?.click()
  }, id)
  await sleep(1400)
  return p.evaluate(() => window.__stop())
}
/* A finger on the screen: down, twenty moves a frame apart, up. */
async function swipe(p, at, dx, steps = 20) {
  await p.touchscreen.touchStart(at.x + 100, at.y)
  for (let i = 1; i <= steps; i++) {
    await p.touchscreen.touchMove(at.x + 100 + (dx * i) / steps, at.y)
    await sleep(16)
  }
  await p.touchscreen.touchEnd()
}
const record = (p) => p.evaluate(() => window.__record())
const stop = (p) => p.evaluate(() => window.__stop())
/* Frames from the first one the gallery is there in. */
const withGallery = (frames) => frames.filter((f) => f.pos !== null)
const backsteps = (frames) => {
  let back = 0
  for (let i = 1; i < frames.length; i++) if (frames[i].dot !== null && frames[i - 1].dot !== null && frames[i].dot < frames[i - 1].dot - 0.02) back++
  return back
}

/* ── OPEN, SWIPE, JUMP, RATIO, QUESTIONS ─────────────────────────────── */
for (const theme of ["default", "midnight"]) {
  for (const w of [390, 1280]) {
    /* cold: tapped at once, before the block read the product; the product then takes 600ms to arrive. */
    for (const variant of w === 390 && theme === "default" ? ["", "cold&delay=600", "cold&delay=600&thumb=1"] : [""]) {
      const cold = variant.startsWith("cold")
      console.log(`\nOpening the sheet, ${theme}, ${w}${variant ? `, ${variant}` : ""}`)
      const p = await open(w, `theme=${theme}${variant ? `&${variant}` : ""}`, cold ? 0 : 1500)
      const frames = withGallery(await tapProduct(p, "p-tee"))
      const counts = [...new Set(frames.map((f) => f.dots))]
      const dotsAt = [...new Set(frames.filter((f) => f.dots).map((f) => Math.round(f.dot ?? -1)))]
      const blank = frames.filter((f) => !f.drawn).length
      const mediaIds = [...new Set(frames.map((f) => f.media))]
      const heights = [...new Set(frames.map((f) => f.h))]
      expect(frames.length > 10, "the gallery is sampled in every frame of the opening", frames.length)
      if (cold) {
        const fades = [...new Set(frames.filter((f) => f.dots).map((f) => f.fade))]
        expect(counts.join() === "0,5" || counts.join() === "5", "the dots come once, all five, when the product arrives", counts)
        expect(fades.some((o) => o > 0 && o < 1) && fades.at(-1) === 1, "they fade in rather than pop", fades)
      } else expect(counts.length === 1 && counts[0] === 5, "the dots never change count while it opens (5 from the first frame)", counts)
      expect(dotsAt.length === 1 && dotsAt[0] === 0, "the lit dot stays on the first picture while it opens", dotsAt)
      expect(blank === 0, "no frame without the picture drawn", { blank, of: frames.length })
      expect(mediaIds.length === 1, "the first picture's element is never swapped for another", mediaIds)
      expect(heights.length === 1, "the box never changes height while it opens", heights)
      if (variant) {
        await p.close()
        continue
      }
      const ratio = await p.evaluate(() => {
        const s = document.querySelector('[data-product-sheet="p-tee"] [data-product-sheet-gallery]').firstElementChild.getBoundingClientRect()
        return Math.round((s.width / s.height) * 1000) / 1000
      })
      const natural = await p.$eval('[data-product-sheet="p-tee"] [data-product-sheet-gallery] img', img => img.naturalWidth / img.naturalHeight)
      expect(Math.abs(ratio - natural) < 0.01, "the gallery matches the media ratio without letterboxing or cropping", {ratio,natural})
      if (theme === "default") await p.screenshot({ path: join(SHOTS, `open-${theme}-${w}.png`) })

      /* A swipe on a phone with a real touch gesture; the next arrow on a computer. */
      const at = await p.evaluate(() => {
        const s = document.querySelector('[data-product-sheet="p-tee"] [data-product-sheet-gallery]').firstElementChild.getBoundingClientRect()
        return { x: Math.round(s.left + s.width / 2), y: Math.round(s.top + s.height / 2) }
      })
      await record(p)
      if (w === 390) {
        await swipe(p, at, -220)
      } else {
        await p.click('[data-product-sheet="p-tee"] [data-product-sheet-next]')
      }
      await sleep(900)
      const moved = (await stop(p)).filter((f) => f.pos !== null)
      const lag = Math.max(...moved.map((f) => Math.abs((f.dot ?? 0) - f.pos)))
      const end = moved.at(-1)
      expect(end && Math.round(end.pos) === 1 && Math.round(end.dot) === 1, w === 390 ? "a swipe lands on the second picture, its dot with it" : "Next lands on the second picture, its dot with it", end)
      expect(backsteps(moved) === 0, "the dot never steps back on the way", { back: backsteps(moved), dots: moved.map((f) => f.dot) })
      expect(lag <= 0.1, "in every frame the dot is where the scroll is (within a tenth of a dot)", { lag: Math.round(lag * 100) / 100 })
      expect(moved.every((f) => f.drawn), "no blank frame while it moves", moved.filter((f) => !f.drawn).length)

      /* The fifth thumbnail from the second picture. */
      await record(p)
      await p.evaluate(() => document.querySelectorAll('[data-product-sheet="p-tee"] [data-product-sheet-thumbs] button')[4].click())
      await sleep(1000)
      const jump = (await stop(p)).filter((f) => f.pos !== null)
      expect(Math.round(jump.at(-1).dot) === 4 && backsteps(jump) === 0, "a thumbnail four along: the dot goes forward only, to the fifth", { back: backsteps(jump), dots: [...new Set(jump.map((f) => Math.round(f.dot * 10) / 10))] })

      /* The arrows on a computer: the chevron on its disc, the disc on the picture. */
      if (w === 1280) {
        await p.evaluate(() => document.querySelectorAll('[data-product-sheet="p-tee"] [data-product-sheet-thumbs] button')[1].click())
        await sleep(700)
        const a = await p.evaluate(() => {
          const btn = document.querySelector('[data-product-sheet="p-tee"] [data-product-sheet-next]')
          const cs = getComputedStyle(btn)
          const r = btn.getBoundingClientRect()
          /* Any CSS colour (oklab, color-mix) as sRGB with its alpha, through a canvas. */
          const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
          const rgba = (css) => {
            c.clearRect(0, 0, 1, 1)
            c.fillStyle = css
            c.fillRect(0, 0, 1, 1)
            const d = c.getImageData(0, 0, 1, 1).data
            return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${Math.round((d[3] / 255) * 100) / 100})`
          }
          return { bg: rgba(cs.backgroundColor), ink: rgba(getComputedStyle(btn.querySelector("svg")).color), opacity: cs.opacity, w: Math.round(r.width), visible: r.width > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0.5 }
        })
        const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number)
        const lum = ([r, g, b]) => {
          const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        }
        /* The disc may be translucent: laid over white (a white photo's edge) for the worst case. */
        const over = (fg, bg = [255, 255, 255]) => (fg.length > 3 ? fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])) : fg)
        const disc = over(rgb(a.bg))
        const ink = rgb(a.ink)
        const cr = (x, y) => {
          const [l1, l2] = [lum(x), lum(y)].sort((m, n) => n - m)
          return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100
        }
        const contrast = cr(over(ink, disc), disc)
        expect(a.visible && contrast >= 4.5, `the arrows are drawn and their chevron reads on the disc (${theme})`, { ...a, contrast })
        console.log(`        arrow contrast, ${theme}: chevron on disc ${contrast}:1`)
        await p.screenshot({ path: join(SHOTS, `arrows-${theme}-${w}.png`), clip: await p.evaluate(() => { const r = document.querySelector('[data-product-sheet="p-tee"] [data-product-sheet-gallery]').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } }) })
      }

      /* The questions: every line the same. */
      const lines = await p.evaluate(() => {
        const q = document.querySelector('[data-product-sheet="p-tee"] [data-product-questions]')
        q?.scrollIntoView({ block: "center" })
        const out = []
        for (const el of q ? [q, ...q.querySelectorAll("*")] : []) {
          const cs = getComputedStyle(el)
          for (const side of ["Top", "Bottom"]) {
            const wd = parseFloat(cs[`border${side}Width`])
            if (wd > 0 && cs[`border${side}Style`] !== "none") out.push({ side, w: wd, c: cs[`border${side}Color`] })
          }
        }
        return out
      })
      await sleep(300)
      if (theme === "default" || w === 390) await p.screenshot({ path: join(SHOTS, `questions-${theme}-${w}.png`) })
      expect(lines.length === 5 && new Set(lines.map((l) => `${l.w}|${l.c}`)).size === 1, "the five lines of four questions are one width and one colour", lines)
      expect(p.errors.length === 0, "no errors", p.errors)
      await p.close()
    }
  }
}

/* ── VIDEO ───────────────────────────────────────────────────────────── */
for (const theme of ["default", "midnight"]) {
  for (const w of [390, 1280]) {
    console.log(`\nA product with a video, ${theme}, ${w}`)
    const p = await open(w, `theme=${theme}`)
    await tapProduct(p, "p-clip")
    const v0 = await p.evaluate(() => {
      const r = document.querySelector('[data-product-sheet="p-clip"]')
      const slides = [...(r.querySelector("[data-product-sheet-strip]") || r.querySelector(".snap-x")).children]
      const s = slides[1]
      const v = s.matches("video") ? s : s.querySelector("video")
      const img = s.matches("img") ? s : null
      const a = slides[0].getBoundingClientRect()
      const b = s.getBoundingClientRect()
      return {
        tag: v ? "VIDEO" : img ? "IMG" : s.tagName,
        brokenImg: img ? img.naturalWidth === 0 : null,
        muted: v?.muted ?? null,
        inline: v?.playsInline ?? null,
        loop: v?.loop ?? null,
        poster: v ? (v.getAttribute("poster") || s.querySelector("img")?.getAttribute("src") || "") : null,
        sameBox: Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height),
        paused: v?.paused ?? null,
        thumb: !!r.querySelectorAll("[data-product-sheet-thumbs] button")[1]?.querySelector("[data-product-sheet-thumb-video]"),
      }
    })
    expect(v0.tag === "VIDEO", "the video is a <video>, not a broken picture", v0)
    expect(v0.muted && v0.inline && v0.loop, "muted, inline and looping, so a phone plays it where it is", v0)
    expect(/\.poster\.jpg$/.test(v0.poster || ""), "its stored first frame is the poster", v0.poster)
    expect(v0.sameBox, "its box is a picture's box")
    expect(v0.paused === true, "it waits while it is not the one shown", v0.paused)
    expect(v0.thumb, "its thumbnail says it is a video")

    /* To the video: swipe on a phone, the arrow on a computer. */
    await record(p)
    if (w === 390) {
      const at = await p.evaluate(() => { const s = document.querySelector('[data-product-sheet="p-clip"] [data-product-sheet-gallery]').firstElementChild.getBoundingClientRect(); return { x: Math.round(s.left + s.width / 2), y: Math.round(s.top + s.height / 2) } })
      await swipe(p, at, -220)
    } else {
      await p.click('[data-product-sheet="p-clip"] [data-product-sheet-next]')
    }
    await sleep(1500)
    const toVideo = (await stop(p)).filter((f) => f.pos !== null)
    const play = await p.evaluate(() => {
      const v = document.querySelector('[data-product-sheet="p-clip"] video')
      return v ? { paused: v.paused, time: Math.round(v.currentTime * 100) / 100, ready: v.readyState } : { paused: true, time: 0, ready: null }
    })
    expect(Math.round(toVideo.at(-1).pos) === 1 && !play.paused && play.time > 0, w === 390 ? "a swipe goes to the video and it plays" : "Next goes to the video and it plays", { end: toVideo.at(-1), play })
    expect(toVideo.every((f) => f.drawn), "every frame on the way has its picture or the video's first frame drawn", toVideo.filter((f) => !f.drawn).length)
    const sizes = [...new Set(toVideo.map((f) => f.h))]
    expect(sizes.length === 1, "nothing changes size on the way", sizes)
    if (theme === "default") await p.screenshot({ path: join(SHOTS, `video-${theme}-${w}.png`) })

    /* Its own button pauses it, and plays it again. */
    await p.evaluate(() => document.querySelector('[data-product-sheet="p-clip"] [data-product-sheet-play]')?.click())
    await sleep(250)
    const paused = await p.evaluate(() => document.querySelector('[data-product-sheet="p-clip"] video')?.paused === true)
    await p.evaluate(() => document.querySelector('[data-product-sheet="p-clip"] [data-product-sheet-play]')?.click())
    await sleep(400)
    const again = await p.evaluate(() => document.querySelector('[data-product-sheet="p-clip"] video')?.paused === false)
    expect(paused && again, "its button pauses it and plays it again", { paused, again })

    /* Full screen on a tap, stepping across the video and the pictures, and closed. */
    await p.evaluate(() => document.querySelector('[data-product-sheet="p-clip"] [data-product-sheet-slide="video"] [data-product-sheet-expand]')?.click())
    await sleep(700)
    const lb = await p.evaluate(() => {
      const box = document.querySelector("[data-product-sheet-lightbox]")
      const r = box?.getBoundingClientRect()
      return { open: !!box, w: box?.offsetWidth ?? 0, h: box?.offsetHeight ?? 0, video: !!box?.querySelector("video"), next: !!box?.querySelector("[data-lightbox-next]"), close: !!box?.querySelector("[data-lightbox-close]"), count: box?.querySelector("[data-lightbox-count]")?.textContent ?? null }
    })
    expect(lb.open && lb.w === VIEWS[w].width && lb.video && lb.close && lb.next && lb.count === "2 / 3", "a tap opens it full screen on the video, with a count, arrows and a close", lb)
    /* Its ground is over everything, the sheet's own window included: beside the video, the screen is near black. */
    const spots = w === 390 ? [[10, 120], [380, 110]] : [[1100, 300], [200, 300]]
    const shot = await p.screenshot({ encoding: "base64" })
    const grounds = await p.evaluate(async (b64, spots, dpr) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      return spots.map(([x, y]) => {
        const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
        return Math.max(d[0], d[1], d[2])
      })
    }, shot, spots, VIEWS[w].deviceScaleFactor)
    expect(grounds.every((v) => v <= 30), "its ground is over the sheet's window, not under it (the brightest channel beside the video)", grounds)
    if (theme === "default" || w === 390) await p.screenshot({ path: join(SHOTS, `lightbox-${theme}-${w}.png`) })
    await p.evaluate(() => document.querySelector("[data-product-sheet-lightbox] [data-lightbox-next]")?.click())
    await sleep(600)
    const lb2 = await p.evaluate(() => document.querySelector("[data-product-sheet-lightbox] [data-lightbox-count]")?.textContent)
    expect(lb2 === "3 / 3", "its arrow steps on to the next picture", lb2)
    await p.evaluate(() => document.querySelector("[data-product-sheet-lightbox] [data-lightbox-close]")?.click())
    await sleep(600)
    const after = await p.evaluate(() => {
      const s = document.querySelector('[data-product-sheet="p-clip"] [data-product-sheet-strip]')
      return { lightbox: !!document.querySelector("[data-product-sheet-lightbox]"), at: s ? Math.round(s.scrollLeft / s.clientWidth) : null, sheet: !!document.querySelector('[data-product-sheet="p-clip"]') }
    })
    expect(!after.lightbox && after.sheet && after.at === 2, "closed, the sheet is still up on the picture it was left on", after)
    expect(p.errors.length === 0, "no errors", p.errors)
    await p.close()
  }
}

await browser.close()
server.close()
console.log(`\n${passed} passed, ${failed} failed. Pictures in ${SHOTS}`)
process.exit(failed ? 1 : 0)
