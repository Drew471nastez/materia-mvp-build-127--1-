/**
 * ===========================================================================
 *  INSIDE THE PHONE APP, WHERE EACH KIND OF LINK GOES
 * ===========================================================================
 * scripts/render-native-links.tsx draws every kind of link a buyer meets;
 * this presses each one in a fresh page whose user agent says Capacitor (what
 * the app's WebView sends, capacitor.config.ts appendUserAgent), and records
 * where it went: a client navigation (the router), a document load in the
 * same WebView (the request the page made), or a window opened (which in the
 * app is the system browser).
 *
 *   ours, any spelling   stays in the WebView, on storelib.com, never a window
 *   theirs               a window (the browser), never the WebView
 *
 *   PROBE_CSS=source node scripts/check-native-links.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".native-links-probe")
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor"

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__log ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
`)
  /* Next's Link: a plain click is a client navigation; a target other than _self is the browser's, as in Next. */
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (e.defaultPrevented || (rest.target && rest.target !== "_self")) return; e.preventDefault(); (window.__log ||= []).push(["link", href]) } }, children) })
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-native-links.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.native-links-probe/navigation.js", "next/link": "./.native-links-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

  /** Press one link on a fresh page at `at`, and say where it went. */
  async function press(sel, at = "/explore") {
    const p = await browser.newPage()
    await p.setUserAgent(UA)
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    const docs = []
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      if (r.isNavigationRequest() && r.frame() === p.mainFrame()) docs.push(r.url())
      if (r.url().startsWith("data:")) return r.continue()
      if (r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
      return r.respond({ status: 204, body: "" })
    })
    /* A window, as the app's WebView would hand it to the system browser: recorded, never opened. */
    await p.evaluateOnNewDocument(() => {
      window.__opened = []
      window.open = (u, t) => { window.__opened.push([String(u), t ?? null]); return null }
    })
    await p.goto(`https://storelib.com${at}`, { waitUntil: "load" })
    await sleep(250)
    const before = docs.length
    const log = await p.evaluate(async (sel) => {
      window.__log = []
      document.querySelector(`[data-case="${sel}"]`).click()
      await new Promise((r) => setTimeout(r, 300))
      return { log: window.__log || [], opened: window.__opened || [] }
    }, sel).catch(() => ({ log: [], opened: [], unloaded: true }))
    await sleep(300)
    const loads = docs.slice(before)
    await p.close()
    return { ...log, loads, errors }
  }

  console.log("\nOurs stays in the app")
  {
    const r = await press("card")
    expect(r.log.some(([k, h]) => k === "link" && h === "/maria/preset-pack?layout=discover&recommended=1") && r.opened.length === 0 && r.loads.length === 0, "an Explore card (https://storelib.com/<handle>/<slug>) is a client navigation to the path", r)
  }
  {
    const r = await press("creator-blank")
    expect(r.log.some(([k, h]) => k === "link" && h === "/maria") && r.opened.length === 0, "the creator link on a product page (target=_blank) is a client navigation, not a window", r)
  }
  {
    const r = await press("a-blank")
    expect(r.opened.length === 0 && (r.log.some(([k, h]) => k === "push" && h === "/terms") || r.loads.some((u) => u === "https://storelib.com/terms")), "a plain <a target=_blank> to a page of ours navigates the app", r)
  }
  {
    const r = await press("a-www")
    expect(r.opened.length === 0 && r.log.some(([k, h]) => k === "push" && h === "/maria") && !r.loads.some((u) => u.includes("www.")), "www.storelib.com is the same page on storelib.com, never the www host", r)
  }
  {
    const r = await press("a-me")
    expect(r.opened.length === 0 && r.log.some(([k, h]) => k === "push" && h === "/maria/links") && !r.loads.some((u) => u.includes("storelib.me")), "storelib.me/<name> is the OnePage's route on storelib.com", r)
  }
  {
    const r = await press("a-plain")
    expect(r.opened.length === 0 && r.loads.some((u) => u === "https://storelib.com/explore/design"), "a plain link on this host is left to the WebView", r)
  }
  {
    const r = await press("next-link")
    expect(r.log.some(([k, h]) => k === "link" && h === "/account/library") && r.loads.length === 0 && r.opened.length === 0, "a Next link is left to Next", r)
  }
  {
    const r = await press("open-internal")
    expect(r.opened.length === 0 && r.log.some(([k, h]) => k === "push" && h === "/explore"), "window.open of a page of ours navigates the app", r)
  }
  {
    const r = await press("external-internal")
    expect(r.opened.length === 0 && r.loads.some((u) => u === "https://storelib.com/explore"), "openExternal of a page of ours (the dashboard's Discover, View product) loads it in the app", r)
  }
  {
    const r = await press("smart-site")
    expect(r.opened.length === 0 && r.loads.some((u) => u === "https://maria.storelib.com/about"), "a creator's website goes to the WebView, not a window (in the app with the next native release)", r)
  }
  {
    const r = await press("a-blank", "/checkout?productId=p1")
    expect(r.loads.length === 0 && !r.log.some(([k]) => k === "push") && r.opened.some(([u]) => u === "https://storelib.com/terms"), "from checkout, Terms opens in the in-app sheet over the payment rather than navigating away from it", r)
  }

  console.log("\nTheirs goes to the browser")
  {
    const r = await press("smart-external")
    expect(r.opened.some(([u]) => u === "https://instagram.com/maria") && r.loads.length === 0, "a creator's Instagram (SmartLink) opens a window", r)
  }
  {
    const r = await press("external-external")
    expect(r.opened.some(([u]) => u === "https://instagram.com/maria"), "openExternal of somebody else's site opens a window", r)
  }
  {
    const r = await press("a-external")
    expect(r.opened.length === 0 && !r.log.length && r.loads.some((u) => u.startsWith("https://instagram.com")), "a plain external link is left alone (the app's shell sends it to the browser)", r)
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
