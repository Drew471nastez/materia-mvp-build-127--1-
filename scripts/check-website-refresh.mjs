/**
 * ===========================================================================
 *  THE WEBSITE PAGE'S REFRESHES, COUNTED
 * ===========================================================================
 * "The /app/website builder page doesn't refresh or reload very bad." Round
 * AP folded every ask for the server into one transition at a time
 * (website-builder-client.tsx `refresh`, lib/website-builder/page-refresh.ts),
 * from reading the code. This proves it in a browser: the real
 * WebsiteBuilderClient over a fake server that answers router.refresh() the
 * way the app router does (scripts/render-website-refresh.tsx), and each
 * trigger driven as a person would, through the page's own buttons:
 *
 *   save       a save in the editor, then the page arrives with an older copy
 *   focus      the window and the tab come back (focus, visibilitychange, pageshow)
 *   publish    More actions, Publish, the confirm
 *   rename     More actions, Rename, a new name, Enter
 *   landing    Duplicate: the copy's row arrives with the refreshed page
 *   timer      Duplicate whose row the server does not have yet: the 12 s placeholder timer
 *   burst      Rename and Duplicate answered while a refresh is on its way
 *
 * For each: router.refresh() calls, the page's mounts (1 for the whole visit),
 * whether the page's root element is the same node at the end, and every
 * animation frame where the page was not on screen (a reload flash). After
 * all of them the page is left alone for 4 s: no call may come (no loop).
 *
 *   node scripts/check-website-refresh.mjs
 *   WIDTHS=390,1440 (default)   SHOTS=<dir>   pictures after each step
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const WIDTHS = (process.env.WIDTHS || "390,1440").split(",").map(Number)
const SHOTS = process.env.SHOTS || ""
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the bundle ─────────────────────────────────────────────────────────── */

const dir = join(root, `.refresh-probe-${process.pid}`)
process.on("exit", () => rmSync(dir, { recursive: true, force: true }))
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `const router = { push(h) { (globalThis.__pushes ||= []).push(h) }, replace() {}, prefetch() {}, refresh() { globalThis.__refresh() }, back() {}, forward() {} }
export const usePathname = () => "/app/website-builder"
export const useSearchParams = () => new URLSearchParams()
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.js"), `import { createElement } from "react"
export default function Link({ href, prefetch, replace, scroll, ...rest }) { return createElement("a", { href: String(href), ...rest }) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "toast.js"), `export const useToast = () => ({ toast: (t) => { (globalThis.__toasts ||= []).push(t && t.title) } })
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-website-refresh.tsx"), "--bundle", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.js")}`, `--alias:@/hooks/use-toast=${join(dir, "toast.js")}`, `--alias:@=${root}`,
    "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    "--format=iife", "--platform=browser", '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;'],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch {
  fail("scripts/render-website-refresh.tsx did not bundle. The error above is esbuild's.")
}
const js = readFileSync(join(dir, "probe.js"))
const css = (await appCss(root)) + "\n" + interFaces(root)
/* One reading per frame: is the page on screen, and is it the same page. */
const RECORD = `window.__frames = [];
(function read() {
  const page = document.querySelector('[data-page="website"]')
  if (page && !window.__pageNode) window.__pageNode = page
  window.__frames.push({ t: performance.now(), page: !!page && !!page.querySelector("table, h1"), same: !!page && page === window.__pageNode, fallback: !!document.querySelector("[data-fallback]") })
  requestAnimationFrame(read)
})()`
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="font-sans antialiased bg-background text-foreground"><div id="app"></div><script src="/probe.js"></script><script>${RECORD}</script></body></html>`

const server = createServer((req, res) => {
  const path = req.url.split("?")[0]
  if (path === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  if (path.startsWith("/covers/")) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })

const results = []
for (const width of WIDTHS) {
  console.log(`\n${width}px`)
  const page = await browser.newPage()
  await page.setViewport({ width, height: width < 768 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(`${base}/app/website-builder`, { waitUntil: "load" })
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `refresh-${width}-${name}.png`) }) }
  const count = () => page.evaluate(() => ({ refreshes: window.__refreshes.length, mounts: window.__mounts }))
  /* Frames from `since` on where the page was not drawn, or was another node. */
  const flashes = (since) => page.evaluate((since) => {
    const f = window.__frames.filter((x) => x.t >= since && window.__pageNode)
    return { frames: f.length, missing: f.filter((x) => !x.page || x.fallback).length, replaced: f.filter((x) => !x.same).length }
  }, since)
  const now = () => page.evaluate(() => performance.now())
  const clickText = async (text, scope = "body") => {
    const ok = await page.evaluate((text, scope) => {
      /* The last one drawn: a menu or a sheet is portaled to the end of the page, after the rows' own buttons. */
      const el = [...document.querySelectorAll(`${scope} button, ${scope} [role="menuitem"], ${scope} a`)].filter((b) => b.textContent.trim() === text && b.getClientRects().length > 0).pop()
      if (!el) return false
      el.click()
      return true
    }, text, scope)
    if (!ok) throw new Error(`no "${text}" to press`)
  }
  const openMenu = async (name) => {
    await page.click(`[aria-label="More actions for ${name}"]`)
    await wait(350)
  }
  const step = async (name, run, want, opts = {}) => {
    const before = await count()
    const t0 = await now()
    await run()
    await wait(opts.settle ?? 1600)
    const after = await count()
    const f = await flashes(t0)
    const made = after.refreshes - before.refreshes
    const ok = want(made)
    expect(ok, `${name}: router.refresh() ${made}`, opts.why ?? "")
    expect(after.mounts === 1, `${name}: the page mounted once for the visit`, `mounts ${after.mounts}`)
    expect(f.missing === 0 && f.replaced === 0, `${name}: no frame without the page, never a new page node`, `${f.frames} frames, ${f.missing} without the page, ${f.replaced} on another node`)
    if (!ok || process.env.DEBUG) console.log('        calls', JSON.stringify(await page.evaluate((t0) => window.__calls.filter((c) => c.at >= t0).map((c) => c.method + ' ' + c.path), t0)), 'toasts', JSON.stringify(await page.evaluate(() => (window.__toasts || []).slice(-3))))
    results.push({ width, name, refreshes: made, mounts: after.mounts, frames: f.frames, missing: f.missing, replaced: f.replaced })
    await shot(name)
  }

  /* 1. Saved in the editor, then the page arrives with the copy from before the save (the server still says so). */
  await page.evaluate(() => { window.__saved("lib-0"); window.__start() })
  await page.waitForSelector('[data-page="website"] table, [data-page="website"] h1', { timeout: 10_000 })
  await wait(2500)
  {
    const c = await count()
    const f = await flashes(0)
    expect(c.refreshes === 1, "save: one router.refresh() for the copy behind the save, even though the server's copy stays behind", `${c.refreshes}`)
    expect(c.mounts === 1, "save: the page mounted once", `${c.mounts}`)
    results.push({ width, name: "save", refreshes: c.refreshes, mounts: c.mounts, frames: f.frames, missing: f.missing, replaced: f.replaced })
    await shot("save")
  }

  await step("focus", async () => {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"))
      window.dispatchEvent(new Event("focus"))
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
    })
  }, (n) => n === 0, { why: "(focus, visibilitychange and pageshow ask nothing)" })

  await step("publish", async () => {
    await page.evaluate(() => { window.__server = window.__server.map((r) => (r.id === "lib-1" ? { ...r, status: "published" } : r.status === "published" ? { ...r, status: "unpublished" } : r)) })
    await openMenu("Atelier")
    await clickText("Publish")
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 })
    await wait(250)
    await clickText("Publish", '[role="alertdialog"]')
  }, (n) => n === 1)

  const rename = async (from, to) => {
    await openMenu(from)
    await clickText("Rename")
    await page.waitForSelector('[role="dialog"] input', { timeout: 5000 })
    await wait(250)
    await page.evaluate((to) => {
      const input = document.querySelector('[role="dialog"] input')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
      set.call(input, to)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }, to)
    await page.keyboard.press("Enter")
  }
  const duplicateOf = async (name) => {
    await openMenu(name)
    await clickText("Duplicate")
  }

  await step("rename", async () => {
    await page.evaluate(() => { window.__server = window.__server.map((r) => (r.id === "lib-0" ? { ...r, name: "Studio North" } : r)) })
    await rename("Studio", "Studio North")
  }, (n) => n === 1)

  await step("landing", async () => {
    await page.evaluate(() => {
      window.__answers["/api/website-builder/themes/lib-0/duplicate"] = { install_id: "dup-1", cover: null }
      const src = window.__server.find((r) => r.id === "lib-0")
      window.__server = [...window.__server, { ...src, id: "dup-1", name: "Studio copy", status: "draft" }]
    })
    await duplicateOf("Studio North")
  }, (n) => n === 1, { settle: 13_500, why: "(the copy lands with the refresh; its 12 s timer is cleared, so no second ask)" })
  {
    const landed = await page.evaluate(() => !!document.querySelector('[data-install-row="dup-1"]'))
    expect(landed, "landing: the copy's row is on the page")
  }

  await step("timer", async () => {
    await page.evaluate(() => { window.__answers["/api/website-builder/themes/dup-1/duplicate"] = { install_id: "dup-2", cover: null } })
    await duplicateOf("Studio copy")
  }, (n) => n === 2, { settle: 14_000, why: "(one ask when the copy is made, one when the 12 s timer gives up on a server copy that does not have it yet)" })

  await step("burst", async () => {
    await page.evaluate(() => {
      window.__serverMs = 1200
      window.__answers["/api/website-builder/themes/lib-0/duplicate"] = { install_id: "dup-3", cover: null }
      const src = window.__server.find((r) => r.id === "lib-0")
      window.__server = [...window.__server.map((r) => (r.id === "dup-1" ? { ...r, name: "Studio spare" } : r)), { ...src, id: "dup-3", name: "Studio copy 2" }]
    })
    await rename("Studio copy", "Studio spare")
    /* The dialog gone (its rename answered and the refresh asked), the server still on its 1.2 s answer: the second ask. */
    await page.waitForSelector('[role="dialog"]', { hidden: true, timeout: 5000 })
    const pending = await page.evaluate(() => performance.now() - window.__refreshes[window.__refreshes.length - 1].at)
    console.log(`        Duplicate pressed ${Math.round(pending)}ms after the rename's refresh was asked (the server answers in 1200ms)`)
    await duplicateOf("Studio North")
  }, (n) => n >= 1 && n <= 2, { settle: 5000, why: "(two asks while the first is on its way: folded, at most one after it)" })

  {
    /* Folded, not stacked: the second ask waited for the first answer (1200ms) instead of going out beside it. */
    const gap = await page.evaluate(() => { const r = window.__refreshes; return r[r.length - 1].at - r[r.length - 2].at })
    expect(gap >= 1100, "burst: the second router.refresh() went out only after the first answer had landed", `${Math.round(gap)}ms apart`)
    results.push({ width, name: "burst gap ms", refreshes: Math.round(gap) })
  }

  /* Left alone: nothing more. */
  {
    const before = await count()
    await wait(4000)
    const after = await count()
    expect(after.refreshes === before.refreshes, "left alone for 4 s: no further router.refresh() (no loop)", `${after.refreshes - before.refreshes}`)
    const all = await page.evaluate(() => window.__refreshes.length)
    results.push({ width, name: "total", refreshes: all, mounts: after.mounts })
    console.log(`        ${all} router.refresh() calls for the whole visit, ${after.mounts} mount`)
  }
  expect(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "))
  await page.close()
}
await browser.close()
server.close()
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results, null, 2))
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
