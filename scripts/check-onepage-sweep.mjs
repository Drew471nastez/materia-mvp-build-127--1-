/**
 * EVERY BLOCK ON THE LIVE PAGE AND IN THE EDITOR'S PREVIEW, MEASURED (round AN).
 *
 * The real public page (components/onepage/public-onepage) with one block of
 * every type and one app block per service (scripts/render-onepage-sweep.tsx),
 * on a light and a dark page, 390 and 1440 wide, as visitors see it and as
 * the editor's preview draws it. For each block:
 *
 *   renders    it is on the page with a size
 *   overflow   nothing of it is outside the window, and the page never
 *              scrolls sideways
 *   tap        its first button or link does something: opens the block
 *              sheet, goes to an address (a link, or window.open), or is a
 *              control of the block itself (a form, a poll)
 *   tracked    on the live page a tap that leaves or opens a sheet is
 *              counted once (one POST to /api/onepage/track for that
 *              block); in the editor's preview the preview's frame answers
 *              those itself, which is not drawn here
 *   console    no console error and no uncaught error, whole run
 *
 * And the Instagram post's fold (components/onepage/compact-post): folded in
 * place, in a carousel and in a group, its foot is masked into the page
 * (the pixels 2px above the box's foot are the page's colour, light or
 * dark), the fade is FOLD_FADE_PX tall, "View full post" is the page's own
 * button colour; in the sheet the post is whole with no button.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/check-onepage-sweep.mjs
 *   REPORT=1 prints the matrix without failing.
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const tracked = []
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-sweep.tsx",
  api: (req, body) => {
    if (req.url.startsWith("/api/onepage/track")) {
      try {
        tracked.push(JSON.parse(body))
      } catch {
        tracked.push({})
      }
      return { body: { ok: true } }
    }
    return null
  },
})
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

const IG = `<!doctype html><style>html,body{margin:0;background:#fff;font:14px sans-serif}div{height:1100px;background:linear-gradient(#fafafa,#e9e9e9)}</style><div>Instagram fixture</div><script>parent.postMessage(JSON.stringify({type:"MEASURE",details:{height:1100}}),"*")</script>`

/* Blocks whose first control is part of the block itself, not a way out: a tap is checked to do nothing wrong, not to leave. */
const SELF = new Set(["app_instagram", "t_email_capture", "t_faq", "t_contact_form", "t_lead_magnet", "app_poll", "t_form_quiz", "t_image", "t_countdown", "app_stats", "app_note", "t_promo_code", "post_carousel", "post_group", "post_inline", "t_text", "t_heading", "t_divider", "pdf_inline", "spotify_page", "apple_page"])

async function load(width, dark, preview) {
  const page = await browser.newPage()
  const errors = []
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200))
  })
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message || e).slice(0, 200)}`))
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "www.instagram.com") return void r.respond({ status: 200, contentType: "text/html", body: IG })
    if (u.hostname === "127.0.0.1" || u.protocol === "data:" || u.protocol === "blob:") return void r.continue()
    /* Every other service answers with a blank page; a script or a picture from elsewhere is not there. */
    if (r.resourceType() === "document") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body style='margin:0;background:#fff'></body>" })
    if (r.resourceType() === "image") return void r.respond({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'/>" })
    return void r.respond({ status: 404, body: "" })
  })
  await page.evaluateOnNewDocument(() => {
    window.__opened = []
    window.__notices = 0
    window.addEventListener("onepage:preview-notice", () => window.__notices++)
    window.open = (u) => {
      window.__opened.push(String(u))
      return null
    }
    /* A link followed is written down and not followed, so the page stays to be measured. */
    document.addEventListener("click", (e) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null
      if (a && !e.defaultPrevented) {
        window.__opened.push(a.href)
        e.preventDefault()
      }
    })
  })
  await page.goto(`${base}/app/onepage?sweep${dark ? "&dark" : ""}${preview ? "&preview" : ""}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-op-block]")
  /* Every lazy frame in: scroll through the page once, then back. */
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
  await sleep(1600)
  return { page, errors }
}

const pageColour = (dark) => (dark ? [14, 14, 16] : [246, 244, 239])

/* The colour of one pixel of the window, read from a screenshot drawn into a canvas. */
async function pixel(page, x, y) {
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 }, encoding: "base64" })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = c.height = 1
    const ctx = c.getContext("2d")
    ctx.drawImage(img, 0, 0)
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
  }, shot)
}
const close = (a, b, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol)

const matrix = []
try {
  for (const dark of [false, true]) {
    for (const width of [390, 1440]) {
      for (const preview of [false, true]) {
        const label = `${dark ? "dark" : "light"} ${width} ${preview ? "preview" : "live"}`
        console.log(`\n── ${label}`)
        const { page, errors } = await load(width, dark, preview)
        const list = await page.evaluate(() => window.PROBE_SWEEP_BLOCKS)

        /* Renders and overflow. */
        const geo = await page.evaluate((ids) => {
          const vw = document.documentElement.clientWidth
          return {
            sideways: document.documentElement.scrollWidth - vw,
            blocks: ids.map(({ id }) => {
              const el = document.querySelector(`[data-op-block="${id}"]`)
              if (!el) return { id, drawn: false }
              const r = el.getBoundingClientRect()
              return { id, drawn: true, h: Math.round(r.height), left: Math.round(r.left), right: Math.round(vw - r.right) }
            }),
          }
        }, list)
        check(geo.sideways <= 0, `${label}: the page never scrolls sideways (${geo.sideways}px over)`)
        for (const b of geo.blocks) {
          const row = { label, id: b.id, drawn: b.drawn, h: b.h ?? 0, overflow: b.drawn && (b.left < 0 || b.right < 0) }
          matrix.push(row)
        }

        /* The Instagram fold, in place, in a carousel and in a group: read before the taps, which open it. */
        for (const where of ["post_inline", "post_carousel", "post_group"]) {
          /* Scrolled to, then left to settle: the posts around it load as they come into view and move it. */
          await page.evaluate((where) => document.querySelector(`[data-op-block="${where}"] [data-compact-post]`)?.scrollIntoView({ block: "center" }), where)
          /* Its frame drawn (it is lazy, and shows once Instagram has said its height), then the page still. */
          await page.waitForFunction((where) => document.querySelector(`[data-op-block="${where}"] [data-post-box] iframe`)?.style.opacity === "1", { timeout: 8000 }, where).catch(() => {})
          await sleep(1200)
          const fold = await page.evaluate((where) => {
            const root = document.querySelector(`[data-op-block="${where}"] [data-compact-post]`)
            if (!root) return null
            const box = root.querySelector("[data-post-box]")
            const more = root.querySelector("[data-post-more]")
            const r = box.getBoundingClientRect()
            const cs = getComputedStyle(box)
            return {
              folded: root.hasAttribute("data-post-folded"),
              mask: cs.maskImage || cs.webkitMaskImage,
              /* In the document's own coordinates, which a screenshot's clip is read in. */
              x: r.left + scrollX + 6,
              bottom: r.bottom + scrollY,
              mid: r.top + scrollY + r.height / 2,
              w: Math.round(r.width),
              h: Math.round(r.height),
              more: more ? { bg: getComputedStyle(more).backgroundColor, h: Math.round(more.getBoundingClientRect().height), gap: Math.round(r.bottom - more.getBoundingClientRect().bottom) } : null,
            }
          }, where)
          if (!fold) {
            check(false, `${label}: ${where} draws an Instagram post`)
            continue
          }
          await sleep(200)
          const foot = await pixel(page, fold.x, Math.floor(fold.bottom) - 2)
          const middle = await pixel(page, fold.x, fold.mid)
          const want = pageColour(dark)
          console.log(`   ${where}`, JSON.stringify({ ...fold, foot, middle }))
          check(fold.folded && /linear-gradient/.test(fold.mask || ""), `${label}: ${where} is folded with a masked foot`)
          check(close(foot, want, 20), `${label}: ${where} fades into the page's own colour at its foot (${foot} vs ${want})`)
          check(close(middle, [242, 242, 242], 16), `${label}: ${where} is drawn solid above the fade (${middle})`)
          const btn = dark ? "rgb(244, 244, 245)" : "rgb(26, 26, 46)"
          check(fold.more && fold.more.bg === btn && fold.more.h === 32 && fold.more.gap >= 8 && fold.more.gap <= 16, `${label}: ${where} "View full post" is the page's button, 32px, at the foot (${JSON.stringify(fold.more)})`)
        }

        /* Taps. */
        for (const { id } of list) {
          const row = matrix.find((m) => m.label === label && m.id === id)
          if (!row.drawn) continue
          const before = tracked.length
          const target = await page.evaluate((id) => {
            window.__opened = []
            window.__notices = 0
            const el = document.querySelector(`[data-op-block="${id}"]`)
            const t = el?.querySelector("a[href],button:not([disabled]),[role=button]")
            if (!t) return null
            t.scrollIntoView({ block: "center" })
            t.setAttribute("data-sweep-target", "")
            return t.tagName
          }, id)
          if (!target) {
            row.tap = "none"
            continue
          }
          await page.$eval("[data-sweep-target]", (t) => {
            t.removeAttribute("data-sweep-target")
            t.click()
          })
          await sleep(450)
          const after = await page.evaluate(() => ({ sheet: !!document.querySelector("[data-block-sheet]"), opened: window.__opened.slice(), sheetPost: (() => {
            const body = document.querySelector("[data-block-sheet-body]")
            const post = body?.querySelector("[data-compact-post]")
            return post ? { whole: post.hasAttribute("data-post-whole"), button: !!post.querySelector("[data-post-more]") } : null
          })(), notice: window.__notices > 0 }))
          row.tap = after.sheet ? "sheet" : after.opened.length ? "leaves" : after.notice ? "notice" : "stays"
          row.tracked = tracked.slice(before).filter((t) => t.block_id === id || (t.block_id || "").startsWith(id)).length
          if (after.sheetPost) row.sheetPost = after.sheetPost
          if (after.sheet) {
            await page.keyboard.press("Escape")
            await sleep(450)
          }
        }

        /* Console. */
        const real = errors.filter((e) => !/Failed to load resource/.test(e))
        check(real.length === 0, `${label}: no console errors (${real.length}${real.length ? `: ${real.slice(0, 4).join(" | ")}` : ""})`)
        await page.close()
      }
    }
  }

  /* The matrix, and what each row must be. */
  console.log("\nblock                     " + [...new Set(matrix.map((m) => m.label))].map((l) => l.padEnd(22)).join(""))
  const ids = [...new Set(matrix.map((m) => m.id))]
  for (const id of ids) {
    const rows = matrix.filter((m) => m.id === id)
    console.log(id.padEnd(26) + rows.map((r) => `${r.drawn ? r.h : "-"}/${r.tap ?? "-"}/${r.tracked ?? "-"}${r.overflow ? "/OVER" : ""}`.padEnd(22)).join(""))
  }
  for (const r of matrix) {
    if (r.overflow) check(false, `${r.label}: ${r.id} reaches outside the window`)
    if (r.drawn && r.tap && r.tap !== "none" && !SELF.has(r.id) && r.tap === "stays") check(false, `${r.label}: a tap on ${r.id} does nothing`)
    const live = !r.label.endsWith("preview")
    if (live && (r.tap === "sheet" || r.tap === "leaves") && !SELF.has(r.id) && !r.tracked) check(false, `${r.label}: a tap on ${r.id} is not counted`)
    /* Counted once, never twice (a block that counts itself says so to the page's listener, components/onepage/block-activity). */
    if (live && r.tracked > 1) check(false, `${r.label}: a tap on ${r.id} is counted ${r.tracked} times`)
    /* In the editor's preview the count is answered by the preview's own frame (components/onepage/preview-document sandboxWrites), which this harness does not draw: not read here. */
    if (r.sheetPost) check(r.sheetPost.whole && !r.sheetPost.button, `${r.label}: in the sheet ${r.id}'s post is whole, with no button`)
  }
  const drawnNowhere = ids.filter((id) => matrix.filter((m) => m.id === id).every((m) => !m.drawn || m.h === 0))
  console.log(`\nnot drawn (empty by design until filled in, or a bug): ${drawnNowhere.join(", ") || "none"}`)
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed")
if (failures.length && !report) process.exit(1)
