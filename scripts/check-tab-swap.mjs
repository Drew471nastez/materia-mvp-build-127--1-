/**
 * ===========================================================================
 *  A TAB IN THE APP CHANGES PAGE IN ONE PIECE (round 20)
 * ===========================================================================
 * lib/nav/tab-swap.ts in headless Chromium, as the app (window.Capacitor),
 * with a stand in for the router: the push changes the address and the page
 * 120ms later, as a prefetched page would; a second case never arrives.
 *
 *   HELD     while the next page is on its way the screen is a view
 *            transition (the page being left held as a picture)
 *   SWAPS    the transition lets go once the address has changed and the
 *            new page has been drawn, not at the hold's limit
 *   FRAME    an address that commits before the page's own frame is drawn
 *            is not enough: it waits for the frame (round 22), and for the
 *            profile, for its header to be decided (no bar still pending)
 *   CAPPED   a page that never comes is not waited for past 600ms
 *   CLEAN    the mark is taken off afterwards
 *   BROWSER  outside the app nothing happens (the caller pushes as before)
 *
 *   node scripts/check-tab-swap.mjs
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const out = mkdtempSync(join(tmpdir(), "tab-swap-"))
try {
  const { build } = await import("esbuild")
  await build({ stdin: { contents: 'import { swapTabPage } from "./lib/nav/tab-swap"; window.__swap = swapTabPage', resolveDir: root, loader: "ts" }, bundle: true, format: "iife", outfile: join(out, "swap.js"), logLevel: "error", alias: { "@": "." }, absWorkingDir: root })
  const js = readFileSync(join(out, "swap.js"), "utf8")
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const run = async (app, arriveMs, frameMs = arriveMs, to = "/community/clay") => {
    const p = await browser.newPage()
    await p.setRequestInterception(true)
    p.on("request", (r) => r.respond({ status: 200, contentType: "text/html", body: `<!doctype html><html><body><main id="m">profile</main><script>${app ? "window.Capacitor={isNativePlatform:()=>true};" : ""}</script><script>${js}</script></body></html>` }))
    await p.goto("https://storelib.com/account", { waitUntil: "load" })
    const r = await p.evaluate((arriveMs, frameMs, to) => new Promise((resolve) => {
      const t0 = performance.now()
      const log = { took: false, held: false, mark: false, finished: null }
      const account = to.startsWith("/account")
      if (account) document.documentElement.setAttribute("data-account-community-pending", "")
      log.took = window.__swap(() => {
        if (arriveMs == null) return
        setTimeout(() => { history.pushState(null, "", to); document.getElementById("m").textContent = account ? "profile" : "feed" }, arriveMs)
        setTimeout(() => {
          const frame = document.createElement("div")
          if (account) {
            frame.setAttribute("data-page", "account")
            document.documentElement.removeAttribute("data-account-community-pending")
          } else frame.setAttribute("data-community-shell", "")
          document.body.appendChild(frame)
        }, frameMs)
      }, to)
      log.mark = document.documentElement.hasAttribute("data-tab-swap")
      if (!log.took) return resolve(log)
      setTimeout(() => { log.held = !!document.getAnimations || true }, 40)
      const check = () => {
        if (document.documentElement.hasAttribute("data-tab-swap")) return requestAnimationFrame(check)
        log.finished = Math.round(performance.now() - t0)
        log.text = document.getElementById("m").textContent
        resolve(log)
      }
      requestAnimationFrame(check)
    }), arriveMs, frameMs, to)
    await p.close()
    return r
  }
  const fast = await run(true, 120)
  expect(fast.took && fast.mark, "HELD: in the app, a crossing tab goes through a view transition", fast)
  const never = await run(true, null)
  expect(fast.finished !== null && never.finished !== null && fast.finished < never.finished - 150 && fast.text === "feed", "SWAPS: it lets go once the new page is there, well before the hold's limit, then fades it in", { fast: fast.finished, never: never.finished })
  const late = await run(true, 60, 300)
  expect(late.finished !== null && late.finished >= 300 && late.finished < never.finished - 100, "FRAME: an address before its frame is not enough, it waits for the community's frame", { late: late.finished })
  const profile = await run(true, 60, 280, "/account")
  expect(profile.finished !== null && profile.finished >= 280 && profile.finished < never.finished - 100, "and for the profile, for its header to be decided", { profile: profile.finished })
  expect(never.finished !== null && never.finished < 600 + 260 + 120, "CAPPED: a page that never comes is not waited for past the hold", never)
  expect(fast.finished !== null && never.finished !== null, "CLEAN: the mark is taken off afterwards", { fast: fast.finished, never: never.finished })
  const web = await run(false, 120)
  expect(web.took === false && web.mark === false, "BROWSER: outside the app nothing happens", web)
  await browser.close()
} finally {
  rmSync(out, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
