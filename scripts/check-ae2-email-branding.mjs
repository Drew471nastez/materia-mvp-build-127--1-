/**
 * ===========================================================================
 *  A COMMUNITY'S EMAILS AND A STORE'S MEMBERSHIP EMAILS, OPENED AS AN INBOX WOULD
 * ===========================================================================
 * scripts/ae2-email-samples.ts writes a community's welcome, ticket, paid
 * plan and broadcast (with and without its picture and domain) and a store's
 * membership and refund with the owner's words; this opens each in Chromium
 * at a phone's width (390) and an email's usual one (600) and measures:
 *
 *   - nothing is wider than the screen;
 *   - the header is the community's (or the creator's): its name drawn on
 *     top, its picture loaded when it has one (a letter tile when not), and
 *     never Storelib's mark;
 *   - the footer names it ("Sent by ... through Storelib");
 *   - every link is absolute https on the host it should be (the
 *     community's own domain once that is live) or a mailto;
 *   - the button is at least 44px tall;
 *   - no value is left in braces, and nothing reads "undefined";
 *   - the From name is the community's or the creator's, Reply-To theirs.
 *
 * Screenshots go to SHOTS_DIR.
 *
 *   node scripts/check-ae2-email-branding.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import zlib from "node:zlib"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const work = join(root, ".ae2-email-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* A small solid PNG for every picture the emails ask for, so a loaded picture can be told from a broken one. */
function png(w, h, rgb) {
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
const AVATAR = png(72, 72, [214, 88, 52])

writeFileSync(join(work, "server-only.js"), "")
execFileSync(
  "pnpm",
  ["exec", "esbuild", "scripts/ae2-email-samples.ts", "--bundle", "--platform=node", "--format=esm", "--alias:@=.", `--alias:server-only=${join(work, "server-only.js")}`, `--outfile=${join(work, "samples.mjs")}`, "--log-level=error",
    "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"],
  { cwd: root, stdio: "inherit" },
)
execFileSync("node", [join(work, "samples.mjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

const files = readdirSync(out).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")).sort()
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

for (const file of files) {
  console.log(`\n${file}`)
  const html = readFileSync(join(out, `${file}.html`), "utf8")
  const text = readFileSync(join(out, `${file}.txt`), "utf8")
  const meta = JSON.parse(readFileSync(join(out, `${file}.json`), "utf8"))
  const visible = html.replace(/<(style|title)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ")
  expect(!/\{\{|\}\}|\{\s*(community|creator)\s*\}/i.test(`${meta.subject} ${visible} ${text}`), "no value left in braces")
  expect(!/\bundefined\b|\bNaN\b|\[object Object\]/.test(`${meta.subject} ${visible} ${text}`), "nothing reads undefined")
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))
  const want = meta.host
  const onHost = (h) => h.startsWith("mailto:") || h.startsWith(`https://${want}/`) || (want !== "storelib.com" && h.startsWith("https://storelib.com/account/"))
  expect(hrefs.length > 0 && hrefs.every(onHost), `every link absolute and on ${want}`, hrefs.filter((h) => !onHost(h)))
  if (meta.community) {
    expect(meta.fromName === "Makers Club" && meta.replyTo === "team@makers.example", "from the community by name, Reply-To its own address", { fromName: meta.fromName, replyTo: meta.replyTo })
    expect(/Sent by Makers Club through Storelib\./.test(html), "the footer names the community")
  } else {
    expect(/Sent by (Maria Popescu|Bread &amp; Butter) through Storelib\.|Sold by (Maria Popescu|Bread &amp; Butter) through Storelib\./.test(html), "the footer names the seller")
  }

  for (const width of [390, 600]) {
    const p = await browser.newPage()
    await p.setViewport({ width, height: 900, deviceScaleFactor: 2 })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      if (r.url().startsWith("http") && /\.(png|jpe?g)$|\/_next\/image|\/api\/email\/img|\/media\//i.test(r.url())) return r.respond({ status: 200, contentType: "image/png", body: AVATAR })
      if (r.url().startsWith("http")) return r.respond({ status: 404, body: "" })
      return r.continue()
    })
    await p.setContent(html, { waitUntil: "load" })
    const m = await p.evaluate(() => {
      const header = document.querySelector(".e-body tr td table")
      const mark = header?.querySelector(".e-mark")?.textContent?.trim() ?? null
      const pic = header?.querySelector("img.e-store-logo, img.e-avatar")
      const storelibMark = !!document.querySelector("img.e-logo")
      const btn = document.querySelector(".e-btn, td.e-btn")
      const b = btn?.getBoundingClientRect()
      return {
        scroll: document.documentElement.scrollWidth,
        mark,
        picLoaded: pic ? pic.complete && pic.naturalWidth > 0 : null,
        picSize: pic ? Math.round(pic.getBoundingClientRect().height) : null,
        storelibMark,
        button: b ? Math.round(b.height) : null,
        buttonWidth: b ? Math.round(b.width) : null,
      }
    })
    const name = meta.community ? "Makers Club" : null
    expect(m.scroll <= width, `${width}px: nothing wider than the screen`, m.scroll)
    expect(!m.storelibMark && (name ? m.mark === name : !!m.mark), `${width}px: the header is ${name ?? "the seller"}'s, not Storelib's`, m.mark)
    expect(meta.picture ? m.picLoaded === true && m.picSize === 36 : m.picLoaded === null, `${width}px: ${meta.picture ? "its picture is drawn, 36px" : "a letter tile, no broken picture"}`, { loaded: m.picLoaded, size: m.picSize })
    expect(m.button === null || m.button >= 44, `${width}px: the button is at least 44px tall`, m.button)
    console.log(`        ${width}px: page ${m.scroll}px wide, header "${m.mark}", picture ${m.picSize ?? "tile"}, button ${m.button ?? "none"}x${m.buttonWidth ?? ""}`)
    await p.screenshot({ path: join(shots, `${file}-${width}.png`), fullPage: true })
    await p.close()
  }
}

await browser.close()
console.log(`\n${broken === 0 ? "All good" : `${broken} failed`}. Screenshots in ${shots}`)
process.exit(broken === 0 ? 0 : 1)
