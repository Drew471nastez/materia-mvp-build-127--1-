import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-social-width.tsx",
})
const browser = await puppeteer.launch({
  executablePath: "/tmp/chromium",
  args: ["--no-sandbox"],
})
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900 })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      if (new URL(r.url()).hostname === "www.instagram.com")
        return void r.respond({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><style>body{margin:0;background:#ddd}</style><p>Instagram fixture</p>",
        })
      void r.continue()
    })
    await page.goto(base + "/app/onepage", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-compact-post]")
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-compact-post] iframe")
          ?.getBoundingClientRect().width > 0,
    )
    const result = await page.evaluate(() => {
      const neighbor = document
        .querySelector("[data-neighbor]")
        .getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        neighbor: neighbor.width,
        frames: [...document.querySelectorAll("[data-compact-post]")].map(
          (e) => {
            const r = e.getBoundingClientRect(),
              frame = e.querySelector("iframe").getBoundingClientRect()
            return {
              w: r.width,
              x: r.x,
              frame: frame.width,
              fx: frame.x,
              layout: e
                .closest("[data-social-layout]")
                ?.getAttribute("data-social-layout"),
            }
          },
        ),
      }
    })
    assert.equal(result.overflow, false)
    for (const f of result.frames) {
      assert.ok(Math.abs(f.w - f.frame) < 2, JSON.stringify(f))
      assert.ok(Math.abs(f.x - f.fx) < 2)
      if (f.layout !== "grid")
        assert.ok(Math.abs(f.w - result.neighbor) < 2, JSON.stringify(result))
    }
    await page.setViewport({ width: width === 1440 ? 390 : 1440, height: 900 })
    await new Promise((r) => setTimeout(r, 250))
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Resize keeps social content within its block",
    )
    await page.close()
    console.log(
      `ok ${width}px: standalone Instagram, single, list, carousel and grid match block width; responsive resize`,
    )
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
