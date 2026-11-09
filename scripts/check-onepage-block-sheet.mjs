/**
 * THE BLOCK SHEET, MEASURED (round AL).
 *
 * The real BlockSheetProvider and the real blocks that open it
 * (scripts/render-onepage-block-sheet.tsx), on a phone (390x844) and a
 * computer (1440x900), on a page scrolled part way down. For each:
 *
 *   motion     the sheet's own animations, read off the element
 *              (getAnimations: keyframes and duration), and the frames as
 *              they are drawn (translate, scale and opacity sampled every
 *              frame from the click): where it starts, where it rests, how
 *              long it takes; the same for Close
 *   shape      a phone: from the foot of the screen, 8px in at the sides,
 *              a strip of the page above it, top corners rounded; a
 *              computer: centred, 520px wide for an embed
 *   the page   scrollY and the page's width before, while open (after
 *              wheels over the dimmed page and over the sheet, PageDown,
 *              Space and End) and after: unchanged
 *   focus      inside the sheet after 12 Tabs and 12 Shift+Tabs, and back
 *              on the button that opened it after Close
 *   ways out   Close, Escape, the dimmed page and the browser's Back each
 *              close it; Back leaves the page's own entry where it was
 *   reduced    prefers-reduced-motion: opacity only, 150ms, nothing moves
 *   blocks     a video, a map, an Instagram post and a contact form set to
 *              "In a sheet" open in it; "Go to the link" is a link; a block
 *              saved before the choice is drawn on the page as it was
 *   Instagram  a tall post in place folds to its account line and picture,
 *              "View full post" sits inside the post's own box at its foot,
 *              and opens it to exactly the height Instagram said; a short
 *              post in a narrow column (a group's) is whole with no button;
 *              in a sheet the post is whole with no button
 *
 *   fold (round AN) on a light and a dark page, 390 and 1440, in place and
 *              in a group's column: the foot is masked (no paint of ours),
 *              the pixels 2px above the box's foot are the page's own
 *              colour, the fade is no taller than 64px, and "View full
 *              post" is the page's button colour, 32px tall
 *   swipe      (round AN) on a phone with touch: the sheet follows the
 *              finger, a short slow drag springs back, a long drag or a
 *              quick flick closes it, and a drag inside a body scrolled
 *              away from its top scrolls it instead of moving the sheet
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/check-onepage-block-sheet.mjs
 *   REPORT=1 prints the numbers without failing.
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-block-sheet.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

/* What Instagram says its posts' heights are, by the post's id. */
const HEIGHTS = { ABC123: 1100, TALL01: 1100, TALL02: 1100, SHORT1: 420 }
const fixture = (h) =>
  `<!doctype html><style>html,body{margin:0;background:#fff;font:14px sans-serif}div{height:${h}px;background:linear-gradient(#fafafa,#e9e9e9)}</style><div>Instagram fixture ${h}</div><script>parent.postMessage(JSON.stringify({type:"MEASURE",details:{height:${h}}}),"*")</script>`

async function open(page, { width, height, reduced = false }) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "www.instagram.com") {
      const id = u.pathname.split("/")[2]
      return void r.respond({ status: 200, contentType: "text/html", body: fixture(HEIGHTS[id] ?? 700) })
    }
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#fff'></body>" })
    void r.continue()
  })
  await page.goto(base + "/app/onepage", { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-probe-calendly]")
  await sleep(400)
}

/* Every frame from now until the sheet rests (or leaves): the panel's translate, scale and opacity. */
const SAMPLE = (ms) => `new Promise((done) => {
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const el = document.querySelector("[data-block-sheet-panel]")
    const t = performance.now() - t0
    if (el) {
      const cs = getComputedStyle(el)
      const y = cs.translate === "none" ? 0 : parseFloat(cs.translate.split(" ")[1] || "0")
      out.push({ t: Math.round(t), y: Math.round(y * 10) / 10, scale: cs.scale === "none" ? 1 : Math.round(parseFloat(cs.scale) * 1000) / 1000, opacity: Math.round(parseFloat(cs.opacity) * 1000) / 1000, h: Math.round(el.getBoundingClientRect().height) })
    } else out.push({ t: Math.round(t), gone: true })
    if (t < ${ms}) requestAnimationFrame(tick)
    else done(out)
  }
  requestAnimationFrame(tick)
})`

const ANIMS = `(() => {
  const el = document.querySelector("[data-block-sheet-panel]")
  const bd = document.querySelector("[data-block-sheet-backdrop]")
  if (!el) return null
  const read = (a) => ({ duration: a.effect.getComputedTiming().duration, easing: a.effect.getTiming().easing, frames: a.effect.getKeyframes().map((k) => ({ translate: k.translate, scale: k.scale, opacity: k.opacity })) })
  return { panel: el.getAnimations().map(read), backdrop: bd ? bd.getAnimations().map(read) : [] }
})()`

/* Pressed where it is, without scrolling the page to it first (as page.click would), with focus on it as a tap leaves it. */
const press = (page, sel) => page.$eval(sel, (el) => { el.focus({ preventScroll: true }); el.click() })

const STATE = `(() => ({ y: Math.round(scrollY), w: document.documentElement.clientWidth, open: !!document.querySelector("[data-block-sheet]"), active: document.activeElement?.closest?.("[data-block-sheet-panel]") ? "sheet" : (document.activeElement?.getAttribute("data-probe-calendly") !== null ? "trigger" : document.activeElement?.tagName) }))()`

/** The first frame drawn and the first at rest, from a run of samples. */
function summary(frames) {
  const shown = frames.filter((f) => !f.gone)
  const first = shown[0]
  const rest = shown.find((f) => near(f.y, 0, 0.5) && near(f.scale, 1, 0.002) && near(f.opacity, 1, 0.01))
  return { first, restAt: rest?.t ?? null, frames: shown.length }
}

try {
  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["computer", { width: 1440, height: 900 }]]) {
    console.log(`\n── ${label} ${viewport.width}x${viewport.height}`)
    const page = await browser.newPage()
    await open(page, viewport)
    await page.evaluate(() => window.scrollTo(0, 600))
    await sleep(100)
    const before = await page.evaluate(STATE)
    const historyBefore = await page.evaluate(() => history.length)

    /* ── Open: the animations as declared, and as drawn. ── */
    const sampling = page.evaluate(SAMPLE(420))
    await press(page, "[data-probe-calendly]")
    const anims = await page.evaluate(ANIMS)
    const openFrames = await sampling
    const o = summary(openFrames)
    const move = anims?.panel.find((a) => a.frames.some((k) => k.translate))
    const fade = anims?.panel.find((a) => a.frames.some((k) => k.opacity !== undefined && !k.translate))
    console.log("   open animations", JSON.stringify(anims))
    console.log("   open frames", JSON.stringify(openFrames.slice(0, 8)), `... rest at ${o.restAt}ms over ${o.frames} frames`)
    check(move && move.duration === 300, `${label}: the rise is 300ms (${move?.duration})`)
    /* Changed on purpose (round AP): 12% of the sheet's height in pixels as it opens, so content arriving during the rise no longer pushes it down. */
    const startPx = await page.evaluate(() => Math.round(document.querySelector("[data-block-sheet-panel]").offsetHeight * 0.12))
    check(move && move.frames[0].translate === `0px ${startPx}px` && move.frames[0].scale === "0.92", `${label}: it starts 12% lower (${startPx}px) at 0.92 (${JSON.stringify(move?.frames[0])})`)
    check(move && /^0(px)?( 0(px)?)?$/.test(move.frames.at(-1).translate) && move.frames.at(-1).scale === "1", `${label}: it ends at rest (${JSON.stringify(move?.frames.at(-1))})`)
    check(fade && fade.frames[0].opacity === "0" && fade.frames.at(-1).opacity === "1", `${label}: it fades in from 0`)
    check(o.first && o.first.opacity < 0.6 && o.first.scale < 0.99, `${label}: the first frame drawn is not the sheet at rest (${JSON.stringify(o.first)})`)
    check(o.restAt !== null && o.restAt >= 200 && o.restAt <= 420, `${label}: at rest after ${o.restAt}ms`)
    check(anims?.backdrop.length === 1 && anims.backdrop[0].frames[0].opacity === "0", `${label}: the page behind dims as it rises`)

    /* ── Shape. ── */
    const shape = await page.evaluate(() => {
      const r = document.querySelector("[data-block-sheet-panel]").getBoundingClientRect()
      const cs = getComputedStyle(document.querySelector("[data-block-sheet-panel]"))
      const title = document.querySelector("[data-block-sheet-title]")
      const foot = document.querySelector("[data-block-sheet-foot]")
      const cta = document.querySelector("[data-block-sheet-cta]").getBoundingClientRect()
      const share = document.querySelector("[data-block-sheet-share]").getBoundingClientRect()
      const close = document.querySelector("[data-block-sheet-close]").getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: innerHeight - r.bottom, right: innerWidth - r.right, tl: cs.borderTopLeftRadius, bl: cs.borderBottomLeftRadius, titleAlign: getComputedStyle(title).textAlign, titleText: title.textContent, footBottom: Math.round(r.bottom - foot.getBoundingClientRect().bottom), ctaLeft: Math.round(cta.x - r.x), shareRight: Math.round(r.right - share.right), closeRight: Math.round(r.right - close.right), ctaH: cta.height, closeW: close.width }
    })
    console.log("   shape", JSON.stringify(shape))
    if (label === "phone") {
      check(near(shape.x, 8, 1) && near(shape.right, 8, 1) && near(shape.bottom, 0, 1), `phone: from the foot of the screen, 8px in at the sides (x ${shape.x}, right ${shape.right}, bottom ${shape.bottom})`)
      /* Changed on purpose (round AN): AN2's keyboard-safe height also stops 24px under the visual viewport's top (--vv-h, 100dvh where it is not set), so the strip is 16 to 24px. */
      check(shape.y >= 14 && shape.y <= 26, `phone: a strip of the page above it (${shape.y}px)`)
      check(shape.tl === "24px" && shape.bl === "0px", `phone: top corners rounded, foot square (${shape.tl} / ${shape.bl})`)
    } else {
      check(near(shape.x, shape.right, 1) && near(shape.y, shape.bottom, 1) && shape.w === 520, `computer: centred, 520px wide (x ${shape.x}, right ${shape.right}, top ${shape.y}, bottom ${shape.bottom}, w ${shape.w})`)
      check(shape.tl === "24px" && shape.bl === "24px", "computer: all four corners rounded")
    }
    check(shape.titleAlign === "center" && shape.titleText === "Calendly", "the title is centred")
    check(shape.ctaLeft >= 12 && shape.ctaLeft <= 20 && shape.closeRight >= 12 && shape.closeRight <= 20 && shape.shareRight > shape.closeRight, `foot bar: the button on the left, Share then Close on the right (${shape.ctaLeft} / ${shape.shareRight} / ${shape.closeRight})`)

    /* ── The page behind does not move. ── */
    await page.mouse.move(viewport.width / 2, 8)
    for (let i = 0; i < 5; i++) await page.mouse.wheel({ deltaY: 400 })
    await page.mouse.move(viewport.width / 2, shape.y + 20)
    for (let i = 0; i < 5; i++) await page.mouse.wheel({ deltaY: -400 })
    for (const key of ["PageDown", "Space", "End", "ArrowDown"]) await page.keyboard.press(key)
    await sleep(250)
    const during = await page.evaluate(STATE)
    check(during.y === before.y && during.w === before.w, `the page behind stays at scrollY ${before.y}, width ${before.w} (now ${during.y}, ${during.w})`)

    /* ── Focus. ── */
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab")
    const afterTabs = await page.evaluate(STATE)
    await page.keyboard.down("Shift")
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab")
    await page.keyboard.up("Shift")
    const afterShiftTabs = await page.evaluate(STATE)
    check(afterTabs.active === "sheet" && afterShiftTabs.active === "sheet", `focus stays inside (${afterTabs.active}, ${afterShiftTabs.active})`)
    check((await page.evaluate(() => history.length)) === historyBefore + 1, "the sheet stands on a history entry of its own")

    /* ── Close: the animation as declared and as drawn. ── */
    const closing = page.evaluate(SAMPLE(380))
    await page.click("[data-block-sheet-close]")
    const closeAnims = await page.evaluate(ANIMS)
    const closeFrames = await closing
    const shown = closeFrames.filter((f) => !f.gone)
    const goneAt = closeFrames.find((f) => f.gone)?.t ?? null
    const out = closeAnims?.panel[0]
    console.log("   close animations", JSON.stringify(closeAnims))
    console.log("   close frames", JSON.stringify(shown.slice(-4)), `gone at ${goneAt}ms`)
    check(out && out.duration === 250, `${label}: Close takes 250ms (${out?.duration})`)
    /* Changed on purpose (round AP): 10% of the sheet's height, in pixels. */
    const endPx = Math.round(shape.h * 0.1)
    check(out && out.frames.at(-1).translate === `0px ${endPx}px` && out.frames.at(-1).scale === "0.94" && out.frames.at(-1).opacity === "0", `${label}: it leaves down 10%, at 0.94, clear (${JSON.stringify(out?.frames.at(-1))})`)
    const mid = shown.find((f) => f.t > 90 && f.t < 200)
    check(mid && mid.y > 0 && mid.scale < 1 && mid.opacity < 1, `${label}: mid-close it is lower, smaller and fading (${JSON.stringify(mid)})`)
    check(goneAt !== null && goneAt >= 220 && goneAt <= 380, `${label}: gone after ${goneAt}ms`)
    await sleep(600)
    const after = await page.evaluate(STATE)
    check(!after.open && after.y === before.y && after.active === "trigger", `after Close: gone, scrollY ${after.y}, focus on the button (${after.active})`)
    check((await page.evaluate(() => history.length)) === historyBefore + 1 && (await page.evaluate(() => !history.state?.onepageBlockSheet)), "Close stepped back off the sheet's entry")

    /* ── Escape, the dimmed page, Back. ── */
    for (const [how, act] of [
      ["Escape", () => page.keyboard.press("Escape")],
      ["the dimmed page", () => page.mouse.click(viewport.width / 2, 6)],
      ["Back", () => page.evaluate(() => history.back())],
    ]) {
      await press(page, "[data-probe-calendly]")
      await sleep(380)
      await act()
      await sleep(700)
      const s = await page.evaluate(STATE)
      check(!s.open && s.y === before.y, `${how} closes it (open ${s.open}, scrollY ${s.y})`)
    }
    check(await page.evaluate(() => location.pathname === "/app/onepage"), "still on the page after Back")

    /* ── The blocks. ── */
    for (const probe of ["video", "map", "post", "contact"]) {
      const tag = await page.$eval(`[data-probe="${probe}"] [data-block-sheet-trigger]`, (el) => el.tagName)
      await page.click(`[data-probe="${probe}"] [data-block-sheet-trigger]`)
      await sleep(450)
      const inside = await page.evaluate(() => {
        const body = document.querySelector("[data-block-sheet-body]")
        return {
          title: document.querySelector("[data-block-sheet-title]")?.textContent,
          video: !!body?.querySelector("[data-onepage-video] iframe"),
          map: !!body?.querySelector("iframe[src*='maps.google.com']"),
          post: !!body?.querySelector("[data-compact-post][data-post-whole]"),
          postButton: !!body?.querySelector("[data-post-more]"),
          postBox: Math.round(body?.querySelector("[data-post-box]")?.getBoundingClientRect().height ?? 0),
          postWidth: Math.round(body?.querySelector("[data-post-box]")?.getBoundingClientRect().width ?? 0),
          contact: !!body?.querySelector("[data-onepage-contact] form"),
          cta: document.querySelector("[data-block-sheet-cta]")?.textContent ?? null,
        }
      })
      console.log(`   ${probe}`, JSON.stringify(inside))
      const ok = probe === "video" ? inside.video : probe === "map" ? inside.map : probe === "contact" ? inside.contact : inside.post && !inside.postButton && near(inside.postBox, Math.round(1100 * (inside.postWidth / Math.max(326, Math.min(540, inside.postWidth)))), 2)
      check(tag === "BUTTON" && ok, `${probe}: "In a sheet" opens it there (${tag})`)
      await page.keyboard.press("Escape")
      await sleep(500)
    }
    check(await page.$eval('[data-probe="direct"] [data-block-sheet-trigger]', (el) => el.tagName === "A" && el.getAttribute("href").includes("youtube.com") && el.target === "_blank"), '"Go to the link" is a link to the service')
    check(await page.$eval('[data-probe="inline-old"]', (el) => !!el.querySelector("[data-onepage-video]") && !el.querySelector("[data-block-sheet-trigger]")), "a block saved before the choice is drawn on the page as it was")

    /* ── Instagram in place. ── */
    await page.waitForFunction(() => document.querySelector('[data-probe="inline-post"] [data-post-more]'), { timeout: 5000 }).catch(() => {})
    const ig = await page.evaluate(() => {
      const read = (sel) => {
        const root = document.querySelector(sel)
        const box = root.querySelector("[data-post-box]").getBoundingClientRect()
        const more = root.querySelector("[data-post-more]")?.getBoundingClientRect()
        const frame = root.querySelector("iframe").getBoundingClientRect()
        return { w: Math.round(box.width), h: Math.round(box.height), frameW: Math.round(frame.width), more: more ? { bottomGap: Math.round(box.bottom - more.bottom), centre: Math.round(more.x + more.width / 2 - (box.x + box.width / 2)), inside: more.top >= box.top && more.bottom <= box.bottom } : null }
      }
      return { tall: read('[data-probe="inline-post"]'), group: read('[data-probe="group-post"]') }
    })
    const unit = (w) => Math.max(326, Math.min(540, w))
    const scaleOf = (w) => w / unit(w)
    const foldH = (w) => Math.ceil((60 + unit(w) * 1.25) * scaleOf(w))
    console.log("   instagram", JSON.stringify(ig), "fold", foldH(ig.tall.w))
    check(ig.tall.frameW === ig.tall.w, `the post fills its column (${ig.tall.frameW} of ${ig.tall.w})`)
    check(near(ig.tall.h, foldH(ig.tall.w), 2), `a tall post folds to its account line and picture: ${ig.tall.h}px (expected ${foldH(ig.tall.w)})`)
    check(ig.tall.more && ig.tall.more.inside && ig.tall.more.bottomGap >= 8 && ig.tall.more.bottomGap <= 16 && Math.abs(ig.tall.more.centre) <= 1, `"View full post" sits inside the post's foot, centred (${JSON.stringify(ig.tall.more)})`)
    check(!ig.group.more && near(ig.group.h, Math.ceil(420 * scaleOf(ig.group.w)), 2), `a short post in a group's column is whole, no button (${ig.group.h}px at ${ig.group.w} wide)`)
    await page.click('[data-probe="inline-post"] [data-post-more]')
    await sleep(500)
    const opened = await page.evaluate(() => {
      const root = document.querySelector('[data-probe="inline-post"]')
      return { h: Math.round(root.querySelector("[data-post-box]").getBoundingClientRect().height), less: !!root.querySelector("[data-post-less]"), more: !!root.querySelector("[data-post-more]") }
    })
    check(near(opened.h, Math.ceil(1100 * scaleOf(ig.tall.w)), 2) && opened.less && !opened.more, `View full post opens it to the height Instagram said: ${opened.h}px (expected ${Math.ceil(1100 * scaleOf(ig.tall.w))})`)
    await page.close()

    /* ── Reduced motion. ── */
    const still = await browser.newPage()
    await open(still, { ...viewport, reduced: true })
    await press(still, "[data-probe-calendly]")
    const ra = await still.evaluate(ANIMS)
    console.log("   reduced", JSON.stringify(ra))
    check(ra && ra.panel.every((a) => a.duration === 150) && ra.panel.every((a) => a.frames.every((k) => !k.translate || /^0(px)?( 0(px)?)?$/.test(k.translate))) && ra.panel.every((a) => a.frames.every((k) => !k.scale || k.scale === "1")), `${label}, reduced motion: 150ms, nothing moves`)
    await still.close()
  }
  /* ── A dark page opens a dark sheet. ── */
  const darkPage = await browser.newPage()
  await darkPage.setViewport({ width: 390, height: 844 })
  await darkPage.goto(base + "/app/onepage?dark", { waitUntil: "domcontentloaded" })
  await darkPage.waitForSelector("[data-probe-calendly]")
  await press(darkPage, "[data-probe-calendly]")
  await sleep(400)
  const bg = await darkPage.$eval("[data-block-sheet-panel]", (el) => getComputedStyle(el).backgroundColor)
  check(bg === "rgb(24, 24, 28)", `a dark page opens a dark sheet (${bg})`)
  await darkPage.close()

  /* ── Round AN: the fold fades into the page, light and dark. ── */
  const shotPixel = async (page, x, y) => {
    const b64 = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 }, encoding: "base64" })
    return page.evaluate(async (b64) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = c.height = 1
      const ctx = c.getContext("2d")
      ctx.drawImage(img, 0, 0)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
    }, b64)
  }
  const sameColour = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  for (const dark of [false, true]) {
    for (const width of [390, 1440]) {
      const page = await browser.newPage()
      await open(page, { width, height: 900 })
      if (dark) {
        await page.goto(base + "/app/onepage?dark", { waitUntil: "domcontentloaded" })
        await page.waitForSelector("[data-probe-calendly]")
      }
      for (const probe of ["inline-post", "group-tall"]) {
        await page.waitForFunction((p) => document.querySelector(`[data-probe="${p}"] [data-post-more]`), { timeout: 5000 }, probe).catch(() => {})
        /* Scrolled to, then left to settle: the posts around it load as they come into view and move it. */
        await page.evaluate((p) => document.querySelector(`[data-probe="${p}"]`).scrollIntoView({ block: "center" }), probe)
        await page.waitForFunction((p) => document.querySelector(`[data-probe="${p}"] [data-post-box] iframe`)?.style.opacity === "1", { timeout: 8000 }, probe).catch(() => {})
        await sleep(1200)
        const f = await page.evaluate((p) => {
          const root = document.querySelector(`[data-probe="${p}"]`)
          const box = root.querySelector("[data-post-box]")
          const more = root.querySelector("[data-post-more]")
          const fade = root.querySelector("[data-post-fade]")
          const r = box.getBoundingClientRect()
          const cs = getComputedStyle(box)
          const mask = cs.maskImage || cs.webkitMaskImage || ""
          const stops = [...mask.matchAll(/calc\(100% - (\d+)px\)/g)].map((m) => Number(m[1]))
          return { x: r.left + scrollX + 6, bottom: r.bottom + scrollY, mid: r.top + scrollY + r.height / 2, mask: !!mask && mask !== "none", fadePx: stops.length ? Math.max(...stops) : null, painted: fade ? getComputedStyle(fade).backgroundImage : null, more: more ? { bg: getComputedStyle(more).backgroundColor, color: getComputedStyle(more).color, h: Math.round(more.getBoundingClientRect().height) } : null }
        }, probe)
        await sleep(150)
        const foot = await shotPixel(page, f.x, Math.floor(f.bottom) - 2)
        const mid = await shotPixel(page, f.x, f.mid)
        const want = dark ? [14, 14, 16] : [255, 255, 255]
        const label = `${dark ? "dark" : "light"} ${width} ${probe}`
        console.log("   fold", label, JSON.stringify({ ...f, foot, mid }))
        check(f.mask && f.painted === "none" && f.fadePx !== null && f.fadePx <= 64, `${label}: the foot is masked over ${f.fadePx}px, nothing painted over it (${f.painted})`)
        check(sameColour(foot, want, 20), `${label}: 2px above the foot it is the page's own colour (${foot} vs ${want})`)
        check(sameColour(mid, [242, 242, 242], 14), `${label}: above the fade the post is solid (${mid})`)
        const btn = dark ? "rgb(244, 244, 245)" : "rgb(26, 26, 46)"
        check(f.more && f.more.bg === btn && f.more.h === 32, `${label}: "View full post" is the page's own button, 32px (${JSON.stringify(f.more)})`)
      }
      await page.close()
    }
  }

  /* ── Round AN: swipe down to close, on a phone. ── */
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = new URL(r.url())
      if (u.hostname === "www.instagram.com") return void r.respond({ status: 200, contentType: "text/html", body: fixture(HEIGHTS[u.pathname.split("/")[2]] ?? 700) })
      if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#fff'></body>" })
      void r.continue()
    })
    await page.goto(base + "/app/onepage", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-probe-calendly]")
    await sleep(300)
    const panelY = () => page.evaluate(() => {
      const el = document.querySelector("[data-block-sheet-panel]")
      if (!el) return null
      const t = getComputedStyle(el).translate
      return t === "none" ? 0 : Math.round(parseFloat(t.split(" ")[1] || "0"))
    })
    const isOpen = () => page.evaluate(() => !!document.querySelector("[data-block-sheet-open]"))
    const titleAt = () => page.$eval("[data-block-sheet-title]", (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    const drag = async (from, dy, { steps = 12, stepMs = 16, hold = false } = {}) => {
      await page.touchscreen.touchStart(from.x, from.y)
      for (let i = 1; i <= steps; i++) {
        await page.touchscreen.touchMove(from.x, from.y + (dy * i) / steps)
        await sleep(stepMs)
      }
      const during = await panelY()
      if (!hold) await page.touchscreen.touchEnd()
      return during
    }

    /* A short slow drag: follows the finger, then springs back. */
    await press(page, "[data-probe-calendly]")
    await sleep(420)
    let at = await titleAt()
    const following = await drag(at, 90, { steps: 15, stepMs: 30, hold: true })
    await page.touchscreen.touchEnd()
    await sleep(450)
    const back = await panelY()
    check(following !== null && following >= 70 && following <= 92, `swipe: the sheet follows the finger (${following}px under a 90px drag)`)
    check((await isOpen()) && back === 0, `swipe: a short slow drag springs back (open, at ${back}px)`)

    /* A long drag: closes. */
    at = await titleAt()
    await drag(at, 320, { steps: 16, stepMs: 30 })
    await sleep(500)
    check(!(await isOpen()) && !(await page.$("[data-block-sheet]")), "swipe: a long drag closes it")

    /* A quick flick: closes. */
    await press(page, "[data-probe-calendly]")
    await sleep(420)
    at = await titleAt()
    await drag(at, 70, { steps: 4, stepMs: 8 })
    await sleep(500)
    check(!(await page.$("[data-block-sheet]")), "swipe: a quick flick closes it")

    /* Inside a body scrolled down: the finger scrolls it; the sheet does not move. */
    await page.click('[data-probe="post"] [data-block-sheet-trigger]')
    await sleep(600)
    const edge = await page.evaluate(() => {
      const body = document.querySelector("[data-block-sheet-body]")
      body.scrollTop = 240
      const r = body.getBoundingClientRect()
      return { x: r.left + 4, y: r.top + 60, top: body.scrollTop }
    })
    const inner = await drag(edge, 160, { steps: 12, stepMs: 30, hold: true })
    await page.touchscreen.touchEnd()
    await sleep(400)
    check(edge.top > 0 && (inner === 0 || inner === null) && (await isOpen()), `swipe: a drag in a body scrolled ${edge.top}px down does not move the sheet (${inner}px)`)
    await page.keyboard.press("Escape")
    await sleep(500)

    /* A field focused (on a phone, the keyboard up): a drag from the title never closes the form. */
    await page.click('[data-probe="contact"] [data-block-sheet-trigger]')
    await sleep(600)
    const field = await page.evaluate(() => {
      const f = document.querySelector("[data-block-sheet-body] input, [data-block-sheet-body] textarea")
      f?.focus()
      return !!f && document.activeElement === f
    })
    at = await titleAt()
    const typed = await drag(at, 320, { steps: 16, stepMs: 30, hold: true })
    await page.touchscreen.touchEnd()
    await sleep(500)
    check(field && (typed === 0 || typed === null) && (await isOpen()), `swipe: with a field focused the sheet stays (moved ${typed}px)`)
    await page.keyboard.press("Escape")
    await sleep(500)
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed")
if (failures.length && !report) process.exit(1)
