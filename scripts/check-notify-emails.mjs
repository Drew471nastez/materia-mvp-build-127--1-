/**
 * ===========================================================================
 *  THE REVIEW AND SALE EMAILS, OPENED AS AN INBOX WOULD
 * ===========================================================================
 * scripts/notify-email-samples.ts writes the two review request emails and
 * the three sale emails; this opens each in Chromium at a phone's width
 * (390) and an email's usual one (600), in light and in dark, and measures:
 *
 *   - nothing is wider than the screen and the card is 600px at most;
 *   - the markup is tables with inline styles: no external stylesheet, no
 *     script, no event handler, no web font;
 *   - every picture is absolute https with alt text and a stated size, and
 *     loads; a product with none has its letter tile instead;
 *   - every link is absolute, and on Storelib;
 *   - the five stars are five links, each at least 40px, each opening the
 *     receipt at that rating;
 *   - the button is at least 44px tall, its words read on it (4.5:1), it is
 *     seen on the card (1.6:1) in both schemes, and it spans the card on a
 *     phone;
 *   - nothing drawn is purple;
 *   - there is a plain text part, and it carries every address.
 *
 * Screenshots go to SHOTS_DIR, to be looked at.
 *
 *   node scripts/check-notify-emails.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import zlib from "node:zlib"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const work = join(root, ".notify-email-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* A PNG drawn from a function of the pixel, so the product shot is told apart in a screenshot. */
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
const PRESETS = png(256, 256, (x, y) => mix([236, 156, 92], [64, 44, 98], (x + y) / 2))
const LOGO = png(64, 64, () => [26, 26, 46])

/* The pictures the emails ask for: the product through /api/email/img, the Storelib mark from the site. */
const imageFor = (url) => {
  try {
    const u = new URL(url)
    if (u.pathname === "/api/email/img") return PRESETS
    if (u.pathname === "/_next/image") return PRESETS
    if (/storelib/i.test(u.hostname) && /\.png$/i.test(u.pathname)) return LOGO
  } catch {}
  return null
}

const PURPLE = /#(8b5cf6|7c3aed|6d28d9|5b21b6|4c1d95|a78bfa|c4b5fd|ddd6fe|ede9fe|f5f3ff|2f2f4d)/i
const FILES = ["review-request", "review-request-bare", "review-reminder", "sale-paid", "sale-free", "sale-first"]

writeFileSync(join(work, "server-only.js"), "")
execFileSync(
  "pnpm",
  ["exec", "esbuild", "scripts/notify-email-samples.ts", "--bundle", "--platform=node", "--format=esm", "--alias:@=.", `--alias:server-only=${join(work, "server-only.js")}`, `--outfile=${join(work, "samples.mjs")}`, "--log-level=error",
    "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"],
  { cwd: root, stdio: "inherit" },
)
execFileSync("node", [join(work, "samples.mjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

for (const file of FILES) {
  console.log(`\n${file}`)
  const html = readFileSync(join(out, `${file}.html`), "utf8")
  const text = readFileSync(join(out, `${file}.txt`), "utf8")
  const meta = JSON.parse(readFileSync(join(out, `${file}.json`), "utf8"))
  const review = file.startsWith("review")

  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  expect(imgs.every((i) => /\salt="/.test(i) && /\ssrc="https:\/\//.test(i) && /\swidth="\d+"/.test(i) && /\sheight="\d+"/.test(i)), "every picture: https, alt text, a stated size", imgs.length)
  expect(!/<link\b|<script\b|\son[a-z]+=|javascript:|@import|fonts\.googleapis/i.test(html), "no stylesheet, script, event handler or web font")
  expect(/<table\b/.test(html) && (html.match(/<table\b/g) ?? []).length >= 3, "drawn with tables", (html.match(/<table\b/g) ?? []).length)
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))
  expect(hrefs.length > 0 && hrefs.every((h) => h.startsWith("https://storelib.com/") || h.startsWith("mailto:")), "every link absolute and on Storelib", hrefs.filter((h) => !h.startsWith("https://storelib.com/") && !h.startsWith("mailto:")))
  expect(text.trim().length > 120 && hrefs.filter((h) => h.startsWith("https://storelib.com/") && !h.endsWith("storelib.com/")).every((h) => text.includes(h)), "a plain text part with every address in it", text.length)
  expect(!PURPLE.test(html), "no purple in the markup", (html.match(PURPLE) ?? [])[0])
  if (review) {
    expect(meta.fromName === "Loudlib" && meta.replyTo === "hello@loudlib.com", "from the seller by name, replying to their support inbox", meta)
    expect([1, 2, 3, 4, 5].every((n) => html.includes(`?rate=${n}#review`)), "five stars, each opening the review at that rating")
    expect(/Turn off review emails/.test(html) && text.includes("Turn off review emails"), "the footer turns review emails off, not everything")
  } else {
    expect(!meta.fromName && !meta.replyTo, "the seller's own sale email comes from Storelib", meta)
  }
  if (file === "sale-free") expect(/Free/.test(text) && !/\$0\.00/.test(text + html) && /You made a sale/.test(text), "a free claim is a sale, and reads Free", text.split("\n")[0])

  for (const width of [390, 600]) {
    for (const scheme of ["light", "dark"]) {
      const p = await browser.newPage()
      await p.setViewport({ width, height: 900, deviceScaleFactor: 2 })
      await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
      await p.setRequestInterception(true)
      p.on("request", (r) => {
        const body = imageFor(r.url())
        if (body) return r.respond({ status: 200, contentType: "image/png", body })
        if (r.url().startsWith("http")) return r.respond({ status: 404, body: "" })
        return r.continue()
      })
      await p.setContent(html, { waitUntil: "load" })
      const m = await p.evaluate(() => {
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
        /* The shared layout (lib/emails/layout.ts): a white page, the content a column of 560px at most, no card. */
        const card = document.querySelector("table.e-body")
        const page = document.querySelector("table.e-bg")
        const para = document.querySelector("p.e-text")
        const cell = document.querySelector("td.e-btn")
        const a = cell ? cell.querySelector("a") : null
        const pics = [...document.images].filter((i) => !(i.width === 1 && i.height === 1))
        const stars = [...document.querySelectorAll('a[aria-label$="star"], a[aria-label$="stars"]')]
        const all = [...document.querySelectorAll("*")]
        const purple = all.map((el) => getComputedStyle(el)).flatMap((s) => [s.color, s.backgroundColor, s.borderTopColor])
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          cardWidth: box(card).w,
          contentWidth: box(card).w,
          brokenImages: pics.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src.slice(0, 90)),
          thumb: (() => {
            const t = document.querySelector(".e-thumb")
            return t ? { ...box(t), fit: getComputedStyle(t).objectFit } : null
          })(),
          tile: (() => {
            const t = document.querySelector(".e-tile")
            return t ? { ...box(t), letter: t.textContent.trim() } : null
          })(),
          button: a ? box(a) : null,
          buttonText: a ? ratio(getComputedStyle(a).color, getComputedStyle(cell).backgroundColor) : null,
          buttonOnCard: cell ? ratio(getComputedStyle(cell).backgroundColor, getComputedStyle(page).backgroundColor) : null,
          stars: stars.map(box),
          bodyText: ratio(getComputedStyle(para).color, getComputedStyle(page).backgroundColor),
          purple: purple.filter((c) => {
            const v = (c.match(/\d+/g) || []).slice(0, 3).map(Number)
            return v.length === 3 && v[2] > v[1] + 40 && v[0] > v[1] + 20 && v[2] > 80
          }),
        }
      })
      const tag = `${width} ${scheme}`
      expect(m.overflow <= 0, `${tag}: nothing wider than the screen`, m.overflow)
      expect(m.cardWidth <= 560 && m.cardWidth >= Math.min(560, width - 48), `${tag}: the column is the screen less its margin, 560 at most`, m.cardWidth)
      expect(m.brokenImages.length === 0, `${tag}: every picture loaded`, m.brokenImages)
      expect(m.button && m.button.h >= 44, `${tag}: the button is a comfortable tap`, m.button)
      expect(m.buttonText >= 4.5, `${tag}: the button's words read on it (4.5:1)`, m.buttonText)
      expect(m.buttonOnCard >= 1.6, `${tag}: the button is seen on the card (1.6:1)`, m.buttonOnCard)
      expect(m.bodyText >= 4.5, `${tag}: the body text reads on the card (4.5:1)`, m.bodyText)
      expect(m.purple.length === 0, `${tag}: nothing drawn is purple`, m.purple.slice(0, 3))
      if (width < 480) expect(Math.abs(m.button.w - m.contentWidth) <= 1, `${tag}: on a phone the button spans the card`, [m.button.w, m.contentWidth])
      if (review) {
        expect(m.stars.length === 5 && m.stars.every((s) => s.w >= 40 && s.h >= 40), `${tag}: five stars, each a comfortable tap`, m.stars)
        if (file === "review-request-bare") expect(m.thumb === null && m.tile && m.tile.w >= 48 && m.tile.letter.length === 1, `${tag}: no picture, the letter tile instead`, m.tile)
        else expect(m.thumb && m.thumb.w === 48 && m.thumb.h === 48 && m.thumb.fit === "cover", `${tag}: the product shot 48 square, covered`, m.thumb)
      }
      await p.screenshot({ path: join(shots, `${file}-${width}-${scheme}.png`), fullPage: true })
      await p.close()
    }
  }
}
await browser.close()

console.log(`\n${broken === 0 ? "all good" : `${broken} failed`}. Screenshots in ${shots}`)
process.exit(broken === 0 ? 0 : 1)
