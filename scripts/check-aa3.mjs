/**
 * ===========================================================================
 *  AA3, MEASURED: A GUEST'S OWNED PRODUCT PAGE AND WHAT FILES SAYS
 * ===========================================================================
 * The markup scripts/render-aa3.tsx writes (the real website product block
 * and the real imported theme notice, for a guest who bought in this
 * browser; the sentence Files says when a picture stays), in Chromium at a
 * phone (390x844) and a computer (1280x900):
 *
 *   BUILT     "You already own this." and one full width button to that
 *             order's receipt (/api/receipt/open?order=...), in place of Add
 *             to cart and Buy now; the button 52px tall, the column's width
 *   THEME     the notice at the foot of the screen: inside the screen with
 *             16px or more each side, 440px at most, its button 36px
 *   FILES     "Removed from Files. Still used by 3 products, so the picture
 *             stays." in a toast's width (Sonner's 356px, less 32px on a
 *             phone): at most three lines
 *   ORDERS    the Orders list's money is measured by scripts/check-orders27.mjs
 *             (MONEY_ONLY=1 for just that part)
 *
 *   node scripts/check-aa3.mjs
 */
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const parts = JSON.parse(execFileSync("npx", ["tsx", "scripts/render-aa3.tsx"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 24 }))
const css = await appCss(root)
const page = (body) => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body>${body}</body></html>`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

for (const [name, vp] of [["phone", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desk", { width: 1280, height: 900 }]]) {
  console.log(`\n${name} ${vp.width}x${vp.height}`)
  const p = await browser.newPage()
  await p.setViewport(vp)
  /* The product column: 16px gutters on a phone, the product page's 480px buy column on a computer. */
  const column = name === "phone" ? "padding:0 16px" : "width:480px;margin:0 auto"
  await p.setContent(page(`<main style="${column};padding-top:24px"><div data-col>${parts.built}</div></main>${parts.theme}<div data-toast style="width:min(356px,calc(100vw - 32px));box-sizing:border-box;padding:16px;font-size:13px;line-height:1.4;position:absolute;left:16px;top:400px">${parts.files}</div>`), { waitUntil: "load" })
  const m = await p.evaluate(() => {
    const col = document.querySelector("[data-col]").getBoundingClientRect()
    const a = document.querySelector("[data-owned-downloads]")
    const r = a.getBoundingClientRect()
    const note = document.querySelector("#sl-owned").getBoundingClientRect()
    const btn = document.querySelector("#sl-owned a").getBoundingClientRect()
    const toast = document.querySelector("[data-toast]")
    const lh = parseFloat(getComputedStyle(toast).lineHeight)
    return {
      built: { href: a.getAttribute("href"), h: Math.round(r.height), w: Math.round(r.width), colW: Math.round(col.width), text: a.innerText, said: document.querySelector("[data-owned] p").innerText, buy: !!document.querySelector("[data-buy-buttons] button") },
      theme: { left: Math.round(note.left), right: Math.round(innerWidth - note.right), w: Math.round(note.width), bottom: Math.round(innerHeight - note.bottom), btnH: Math.round(btn.height), href: document.querySelector("#sl-owned a").getAttribute("href") },
      files: { lines: Math.round((toast.getBoundingClientRect().height - 32) / lh), text: toast.innerText },
      sideways: document.documentElement.scrollWidth - innerWidth,
    }
  })
  expect(m.built.said === "You already own this." && !m.built.buy, "built website: says it is owned, and offers no Add to cart or Buy now", m.built.said)
  expect(/^\/api\/receipt\/open\?order=[0-9a-f-]{36}$/.test(m.built.href) && m.built.text === "Go to your downloads", "  the one button goes to that order's receipt through the cookie", m.built.href)
  expect(m.built.h === 52 && m.built.w === m.built.colW, "  52px tall and the column's full width", { h: m.built.h, w: m.built.w, col: m.built.colW })
  expect(m.theme.left >= 16 && m.theme.right >= 16 && m.theme.w <= 440 && m.theme.bottom >= 16, "imported theme: the notice sits inside the screen, 16px or more from each edge, 440px at most", m.theme)
  expect(m.theme.btnH === 36 && /^\/api\/receipt\/open\?order=/.test(m.theme.href), "  its button 36px, to the receipt", { h: m.theme.btnH, href: m.theme.href })
  expect(m.files.text === "Removed from Files. Still used by 3 products, so the picture stays." && m.files.lines <= 3, "Files: the sentence, in a toast's width, at most three lines", m.files)
  expect(m.sideways <= 0, "nothing runs off the side", m.sideways)
  await p.close()
}

await browser.close()
console.log(`\n${broken === 0 ? "all good" : `${broken} failed`}`)
process.exit(broken ? 1 : 0)
