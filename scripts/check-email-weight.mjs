/**
 * ===========================================================================
 *  WHAT AN INBOX DOWNLOADS, AND WHAT IT SHOWS
 * ===========================================================================
 * scripts/email-weight-samples.ts writes the receipt, the seller's sale
 * email, a broadcast, and the two contact emails, drawn by the send's own
 * functions with real pictures from Storelib's storage. This weighs each:
 *
 *   - the HTML, against Gmail's 102 KB clipping line (kept under 60 KB here)
 *   - every picture, fetched from where the email points, twice: as Outlook
 *     on Windows asks ("Accept: *\/*", no WebP) and as a browser based
 *     client asks (WebP allowed). The Outlook answer must be JPEG, PNG or
 *     GIF, never WebP, AVIF or SVG, and no picture may be a data: address
 *   - every picture says its size, has alt, sets its border and is https
 *   - the document says its doctype, language and charset, has a preheader
 *     when it is a creator's or Storelib's designed email, and a marketing
 *     email carries the one-click unsubscribe headers while a receipt does not
 *
 * Then photographs each at 390 and 640 wide in Chromium, the pictures served
 * as Outlook would get them. With BEFORE_DIR set (a folder the samples were
 * written to from an older build), the older emails are weighed and
 * photographed the same way and each pair is compared pixel by pixel.
 *
 *   node scripts/check-email-weight.mjs
 *   BEFORE_DIR=<dir> SHOTS_DIR=<dir> node scripts/check-email-weight.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const work = join(root, ".email-weight-probe")
const out = process.env.OUT_DIR || join(work, "out")
const shots = process.env.SHOTS_DIR || join(work, "shots")
const before = process.env.BEFORE_DIR || null
mkdirSync(work, { recursive: true })
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const OUTLOOK = "image/png, image/svg+xml, image/*;q=0.8, */*;q=0.5"
const BROWSER = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"

/** One picture, as a client asking with this Accept gets it. Cached per run. */
const fetched = new Map()
function fetchImage(url, accept) {
  const key = `${accept}|${url}`
  if (fetched.has(key)) return fetched.get(key)
  const file = join(work, `img-${fetched.size}.bin`)
  let result = { status: 0, type: "", bytes: 0, body: Buffer.alloc(0) }
  /* Three tries: the proxy in front of this machine drops a connection now and then. */
  for (let attempt = 0; attempt < 3 && result.status !== 200; attempt++) {
    try {
      const meta = execFileSync("curl", ["-sS", "-L", "--retry", "2", "--max-time", "60", "-H", `Accept: ${accept}`, "-o", file, "-w", "%{http_code} %{content_type}", url], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      const [code, type] = meta.trim().split(" ")
      const body = readFileSync(file)
      result = { status: Number(code), type: (type || "").split(";")[0], bytes: body.length, body }
    } catch {
      /* tried again below */
    }
  }
  fetched.set(key, result)
  return result
}

function imagesOf(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => {
    const tag = m[0]
    const attr = (name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? null
    const src = (attr("src") || "").replace(/&amp;/g, "&")
    return { tag, src, width: attr("width"), height: attr("height"), alt: attr("alt"), style: attr("style") || "" }
  })
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

/** Weighs one folder of samples; returns a row per email. */
function weigh(dir, label) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))
  const rows = []
  console.log(`\n${label}: ${dir}`)
  for (const email of manifest) {
    const html = readFileSync(join(dir, `${email.name}.html`), "utf8")
    const text = existsSync(join(dir, `${email.name}.txt`)) ? readFileSync(join(dir, `${email.name}.txt`), "utf8") : ""
    const imgs = imagesOf(html).filter((i) => !/\/api\/(email|automations)\/(track|t\/o)/.test(i.src))
    let outlook = 0
    let browser = 0
    let original = 0
    const pictures = []
    for (const img of imgs) {
      const o = fetchImage(img.src, OUTLOOK)
      const b = fetchImage(img.src, BROWSER)
      /* The stored file the address was made from, for "what it would cost unsized". */
      const inner = (() => {
        try {
          const u = new URL(img.src)
          if (u.pathname === "/api/email/img") return u.searchParams.get("u")
          return u.pathname === "/_next/image" ? u.searchParams.get("url") : img.src
        } catch {
          return img.src
        }
      })()
      const orig = inner ? fetchImage(inner.startsWith("/") ? `https://storelib.com${inner}` : inner, OUTLOOK) : { bytes: 0, type: "" }
      outlook += o.bytes
      browser += b.bytes
      original += orig.bytes
      pictures.push({ src: img.src, drawn: `${img.width ?? "?"}x${img.height ?? "auto"}`, outlook: `${o.type} ${o.bytes}`, browser: `${b.type} ${b.bytes}`, stored: `${orig.type} ${orig.bytes}`, tag: img })
    }
    rows.push({ name: email.name, kind: email.kind, html: Buffer.byteLength(html), text: Buffer.byteLength(text), images: imgs.length, outlook, browser, original, pictures, headers: email.headers, doc: html })
  }
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(13)} html ${kb(r.html).padStart(9)}  text ${kb(r.text).padStart(7)}  ${String(r.images).padStart(2)} pictures: Outlook ${kb(r.outlook).padStart(9)}  WebP client ${kb(r.browser).padStart(9)}  stored files ${kb(r.original).padStart(10)}`)
    for (const p of r.pictures) console.log(`      ${p.drawn.padEnd(9)} outlook ${p.outlook.padEnd(18)} webp-client ${p.browser.padEnd(18)} stored ${p.stored}`)
  }
  return rows
}

function checks(rows) {
  console.log("\nchecks on the emails as they are now")
  for (const r of rows) {
    const t = r.name
    expect(r.html < 60 * 1024, `${t}: HTML well under Gmail's 102 KB clipping line`, kb(r.html))
    expect(/^\s*<!doctype html>/i.test(r.doc), `${t}: starts with a doctype`)
    expect(/<html[^>]*\blang="[a-z-]+"/i.test(r.doc), `${t}: says its language`)
    expect(/<meta[^>]+charset/i.test(r.doc), `${t}: says its charset`)
    expect(r.text > 40, `${t}: has a plain text part`, r.text)
    expect(!/src="data:/i.test(r.doc), `${t}: no picture inlined as data:`)
    expect(!/\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly)\//i.test(r.doc), `${t}: no link shorteners`)
    expect(!/<script|\son[a-z]+=/i.test(r.doc), `${t}: no script or event handler`)
    const tables = [...r.doc.matchAll(/<table\b[^>]*>/gi)].map((m) => m[0])
    expect(tables.every((tag) => /role="presentation"/.test(tag)), `${t}: every layout table is role=presentation`, tables.filter((tag) => !/role="presentation"/.test(tag)).length)
    if (r.kind === "marketing") {
      expect(/^<https:\/\/.+>$/.test(r.headers["List-Unsubscribe"] || ""), `${t}: marketing email carries List-Unsubscribe`)
      expect(r.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click", `${t}: and List-Unsubscribe-Post One-Click`)
    }
    if (t === "receipt") expect(!r.headers["List-Unsubscribe"], `${t}: a receipt carries no List-Unsubscribe`)
    for (const p of r.pictures) {
      const short = p.src.replace(/^https:\/\/[^/]+/, "").slice(0, 60)
      expect(/^https:\/\//.test(p.src), `${t}: picture is https ${short}`)
      expect(!!p.tag.width || /height:\d+px/.test(p.tag.style), `${t}: picture says its size ${short}`, p.drawn)
      expect(p.tag.alt !== null, `${t}: picture has alt ${short}`)
      /* border:0, or a border the design draws on purpose (the receipt's hairline round a thumbnail): never the old clients' blue link border. */
      expect(/border:(0|1px solid)/.test(p.tag.style), `${t}: picture sets its border ${short}`)
      expect(/^image\/(jpeg|png|gif)$/.test(p.outlook.split(" ")[0]), `${t}: Outlook gets JPEG, PNG or GIF ${short}`, p.outlook)
    }
  }
}

async function shoot(browser, dir, label, names) {
  const files = {}
  for (const name of names) {
    const html = readFileSync(join(dir, `${name}.html`), "utf8")
    for (const width of [390, 640]) {
      const page = await browser.newPage()
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
      await page.setRequestInterception(true)
      page.on("request", (req) => {
        const url = req.url()
        if (url.startsWith("data:") || url === "about:blank") return req.continue()
        const hit = fetched.get(`${OUTLOOK}|${url}`)
        if (hit && hit.status === 200) return req.respond({ status: 200, contentType: hit.type, body: hit.body })
        return req.abort()
      })
      await page.setContent(html, { waitUntil: "load" })
      await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))))
      const file = join(shots, `${label}-${name}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      files[`${name}-${width}`] = file
      await page.close()
    }
  }
  return files
}

/** How many pixels differ between two screenshots, and whether their sizes match. */
async function compare(browser, a, b) {
  const page = await browser.newPage()
  const result = await page.evaluate(
    async (x, y) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src })
      const [p, q] = await Promise.all([load(x), load(y)])
      const w = Math.max(p.width, q.width)
      const h = Math.max(p.height, q.height)
      const draw = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data }
      const d1 = draw(p)
      const d2 = draw(q)
      let diff = 0
      for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 48) diff++
      return { a: `${p.width}x${p.height}`, b: `${q.width}x${q.height}`, diff, share: diff / (w * h) }
    },
    `data:image/png;base64,${readFileSync(a).toString("base64")}`,
    `data:image/png;base64,${readFileSync(b).toString("base64")}`,
  )
  await page.close()
  return result
}

try {
  writeFileSync(join(work, "server-only.js"), "")
  execFileSync("npx", ["esbuild", "scripts/email-weight-samples.ts", "--bundle", "--platform=node", "--format=cjs", "--alias:@=.", `--alias:server-only=${join(work, "server-only.js")}`, `--outfile=${join(work, "samples.cjs")}`, "--log-level=error"], { stdio: "inherit" })
  execFileSync("node", [join(work, "samples.cjs")], { stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

  const earlier = before ? weigh(before, "before") : null
  const now = weigh(out, "after")
  checks(now)

  const report = { after: now.map(({ doc, pictures, ...r }) => ({ ...r, pictures: pictures.map(({ tag, ...p }) => p) })) }
  if (earlier) report.before = earlier.map(({ doc, pictures, ...r }) => ({ ...r, pictures: pictures.map(({ tag, ...p }) => p) }))

  if (existsSync(CHROMIUM)) {
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
    try {
      const names = now.map((r) => r.name)
      const afterShots = await shoot(browser, out, "after", names)
      if (earlier) {
        const beforeShots = await shoot(browser, before, "before", earlier.map((r) => r.name))
        console.log("\nbefore and after, pixel by pixel (pictures served as Outlook gets them)")
        report.diff = {}
        for (const key of Object.keys(afterShots)) {
          if (!beforeShots[key]) continue
          const d = await compare(browser, beforeShots[key], afterShots[key])
          report.diff[key] = d
          console.log(`  ${key.padEnd(20)} before ${d.a.padEnd(9)} after ${d.b.padEnd(9)} ${d.diff} pixels differ (${(d.share * 100).toFixed(2)}%)`)
        }
      }
      console.log(`\nscreenshots in ${shots}`)
    } finally {
      await browser.close()
    }
  } else {
    console.log(`\nNo browser at ${CHROMIUM}; weighed only.`)
  }
  writeFileSync(join(work, "report.json"), JSON.stringify(report, null, 2))
} catch (e) {
  console.error(e)
  broken++
}

/* The fetched pictures go; the report and the samples stay for a look. */
for (const f of existsSync(work) ? readdirSync(work) : []) if (/^img-\d+\.bin$|^samples\.cjs$|^server-only\.js$/.test(f)) rmSync(join(work, f), { force: true })

console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
