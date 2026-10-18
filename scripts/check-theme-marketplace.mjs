/**
 * ===========================================================================
 *  THE THEME CARDS, THE MARKETPLACE AND ITS ADMIN, MEASURED (round Z5)
 * ===========================================================================
 * At 390 and 1280 wide, in Chromium:
 *
 *   LIBRARY (the Website page drawn on the server with ten listings)
 *   • Browse themes holds eight theme cards and the Explore more themes card
 *   • one column on a phone, three on a laptop, equal widths, no overflow
 *   • each picture is 4:3 with rounded corners and no border
 *   • "Theme marketplace" sits at the right end of the heading row, 14px,
 *     opens /themes in a new tab
 *   • every filled control on a phone is 44px or taller
 *
 *   HOVER (the marketplace page mounted live with the same cards)
 *   • under a mouse the full page picture slides up by transform, steadily,
 *     reaching the bottom of the picture, and comes back on leave
 *   • the Preview label goes from hidden to shown
 *   • on a phone a tap on the picture opens the theme's page
 *   • the price filter and the search narrow the grid
 *
 *   SERVER (only with BASE_URL=http://127.0.0.1:3000, a running build)
 *   • /themes and /themes/storelib-default render, the preview frame loads
 *     the theme, and Phone makes the frame 390 wide or less
 *   • /admin/themes with an admin cookie (ADMIN_SECRET, the BLOG_ADMIN_SECRET
 *     that server runs with) draws the list and the form
 *   • SHOT_DEFAULT=1 saves the full page screenshot of Storelib's own theme
 *     as public/themes/storelib-default-full.webp, the card's cover
 *
 *   node scripts/check-theme-marketplace.mjs
 */
import { execFileSync } from "node:child_process"
import { createHmac, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-themes-"))
const BASE = process.env.BASE_URL || ""
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const css = (await appCss(root)) + "\n" + interFaces(root)
const stubs = join(root, ".themes-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) {
  return React.createElement("a", { href: String(href), ...rest }, children)
}
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/website-builder"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast() {} })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)
const aliases = [
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`,
  `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`,
  `--alias:@=${root}`,
]

let browser
try {
  /* ── The tall picture a card pans through: the real one when it exists. ── */
  const real = join(root, "public/themes/storelib-default-full.webp")
  const tallSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="4000" viewBox="0 0 1280 4000"><rect width="1280" height="4000" fill="#fff"/>${Array.from({ length: 10 }, (_, i) => `<rect y="${i * 400}" width="1280" height="200" fill="${i % 2 ? "#e9e3d9" : "#1f2937"}"/><text x="80" y="${i * 400 + 130}" font-size="72" fill="#888">Section ${i + 1}</text>`).join("")}</svg>`

  /* ── Bundles ──────────────────────────────────────────────────────────── */
  const node = join(out, "library-probe.js")
  try {
    execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-theme-library-probe.tsx"), "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${node}`, ...aliases], { stdio: ["ignore", "ignore", "inherit"] })
  } catch {
    fail("The library probe did not bundle. The error above is esbuild's.")
  }
  execFileSync("node", [node], { env: { ...process.env, OUT_DIR: out, COVER: "/cover" }, stdio: ["ignore", "ignore", "inherit"] })
  const library = readFileSync(join(out, "library.html"), "utf8")

  const liveJs = join(out, "live.js")
  try {
    execFileSync(
      "npx",
      ["--no-install", "esbuild", join(root, "scripts/render-theme-cards-live.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${liveJs}`,
        '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
        '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", ...aliases],
      { stdio: ["ignore", "ignore", "inherit"] },
    )
  } catch {
    fail("The live probe did not bundle. The error above is esbuild's.")
  }
  const js = readFileSync(liveJs)

  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>*{box-sizing:border-box}body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style>`
  const server = createServer((req, res) => {
    if (req.url.startsWith("/cover")) {
      if (existsSync(real)) { res.writeHead(200, { "content-type": "image/webp" }); return res.end(readFileSync(real)) }
      res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end(tallSvg)
    }
    if (req.url.startsWith("/live.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    if (req.url.startsWith("/library")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<!doctype html><html><head>${head}</head><body><div data-probe-shell>${library}</div></body></html>`) }
    if (req.url.startsWith("/market")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<!doctype html><html><head>${head}</head><body><div id="root"></div><script>window.__COVER__="/cover"</script><script src="/live.js"></script></body></html>`) }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html><head>${head}</head><body data-landed="${req.url}">theme page</body></html>`)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`

  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const open = async (url, W) => {
    const p = await browser.newPage()
    const phone = W <= 640
    await p.setViewport({ width: W, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
    /* A served page keeps a connection or two open (the header asks who is signed in): load, then a moment. */
    await p.goto(url, { waitUntil: url.startsWith(BASE || "\u0000") ? "load" : "networkidle0", timeout: 60_000 })
    if (BASE && url.startsWith(BASE)) await sleep(1200)
    return p
  }

  /* ── 1. The library ───────────────────────────────────────────────────── */
  for (const W of [390, 1280]) {
    console.log(`\nLibrary, Browse themes, ${W} wide\n`)
    const p = await open(`${origin}/library`, W)
    const m = await p.evaluate((W) => {
      const grid = document.querySelector("[data-theme-grid]")
      const cards = [...grid.querySelectorAll(":scope > [data-theme-card]")]
      const lefts = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)))]
      const widths = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().width)))]
      const frame = grid.querySelector("[data-theme-card-frame]")
      const fr = frame.getBoundingClientRect()
      const fc = getComputedStyle(frame)
      const link = document.querySelector("[data-theme-marketplace-link]")
      const lr = link.getBoundingClientRect()
      const gr = grid.getBoundingClientRect()
      const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent === "Browse themes" && !h.classList.contains("sr-only"))
      const hr = heading.getBoundingClientRect()
      const short = []
      if (W <= 640) {
        for (const el of grid.querySelectorAll("button, a")) {
          const c = getComputedStyle(el)
          const filled = c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent"
          if (!filled && !(parseFloat(c.borderTopWidth) > 0)) continue
          const b = el.getBoundingClientRect()
          if (b.height && b.height < 44) short.push(`${el.textContent.trim().slice(0, 16)} ${Math.round(b.height)}`)
        }
      }
      const scroller = document.querySelector("[data-probe-shell] .page-scroll") || document.documentElement
      return {
        count: cards.length,
        explore: cards.filter((c) => c.getAttribute("data-theme-card") === "explore").length,
        columns: lefts.length,
        widths,
        ratio: +(fr.width / fr.height).toFixed(3),
        radius: fc.borderTopLeftRadius,
        border: fc.borderTopWidth,
        linkText: link.textContent.trim(),
        linkTarget: link.getAttribute("target"),
        linkHref: link.getAttribute("href"),
        linkSize: getComputedStyle(link).fontSize,
        linkRightGap: Math.round(gr.right - lr.right),
        linkMid: Math.round(lr.top + lr.height / 2),
        headingMid: Math.round(hr.top + hr.height / 2),
        short,
        overflow: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
        names: cards.slice(0, 2).map((c) => c.querySelector("h3")?.textContent),
        byline: cards[0].querySelector("p")?.textContent,
      }
    }, W)
    expect(m.count === 9 && m.explore === 1, "eight theme cards and the Explore more themes card", `${m.count} cards, ${m.explore} explore`)
    expect(m.columns === (W <= 640 ? 1 : 3) && m.widths.length === 1, `${W <= 640 ? "one column" : "three columns"} of equal cards`, `${m.columns} columns, widths ${m.widths.join("/")}`)
    expect(Math.abs(m.ratio - 4 / 3) < 0.02 && m.border === "0px" && parseFloat(m.radius) >= 10, "each picture is 4:3, rounded, no border", `ratio ${m.ratio}, radius ${m.radius}, border ${m.border}`)
    expect(m.names[0] === "Storelib Default" && /^by Storelib/.test(m.byline ?? ""), "Storelib's own theme first, with its author", `${m.names.join(", ")} / ${m.byline}`)
    expect(m.linkText === "Theme marketplace" && m.linkTarget === "_blank" && m.linkHref === "/themes" && m.linkSize === "14px", "Theme marketplace, 14px, /themes in a new tab", `${m.linkText} ${m.linkSize} ${m.linkTarget} ${m.linkHref}`)
    expect(m.linkRightGap <= 12 && Math.abs(m.linkMid - m.headingMid) <= 4, "  at the right end of the heading row", `right gap ${m.linkRightGap}px, centre offset ${m.linkMid - m.headingMid}px`)
    if (W <= 640) expect(m.short.length === 0, "every filled control is 44px or taller on a phone", m.short.join(", "))
    expect(m.overflow === 0, "nothing runs off the side", `${m.overflow}px`)
    if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `library-${W}.png`), fullPage: true })
    await p.close()
  }

  /* ── 2. Hover, tap, filters ───────────────────────────────────────────── */
  console.log("\nMarketplace cards, live, 1280 wide\n")
  {
    const p = await open(`${origin}/market`, 1280)
    await p.waitForSelector("[data-theme-card-shot]")
    await p.evaluate(async () => {
      const img = document.querySelector("[data-theme-card-shot]")
      if (!img.complete) await new Promise((r) => img.addEventListener("load", r, { once: true }))
    })
    const frame = await p.$("[data-theme-card-frame]")
    const box = await frame.boundingBox()
    const ty = () => p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector("[data-theme-card-shot]")).transform).m42)
    const label = () => p.evaluate(() => +getComputedStyle(document.querySelector("[data-theme-card-preview]")).opacity)
    const before = await ty()
    const labelBefore = await label()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const samples = []
    for (let i = 0; i < 6; i++) {
      await sleep(300)
      samples.push(Math.round(await ty()))
    }
    const geo = await p.evaluate(() => {
      const f = document.querySelector("[data-theme-card-frame]").getBoundingClientRect()
      const img = document.querySelector("[data-theme-card-shot]")
      return { distance: Math.round(img.offsetHeight - f.height), duration: getComputedStyle(img).transitionDuration, property: getComputedStyle(img).transitionProperty }
    })
    await sleep(Math.max(0, parseFloat(geo.duration) * 1000 - 1800) + 300)
    const end = Math.round(await ty())
    const labelAfter = await label()
    const steady = samples.every((v, i) => i === 0 || v <= samples[i - 1])
    expect(before === 0 && samples[0] < 0 && steady, "under a mouse the picture slides up, steadily", `from ${before}: ${samples.join(", ")}`)
    expect(Math.abs(end + geo.distance) <= 2, "  all the way to the foot of the page", `${end}px of ${-geo.distance}px, over ${geo.duration}`)
    expect(geo.property === "transform", "  by transform, the compositor's work", geo.property)
    const hoverable = await p.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    const hovered = await p.evaluate(() => document.querySelector("[data-theme-card]").matches(":hover"))
    expect(labelBefore === 0 && labelAfter === 1, "the Preview label shows on hover", `${labelBefore} then ${labelAfter} (pointer media ${hoverable}, :hover ${hovered})`)
    await p.mouse.move(5, 5)
    await sleep(1100)
    expect(Math.round(await ty()) === 0, "and leaving brings it back to the top", `${Math.round(await ty())}`)

    const all = await p.$$eval("[data-theme-grid] > [data-theme-card]", (c) => c.length)
    await p.click('[role="radio"][aria-checked="false"]:nth-child(3)')
    await sleep(100)
    const paid = await p.$$eval("[data-theme-grid] > [data-theme-card]", (c) => c.map((x) => x.querySelector("p").textContent))
    expect(all === 10 && paid.length === 2 && paid.every((t) => /\$49/.test(t)), "Paid leaves the two paid themes", `${all} then ${paid.length}: ${paid.join(" | ")}`)
    await p.click('[role="radio"]:nth-child(1)')
    await p.type('input[type="search"]', "noir")
    await sleep(100)
    const found = await p.$$eval("[data-theme-grid] > [data-theme-card] h3", (h) => h.map((x) => x.textContent))
    expect(found.length === 1 && found[0] === "Studio Noir", "search narrows by name", found.join(", "))
    const url = await p.evaluate(() => location.search)
    expect(url === "?q=noir", "  and the address keeps it", url)
    await p.close()
  }
  console.log("\nMarketplace cards, live, 390 wide, touch\n")
  {
    const p = await open(`${origin}/market`, 390)
    const cols = await p.$$eval("[data-theme-grid] > [data-theme-card]", (c) => new Set(c.map((x) => Math.round(x.getBoundingClientRect().left))).size)
    expect(cols === 1, "one column on a phone", `${cols}`)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow === 0, "nothing runs off the side", `${overflow}px`)
    await p.tap("[data-theme-card-frame]")
    await p.waitForSelector("body[data-landed]", { timeout: 5000 }).catch(() => {})
    const landed = await p.evaluate(() => document.body.getAttribute("data-landed"))
    expect(landed === "/themes/storelib-default", "a tap on the picture opens the theme's page", landed ?? "stayed")
    await p.close()
  }

  /* ── 3. A running server ─────────────────────────────────────────────── */
  if (BASE) {
    console.log(`\nServer pages at ${BASE}\n`)
    if (process.env.SHOT_DEFAULT) {
      const p = await open(`${BASE}/theme-preview/storelib-default`, 1280)
      await sleep(800)
      const banner = await p.evaluate(() => !!document.querySelector("[data-cookie-banner]"))
      expect(!banner, "the preview asks nothing about cookies")
      const h = await p.evaluate(() => document.documentElement.scrollHeight)
      const png = join(out, "default.png")
      await p.screenshot({ path: png, fullPage: true })
      const sharp = (await import("sharp")).default
      mkdirSync(join(root, "public/themes"), { recursive: true })
      const info = await sharp(png).resize({ width: 800 }).webp({ quality: 78 }).toFile(real)
      expect(h > 1600 && info.size < 400_000, "Storelib's own theme, photographed whole for its card", `${h}px tall, ${Math.round(info.size / 1024)} KB webp at ${info.width}x${info.height}`)
      await p.close()
    }
    for (const W of [390, 1280]) {
      const p = await open(`${BASE}/themes`, W)
      const m = await p.evaluate(() => ({ cards: document.querySelectorAll("[data-theme-grid] > [data-theme-card]").length, h1: document.querySelector("h1")?.textContent, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
      expect(m.cards >= 1 && m.h1 === "Themes" && m.overflow === 0, `/themes at ${W}: the grid, no overflow`, `${m.cards} cards, overflow ${m.overflow}`)
      await p.close()
      const d = await open(`${BASE}/themes/storelib-default`, W)
      await d.waitForSelector("iframe")
      await sleep(1500)
      const frame = d.frames().find((f) => f.url().includes("/theme-preview/"))
      const drawn = frame ? await frame.evaluate(() => !!document.querySelector("[data-theme-preview]")).catch(() => false) : false
      const desk = await d.$eval("[data-theme-frame]", (e) => Math.round(e.getBoundingClientRect().width))
      await d.click('[role="radio"]:nth-child(2)')
      await sleep(450)
      const phone = await d.$eval("[data-theme-frame]", (e) => Math.round(e.getBoundingClientRect().width))
      const add = await d.$eval("[data-theme-add]", (e) => ({ text: e.textContent, h: Math.round(e.getBoundingClientRect().height) }))
      expect(drawn, `/themes/storelib-default at ${W}: the live preview draws the theme in its frame`)
      expect(phone <= 390 && (W > 640 ? desk > 900 : true), "  Phone makes the frame a phone's width", `desktop ${desk}px, phone ${phone}px`)
      expect(add.text === "Add to my library" && add.h >= 44, "  Add to my library, 44px", `${add.text} ${add.h}px`)
      if (process.env.SHOTS) await d.screenshot({ path: join(process.env.SHOTS, `detail-${W}.png`) })
      await d.close()
    }
    if (process.env.ADMIN_SECRET) {
      const issued = Date.now().toString(36)
      const nonce = randomBytes(9).toString("hex")
      const token = `v2.${issued}.${nonce}.${createHmac("sha256", process.env.ADMIN_SECRET).update(`blog-admin.${issued}.${nonce}`).digest("hex")}`
      for (const W of [390, 1280]) {
        const p = await browser.newPage()
        await p.setViewport({ width: W, height: 900, isMobile: W <= 640, hasTouch: W <= 640 })
        const host = new URL(BASE).hostname
        await p.setCookie({ name: "blog_admin", value: token, domain: host, path: "/" })
        await p.goto(`${BASE}/admin/themes`, { waitUntil: "load", timeout: 60_000 })
        await sleep(1500)
        const listed = await p.$$eval("[data-admin-theme-row]", (r) => r.length).catch(() => 0)
        const newBtn = await p.$$("button")
        for (const b of newBtn) if ((await b.evaluate((e) => e.textContent)) === "New theme") { await b.click(); break }
        await sleep(300)
        const form = await p.evaluate(() => {
          const f = document.querySelector("[data-admin-theme-form]")
          if (!f) return null
          return { inputs: f.querySelectorAll("input, select").length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, labels: [...f.querySelectorAll("label")].map((l) => l.firstChild?.textContent?.trim()).filter(Boolean) }
        })
        expect(listed >= 0 && !!form && form.inputs >= 7 && form.overflow === 0, `/admin/themes at ${W}: the list and the form`, form ? `${listed} listed, ${form.inputs} fields (${form.labels.join(", ")}), overflow ${form.overflow}` : "no form")
        if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `admin-${W}.png`), fullPage: true })
        await p.close()
      }
    }
  }

  server.close()
} finally {
  if (browser) await browser.close()
  rmSync(stubs, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
