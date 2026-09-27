/**
 * ===========================================================================
 *  DELETE, FROM THE EDITOR'S MORE MENU AND FROM THE LIST, MEASURED
 * ===========================================================================
 * "I tried to delete that product and it didn't delete it."
 *
 * The real Products list and product editor (scripts/render-product-editor.tsx
 * in its `?route` mode: a router of two addresses, the list drawn from the
 * same array every time it mounts, which is what the router's kept copy of
 * the list is). The delete route is answered by the probe: refused, deleted,
 * or archived because the product has sales.
 *
 *   THE EDITOR (390 and 1280). The more button opens the menu (a sheet on a
 *   phone); Delete is its last row, red, 44px or more on a phone. It asks
 *   first. Refused: the editor stays, says why, and the page still takes
 *   presses. Deleted: back to Products, where the product is not drawn even
 *   though the list was drawn from the copy from before the delete, the
 *   router's kept pages are dropped (a refresh), and "Product deleted" is
 *   shown. Archived: back to Products, not in All, with the line why.
 *   THE LIST (390 and 1280). A row's menu, Delete, the question; refused, the
 *   question stays open and says why; deleted, the row goes, a refresh.
 *
 * Screenshots: delete-*.png in SHOTS_DIR.
 *
 *   PROBE_CSS=source node scripts/check-product-delete.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".product-delete-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-delete-")), "shots")
mkdirSync(shots, { recursive: true })

const PRODUCT = "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6"
const SALES_LINE = "It has sales, so it was archived instead"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => { log("push", h); if (window.__navigate) window.__navigate(h, "push") }, replace: (h) => { log("replace", h); if (window.__navigate) window.__navigate(h, "replace") }, prefetch: (h, o) => log("prefetch", h + (o && o.kind ? " " + o.kind : "")), back: () => { log("back"); if (window.__back) window.__back() }, refresh: () => log("refresh") }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-product-editor.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": "./.product-delete-probe/navigation.js",
      "next/link": "./.product-delete-probe/link.jsx",
      "next/image": "./.product-delete-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [{
      name: "server-action-stub",
      setup(b) {
        b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
      },
    }],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const desk = { width: 1280, height: 800 }

  /** A page at `path`, with the delete route answered by `ctx.answer`. */
  async function open(path, vp) {
    const p = await browser.newPage()
    const ctx = { answer: null, deletes: [], errors: [] }
    p.on("pageerror", (e) => ctx.errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u === "http://probe.test/api/products/delete") {
        ctx.deletes.push(JSON.parse(r.postData() || "{}"))
        const a = ctx.answer || { status: 500, body: { ok: false, error: "No answer set" } }
        return setTimeout(() => r.respond({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body) }).catch(() => {}), 250)
      }
      if (u.startsWith("http://probe.test/api/")) return r.abort()
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      r.abort()
    })
    await p.setViewport(vp)
    await p.goto(`http://probe.test${path}?route`)
    await sleep(900)
    return { p, ctx }
  }

  const routerLog = (p) => p.evaluate(() => (window.__router || []).map(([k, a]) => (a ? `${k} ${a}` : k)))
  const pathNow = (p) => p.evaluate(() => location.pathname)
  /* The open sheet or dropdown's rows, with their sizes. */
  const menuRows = (p) => p.evaluate(() => {
    const surface = document.querySelector('[data-app-sheet="open"] [data-action-sheet]') || document.querySelector("[data-action-list]")
    if (!surface) return null
    return [...surface.querySelectorAll("button, [role=menuitem], a")]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { text: el.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), color: getComputedStyle(el).color }
      })
  })
  const pressMenuRow = (p, text) => p.evaluate((text) => {
    const surface = document.querySelector('[data-app-sheet="open"] [data-action-sheet]') || document.querySelector("[data-action-list]")
    const row = [...(surface?.querySelectorAll("button, [role=menuitem]") ?? [])].find((el) => el.textContent.trim() === text)
    if (!row) return false
    row.click()
    return true
  }, text)
  const confirmShape = (p) => p.evaluate(() => {
    const s = [...document.querySelectorAll("[data-confirm-sheet]")].find((el) => getComputedStyle(el).visibility !== "hidden" && (!el.closest("[data-app-sheet]") || el.closest("[data-app-sheet]").dataset.appSheet === "open"))
    if (!s) return null
    const panel = s.closest("[data-sheet-panel]") || s
    return {
      surface: s.dataset.surface,
      title: (panel.querySelector("h2") || s.querySelector("h2"))?.textContent,
      body: (panel.querySelector("p") || s.querySelector("p"))?.textContent,
      btns: [...s.querySelectorAll("button")].map((b) => ({ text: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })),
    }
  })
  /* The notice at the top of the screen: the editor's and the list's are both fixed there, over everything. */
  const toastText = (p) => p.evaluate(() => [...document.querySelectorAll(".fixed.z-\\[100\\]")].filter((e) => !e.querySelector("[role=alertdialog]")).map((e) => e.textContent.trim()).filter(Boolean).join(" | "))
  /* A real press (pointer down and up), which a dropdown opens on; the first of `sel` that is on the screen. */
  const pressFirst = async (p, sel) => {
    const handles = await p.$$(sel)
    for (const h of handles) {
      if (await h.evaluate((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0)) {
        await h.click()
        return true
      }
    }
    return false
  }
  const takesPresses = (p) => p.evaluate(() => getComputedStyle(document.body).pointerEvents !== "none")

  for (const [label, vp] of [["390", phone], ["1280", desk]]) {
    const isPhone = vp.width < 640
    const MORE = vp.width >= 1024 ? "[data-editor-head] button[aria-label='More actions']" : "[data-editor-bar] button[aria-label='More actions']"
    console.log(`\n${label}: the editor's more menu`)
    const { p, ctx } = await open(`/app/products/${PRODUCT}`, vp)

    await p.click(MORE)
    await sleep(700)
    const rows = await menuRows(p)
    const del = rows?.find((r) => r.text === "Delete")
    await p.screenshot({ path: join(shots, `delete-${label}-menu.png`) })
    expect(!!del && rows[rows.length - 1].text === "Delete", "Delete is in the more menu, last", rows?.map((r) => r.text))
    expect(del?.color === "rgb(196, 41, 12)", "in the list's red", del?.color)
    if (isPhone) expect((del?.h ?? 0) >= 44 && (del?.w ?? 0) >= 300, "a full width row of 44px or more on a phone", del)

    await pressMenuRow(p, "Delete")
    await sleep(isPhone ? 800 : 450)
    const q = await confirmShape(p)
    await p.screenshot({ path: join(shots, `delete-${label}-confirm.png`) })
    expect(!!q && /^Delete Portrait retouching presets/.test(q.title ?? "") && /Its sales stay in Orders/.test(q.body ?? ""), "it asks first, naming the product", q && { title: q.title, body: q.body })
    expect(!!q && q.btns.map((b) => b.text).join() === "Cancel,Delete", "Cancel and Delete", q?.btns)
    if (isPhone) expect(!!q && q.surface === "sheet" && q.btns.every((b) => b.h === 48), "a sheet on a phone, 48px buttons", q)
    else expect(!!q && q.surface === "modal", "a modal on a computer", q?.surface)

    /* Refused. */
    ctx.answer = { status: 409, body: { ok: false, error: "Could not delete the product" } }
    const before = (await routerLog(p)).length
    await p.evaluate(() => [...document.querySelectorAll("[data-confirm]")].find((b) => b.getBoundingClientRect().height > 0)?.click())
    await sleep(900)
    const refusedToast = await toastText(p)
    const movedOnRefusal = (await routerLog(p)).slice(before).filter((e) => /^(replace|back|push)/.test(e))
    await p.screenshot({ path: join(shots, `delete-${label}-refused.png`) })
    expect(ctx.deletes.length === 1 && ctx.deletes[0].productId === PRODUCT, "one request to the delete route, with the product's id", ctx.deletes)
    expect(/Could not delete the product/.test(refusedToast), "refused: the editor says so", refusedToast)
    expect(movedOnRefusal.length === 0 && (await pathNow(p)) === `/app/products/${PRODUCT}`, "and stays, with the product", { moved: movedOnRefusal, path: await pathNow(p) })
    expect(await takesPresses(p), "the page still takes presses", await p.evaluate(() => getComputedStyle(document.body).pointerEvents))
    const spinnerGone = await p.$eval(MORE, (b) => !b.disabled)
    expect(spinnerGone, "the more button is back to itself")

    /* Deleted. */
    ctx.answer = { status: 200, body: { ok: true, outcome: "deleted", status: "published", slug: "portrait-presets" } }
    await p.click(MORE)
    await sleep(700)
    await pressMenuRow(p, "Delete")
    await sleep(isPhone ? 800 : 450)
    await p.evaluate(() => [...document.querySelectorAll("[data-confirm]")].find((b) => b.getBoundingClientRect().height > 0)?.click())
    await sleep(1600)
    const path = await pathNow(p)
    const drawn = await p.evaluate((id) => [...document.querySelectorAll(`[data-row="${id}"]`)].filter((e) => e.getClientRects().length > 0).length, PRODUCT)
    const others = await p.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((e) => e.getClientRects().length > 0).length)
    const log = await routerLog(p)
    const notice = await toastText(p)
    await p.screenshot({ path: join(shots, `delete-${label}-after.png`) })
    expect(path === "/app/products", "deleted: back to Products", path)
    expect(drawn === 0 && others > 0, "the list, drawn from its copy from before the delete, does not draw the product", { drawn, others })
    expect(log.includes("refresh"), "and the router's kept pages are dropped", log.filter((e) => /refresh|replace|back/.test(e)))
    expect(/Product deleted/.test(notice), "Product deleted is shown on the list", notice)
    if (ctx.errors.length) expect(false, "nothing threw", ctx.errors)
    await p.close()

    console.log(`\n${label}: a product with sales, on a database that would lose them`)
    const a = await open(`/app/products/${PRODUCT}`, vp)
    a.ctx.answer = { status: 200, body: { ok: true, outcome: "archived", reason: "sales", message: SALES_LINE, status: "archived", archived: true, slug: "portrait-presets" } }
    await a.p.click(MORE)
    await sleep(700)
    await pressMenuRow(a.p, "Delete")
    await sleep(isPhone ? 800 : 450)
    await a.p.evaluate(() => [...document.querySelectorAll("[data-confirm]")].find((b) => b.getBoundingClientRect().height > 0)?.click())
    await sleep(1600)
    const aDrawn = await a.p.evaluate((id) => [...document.querySelectorAll(`[data-row="${id}"]`)].filter((e) => e.getClientRects().length > 0).length, PRODUCT)
    const aNotice = await toastText(a.p)
    await a.p.screenshot({ path: join(shots, `delete-${label}-archived.png`) })
    expect((await pathNow(a.p)) === "/app/products" && aDrawn === 0, "archived: back to Products, and not in All", { path: await pathNow(a.p), drawn: aDrawn })
    expect(aNotice.includes(SALES_LINE), "with the one line why", aNotice)
    /* The view picker ("All") lists only the views with something in them. */
    const viewButton = await a.p.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => /^All/.test(b.textContent.trim()) && b.getClientRects().length > 0))
    if (viewButton.asElement()) await viewButton.asElement().click()
    await sleep(700)
    const views = await a.p.evaluate(() => [...document.querySelectorAll("[role=option], [role=menuitemradio], [role=radio], [data-app-sheet='open'] button, [role=listbox] button")].map((b) => b.textContent.trim()).filter(Boolean))
    await a.p.screenshot({ path: join(shots, `delete-${label}-archived-views.png`) })
    expect(views.some((v) => /^Archived/.test(v)), "and the list now has an Archived view to find it in", views)
    if (a.ctx.errors.length) expect(false, "nothing threw", a.ctx.errors)
    await a.p.close()

    console.log(`\n${label}: the list's own delete`)
    const l = await open("/app/products", vp)
    const target = "p1"
    const menuSel = `[data-row="${target}"] button[aria-label="Actions for Product 2"]`
    await pressFirst(l.p, menuSel)
    await sleep(700)
    const lRows = await menuRows(l.p)
    expect(lRows?.[lRows.length - 1]?.text === "Delete", "the row menu ends with Delete", lRows?.map((r) => r.text))
    await pressMenuRow(l.p, "Delete")
    await sleep(600)
    l.ctx.answer = { status: 409, body: { ok: false, error: "Could not delete the product" } }
    await l.p.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent.trim() === "Delete")?.click())
    await sleep(900)
    const modal = await l.p.evaluate(() => {
      const d = document.querySelector('[role="alertdialog"]')
      if (!d) return null
      return { alert: d.querySelector('[role="alert"]')?.textContent ?? null, btns: [...d.querySelectorAll("button")].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })) }
    })
    await l.p.screenshot({ path: join(shots, `delete-${label}-list-refused.png`) })
    expect(!!modal && modal.alert === "Could not delete the product", "refused: the question stays open and says why", modal)
    if (isPhone) expect(!!modal && modal.btns.every((b) => b.h >= 44), "its buttons 44px on a phone", modal?.btns)
    l.ctx.answer = { status: 200, body: { ok: true, outcome: "deleted", status: "published", slug: "product-1" } }
    await l.p.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => b.textContent.trim() === "Delete")?.click())
    await sleep(900)
    const lGone = await l.p.evaluate((id) => [...document.querySelectorAll(`[data-row="${id}"]`)].filter((e) => e.getClientRects().length > 0).length, target)
    const lLog = await routerLog(l.p)
    const lModal = await l.p.evaluate(() => !!document.querySelector('[role="alertdialog"]'))
    await l.p.screenshot({ path: join(shots, `delete-${label}-list-after.png`) })
    expect(lGone === 0 && !lModal, "deleted: the row goes and the question closes", { rows: lGone, modal: lModal })
    expect(lLog.includes("refresh"), "and the router's kept pages are dropped, so going back cannot bring it back", lLog.filter((e) => /refresh/.test(e)))
    expect(/Product deleted/.test(await toastText(l.p)), "Product deleted", await toastText(l.p))
    if (l.ctx.errors.length) expect(false, "nothing threw", l.ctx.errors)
    await l.p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nshots in ${shots}`)
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall ok")
