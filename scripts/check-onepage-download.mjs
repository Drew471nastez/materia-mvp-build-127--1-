/**
 * ===========================================================================
 *  A LEAD MAGNET DOWNLOADS, AND THE CREATOR'S PAGE IS STILL THERE
 * ===========================================================================
 * The real published OnePage (components/onepage/public-onepage.tsx, through
 * scripts/onepage-probe-server.mjs) with an email block that hands over a
 * file. The visitor has given their address already, which is what the
 * stored subscription below says, so the block shows Download.
 *
 * The file is served from a SECOND PORT, which is a second origin, exactly
 * as Supabase storage is in production. An anchor's `download` is ignored
 * there: this was a plain anchor click, so a file the browser could draw
 * replaced the creator's page with itself and the visitor was gone from the
 * page that was meant to sell to them. It then went to a tab of its own,
 * which the owner saw as about:blank and did not want. It takes the one
 * download path now (lib/downloads/download-file): saved where the button
 * is, in a hidden frame, with no tab and no pop-up.
 *
 * At 390x844 and 1440x900, three presses:
 *
 *   ATTACHMENT  what storage answers a `download=` address with. The page's
 *               own address never changes, the page is still drawn, no tab
 *               is opened, and the file is saved under its name.
 *   DRAWABLE    no attachment header, which is the shape that took the page
 *               away. The page stays, no tab opens, and a one line notice
 *               offers the file with an Open link.
 *   POP-UPS OFF a browser that blocks pop-ups. Nothing asks for one, so the
 *               file still saves.
 *
 *   PROBE_CSS=source node scripts/check-onepage-download.mjs
 *   SHOTS=/some/dir  also writes pictures
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* The file, on its own origin. `download=` is answered as an attachment, the
   way storage does; without it the PDF comes back drawable. */
const FILE_NAME = "Colour grading guide.pdf"
const asked = []
const files = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  asked.push({ path: url.pathname, query: url.search })
  if (url.pathname === "/storage/v1/object/public/lead/guide.pdf") {
    const name = url.searchParams.get("download")
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": name === null ? "inline" : `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    })
    return res.end("%PDF-1.4\n%probe\n")
  }
  res.writeHead(404, { "content-type": "text/plain" })
  res.end("no")
})
await new Promise((r) => files.listen(0, "127.0.0.1", r))
const filesBase = `http://127.0.0.1:${files.address().port}`
/* The shape a OnePage stores: a public storage address. The page adds
   `download=<title>` to it before opening anything (public-onepage). */
const FILE_URL = `${filesBase}/storage/v1/object/public/lead/guide.pdf`
/* The same address with the parameter stripped, for the drawable run. */
const DRAWABLE_URL = `${filesBase}/storage/v1/object/lead/guide.pdf`

const BLOCK_ID = "mail"
const blocks = [
  { id: "b1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Shop the prints", url: "https://example.com/shop" } },
  {
    id: BLOCK_ID,
    type: "email_capture",
    enabled: true,
    sort_order: 1,
    data: {
      headline: "Get the guide",
      description: "One file, yours to keep",
      placeholder: "Your email",
      button_text: "Send it",
      success_message: "Sent",
      layout_type: "default",
      animation_type: "none",
      enable_digital_product: true,
      digital_product_file_url: FILE_URL,
      digital_product_title: FILE_NAME,
    },
  },
]

const { base, server } = await serveEditorProbe({ root, blocks, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const VIEWPORTS = [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]

/** The live page, with the visitor already subscribed, so Download is there. */
async function openPage(viewport, url = FILE_URL) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  await page.evaluateOnNewDocument(
    (id, link) => {
      try {
        localStorage.setItem(`onepage_subscribed_op_probe_${id}`, JSON.stringify({ subscribed: true, email: "ines@example.com", downloadLink: link, timestamp: Date.now() }))
      } catch { /* nothing stored, the probe will say so */ }
    },
    BLOCK_ID,
    url,
  )
  await page.goto(`${base}/app/onepage?live`, { waitUntil: "networkidle0" })
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Download"), { timeout: 10000 })
  await wait(200)
  return page
}

const pressDownload = (page) =>
  page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Download")?.click())

/** What is left of the page: its own address, its blocks, its email card. */
const stillThere = (page) =>
  page.evaluate(() => ({
    blocks: document.querySelectorAll("a, button").length,
    headline: document.body.innerText.includes("Get the guide"),
    shop: document.body.innerText.includes("Shop the prints"),
  }))

const settle = async (page) => {
  for (const other of await browser.pages()) if (other !== page) await other.close()
  await page.bringToFront()
  await wait(150)
}

const cdp = await browser.target().createCDPSession()
await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: join(root, ".onepage-downloads"), eventsEnabled: true })

try {
  for (const [label, viewport] of VIEWPORTS) {
    /* ── What storage really answers ──────────────────────────────── */
    console.log(`\nthe file comes back as an attachment at ${label}`)
    {
      const page = await openPage(viewport)
      const said = []
      page.on("console", (m) => { if (m.type() === "error") said.push(m.text()) })
      page.on("pageerror", (e) => said.push(`pageerror: ${e.message}`))
      let began = null
      const onBegin = (e) => { began = e }
      cdp.on("Browser.downloadWillBegin", onBegin)
      const tabs = []
      const onTarget = (t) => { if (t.type() === "page") tabs.push(t.url()) }
      browser.on("targetcreated", onTarget)
      asked.length = 0
      const was = page.url()
      await pressDownload(page)
      await wait(2000)
      browser.off("targetcreated", onTarget)
      cdp.off("Browser.downloadWillBegin", onBegin)

      expect(page.url() === was, `${label}: the creator's page never moved`, `${was} -> ${page.url()}`)
      const alive = await stillThere(page)
      expect(alive.headline && alive.shop && alive.blocks > 1, `${label}: the page is still drawn, blocks and all`, alive)
      expect(tabs.length === 0, `${label}: no tab was opened, not even about:blank`, tabs)
      const got = asked.find((a) => a.path.endsWith("/guide.pdf"))
      expect(!!got && decodeURIComponent(got.query).includes(`download=${FILE_NAME}`), `${label}: the file was asked for with the name storage answers as an attachment`, got)
      expect(!!began && began.suggestedFilename === FILE_NAME, `${label}: it came back as an attachment and was saved, not drawn`, began && { url: began.url, name: began.suggestedFilename })
      expect(said.length === 0, `${label}: nothing in the console`, said.slice(0, 2).join(" | "))
      await settle(page)
      await page.close()
    }

    /* ── The shape that used to take the page away ────────────────── */
    console.log(`\nand when it comes back drawable at ${label}`)
    {
      const page = await openPage(viewport, DRAWABLE_URL)
      const tabs = []
      const onTarget = (t) => { if (t.type() === "page") tabs.push(t.url()) }
      browser.on("targetcreated", onTarget)
      const was = page.url()
      await pressDownload(page)
      await wait(2000)
      browser.off("targetcreated", onTarget)
      expect(page.url() === was, `${label}: a drawable file did not take the page with it`, `${was} -> ${page.url()}`)
      const alive = await stillThere(page)
      expect(alive.headline && alive.shop, `${label}: the page is still there, the PDF did not take its place`, alive)
      expect(tabs.length === 0, `${label}: and no tab was opened for it`, tabs)
      const open = await page.evaluate(() => {
        const box = document.querySelector("[data-download-open]")
        const a = box?.querySelector("a")
        const r = a ? a.getBoundingClientRect() : null
        return box ? { text: box.textContent || "", target: a?.getAttribute("target"), onScreen: !!r && r.height >= 32 && r.bottom <= window.innerHeight && r.right <= window.innerWidth } : null
      })
      expect(!!open && open.target === "_blank" && open.onScreen && open.text.includes(FILE_NAME), `${label}: a notice offers it with an Open link the visitor presses`, open)
      await settle(page)
      await page.close()
    }

    /* ── A browser with pop-ups blocked ───────────────────────────── */
    console.log(`\nwith pop-ups blocked at ${label}`)
    {
      const page = await openPage(viewport)
      await page.evaluate(() => {
        window.__opened = 0
        window.open = () => { window.__opened++; return null }
      })
      let began = null
      const onBegin = (e) => { began = e }
      cdp.on("Browser.downloadWillBegin", onBegin)
      const was = page.url()
      await pressDownload(page)
      await wait(1500)
      cdp.off("Browser.downloadWillBegin", onBegin)
      expect(page.url() === was, `${label}: the page did not move`, `${was} -> ${page.url()}`)
      expect((await page.evaluate(() => window.__opened)) === 0, `${label}: window.open was never called`)
      expect(!!began && began.suggestedFilename === FILE_NAME, `${label}: and the file still saved`, began && began.suggestedFilename)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow <= 0, `${label}: nothing pushed sideways`, `${overflow}px`)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `onepage-download-${label}-popups-off.png`) })
      await settle(page)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
  files.close()
}

console.log(broken ? `\n${broken} failed` : "\nall held")
if (broken) process.exit(1)
