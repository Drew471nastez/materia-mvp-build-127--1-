/**
 * ===========================================================================
 *  THE STORE'S LOGO IN EVERY EMAIL, OPENED AS AN INBOX WOULD (round 43)
 * ===========================================================================
 * scripts/email-logo-samples.ts writes a refund (with its credit note), a
 * receipt, an order and a shipping confirmation, a review request and a
 * campaign, each with a 4:1 wordmark and with a square icon; this opens each
 * in Chromium at 390 and 640 wide and measures the logo as drawn:
 *
 *   - its shape is the picture's own (drawn width / height within 2% of the
 *     file's), never cut round (0px corners) and never cropped;
 *   - it fits 200 by 40;
 *   - a wordmark stands alone; a square icon has the store's name beside
 *     it, on the same line.
 *
 * Screenshots go to SHOTS_DIR, to be looked at.
 *
 *   node scripts/check-email-logo.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import zlib from "node:zlib"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const work = process.env.WORK_DIR || join(tmpdir(), "storelib-email-logo-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(work, { recursive: true })
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

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
/* A black wordmark band with pale letters' stand ins at both ends (so a crop shows), and an orange square icon. */
const images = {
  "wordmark.png": { w: 1040, h: 260, body: png(1040, 260, (x, y) => (x < 0.06 || x > 0.94 ? [240, 240, 240] : y > 0.3 && y < 0.7 && Math.floor(x * 20) % 3 === 0 ? [250, 250, 250] : [12, 12, 14])) },
  "icon.png": { w: 400, h: 400, body: png(400, 400, (x, y) => [232 - Math.round(y * 80), 150, 92]) },
}
const imageFor = (url) => {
  let target = url
  try {
    const u = new URL(url)
    if (u.pathname === "/api/email/img") target = u.searchParams.get("u") ?? url
    if (u.pathname === "/_next/image") target = u.searchParams.get("url") ?? url
  } catch {}
  return images[target.split("?")[0].split("/").pop()] ?? null
}

try {
  writeFileSync(join(work, "server-only.js"), "")
  execFileSync(
    "npx",
    ["esbuild", "scripts/email-logo-samples.ts", "--bundle", "--platform=node", "--format=esm", "--alias:@=.", `--alias:server-only=${join(work, "server-only.js")}`, `--outfile=${join(work, "samples.mjs")}`, "--log-level=error",
      "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"],
    { cwd: root, stdio: "inherit" },
  )
  execFileSync("node", [join(work, "samples.mjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })
  const samples = JSON.parse(readFileSync(join(out, "samples.json"), "utf8"))

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  for (const [file, shape] of Object.entries(samples)) {
    console.log(`\n${file}.html (a ${shape === "wide" ? "4:1 wordmark" : "square icon"})`)
    const html = readFileSync(join(out, `${file}.html`), "utf8")
    for (const width of [390, 640]) {
      const p = await browser.newPage()
      await p.setViewport({ width, height: 900, deviceScaleFactor: 2 })
      await p.setRequestInterception(true)
      p.on("request", (r) => {
        const img = imageFor(r.url())
        if (img) return r.respond({ status: 200, contentType: "image/png", body: img.body })
        if (r.url().startsWith("http")) return r.respond({ status: 404, body: "" })
        return r.continue()
      })
      await p.setContent(html, { waitUntil: "load" })
      const m = await p.evaluate(() => {
        const img = document.querySelector("img.e-store-logo, img.sl-logo")
        if (!img) return null
        const r = img.getBoundingClientRect()
        const cs = getComputedStyle(img)
        const row = img.closest("tr")
        const name = row ? [...row.querySelectorAll("td.e-mark")].map((td) => ({ text: td.textContent.trim(), top: Math.round(td.getBoundingClientRect().top), h: Math.round(td.getBoundingClientRect().height) })) : []
        return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top), natural: [img.naturalWidth, img.naturalHeight], radius: cs.borderTopLeftRadius, fit: cs.objectFit, name }
      })
      const tag = `${width}`
      if (!m) {
        expect(false, `${tag}: the logo is drawn`)
        await p.close()
        continue
      }
      const ratio = m.w / m.h
      const own = m.natural[0] / m.natural[1]
      expect(Math.abs(ratio / own - 1) < 0.02, `${tag}: its own shape, ${own.toFixed(2)}:1`, { drawn: [m.w, m.h], ratio: Number(ratio.toFixed(3)) })
      expect(m.w <= 200.5 && m.h <= 40.5 && (m.w >= 199.5 || m.h >= 39.5), `${tag}: as large as fits 200 by 40`, [m.w, m.h])
      expect(m.radius === "0px" && m.fit === "fill", `${tag}: never cut round, never cropped`, [m.radius, m.fit])
      if (shape === "wide") expect(m.name.length === 0, `${tag}: a wordmark alone, no name beside it`, m.name)
      else expect(m.name.length === 1 && m.name[0].text === "loud LIB." && Math.abs(m.name[0].top + m.name[0].h / 2 - (m.top + m.h / 2)) <= 2, `${tag}: a square icon with the name beside it, centred on it`, m.name)
      await p.screenshot({ path: join(shots, `${file}-${width}.png`), clip: { x: 0, y: 0, width, height: 140 } })
      await p.close()
    }
  }
  await browser.close()
} finally {
  if (!process.env.KEEP_PROBE) rmSync(join(work, "samples.mjs"), { force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
