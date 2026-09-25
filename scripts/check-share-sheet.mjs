/**
 * ===========================================================================
 *  THE ADDRESS PILL AND THE SHARE SHEET, MEASURED
 * ===========================================================================
 * The real ShareStorelib pill and what it opens (components/app/share) over a
 * page shaped like /app's home header (scripts/render-share-sheet.tsx), at
 * 1440x900 and on a 390x844 phone:
 *
 *   PILL     36px, the bare S, the whole address; one that does not fit is
 *            faded where it is cut, one that fits is not. On a phone it
 *            shares one row with the live count and the period
 *   PANEL    a computer gets a panel dropped from the pill itself (no
 *            centred modal, no dimmed page), no wider than 396px, that does
 *            not scroll inside: the three addresses, Copy, the QR card with
 *            a drawn code, the creator's platforms and the row of places to
 *            post it, with no fade over the end of a row
 *   SHEET    a phone gets the bottom sheet, with no QR card and no close
 *            button, no taller than three quarters of the screen on the
 *            share view, and a share row that scrolls sideways inside the
 *            sheet rather than the page
 *   MARKS    the violet Storelib tile in the address row and the My
 *            Storelib circle; no outline mark anywhere
 *   VIEWS    a platform opens its how to (picture, five steps, the link,
 *            Open), Back returns, the QR view draws a code; the Website tab
 *            puts the website's address in the row
 *   PAGE     nothing on the page scrolls sideways at either width
 *
 *   PROBE_CSS=source node scripts/check-share-sheet.mjs
 *   (or after `pnpm build`, without PROBE_CSS, to use the built stylesheet)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

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

try {
  execFileSync(
    "npx",
    [
      "esbuild", "scripts/render-share-sheet.tsx", "--bundle", "--format=iife", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"', "--alias:@=.",
      "--banner:js=var process={env:{NODE_ENV:'production'}};",
      `--outfile=${join(work, "app.js")}`, "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const js = readFileSync(join(work, "app.js"), "utf8")
  writeFileSync(
    join(work, "index.html"),
    `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const viewports = [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  for (const [label, vp] of viewports) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(work, "index.html")}`)
    await sleep(400)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    const pillSel = phone ? "[data-probe=pill-sm] [data-share-pill]" : "[data-probe=pill-md] [data-share-pill]"
    const pill = await p.$eval(pillSel, (el) => {
      const b = el.getBoundingClientRect()
      return {
        h: Math.round(b.height),
        text: el.textContent.trim(),
        cut: el.querySelector("[data-cut]") != null,
        outline: el.querySelector("svg rect") != null,
        glyph: !!el.querySelector("svg path[data-keep-transform]"),
      }
    })
    expect(pill.h === 36, "the pill is 36px tall", pill.h)
    expect(pill.text === "storelib.com/andrewrullz", "it carries the whole address, no ellipsis", pill.text)
    expect(pill.glyph && !pill.outline, "the bare S, no square around it", pill)
    if (!phone) expect(!pill.cut, "an address that fits is not faded", pill.cut)
    const long = await p.$eval("[data-probe=pill-long] [data-share-pill]", (el) => ({
      text: el.textContent.trim(),
      cut: el.querySelector("[data-cut]") != null,
      mask: getComputedStyle(el.querySelector("[data-cut]") ?? el).maskImage || getComputedStyle(el.querySelector("[data-cut]") ?? el).webkitMaskImage,
      w: Math.round(el.getBoundingClientRect().width),
    }))
    expect(long.cut && /gradient/.test(long.mask) && long.w <= 240, "a long address fades where the room runs out", long)
    if (phone) {
      /* One row: the live count, the period and the pill, none wrapped under another. */
      const row = await p.$eval("[data-probe=phone-row]", (el) => {
        const kids = [...el.children].map((c) => c.getBoundingClientRect())
        const top = Math.round(kids[0].top)
        return { sameRow: kids.every((k) => Math.abs(Math.round(k.top) - top) <= 1), right: Math.round(kids[kids.length - 1].right), vw: window.innerWidth }
      })
      expect(row.sameRow && row.right <= row.vw - 16, "the live count, the period and the pill share one row", row)
    }
    const pageSide = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    /* No outline mark is left anywhere: the tile and the bare S are what is drawn. */
    const noOutline = () => p.evaluate(() => document.querySelectorAll("svg rect + path[data-keep-transform]").length === 0)
    expect((await pageSide()) === 0, "the page does not scroll sideways", await pageSide())
    await p.screenshot({ path: join(shots, `${label}-header.png`) })

    if (phone) await p.tap(pillSel)
    else await p.click(pillSel)
    await sleep(700)
    const surface = await p.evaluate(() => {
      const el = document.querySelector("[data-share-sheet]")
      if (!el) return null
      const card = el.getAttribute("data-surface") === "panel" ? el : el.closest("[role=dialog]") || el
      const b = card.getBoundingClientRect()
      const pill = document.querySelector("[data-probe=pill-md] [data-share-pill]")?.getBoundingClientRect()
      return {
        pill: pill ? [Math.round(pill.right), Math.round(pill.bottom)] : null,
        scrolls: el.scrollHeight > el.clientHeight + 1,
        dimmed: [...document.querySelectorAll("body *")].some((n) => {
          const s = getComputedStyle(n)
          return s.position === "fixed" && n.getBoundingClientRect().width >= window.innerWidth && /rgba\(0, 0, 0, 0\.[1-9]/.test(s.backgroundColor) && !n.closest("[data-app-sheet]")
        }),
        faded: [...el.querySelectorAll("[data-share-row]")].some((r) => getComputedStyle(r).maskImage !== "none" && getComputedStyle(r).maskImage !== ""),
        close: !!el.querySelector("button[aria-label=Close]") || !!document.querySelector("[data-app-sheet] button[aria-label=Close]"),
        tile: !!el.querySelector("[data-share-copy]")?.parentElement?.querySelector("span[aria-hidden] svg path"),
        kind: el.getAttribute("data-surface"),
        box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
        tabs: [...el.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
        qrCard: !!el.querySelector("[data-share-qr-hint]"),
        qrDrawn: !!el.querySelector("[data-share-qr-hint] svg path"),
        platforms: [...el.querySelectorAll("p")].some((x) => x.textContent.trim() === "My platforms"),
        buttons: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
        rows: [...el.querySelectorAll("[data-sheet-no-drag]")].map((r) => ({ sw: r.scrollWidth, cw: r.clientWidth })),
      }
    })
    expect(!!surface, "the pill opens the share sheet", surface)
    if (!surface) continue
    expect(surface.kind === (phone ? "sheet" : "panel"), phone ? "a phone gets the bottom sheet" : "a computer gets the panel", surface.kind)
    expect(!surface.faded, "no fade over the end of a row", surface.faded)
    expect(surface.tile, "the address row wears the violet tile", surface.tile)
    expect(surface.tabs.join("|") === "Creator page|OnePage|Website", "the three addresses, the creator page first", surface.tabs)
    expect(surface.platforms, "My platforms is there", surface.platforms)
    for (const want of ["Copy", "Instagram", "TikTok", "X", "My Storelib", "QR code", "Facebook", "WhatsApp", "Email"]) {
      expect(surface.buttons.includes(want), `a ${want} button`, undefined)
    }
    if (phone) {
      expect(!surface.qrCard, "no QR card on a phone", surface.qrCard)
      expect(!surface.close, "no close button on the sheet", surface.close)
      const rows = surface.rows
      expect(rows.some((r) => r.sw > r.cw), "the share row scrolls sideways inside the sheet", rows)
      /* With no fade, the circle the edge cuts is what says there is more: some of it must show. */
      const peek = await p.evaluate(() => {
        const row = [...document.querySelectorAll("[data-share-sheet] [data-share-row]")].at(-1)
        const edge = row.getBoundingClientRect().right
        const cut = [...row.querySelectorAll("[data-circle]")].map((c) => c.getBoundingClientRect()).find((b) => b.right > edge)
        return cut ? Math.round(edge - cut.left) : null
      })
      expect(peek != null && peek >= 10 && peek <= 38, "a piece of the next circle shows at the edge", peek)
    } else {
      expect(surface.qrCard && surface.qrDrawn, "the QR card with a drawn code", { card: surface.qrCard, drawn: surface.qrDrawn })
      expect(surface.box[2] <= 396, "a panel no wider than 396px", surface.box)
      expect(
        surface.pill && surface.box[1] >= surface.pill[1] && surface.box[1] - surface.pill[1] <= 14 && Math.abs(surface.box[0] + surface.box[2] - surface.pill[0]) <= 1,
        "dropped from the pill, its right edge on the pill's",
        { box: surface.box, pill: surface.pill },
      )
      expect(!surface.scrolls, "nothing inside it scrolls", surface.scrolls)
      expect(!surface.dimmed, "the page is not dimmed behind it", surface.dimmed)
    }
    /* The sheet's own panel, found by walking up to the first ancestor with a background: the dialog role sits on the full-screen layer. */
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
    if (phone) expect(sheetH != null && sheetH <= 844 * 0.75, "the share view is no taller than three quarters of the screen", sheetH)
    expect((await pageSide()) === 0, "still nothing scrolls sideways", await pageSide())
    expect(await noOutline(), "no outline mark is drawn anywhere", undefined)
    await p.screenshot({ path: join(shots, `${label}-share.png`) })

    /* The Website tab puts the website in the row. */
    const tabWebsite = await p.$$("[data-share-sheet] [role=tab]")
    if (tabWebsite[2]) {
      if (phone) await tabWebsite[2].tap()
      else await tabWebsite[2].click()
      await sleep(350)
      const row = await p.evaluate(() => [...document.querySelectorAll("[data-share-sheet] button")].map((b) => b.textContent.trim()).find((t) => t.includes("storelib.com")))
      expect(row === "andrewrullz.storelib.com", "the Website tab shows the website's address", row)
      const thumb = await p.$eval("[data-share-sheet] [data-share-thumb]", (el) => getComputedStyle(el).transform)
      expect(/matrix\(1, 0, 0, 1, [1-9]/.test(thumb), "the thumb has slid under Website", thumb)
      /* A thumb held on its own layer pulled the tab text over it onto another, which a phone re-draws late: the "Creator page" glitch. */
      const layered = await p.$eval("[data-share-sheet] [data-share-thumb]", (el) => getComputedStyle(el).willChange)
      expect(layered === "auto", "the thumb is not held on a layer of its own", layered)
      await p.screenshot({ path: join(shots, `${label}-website.png`) })
    }

    /* A platform's how to. */
    const ig = await p.evaluateHandle(() => [...document.querySelectorAll("[data-share-sheet] button")].find((b) => b.textContent.trim() === "Instagram"))
    if (phone) await ig.asElement().tap()
    else await ig.asElement().click()
    await sleep(600)
    const how = await p.evaluate(() => {
      const el = document.querySelector("[data-share-sheet]")
      return {
        view: el.getAttribute("data-view"),
        steps: el.querySelectorAll("ol li").length,
        bold: el.querySelectorAll("ol li strong").length,
        open: [...el.querySelectorAll("button")].some((b) => b.textContent.trim() === "Open Instagram"),
        back: !!document.querySelector("button[aria-label=Back]"),
      }
    })
    expect(how.view === "platform" && how.steps === 5 && how.open && how.back, "Instagram opens its how to: five steps, the link, Open Instagram, Back", how)
    expect(how.bold >= 3, "the button names in the steps are bold", how.bold)
    await p.screenshot({ path: join(shots, `${label}-instagram.png`) })

    const back = await p.$("button[aria-label=Back]")
    if (phone) await back.tap()
    else await back.click()
    await sleep(500)
    expect((await p.$eval("[data-share-sheet]", (el) => el.getAttribute("data-view"))) === "share", "Back returns to the share view")

    /* The QR view. */
    const qr = await p.evaluateHandle(() => [...document.querySelectorAll("[data-share-sheet] button")].find((b) => b.textContent.trim() === "QR code"))
    if (phone) await qr.asElement().tap()
    else await qr.asElement().click()
    await sleep(900)
    const qrView = await p.evaluate(() => {
      const el = document.querySelector("[data-share-sheet]")
      const svg = el.querySelector("[role=img] svg")
      return {
        view: el.getAttribute("data-view"),
        drawn: !!svg && svg.querySelectorAll("path").length > 0,
        size: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
        download: [...el.querySelectorAll("button")].some((b) => b.textContent.trim() === "Download"),
      }
    })
    expect(qrView.view === "qr" && qrView.drawn && qrView.size >= 180, "the QR view draws a large code", qrView)
    expect(qrView.download, "a Download button in a browser", qrView.download)
    await p.screenshot({ path: join(shots, `${label}-qr.png`) })

    await p.keyboard.press("Escape")
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
