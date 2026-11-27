/**
 * A Materia template served on a local port the way a creator's website
 * draws it (scripts/theme-templates/site.ts: composed, imported, answered by
 * the compat engine's answer()), kept running for Chromium probes (round 67,
 * scripts/check-commerce-r67.mjs).
 *
 *   TEMPLATE=rail PORT=4701 node <runner> scripts/serve-template-r67.ts
 *
 * PRODUCTS=n draws the first n of the template's sample shop (default all).
 * IMAGES=a.png,b.png,... gives the products these pictures in turn, read from
 * PRODUCTS_DIR (the r67 picture shapes: wide, 4:3, square, tall).
 * WISHLIST_ICON=0|1 and ACTIONS_TEXT=0|1 set the header's settings.
 */
import { createServer } from "node:http"
import { join } from "node:path"
import { importTemplate, serve, siteFor, type SampleProduct } from "./theme-templates/site"
import { SAMPLE_SHOPS } from "./theme-templates/shops"

async function main() {
  const id = process.env.TEMPLATE ?? "rail"
  const imported = await importTemplate(`materia/${id}`)
  const sample = (SAMPLE_SHOPS[id] ?? SAMPLE_SHOPS.default).products
  const n = Number(process.env.PRODUCTS ?? sample.length)
  const images = (process.env.IMAGES ?? "").split(",").filter(Boolean)
  const list: SampleProduct[] = Array.from({ length: n }, (_, i) => {
    const p = sample[i % sample.length]
    const title = i < sample.length ? p.title : `${p.title} ${i + 1}`
    return images.length ? { ...p, title, image: images[i % images.length], images: [images[(i + 1) % images.length]] } : { ...p, title }
  })
  const built = siteFor(imported, { name: "Shop", products: list })
  const pages = built.site.pages as unknown as Record<string, { type: string; settings?: Record<string, unknown> }[]>
  for (const page of Object.values(pages)) {
    for (const s of page) {
      if (!/header/.test(s.type) || !s.settings) continue
      if (process.env.WISHLIST_ICON) s.settings.show_wishlist_icon = process.env.WISHLIST_ICON === "1"
      if (process.env.ACTIONS_TEXT) s.settings.actions_as_text = process.env.ACTIONS_TEXT === "1"
    }
  }
  const dir = process.env.PRODUCTS_DIR ?? join("scripts/theme-templates/products", id)
  const { base, server } = await serve(built, dir, { eager: process.env.EAGER === "1" })
  const port = Number(process.env.PORT ?? 0)
  if (port) {
    /* A fixed port in front of the served site, so a probe can be pointed at it. */
    const target = new URL(base)
    const front = createServer((req, res) => {
      const proxied = { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers }
      import("node:http").then(({ request }) => {
        const up = request(proxied, (r) => {
          res.writeHead(r.statusCode ?? 500, r.headers)
          r.pipe(res)
        })
        up.on("error", () => { res.writeHead(502); res.end() })
        req.pipe(up)
      })
    })
    front.listen(port, "127.0.0.1")
    console.log(`serving ${id} at http://127.0.0.1:${port}`)
  } else console.log(`serving ${id} at ${base}`)
  process.on("SIGTERM", () => { server.close(); process.exit(0) })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
