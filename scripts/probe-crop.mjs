/**
 * Crops (and optionally enlarges) a PNG with the probe's own Chromium, for
 * probes that need a close look at a few pixels (a shadow's edge) where a
 * clipped screenshot of a fixed header comes back wrong. No image library:
 * the picture is drawn on a canvas and read back.
 *
 *   import { cropPng } from "./probe-crop.mjs"
 *   await cropPng(browser, "in.png", "out.png", { x, y, width, height }, 3)
 */
import { readFileSync, writeFileSync } from "node:fs"

export async function cropPng(browser, input, output, rect, scale = 1) {
  const p = await browser.newPage()
  const src = `data:image/png;base64,${readFileSync(input).toString("base64")}`
  const data = await p.evaluate(async (src, r, s) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = document.createElement("canvas")
    c.width = Math.round(r.width * s)
    c.height = Math.round(r.height * s)
    const g = c.getContext("2d")
    g.imageSmoothingEnabled = false
    g.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, c.width, c.height)
    return c.toDataURL("image/png").split(",")[1]
  }, src, rect, scale)
  writeFileSync(output, Buffer.from(data, "base64"))
  await p.close()
}
