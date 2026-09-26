/**
 * ===========================================================================
 *  THE ADDRESS PILL AND THE SHARE PANEL, MEASURED
 * ===========================================================================
 * The real ShareStorelib pill and what it opens (components/app/share) over a
 * page shaped like /app's home header (scripts/render-share-sheet.tsx), at
 * 1280, 1440 and 1920 wide and on 360, 390 and 430 phones:
 *
 *   PILL     36px, the S in the logo's violet (lit and shadowed, no square
 *            around it), the whole address; one that does not fit is faded
 *            where it is cut, one that fits is not
 *   OPENING  on a computer the panel grows from the pill's corner: every
 *            frame of the open and the close, its right edge stays on the
 *            pill's, its left edge only ever moves out, and its transform
 *            origin is the corner from the first frame (it used to slide from
 *            the middle, which drifted the panel 6px left and back)
 *   PANEL    no centred modal, no dimmed page, no wider than 396px, nothing
 *            inside it scrolls; the three addresses, the address with Copy,
 *            one line under it, Open and QR code (and Share where the device
 *            has it); no QR card, no platforms, no row of share targets
 *   SWITCH   Creator page, OnePage, Website: the panel's height holds to the
 *            pixel on every frame of the switch, the thumb slides, the
 *            address changes
 *   SHEET    a phone gets the bottom sheet, no close button, no taller than
 *            three quarters of the screen
 *   VIEWS    the QR view draws a code with Download and Copy link; Back
 *            returns; Escape closes
 *   PAGE     nothing on the page scrolls sideways at any width
 *
 *   PROBE_CSS=source node scripts/check-share-sheet.mjs
 *   (or after `pnpm build`, without PROBE_CSS, to use the built stylesheet)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const work = join(root, ".share-sheet-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-share-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The card the address sits on: the panel itself, or the sheet's first ancestor with a background that is not the whole screen. */
const CARD_OF = `(() => {
  const el = document.querySelector("[data-share-sheet]")
  if (el.getAttribute("data-surface") === "panel") return el
  let n = el
  while (n && n.parentElement) {
    n = n.parentElement
    const bg = getComputedStyle(n).backgroundColor
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && n.getBoundingClientRect().height < window.innerHeight) return n
  }
  return el
})()`

/** The panel's box every frame for `ms`, from now: [t, left, right, top, height, origin]. */
const trackPanel = (p, ms) =>
  p.evaluate((ms) => new Promise((resolve) => {
    const frames = []
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector("[data-share-sheet][data-surface=panel]")
      if (el) {
        const b = el.getBoundingClientRect()
        frames.push([Math.round(performance.now() - t0), +b.left.toFixed(2), +b.right.toFixed(2), +b.top.toFixed(2), +b.height.toFixed(2), getComputedStyle(el).transformOrigin, +getComputedStyle(el).opacity])
      } else frames.push([Math.round(performance.now() - t0), null])
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else resolve(frames)
    }
    requestAnimationFrame(tick)
  }), ms)

/* The panel's "Open OnePage" is an app link (components/app/app-link.tsx), which asks for the app's router: a stand-in, as in the home probes. */
writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return <a ref={ref} href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
})
`)

try {
  execFileSync(
    "npx",
    [
      "esbuild", "scripts/render-share-sheet.tsx", "--bundle", "--format=iife", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"', "--alias:@=.",
      `--alias:next/navigation=${join(work, "navigation.js")}`, `--alias:next/link=${join(work, "link.jsx")}`, "--loader:.jsx=jsx",
      "--banner:js=var process={env:{NODE_ENV:'production'}};",
      `--outfile=${join(work, "app.js")}`, "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const js = readFileSync(join(work, "app.js"), "utf8")
  writeFileSync(
    join(work, "index.html"),
    `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const viewports = [
    ["desktop-1440", { width: 1440, height: 900 }, true],
    ["desktop-1280", { width: 1280, height: 800 }, false],
    ["desktop-1920", { width: 1920, height: 1080 }, false],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
    ["phone-360", { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, false],
    ["phone-430", { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, false],
  ]
  for (const [label, vp, full] of viewports) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(work, "index.html")}`)
    await p.evaluate(() => document.fonts.ready)
    await sleep(400)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    const pillSel = phone ? "[data-probe=pill-sm] [data-share-pill]" : "[data-probe=pill-md] [data-share-pill]"
    const pill = await p.$eval(pillSel, (el) => {
      const b = el.getBoundingClientRect()
      const path = el.querySelector("svg path[data-keep-transform]")
      return {
        h: Math.round(b.height),
        right: +b.right.toFixed(2),
        bottom: +b.bottom.toFixed(2),
        text: el.textContent.trim(),
        cut: el.querySelector("[data-cut]") != null,
        outline: el.querySelector("svg rect") != null,
        fill: path?.getAttribute("fill"),
        lit: /^url\(#storelib-s-/.test(path?.getAttribute("filter") || ""),
      }
    })
    expect(pill.h === 36, "the pill is 36px tall", pill.h)
    if (phone) expect(pill.text === "View" && !pill.fill, "on a phone it is an eye and View", pill)
    else {
      expect(pill.text === "storelib.com/andrewrullz", "it carries the whole address, no ellipsis", pill.text)
      expect(pill.fill === "#8b56fa" && !pill.lit && !pill.outline, "the S in flat violet, no square around it", pill)
    }
    const depth = await p.$eval(pillSel, (el) => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow }))
    expect(depth.bg === "rgb(244, 244, 246)" && !/inset/.test(depth.shadow), "light grey with almost no depth", depth)
    if (!phone) expect(!pill.cut, "an address that fits is not faded", pill.cut)
    const pageSide = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect((await pageSide()) === 0, "the page does not scroll sideways", await pageSide())
    if (full) {
      const long = await p.$eval("[data-probe=pill-long] [data-share-pill]", (el) => ({
        cut: el.querySelector("[data-cut]") != null,
        mask: getComputedStyle(el.querySelector("[data-cut]") ?? el).maskImage || getComputedStyle(el.querySelector("[data-cut]") ?? el).webkitMaskImage,
        w: Math.round(el.getBoundingClientRect().width),
      }))
      expect(long.cut && /gradient/.test(long.mask) && long.w <= 240, "a long address fades where the room runs out", long)
      await p.screenshot({ path: join(shots, `${label}-header.png`) })
    }

    /* Open, frame by frame. */
    const opening = phone ? null : trackPanel(p, 420)
    if (phone) await p.tap(pillSel)
    else await p.click(pillSel)
    if (opening) {
      const frames = (await opening).filter((f) => f[1] != null)
      const rights = frames.map((f) => f[2])
      const lefts = frames.map((f) => f[1])
      const origins = [...new Set(frames.map((f) => f[5]))]
      const leftward = lefts.every((x, i) => i === 0 || x <= lefts[i - 1] + 0.01)
      expect(frames.length > 5 && rights.every((r) => Math.abs(r - pill.right) <= 0.5), "every frame of the open, the panel's right edge is on the pill's", { pill: pill.right, rights: [...new Set(rights)] })
      expect(leftward, "its left edge only ever moves out: no drift to the left and back", lefts)
      expect(origins.length === 1 && /^396px 0px$|^100% 0%$/.test(origins[0]), "it grows from the pill's corner from the first frame", origins)
    }
    await sleep(500)
    const surface = await p.evaluate(() => {
      const el = document.querySelector("[data-share-sheet]")
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        scrolls: el.scrollHeight > el.clientHeight + 1,
        dimmed: [...document.querySelectorAll("body *")].some((n) => {
          const s = getComputedStyle(n)
          return s.position === "fixed" && n.getBoundingClientRect().width >= window.innerWidth && /rgba\(0, 0, 0, 0\.[1-9]/.test(s.backgroundColor) && !n.closest("[data-app-sheet]")
        }),
        close: !!el.querySelector("button[aria-label=Close]") || !!document.querySelector("[data-app-sheet] button[aria-label=Close]"),
        icons: [...el.querySelectorAll("[data-share-pane]:not([style*=hidden]) svg")].filter((svg) => svg.getClientRects().length && !svg.closest("[hidden]")).length,
        kind: el.getAttribute("data-surface"),
        box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
        right: +b.right.toFixed(2),
        tabs: [...el.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
        rows: [...el.querySelectorAll("[data-share-row]")].filter((r) => r.getClientRects().length).map((r) => ({ what: r.getAttribute("data-share-row"), address: r.querySelector("[data-share-address]").textContent.trim(), copy: !!r.querySelector("[data-share-copy]"), open: !!r.querySelector("[data-share-open]") })),
        ink: [...el.querySelectorAll("button")].filter((b) => b.getClientRects().length && getComputedStyle(b).backgroundColor === "rgb(26, 26, 46)").length,
        address: el.querySelector("[data-share-address]")?.textContent.trim(),
        actions: [...el.querySelectorAll("[data-share-actions] button")].map((b) => b.textContent.trim()),
        buttons: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
        text: el.textContent,
        /* innerText: the line for an unpublished OnePage is there too, hidden, so no element comes or goes on a switch. */
        hint: el.querySelector("[data-share-address]")?.closest("div")?.nextElementSibling?.innerText.trim(),
      }
    })
    expect(!!surface, "the pill opens the share panel", surface?.kind)
    if (!surface) continue
    expect(surface.kind === (phone ? "sheet" : "panel"), phone ? "a phone gets the bottom sheet" : "a computer gets the panel", surface.kind)
    expect(surface.tabs.length === 0, "no tabs to switch between", surface.tabs)
    expect(surface.rows.map((r) => r.what).join("|") === "creator|onepage|website" && surface.rows[0].address === "storelib.com/andrewrullz", "every address at once, a row each, the creator page first", surface.rows)
    expect(surface.rows.every((r) => r.copy && r.open), "each with its own Copy and Open", surface.rows)
    expect(surface.ink === 0, "no black Copy link button", { ink: surface.ink, buttons: surface.buttons })
    expect(surface.actions[0] === "QR code" && surface.actions.length <= 2, "QR code under them (and Share where the device has one), with their icons", surface.actions)
    const gone = ["My platforms", "Instagram", "TikTok", "WhatsApp", "Facebook", "Telegram", "Reddit", "My Storelib", "Add it to your Instagram bio"].filter((w) => surface.text.includes(w))
    expect(gone.length === 0, "no platforms, no QR card, no row of share targets", gone)
    if (phone) {
      expect(!surface.close, "no close button on the sheet", surface.close)
      /* The QR view is built with the sheet and its code drawn once the sheet has arrived: the QR code button only shows it. */
      await p.waitForFunction(() => !!document.querySelector("[data-share-sheet] [data-share-qr]")?.getAttribute("src"), { timeout: 3000 }).catch(() => {})
      const ahead = await p.evaluate(() => {
        const el = document.querySelector("[data-share-sheet]")
        return {
          panes: [...el.querySelectorAll("[data-share-pane]")].map((n) => (getComputedStyle(n).visibility === "hidden" ? "hidden" : "on")),
          drawn: !!el.querySelector("[data-share-qr]")?.getAttribute("src"),
        }
      })
      expect(ahead.panes.join("|") === "on|hidden" && ahead.drawn, "the QR code is built and drawn with the sheet, out of sight until asked for", ahead)
    } else {
      expect(surface.box[2] <= 396, "a panel no wider than 396px", surface.box)
      expect(surface.box[1] >= pill.bottom && surface.box[1] - pill.bottom <= 14 && Math.abs(surface.right - pill.right) <= 0.5, "dropped from the pill, its right edge on the pill's", { box: surface.box, pill: [pill.right, pill.bottom] })
      expect(!surface.scrolls, "nothing inside it scrolls", surface.scrolls)
      expect(!surface.dimmed, "the page is not dimmed behind it", surface.dimmed)
    }
    const sheetH = await p.evaluate(() => {
      let el = document.querySelector("[data-share-sheet]")
      while (el && el.parentElement) {
        el = el.parentElement
        const bg = getComputedStyle(el).backgroundColor
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && el.getBoundingClientRect().height < window.innerHeight) {
          return Math.round(el.getBoundingClientRect().height)
        }
      }
      return null
    })
    if (phone) expect(sheetH != null && sheetH <= vp.height * 0.75, "the share view is no taller than three quarters of the screen", sheetH)
    expect((await pageSide()) === 0, "still nothing scrolls sideways", await pageSide())
    await p.screenshot({ path: join(shots, `${label}-share.png`) })

    if (full) {
      /* Copy: the icon turns into a check, and nothing moves. */
      const heightOf = () => p.evaluate((cardOf) => +eval(cardOf).getBoundingClientRect().height.toFixed(2), CARD_OF)
      const before = await heightOf()
      await p.evaluate(() => { try { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true }) } catch {} })
      const copyBtn = await p.$("[data-share-sheet] [data-share-row=website] [data-share-copy]")
      if (phone) await copyBtn.tap()
      else await copyBtn.click()
      await sleep(120)
      const copied = await p.$eval("[data-share-sheet] [data-share-row=website] [data-share-copy]", (b) => b.getAttribute("aria-label"))
      expect(copied === "Copied" && Math.abs((await heightOf()) - before) <= 0.5, "Copy turns into Copied, and the panel holds its height", { copied })
      await p.screenshot({ path: join(shots, `${label}-copied.png`) })

      /* The QR view. */
      const qr = await p.evaluateHandle(() => [...document.querySelectorAll("[data-share-sheet] [data-share-actions] button")].find((b) => b.textContent.trim() === "QR code"))
      if (phone) await qr.asElement().tap()
      else await qr.asElement().click()
      await sleep(900)
      const qrView = await p.evaluate(() => {
        const el = document.querySelector("[data-share-sheet]")
        /* The code is an <img> of the library's SVG that is always there, hidden until it is drawn. */
        const code = el.querySelector("[data-share-qr]")
        /* The view on show; on a phone the share view is kept beside it, out of sight (by its style, not a class). */
        const shown = [...el.querySelectorAll("[data-share-pane]")].find((n) => n.style.visibility !== "hidden") ?? el
        return {
          view: el.getAttribute("data-view"),
          drawn: !!code && !code.hidden && code.complete && code.naturalWidth > 0 && /^data:image\/svg\+xml/.test(code.src),
          size: code ? Math.round(code.getBoundingClientRect().width) : 0,
          buttons: [...shown.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
          panes: [...el.querySelectorAll("[data-share-pane]")].map((n) => (getComputedStyle(n).visibility === "hidden" ? "hidden" : "on")),
        }
      })
      expect(qrView.view === "qr" && qrView.drawn && qrView.size >= 180, "the QR view draws a large code", qrView)
      expect(/^(Download\|)?Copy link$/.test(qrView.buttons.join("|")), "with Download and Copy link", qrView.buttons)
      if (phone) expect(qrView.panes.join("|") === "hidden|on", "the share view is kept out of sight behind it, not taken down", qrView.panes)
      else expect(qrView.panes.join("|") === "on", "on a computer only the view on show is in the panel", qrView.panes)
      await p.screenshot({ path: join(shots, `${label}-qr.png`) })
      /* Every header keeps its Back button and hides it on the share view: the one on show. */
      const back = (await p.evaluateHandle(() => [...document.querySelectorAll("button[aria-label=Back]")].find((b) => !b.hidden && b.getClientRects().length > 0))).asElement()
      if (phone) await back.tap()
      else await back.click()
      await sleep(500)
      expect((await p.$eval("[data-share-sheet]", (el) => el.getAttribute("data-view"))) === "share", "Back returns to the share view")
    }

    /* Close, frame by frame: it leaves the way it came. */
    const closing = phone ? null : trackPanel(p, 320)
    await p.keyboard.press("Escape")
    if (closing) {
      const frames = (await closing).filter((f) => f[1] != null)
      expect(frames.every((f) => Math.abs(f[2] - pill.right) <= 0.5), "every frame of the close, the right edge stays on the pill's", [...new Set(frames.map((f) => f[2]))])
    }
    await sleep(600)
    /* The phone's sheet is kept once it has been built (BottomSheet keepMounted): closed, it is at rest, out of sight. */
    const closed = await p.evaluate(() => {
      const el = document.querySelector("[data-share-sheet]")
      return !el || (!!el.closest("[data-app-sheet-rest]") && getComputedStyle(el.closest("[data-app-sheet-rest]")).visibility === "hidden")
    })
    expect(closed, "Escape closes it", closed)
    if (errors.length) expect(false, "no errors on the page", errors)
    await p.close()
  }
  await browser.close()
  console.log(`\nshots: ${shots}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (broken) fail(`${broken} check(s) failed`)
console.log("\nall checks passed")
