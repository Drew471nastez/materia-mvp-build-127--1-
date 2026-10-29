/**
 * ===========================================================================
 *  THE RECEIPT EMAIL AND THE ONE PICTURE, OPENED AS AN INBOX WOULD
 * ===========================================================================
 * scripts/receipt-email-samples.ts writes the buyer's receipt three ways and
 * the report's automated email; this opens each in Chromium at a phone's
 * width (390) and a desktop reading pane's (640), in light and in dark, and
 * measures:
 *
 *   - nothing is wider than the screen, and the column is 560px at most
 *     (the shared layout, lib/emails/layout.ts);
 *   - every picture loads (no broken image), says its size, and is drawn at
 *     it: product thumbnails 56 by 56, the creator's photo 40 by 40 at its
 *     own shape, never cut round (round 43, lib/emails/brand-mark.ts);
 *   - a product with no thumbnail has its letter tile instead;
 *   - the creator is shown by ONE picture, in the receipt and in the
 *     automated email that used to carry a logo and a different photo;
 *   - the Download button is at least 44px tall, its words read on it
 *     (4.5:1) and it is seen on the card (1.6:1) in both schemes, and on a
 *     phone it spans the card;
 *   - every amount stays on its line, at the right, at every width.
 *
 * Screenshots go to SHOTS_DIR, to be looked at.
 *
 *   node scripts/check-receipt-email.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import zlib from "node:zlib"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const work = join(root, ".receipt-email-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* A PNG drawn by a function of the pixel, so each sample picture is told apart in a screenshot. */
function png(w, h, paint) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) raw.set(paint(x / w, y / h), y * (w * 3 + 1) + 1 + x * 3)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const images = {
  /* A dark ground with a pale disc: a stand in for the creator's photo. */
  "luca-photo.png": png(256, 256, (x, y) => ((x - 0.5) ** 2 + (y - 0.42) ** 2 < 0.06 ? [236, 226, 214] : mix([28, 28, 34], [70, 60, 72], y))),
  "ld-logo.png": png(160, 160, () => [22, 22, 30]),
  "square.png": png(400, 400, (x, y) => mix([232, 150, 92], [120, 60, 90], (x + y) / 2)),
  "wide.png": png(1040, 560, (x, y) => mix([24, 40, 92], [210, 170, 120], y * 0.8 + x * 0.2)),
}
const imageFor = (url) => {
  let target = url
  try {
    const u = new URL(url)
    if (u.pathname === "/_next/image") target = u.searchParams.get("url") ?? url
  } catch {}
  return images[target.split("?")[0].split("/").pop()] ?? null
}

try {
  writeFileSync(join(work, "server-only.js"), "")
  execFileSync(
    "npx",
    ["esbuild", "scripts/receipt-email-samples.ts", "--bundle", "--platform=node", "--format=esm", "--alias:@=.", `--alias:server-only=${join(work, "server-only.js")}`, `--outfile=${join(work, "samples.mjs")}`, "--log-level=error",
      "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"],
    { cwd: root, stdio: "inherit" },
  )
  execFileSync("node", [join(work, "samples.mjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const requested = new Set()

  for (const file of ["receipt-one", "receipt-basket", "receipt-bare", "automation-luca"]) {
    console.log(`\n${file}.html`)
    const html = readFileSync(join(out, `${file}.html`), "utf8")
    const receipt = file.startsWith("receipt")
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
    expect(imgs.every((i) => /\salt="/.test(i) && /\ssrc="https:\/\//.test(i) && /\s(width|height)="\d+"/.test(i)), "every picture: https, alt text, a size", imgs.length)
    expect(!/<script|\son[a-z]+=|javascript:/i.test(html), "no script, event handler or javascript: link")

    for (const width of [390, 640]) {
      for (const scheme of ["light", "dark"]) {
        const p = await browser.newPage()
        await p.setViewport({ width, height: 900, deviceScaleFactor: 2 })
        await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          const u = r.url()
          const body = imageFor(u)
          if (body) {
            requested.add(u)
            return r.respond({ status: 200, contentType: "image/png", body })
          }
          if (u.startsWith("http")) return r.respond({ status: 404, body: "" })
          return r.continue()
        })
        await p.setContent(html, { waitUntil: "load" })
        const m = await p.evaluate((isReceipt) => {
          const lum = (c) => {
            const v = (c.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map((x) => Number(x) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
          }
          const ratio = (a, b) => {
            const x = lum(a)
            const y = lum(b)
            return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100
          }
          const box = (el) => {
            const r = el.getBoundingClientRect()
            return { w: Math.round(r.width), h: Math.round(r.height) }
          }
          const visible = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0
          /* The receipt is drawn in the shared layout (lib/emails/layout.ts): a white page and a 560px column, no card. */
          const card = document.querySelector(isReceipt ? "table.e-body" : ".sl-card")
          const cardBg = getComputedStyle(isReceipt ? document.querySelector("table.e-bg") : card).backgroundColor
          const pics = [...document.images].filter((i) => !(i.width === 1 && i.height === 1))
          const res = {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            cardWidth: box(card).w,
            brokenImages: pics.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src.slice(0, 80)),
            pictures: pics.length,
          }
          if (!isReceipt) {
            res.creatorPictures = pics.length
            return res
          }
          const cell = document.querySelector("td.e-btn")
          const a = document.querySelector("a.e-btn-a")
          res.button = box(a)
          res.buttonText = ratio(getComputedStyle(a).color, getComputedStyle(cell).backgroundColor)
          res.buttonOnCard = ratio(getComputedStyle(cell).backgroundColor, cardBg)
          res.contentWidth = box(card).w
          res.thumbs = [...document.querySelectorAll(".e-thumb")].map((i) => ({ ...box(i), fit: getComputedStyle(i).objectFit, radius: getComputedStyle(i).borderTopLeftRadius }))
          res.tiles = [...document.querySelectorAll("td.e-tile, td.e-tile-accent")].map((t) => ({ ...box(t), letter: t.textContent.trim() }))
          /* Changed on purpose (round 43, lib/emails/brand-mark.ts): the photo is drawn at its own shape, never round. */
          const avatar = document.querySelector(".e-store-logo")
          res.avatar = avatar ? { ...box(avatar), radius: getComputedStyle(avatar).borderTopLeftRadius } : null
          /* Each amount stays on its line at the right, at every width. */
          res.priceRight = [...document.querySelectorAll("td[align=right]")].filter((td) => /\$|Free/.test(td.textContent)).map((td) => visible(td) && td.getBoundingClientRect().right >= card.getBoundingClientRect().right - 1)
          res.creatorPictures = pics.filter((i) => !i.classList.contains("e-thumb")).length
          return res
        }, receipt)
        const tag = `${width} ${scheme}`
        expect(m.overflow <= 0, `${tag}: nothing wider than the screen`, m.overflow)
        if (receipt) expect(m.cardWidth <= 560 && (width > 608 || m.cardWidth >= width - 48), `${tag}: the column is the screen less its margin, 560 at most`, m.cardWidth)
        else expect(m.cardWidth <= 600 && (width > 632 || m.cardWidth >= width - 32), `${tag}: the card is the screen less its margin, 600 at most`, m.cardWidth)
        expect(m.brokenImages.length === 0, `${tag}: every picture loaded`, m.brokenImages)
        expect(m.creatorPictures <= 1, `${tag}: one picture of the creator at most`, m.creatorPictures)
        if (file === "automation-luca") expect(m.creatorPictures === 1, `${tag}: the report's email draws exactly one`, m.creatorPictures)
        if (receipt) {
          expect(m.thumbs.every((t) => t.w === 58 && t.h === 58 && t.fit === "cover" && t.radius === "10px"), `${tag}: thumbnails 56 by 56 inside a 1px border, covered, 10px radius`, m.thumbs)
          expect(m.tiles.every((t) => (t.w === 36 && t.h === 36) || (t.w === 56 && t.h === 56)) && m.tiles.every((t) => t.letter.length === 1), `${tag}: a letter tile where there is no picture`, m.tiles)
          if (file !== "receipt-bare") expect(m.avatar && m.avatar.w === 40 && m.avatar.h === 40 && m.avatar.radius === "0px", `${tag}: the creator's photo, 40 square, never cut round`, m.avatar)
          else expect(m.avatar === null && m.creatorPictures === 0, `${tag}: no picture, the initial instead`, m.tiles)
          expect(m.button.h >= 44, `${tag}: the button is a comfortable tap`, m.button)
          expect(m.buttonText >= 4.5, `${tag}: the button's words read on it (4.5:1)`, m.buttonText)
          expect(m.buttonOnCard >= 1.6, `${tag}: the button is seen on the card (1.6:1)`, m.buttonOnCard)
          if (width < 480) expect(Math.abs(m.button.w - m.contentWidth) <= 1, `${tag}: on a phone the button spans the column`, [m.button.w, m.contentWidth])
          expect(m.priceRight.length > 0 && m.priceRight.every(Boolean), `${tag}: every amount on its own line at the right`, m.priceRight)
        }
        await p.screenshot({ path: join(shots, `${file}-${width}-${scheme}.png`), fullPage: true })
        await p.close()
      }
    }
  }
  await browser.close()
  const resized = [...requested].filter((u) => u.includes("/_next/image?"))
  expect(resized.length > 0 && resized.every((u) => /^https:\/\/[^/]+\/_next\/image\?url=https%3A%2F%2Fabc\.supabase\.co%2F.+&w=(64|96|128)&q=75$/.test(u)), "stored pictures were asked of the resizer, absolute, at twice their size", resized.slice(0, 3))
} finally {
  if (!process.env.KEEP_PROBE) rmSync(join(work, "samples.mjs"), { force: true })
}

console.log(`\nShots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
