/* Round 66: the code pane's frame answered by a page that refuses to be framed (signed out, /login): the pane says so, with Try again. OUT=<dir> npx tsx scripts/probe-codepane-r66.ts */
import JSZip from "jszip"
import puppeteer from "puppeteer-core"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
void (async () => {
  const OUT = process.env.OUT ?? "/tmp"
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const zip = await JSZip.loadAsync(await composeTemplateZip("materia/space"))
  for (const [w, h] of [[1280, 800], [390, 844]] as const) {
    const ed = await editorFor(browser, w, h, w < 800, undefined, zip)
    const page = ed.page
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 })
    await page.setRequestInterception(true)
    let refused = 0
    page.on("request", (req) => {
      if (req.isNavigationRequest() && /\/website-builder\/code\//.test(req.url())) { refused++; void req.respond({ status: 200, contentType: "text/html", headers: { "X-Frame-Options": "DENY" }, body: "<h1>Sign in</h1>" }); return }
      void req.continue()
    })
    await ed.frame(); await sleep(2500)
    const pressed = await page.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLElement>("button, [role=tab], a")].find((x) => x.getClientRects().length && /^code$/i.test((x.getAttribute("aria-label") || x.textContent || "").trim()))
      b?.click(); return !!b
    })
    await sleep(2500)
    const shown = await page.evaluate(() => [...document.querySelectorAll("[data-code-pane] p")].map((p) => p.textContent))
    console.log(`${w}: code pressed ${pressed}, frame answers refused ${refused}, pane says ${JSON.stringify(shown)}`)
    await page.screenshot({ path: `${OUT}/codepane-refused-${w}.png` })
    ed.close()
    await page.close()
  }
  await browser.close()
})()
