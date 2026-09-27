/**
 * ===========================================================================
 *  THE PRODUCTS LIST, READ THROUGH A BROWSER'S TRANSLATOR
 * ===========================================================================
 * "Failed to execute 'insertBefore' on 'Node': The node before which the new
 * node is to be inserted is not a child of this node." on /app/products, 101
 * times from two people. Chrome's and Safari's translators replace every text
 * node with <font> elements of their own, and React still holds the nodes it
 * made.
 *
 * The real list (scripts/render-products-list.tsx), translated the way the
 * translator does it (each text node swapped for <font><font>, and every new
 * one as it appears), then every move a creator makes on it: each view, a
 * search and its clearing, the pages, each order, Archive, Restore,
 * Duplicate, Delete refused and Delete done, Export, opening a row. At 1280
 * and 390, each on a fresh page. It fails when anything throws, when the
 * list is gone, or when a word the move changed still says the old one.
 *
 * GUARD=0 leaves out lib/ui/dom-guard (instrumentation-client installs it in
 * the app), to see what the list does on its own.
 *
 *   node scripts/check-products-translate.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const stubs = join(root, ".products-translate-probe")
mkdirSync(stubs, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The translator: every text node out, <font><font> in, and new ones as they appear. */
const TRANSLATOR = `
window.__translate = () => {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walk.nextNode()) { const n = walk.currentNode; const p = n.parentElement; if (!n.nodeValue.trim() || !p || /^(SCRIPT|STYLE|FONT)$/.test(p.tagName)) continue; nodes.push(n) }
  for (const n of nodes) { const outer = document.createElement("font"); outer.style.verticalAlign = "inherit"; const inner = document.createElement("font"); inner.style.verticalAlign = "inherit"; inner.textContent = "[t]" + n.nodeValue; outer.append(inner); n.parentNode.replaceChild(outer, n) }
  return nodes.length
}
window.__watch = () => { let q = false; new MutationObserver(() => { if (q) return; q = true; setTimeout(() => { q = false; window.__translate() }, 30) }).observe(document.body, { subtree: true, childList: true, characterData: true }) }
`

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, refresh: () => {} }
export const usePathname = () => "/app/products"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "guard.ts"), `import { guardDomAgainstTranslators } from "@/lib/ui/dom-guard"\nguardDomAgainstTranslators()\n`)
  const { build } = await import("esbuild")
  const bundle = async (entry, out) => {
    await build({
      entryPoints: [entry], bundle: true, format: "iife", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: {
        "@": ".",
        react: join(root, "node_modules/next/dist/compiled/react"),
        "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
        "next/navigation": join(stubs, "navigation.js"),
        "next/link": join(stubs, "link.jsx"),
      },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" }, outfile: join(stubs, out), logLevel: "error", absWorkingDir: root, nodePaths: [join(root, "node_modules")],
    })
    return readFileSync(join(stubs, out), "utf8").replace(/<\/script/gi, "<\\/script")
  }
  const app = await bundle(join(root, "scripts/render-products-list.tsx"), "app.js")
  const guard = process.env.GUARD === "0" ? "" : await bundle(join(stubs, "guard.ts"), "guard.js")
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style><style>${await appCss(root)}</style></head><body><div id="app"></div><script>${guard}</script><script>${TRANSLATOR}</script><script>${app}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  async function run(vp, name, move) {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    const ctx = { deleteAnswer: { status: 409, body: { ok: false, error: "Could not delete the product" } } }
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/api/products/delete?")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, hasSales: false }) })
      if (u === "http://probe.test/api/products/delete") return setTimeout(() => r.respond({ status: ctx.deleteAnswer.status, contentType: "application/json", body: JSON.stringify(ctx.deleteAnswer.body) }).catch(() => {}), 300)
      if (u.startsWith("http://probe.test/app")) return r.respond({ status: 200, contentType: "text/html", body: html })
      r.abort()
    })
    await p.setViewport(vp)
    await p.goto("http://probe.test/app/products")
    await sleep(900)
    const translated = await p.evaluate(() => window.__translate())
    await p.evaluate(() => window.__watch())
    const shown = () => p.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((e) => e.getClientRects().length).map((e) => e.dataset.row))
    const press = (sel) => p.evaluate((sel) => { const b = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length); if (!b) return false; b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })); b.click(); return true }, sel)
    const pick = (sel, re) => p.evaluate((sel, re) => { const el = [...document.querySelectorAll(sel)].find((e) => new RegExp(re).test(e.textContent.replace(/\[t\]/g, "").trim()) && e.getClientRects().length > 0); if (el) el.click(); return !!el }, sel, re)
    const words = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length)?.textContent.replace(/\[t\]/g, "").trim() ?? null, sel)
    const h = {
      p, shown, press, words, ctx,
      view: async (name) => { await press("[data-view-select]"); await sleep(700); const ok = await pick("[role=option], [data-app-sheet='open'] button, button:not([data-view-select])", `^${name}\\b`); await sleep(1000); return ok },
      type: async (text) => { for (const i of await p.$$("input[type=search]")) if (await i.evaluate((e) => e.getClientRects().length > 0)) return i.type(text, { delay: 20 }) },
      row: async (id, action) => { await press(`[data-row="${id}"] button[aria-label^="Actions"]`); await sleep(800); const ok = await pick("[role=menuitem], [data-app-sheet='open'] button", `^${action}$`); await sleep(1000); return ok },
      sort: async (re) => { await press("[data-sort]"); await sleep(700); const ok = await pick("[role=option], [data-app-sheet='open'] button, button:not([data-sort])", re); await sleep(900); return ok },
      confirm: async () => { await p.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].find((b) => /(Delete|Archive)$/.test(b.textContent.trim()))?.click()); await sleep(1300) },
      pick,
    }
    let detail
    try { detail = await move(h) } catch (e) { errors.push(`probe: ${e.message}`) }
    await sleep(600)
    const alive = await p.evaluate(() => !!document.querySelector('section[aria-label="Products"]'))
    expect(alive && errors.length === 0 && translated > 50, `${vp.width}: ${name}, translated, nothing threw and the list is there`, errors.length ? errors : undefined)
    if (detail) expect(detail.ok, `${vp.width}: ${name}: ${detail.what}`, detail.got)
    await p.close()
  }
  const moves = {
    "each view": async (h) => {
      const got = []
      for (const v of ["Draft", "Active", "Archived", "All"]) { await h.view(v); got.push(`${await h.words("[data-view-select]")}:${(await h.shown()).length}`) }
      return { ok: got.join() === "Draft:21,Active:50,Archived:13,All:50", what: "each view shows its own rows and says its own name", got }
    },
    "search and clear": async (h) => { await h.type("Product 1"); await sleep(500); await h.type("zz"); await sleep(500); await h.pick("button", "^Clear search$"); await sleep(700); return { ok: (await h.shown()).length === 50, what: "cleared, the whole first page is back", got: (await h.shown()).length } },
    "pages": async (h) => { await h.press('[aria-label="Next page"]'); await sleep(900); const w = await h.words("[data-footer] span"); return { ok: w === "51–100 of 107", what: "the next page, and the count says so", got: w } },
    "orders": async (h) => { await h.sort("^Oldest"); await h.sort("^Price"); await h.sort("^Newest"); return { ok: (await h.shown())[0] === "p0", what: "back to the newest first", got: (await h.shown())[0] } },
    "archive": async (h) => ({ ok: await h.row("p1", "Archive"), what: "Archive is in the row's menu" }),
    "restore": async (h) => { await h.view("Archived"); return { ok: await h.row("p4", "Restore"), what: "Restore is in an archived row's menu" } },
    "duplicate": async (h) => ({ ok: await h.row("p1", "Duplicate"), what: "Duplicate is in the row's menu" }),
    "delete refused": async (h) => { await h.row("p2", "Delete"); await h.confirm(); const w = await h.words('[role="alertdialog"] [role="alert"]'); const b = await h.p.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].map((x) => x.textContent.replace(/\[t\]/g, "").trim()).join()); return { ok: w === "Could not delete the product" && b === "Cancel,Delete", what: "the question stays, says why, and its button is Delete again", got: { w, b } } },
    "delete done": async (h) => { h.ctx.deleteAnswer = { status: 200, body: { ok: true, outcome: "deleted", status: "published", slug: "product-2" } }; await h.row("p2", "Delete"); await h.confirm(); return { ok: !(await h.shown()).includes("p2"), what: "the row goes" } },
    "export": async (h) => { await h.pick("button", "^Export$"); await sleep(600); await h.pick("[role=menuitem], [data-app-sheet='open'] button", "CSV"); return null },
    "open a row": async (h) => { await h.p.evaluate(() => [...document.querySelectorAll('[data-row="p5"] a')].find((e) => e.getClientRects().length)?.click()); return null },
  }
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    console.log(`\n${vp.width}`)
    for (const [name, move] of Object.entries(moves)) await run(vp, name, move)
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
if (broken) { console.log(`\n${broken} failed`); process.exit(1) }
console.log("\nall ok")
