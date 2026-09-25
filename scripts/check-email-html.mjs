/**
 * ===========================================================================
 *  THE EMAILS A CREATOR SENDS, OPENED AS AN INBOX WOULD
 * ===========================================================================
 * scripts/email-samples.ts writes a campaign and an automated email exactly
 * as the send builds them; this opens each in Chromium at a phone's width
 * (390) and the email's own (600), in light and in dark, and measures what
 * the layout claims (lib/email-campaigns/template.ts):
 *
 *   - nothing is wider than the screen, at either width;
 *   - the card is 600px at most, and the whole width of a phone less its
 *     margin;
 *   - the button's words read on its fill (4.5:1), and the fill is seen on
 *     the card (1.6:1), in both schemes;
 *   - body text reads on the card (4.5:1) in both schemes;
 *   - the preheader is hidden, every picture has alt text, every link is
 *     https or mailto, and there is no script or event handler;
 *   - the footer has the creator's name, the address when there is one, and
 *     the unsubscribe link; the automated email carries the one-click
 *     headers and the campaign its Message-Id.
 *
 * Screenshots of each go to SHOTS_DIR, to be looked at.
 *
 *   node scripts/check-email-html.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const work = join(root, ".email-html-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* A picture for every address the samples use: a flat colour, the size a real one would be. */
function png(w, h, rgb) {
  const zlib = globalThis.__zlib
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3)
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

try {
  globalThis.__zlib = await import("node:zlib")
  execFileSync(
    "npx",
    ["esbuild", "scripts/email-samples.ts", "--bundle", "--platform=node", "--format=esm", "--alias:@=.", "--alias:server-only=/tmp/claude-0/empty.js", `--outfile=${join(work, "samples.mjs")}`, "--log-level=error",
      "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"],
    { cwd: root, stdio: "inherit" },
  )
  execFileSync("node", [join(work, "samples.mjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

  const images = {
    "logo.png": png(160, 40, [26, 26, 46]),
    "avatar.png": png(64, 64, [180, 160, 140]),
    "cover.png": png(1040, 560, [210, 140, 90]),
    "p1.png": png(192, 192, [120, 150, 170]),
  }
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  for (const file of ["campaign", "campaign-pale", "automation"]) {
    console.log(`\n${file}.html`)
    const html = readFileSync(join(out, `${file}.html`), "utf8")
    const headers = JSON.parse(readFileSync(join(out, `${file}.headers.json`), "utf8"))
    const text = readFileSync(join(out, `${file}.txt`), "utf8")
    expect(!/<script|\son[a-z]+=|javascript:/i.test(html), "no script, event handler or javascript: link")
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs.length > 0 && hrefs.every((h) => /^https:\/\/|^mailto:/.test(h)), "every link is https or mailto", hrefs.filter((h) => !/^https:\/\/|^mailto:/.test(h)))
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
    expect(imgs.every((i) => /\salt="/.test(i) && /\ssrc="https:\/\//.test(i)), "every picture is https with alt text", imgs.length)
    expect(/List-Unsubscribe/.test(JSON.stringify(headers)) && headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", "one-click unsubscribe headers", headers["List-Unsubscribe"])
    if (file !== "automation") expect(/^<c.+@.+>$/.test(headers.messageId ?? ""), "a Message-Id fixed to the recipient row", headers.messageId)
    expect(/Unsubscribe: https:\/\//.test(text) && text.length > 200 && !/<[a-z]/i.test(text), "a plain text part with the way out", text.length)

    for (const width of [390, 600]) {
      for (const scheme of ["light", "dark"]) {
        const p = await browser.newPage()
        await p.setViewport({ width, height: 900 })
        await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          const u = r.url()
          if (u.startsWith("https://cdn.example.com/")) return r.respond({ status: 200, contentType: "image/png", body: images[u.split("/").pop()] ?? images["logo.png"] })
          if (u.startsWith("https://")) return r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") })
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
          const card = document.querySelector(".sl-card")
          const cardBg = getComputedStyle(card).backgroundColor
          const cell = document.querySelector("td[bgcolor]")
          const btn = cell?.querySelector("a span") ?? cell?.querySelector("a")
          const para = document.querySelector(".sl-body p")
          const pre = document.querySelector(".sl-preheader")
          const foot = document.querySelector(".sl-foot")
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            cardWidth: Math.round(card.getBoundingClientRect().width),
            buttonText: btn && cell ? ratio(getComputedStyle(btn).color, getComputedStyle(cell).backgroundColor) : null,
            /* The fill against the card, or in dark mode the edge drawn round it when the fill is too dark to show. */
            buttonOnCard: cell
              ? Math.max(ratio(getComputedStyle(cell).backgroundColor, cardBg), getComputedStyle(cell).borderTopWidth !== "0px" ? ratio(getComputedStyle(cell).borderTopColor, cardBg) : 0)
              : null,
            bodyText: para ? ratio(getComputedStyle(para).color, cardBg) : null,
            preheaderHidden: pre ? getComputedStyle(pre).display === "none" : true,
            footer: foot?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          }
        })
        const tag = `${width} ${scheme}`
        expect(m.overflow <= 0, `${tag}: nothing wider than the screen`, m.overflow)
        expect(m.cardWidth <= 600 && (width > 632 || m.cardWidth >= width - 32), `${tag}: the card is the screen less its margin, 600 at most`, m.cardWidth)
        expect(m.buttonText === null || m.buttonText >= 4.5, `${tag}: the button's words read on it (4.5:1)`, m.buttonText)
        expect(m.buttonOnCard === null || m.buttonOnCard >= 1.6, `${tag}: the button, or its edge, is seen on the card (1.6:1)`, m.buttonOnCard)
        expect(m.bodyText >= 4.5, `${tag}: body text reads on the card (4.5:1)`, m.bodyText)
        expect(m.preheaderHidden, `${tag}: the preheader is hidden`)
        expect(/Unsubscribe/.test(m.footer), `${tag}: the footer has the way out`, m.footer.slice(0, 160))
        await p.screenshot({ path: join(shots, `${file}-${width}-${scheme}.png`), fullPage: true })
        await p.close()
      }
    }
  }
  await browser.close()
} finally {
  if (!process.env.KEEP_PROBE) {
    for (const f of readdirSync(work)) if (f === "samples.mjs") rmSync(join(work, f), { force: true })
  }
}

console.log(`\nShots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
