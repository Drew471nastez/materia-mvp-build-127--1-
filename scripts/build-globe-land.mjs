/**
 * ===========================================================================
 *  THE LAND ON HOME'S GLOBE, AS ONE BIT PER DOT
 * ===========================================================================
 * The globe in the Pro plan banner (components/app/home/globe.tsx) draws a
 * dot wherever there is land. Which dots those are never changes, so it is
 * worked out here once, from Natural Earth's land outline (public domain,
 * through the world-atlas package), and written into
 * components/app/home/globe-land.ts as a bit per dot: about 1.3 kB of text
 * instead of a map the browser would have to download and test every dot
 * against.
 *
 * The dots sit in rows of latitude, GLOBE_STEP degrees apart, each row
 * holding as many dots as fit around the globe at that latitude, every
 * other row shifted half a dot so they nest. globe-land.ts walks the same
 * rows in the same order to read the bits back, so the loop below and
 * `landDots` there have to stay the same loop.
 *
 *   node scripts/build-globe-land.mjs [land-50m.json]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const STEP = 1.5
const SOURCE = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json"

const topo = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : await (await fetch(SOURCE)).json()

/* TopoJSON keeps shared borders once, as quantised deltas. Back to degrees. */
const { scale, translate } = topo.transform
const arcs = topo.arcs.map((arc) => {
  let x = 0
  let y = 0
  return arc.map(([dx, dy]) => {
    x += dx
    y += dy
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]]
  })
})
const ringOf = (ids) => {
  const out = []
  for (const id of ids) {
    const pts = id < 0 ? arcs[~id].slice().reverse() : arcs[id]
    out.push(...(out.length ? pts.slice(1) : pts))
  }
  return out
}
const rings = []
for (const geometry of topo.objects.land.geometries) {
  const polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs
  for (const polygon of polygons) for (const ring of polygon) rings.push(ringOf(ring))
}

/* Even-odd over every ring at once: a lake inside a continent is a hole. */
const isLand = (lon, lat) => {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

const bits = []
const rows = Math.round(180 / STEP)
for (let r = 0; r < rows; r++) {
  const lat = 90 - STEP / 2 - r * STEP
  const count = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP))
  for (let i = 0; i < count; i++) {
    const lon = -180 + ((i + (r % 2) * 0.5) * 360) / count
    bits.push(isLand(lon, lat) ? 1 : 0)
  }
}
const bytes = new Uint8Array(Math.ceil(bits.length / 8))
bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7) })
const mask = Buffer.from(bytes).toString("base64")
const land = bits.reduce((a, b) => a + b, 0)

const file = join(process.cwd(), "components/app/home/globe-land.ts")
const source = readFileSync(file, "utf8")
const next = source
  .replace(/export const GLOBE_STEP = [\d.]+/, `export const GLOBE_STEP = ${STEP}`)
  .replace(/const LAND_MASK =\n  "[^"]*"/, `const LAND_MASK =\n  "${mask}"`)
writeFileSync(file, next)
console.log(`${bits.length} dots, ${land} on land, ${mask.length} characters`)
