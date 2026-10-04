/**
 * ===========================================================================
 *  MEMBERSHIPS FOLDED INTO THE LIBRARY'S PRODUCTS, MEASURED
 * ===========================================================================
 * Memberships are communities now, so the library has no Memberships pill;
 * a membership bought on its own is a row of Products labelled Membership
 * (components/library/library-memberships.tsx). The real pills and list,
 * drawn by scripts/render-library-memberships.tsx, at 390x844 and 1440x900:
 *
 *   PILLS     Products, Courses, Wishlist, Reviews, Receipts: no Memberships
 *   ROWS      the memberships first, each labelled Membership with its status
 *             line and an Open to /account/library/memberships/<id>; then the
 *             products; the count says "3 products · 2 memberships"
 *   GRID      a membership row lines up with the product rows: the same
 *             picture size and left edge, its Open at the same right edge as
 *             a product's actions; nothing wider than the screen
 *   ONLY      memberships and no products: the rows, never "Nothing bought yet"
 *
 *   PROBE_CSS=source node scripts/check-library-memberships.mjs   (SHOTS_DIR=dir for pictures)
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".library-memberships-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-library-memberships-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/account/library"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-library-memberships.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(stubs, "navigation.js"), "next/link": join(stubs, "link.jsx") },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

async function openPage(vp, hash) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname === "/__probe") return r.respond({ status: 200, contentType: "text/html", body: html })
    return r.respond({ status: 404, body: "" })
  })
  await p.goto(`https://storelib.com/__probe#${hash}`, { waitUntil: "domcontentloaded" })
  await p.waitForFunction(() => document.querySelector("[data-library-home], [data-library-empty]"))
  await p.evaluate(() => document.fonts.ready)
  return { p, errors }
}

for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1440", { width: 1440, height: 900 }],
]) {
  console.log(`\n${label}`)
  {
    const { p, errors } = await openPage(vp, "mixed")
    const m = await p.evaluate(() => {
      const box = (el) => (el ? el.getBoundingClientRect() : null)
      const pills = [...document.querySelectorAll("[data-library-tab]")].map((a) => a.getAttribute("data-library-tab"))
      const items = [...document.querySelectorAll("[data-library-list] > li")].map((li) => (li.hasAttribute("data-library-membership") ? "membership" : "product"))
      const memberships = [...document.querySelectorAll("[data-library-membership]")].map((li) => {
        const open = [...li.querySelectorAll("a")].find((a) => a.textContent.trim() === "Open")
        const thumb = li.querySelector("a[aria-hidden] > div")
        return {
          id: li.getAttribute("data-library-membership"),
          label: li.querySelector("[data-membership-label]")?.textContent?.trim() ?? null,
          href: open?.getAttribute("href") ?? null,
          openH: Math.round(box(open)?.height ?? 0),
          openRight: Math.round(box(open)?.right ?? 0),
          thumbLeft: Math.round(box(thumb)?.left ?? 0),
          thumbW: Math.round(box(thumb)?.width ?? 0),
          status: li.innerText.includes("Renews") || li.innerText.includes("card") || li.innerText.includes("Payment"),
          unread: li.querySelector("[data-unread-count]")?.textContent?.trim() ?? null,
        }
      })
      const product = document.querySelector("[data-library-item]")
      const productThumb = product?.querySelector("a[aria-hidden] > div")
      const actions = product?.querySelector("[data-row-actions]")
      const count = [...document.querySelectorAll("[data-library-home] p[aria-live]")].map((el) => el.textContent.trim())[0]
      return {
        pills,
        items,
        memberships,
        count,
        productThumbLeft: Math.round(box(productThumb)?.left ?? 0),
        productThumbW: Math.round(box(productThumb)?.width ?? 0),
        actionsRight: Math.round(box(actions)?.right ?? 0),
        scroll: document.scrollingElement.scrollWidth,
        width: innerWidth,
      }
    })
    expect(m.pills.join() === "Products,Courses,Wishlist,Reviews,Receipts", "PILLS: no Memberships", m.pills)
    expect(m.items.join() === "membership,membership,product,product,product", "ROWS: the memberships first, then the products", m.items)
    expect(m.memberships.every((r) => r.label === "Membership"), "ROWS: each membership labelled Membership", m.memberships.map((r) => r.label))
    expect(m.memberships.map((r) => r.href).join() === "/account/library/memberships/m1,/account/library/memberships/m2", "ROWS: Open goes to its page", m.memberships.map((r) => r.href))
    expect(m.memberships[0]?.unread === "3 new", "ROWS: unread posts counted", m.memberships[0]?.unread)
    expect(m.count === "3 products · 2 memberships", "ROWS: the count says what the list holds", m.count)
    expect(m.memberships.every((r) => r.thumbLeft === m.productThumbLeft && r.thumbW === m.productThumbW), "GRID: the same picture, at the same left edge, as a product", { memberships: m.memberships.map((r) => [r.thumbLeft, r.thumbW]), product: [m.productThumbLeft, m.productThumbW] })
    expect(m.memberships.every((r) => Math.abs(r.openRight - m.actionsRight) <= 1), "GRID: Open ends where a product's actions end", { open: m.memberships.map((r) => r.openRight), actions: m.actionsRight })
    expect(m.memberships.every((r) => r.openH >= 36), "GRID: Open is the row action's 36px, like a product's Download", m.memberships.map((r) => r.openH))
    expect(m.scroll <= m.width, "FIT: nothing scrolls sideways", { scroll: m.scroll, width: m.width })
    await p.screenshot({ path: join(shots, `${label}-mixed.png`), fullPage: true })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
  {
    const { p, errors } = await openPage(vp, "only")
    const m = await p.evaluate(() => ({
      empty: !!document.querySelector("[data-library-empty]"),
      rows: document.querySelectorAll("[data-library-membership]").length,
      products: document.querySelectorAll("[data-library-item]").length,
      count: document.querySelector("[data-library-home] p[aria-live]")?.textContent?.trim(),
      scroll: document.scrollingElement.scrollWidth,
      width: innerWidth,
    }))
    expect(!m.empty && m.rows === 2 && m.products === 0 && m.count === "2 memberships", "ONLY: memberships and nothing else are listed, not Nothing bought yet", m)
    expect(m.scroll <= m.width, "FIT: nothing scrolls sideways", m)
    await p.screenshot({ path: join(shots, `${label}-only.png`), fullPage: true })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
}

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nscreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
