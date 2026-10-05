/**
 * ===========================================================================
 *  THE TICKET EMAILS, OPENED AS AN INBOX WOULD
 * ===========================================================================
 * scripts/event-email-samples.ts writes the five emails a ticket for a paid
 * event can send; this opens each in Chromium at a phone's width (390) and
 * an email's usual one (600), in light and in dark, and measures:
 *
 *   - nothing is wider than the screen, and the card is 600px at most;
 *   - the markup is tables with inline styles: no stylesheet, no script, no
 *     event handler, no web font;
 *   - every link is absolute and on Storelib, and every one is in the plain
 *     text part too;
 *   - the button is at least 44px tall, its words read on it (4.5:1), and on
 *     a phone it spans the card;
 *   - nothing drawn is purple;
 *   - the receipt and the invited seat carry a calendar file that starts
 *     BEGIN:VCALENDAR and holds the event page, never a meeting link;
 *   - an invited seat never says a price was paid, and a cancelled event
 *     says both that it is off and that the money is coming back.
 *
 * Screenshots go to SHOTS_DIR, to be looked at.
 *
 *   node scripts/check-event-emails.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const work = join(root, ".event-email-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const PURPLE = /#(8b5cf6|7c3aed|6d28d9|5b21b6|4c1d95|a78bfa|c4b5fd|ddd6fe|ede9fe|f5f3ff|2f2f4d)/i
const FILES = ["ticket-receipt", "ticket-invited", "ticket-refund", "event-cancelled", "invite-event"]

writeFileSync(join(work, "server-only.js"), "")
execFileSync(
  "pnpm",
  [
    "exec",
    "esbuild",
    "scripts/event-email-samples.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--alias:@=.",
    `--alias:server-only=${join(work, "server-only.js")}`,
    `--outfile=${join(work, "samples.mjs")}`,
    "--log-level=error",
    "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  ],
  { cwd: root, stdio: "inherit" },
)
execFileSync("node", [join(work, "samples.mjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

for (const file of FILES) {
  console.log(`\n${file}`)
  const html = readFileSync(join(out, `${file}.html`), "utf8")
  const text = readFileSync(join(out, `${file}.txt`), "utf8")
  const meta = JSON.parse(readFileSync(join(out, `${file}.json`), "utf8"))

  expect(!/<link\b|<script\b|\son[a-z]+=|javascript:|@import|fonts\.googleapis/i.test(html), "no stylesheet, script, event handler or web font")
  expect((html.match(/<table\b/g) ?? []).length >= 3, "drawn with tables", (html.match(/<table\b/g) ?? []).length)
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))
  expect(hrefs.length > 0 && hrefs.every((h) => h.startsWith("https://storelib.com/")), "every link absolute and on Storelib", hrefs.filter((h) => !h.startsWith("https://storelib.com/")))
  expect(text.trim().length > 120 && hrefs.filter((h) => !h.endsWith("storelib.com/")).every((h) => text.includes(h)), "a plain text part with every address in it", text.length)
  expect(!PURPLE.test(html), "no purple in the markup", (html.match(PURPLE) ?? [])[0])
  expect(meta.subject.length > 8 && meta.subject.length <= 90 && !/—|–/.test(meta.subject + text), "a subject of its own, and no em dashes anywhere", meta.subject)

  if (file === "ticket-receipt" || file === "ticket-invited") {
    const ics = meta.files[0]
    const flat = ics ? ics.text.replace(/\r\n /g, "") : ""
    expect(Boolean(ics) && ics.filename.endsWith(".ics") && flat.startsWith("BEGIN:VCALENDAR"), "the event is attached as a calendar file", ics?.filename)
    expect(flat.includes("URL:https://storelib.com/community/film-loft/events/"), "the file holds the event page")
    expect(!/meet\.|zoom\.|livestream/i.test(flat), "and never a meeting link")
    expect(/DTSTART:20261120T180000Z/.test(flat) && /DTEND:20261120T200000Z/.test(flat), "with the right start and end", flat.split("\r\n").find((l) => l.startsWith("DTSTART")))
  }
  if (file === "ticket-invited") {
    expect(!/You paid/i.test(html + text) && /Sam Petre/.test(text) && /\$25/.test(text), "an invited seat names who gave it, and no price paid")
  }
  if (file === "event-cancelled") {
    expect(/cancelled/i.test(meta.subject) && /\$25/.test(text) && /goes back to the card/.test(text), "off and refunded in one message", meta.subject)
  }
  if (file === "ticket-refund") {
    expect(meta.files.length === 0, "a refund carries no calendar file")
  }
  if (file === "invite-event") {
    expect(hrefs.some((h) => /\/join\?invite=[^&]+&event=[0-9a-f-]{36}&et=[0-9a-f]{32}$/.test(h)), "the invite link carries the event and its signature", hrefs.find((h) => h.includes("/join?")))
    expect(/free ticket/i.test(text), "and says a free ticket is waiting")
  }

  for (const width of [390, 600]) {
    for (const scheme of ["light", "dark"]) {
      const p = await browser.newPage()
      await p.setViewport({ width, height: 900, deviceScaleFactor: 2 })
      await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
      await p.setRequestInterception(true)
      p.on("request", (r) => (r.url().startsWith("http") ? r.respond({ status: 200, contentType: "image/png", body: Buffer.alloc(0) }) : r.continue()))
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
        const card = document.querySelector(".sn-card")
        const pad = document.querySelector(".sn-pad")
        const padStyle = getComputedStyle(pad)
        const cell = document.querySelector(".sn-btn")
        const a = cell ? cell.querySelector("a") : null
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          cardWidth: Math.round(card.getBoundingClientRect().width),
          contentWidth: Math.round(pad.getBoundingClientRect().width - parseFloat(padStyle.paddingLeft) - parseFloat(padStyle.paddingRight)),
          button: a ? { w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) } : null,
          buttonText: a ? ratio(getComputedStyle(a).color, getComputedStyle(cell).backgroundColor) : null,
          bodyText: ratio(padStyle.color, getComputedStyle(card).backgroundColor),
          purple: [...document.querySelectorAll("*")]
            .map((el) => getComputedStyle(el))
            .flatMap((s) => [s.color, s.backgroundColor, s.borderTopColor])
            .filter((c) => {
              const v = (c.match(/\d+/g) || []).slice(0, 3).map(Number)
              return v.length === 3 && v[2] > v[1] + 40 && v[0] > v[1] + 20 && v[2] > 80
            }),
        }
      })
      const tag = `${width} ${scheme}`
      expect(m.overflow <= 0, `${tag}: nothing wider than the screen`, m.overflow)
      expect(m.cardWidth <= 600 && m.cardWidth >= Math.min(600, width - 32), `${tag}: the card is the screen less its margin, 600 at most`, m.cardWidth)
      expect(Boolean(m.button) && m.button.h >= 44, `${tag}: the button is a comfortable tap`, m.button)
      expect(m.buttonText >= 4.5, `${tag}: the button's words read on it (4.5:1)`, m.buttonText)
      expect(m.bodyText >= 4.5, `${tag}: the body text reads on the card (4.5:1)`, m.bodyText)
      expect(m.purple.length === 0, `${tag}: nothing drawn is purple`, m.purple.slice(0, 3))
      if (width < 480) expect(Math.abs(m.button.w - m.contentWidth) <= 1, `${tag}: on a phone the button spans the card`, [m.button.w, m.contentWidth])
      await p.screenshot({ path: join(shots, `${file}-${width}-${scheme}.png`), fullPage: true })
      await p.close()
    }
  }
}

await browser.close()
console.log(`\nScreenshots in ${shots}`)
if (broken) {
  console.log(`${broken} measurement(s) failed`)
  process.exit(1)
}
console.log("every ticket email measured as it should")
