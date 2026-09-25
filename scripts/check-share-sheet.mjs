/**
 * ===========================================================================
 *  THE ADDRESS PILL AND THE SHARE SHEET, MEASURED
 * ===========================================================================
 * The real SharePill and ShareStorelibSheet (components/app/share) over a
 * page shaped like /app's home header (scripts/render-share-sheet.tsx), at
 * 1440x900 and on a 390x844 phone:
 *
 *   PILL     40px on a computer and 34px on a phone; an address past 23
 *            characters is cut to 23 and an ellipsis
 *   MODAL    a computer gets a centred modal no wider than 460px: the three
 *            addresses, Copy, the QR card with a drawn code, the creator's
 *            platforms and the row of places to post it
 *   SHEET    a phone gets the bottom sheet, with no QR card, no taller than
 *            three quarters of the screen on the share view, and a share row
 *            that scrolls sideways inside the sheet rather than the page
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
      return { h: Math.round(b.height), text: el.textContent.trim(), right: Math.round(window.innerWidth - b.right) }
    })
    expect(pill.h === (phone ? 34 : 40), `the pill is ${phone ? 34 : 40}px tall`, pill.h)
    expect(pill.text === "storelib.com/andrewrull…", "24 characters are cut to 23 and an ellipsis", pill.text)
    const long = await p.$eval("[data-probe=pill-long] [data-share-pill]", (el) => el.textContent.trim())
    expect(long === "storelib.com/a-very-lon…", "a long address is cut the same way", long)
    const pageSide = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    /* Every outline mark's S sits inside its square (a flattened transform draws it in the corner). */
    const marksInside = () =>
      p.evaluate(() =>
        [...document.querySelectorAll("svg rect + path[data-keep-transform]")].every((path) => {
          const svg = path.ownerSVGElement.getBoundingClientRect()
          if (svg.width === 0) return true /* the other width's pill, not drawn at this one */
          const b = path.getBoundingClientRect()
          const cx = b.left + b.width / 2 - svg.left
          const cy = b.top + b.height / 2 - svg.top
          return b.width > svg.width * 0.3 && Math.abs(cx - svg.width / 2) < svg.width * 0.15 && Math.abs(cy - svg.height / 2) < svg.height * 0.15
        }),
      )
    expect((await pageSide()) === 0, "the page does not scroll sideways", await pageSide())
    await p.screenshot({ path: join(shots, `${label}-header.png`) })

    if (phone) await p.tap(pillSel)
    else await p.click(pillSel)
    await sleep(700)
    const surface = await p.evaluate(() => {
      const el = document.querySelector("[data-share-sheet]")
      if (!el) return null
      const card = el.getAttribute("data-surface") === "modal" ? el : el.closest("[role=dialog]") || el
      const b = card.getBoundingClientRect()
      return {
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
    expect(surface.kind === (phone ? "sheet" : "modal"), phone ? "a phone gets the bottom sheet" : "a computer gets the modal", surface.kind)
    expect(surface.tabs.join("|") === "Creator page|OnePage|Website", "the three addresses, the creator page first", surface.tabs)
    expect(surface.platforms, "My platforms is there", surface.platforms)
    for (const want of ["Copy", "Instagram", "TikTok", "X", "My Storelib", "QR code", "Facebook", "WhatsApp", "Email"]) {
      expect(surface.buttons.includes(want), `a ${want} button`, undefined)
    }
    if (phone) {
      expect(!surface.qrCard, "no QR card on a phone", surface.qrCard)
      const rows = surface.rows
      expect(rows.some((r) => r.sw > r.cw), "the share row scrolls sideways inside the sheet", rows)
    } else {
      expect(surface.qrCard && surface.qrDrawn, "the QR card with a drawn code", { card: surface.qrCard, drawn: surface.qrDrawn })
      expect(surface.box[2] <= 460 && Math.abs(surface.box[0] + surface.box[2] / 2 - 720) <= 1, "a modal no wider than 460px, centred", surface.box)
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
    expect(await marksInside(), "every outline mark draws its S in the middle of its square", undefined)
    await p.screenshot({ path: join(shots, `${label}-share.png`) })

    /* The Website tab puts the website in the row. */
    const tabWebsite = await p.$$("[data-share-sheet] [role=tab]")
    if (tabWebsite[2]) {
      if (phone) await tabWebsite[2].tap()
      else await tabWebsite[2].click()
      await sleep(250)
      const row = await p.evaluate(() => [...document.querySelectorAll("[data-share-sheet] button")].map((b) => b.textContent.trim()).find((t) => t.includes("storelib.com")))
      expect(row === "andrewrullz.storelib.com", "the Website tab shows the website's address", row)
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
    expect(qrView.view === "qr" && qrView.drawn && qrView.size >= 190, "the QR view draws a large code", qrView)
    expect(qrView.download, "a Download button in a browser", qrView.download)
    await p.screenshot({ path: join(shots, `${label}-qr.png`) })

    await p.keyboard.press("Escape")
    await sleep(600)
    const closed = await p.evaluate(() => !document.querySelector("[data-share-sheet]"))
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
