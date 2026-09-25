/**
 * ===========================================================================
 *  WHERE THE GLOBE PUTS A DOT
 * ===========================================================================
 * The land of the world as one bit per dot, written by
 * scripts/build-globe-land.mjs from Natural Earth's outline (public domain).
 * Do not edit LAND_MASK by hand: run the script.
 *
 * The dots sit in rows of latitude GLOBE_STEP degrees apart, from the north
 * down. Each row holds as many dots as fit around the globe at its latitude,
 * so they are as far apart at the equator as near the poles, and every other
 * row is shifted half a dot so the rows nest instead of stacking into
 * columns. The script walks the rows in this same order, so `landDots` and
 * the loop there are one loop written twice, and have to stay that way.
 */
export const GLOBE_STEP = 2

const LAND_MASK =
  "AAAAABAAAHwgAMAeAQCA6AMAAAAfHwA4AgB9fADAH/A/x+H/KwB8fP+MB4gnAAAOAJzxPwgAAID+/zcOg+3////j/z+IAWD/////D/f/YTAA7v///z8Dw//hAAA4////PwjA4P/hAQCh////fzAAAP+/HwAY8P///w8MAAD+f38A4P7/////QwAA4P//BwDw//////8HAAAA///HAAD+/////38AAACA//9HAAD+v/////8BAAAA+P9/AQCA9/H+//9/AAAAAPz/PwAA4NGD+f///xAAAAAA//8HAAB40P/9////AAAAAAD//wcAAPBA/ef//z9CAAAAAMD//wAAADCW/Pf///9CAAAAAMD//wAAAOAPwP/////oAAAAAADw/w8AAAD+A/D/////CAAAAAAA6P8DAAAA/t/9/////wEAAAAAAAB/IAAAAPD//7////8/AAAAAAAA0A8EAAAA/v+/n////w8AAAAAAABAHwAAAAD8///9hP//fwAAAAAAAADwgAAAAMD//5//wP//FwAAAAAAAAB4DAEAAOD//7//4B9/AAAAAAAIAADwDAgAAOD//3//gB9+AQAAAAAAAAAAPgAAABD+///nA/DADwQAAAAAAAAAAB8AAADg////HAAO8IMAAAAAAAAAAAAEAAAA8P///wMAB/ABAAAAAAAAAAAAggMAAPD///8ZAAbAgQAAAAAAAAAAAFB/AACA////PwAoQAIAAAAAAAAAAAAA/gMAAPz///8AgAACIAAAAAAAAAAAAOD/AQCAwP//BwAALDAAAAAAAAAAAACA/x8AAAD4/x8AAIDCAQAAAAAAAAAAAPj/AQAAgP//AAAAMJ4EAAAAAAAAAADA/38AAAD8/wcAAADjgQEAAAAAAAAAAPj/fwAAAP9/AAAAYN3oAwAAAAAAAADg//8HAAD4/wEAAAACBDwAAAAAAAAAAP7//wAAgP8fAAAAwAPAAwAAAAAAAADw//8DAAD+fwAAAAAAAEIAAAAAAAAAgP//BwAA8P8BAAAAAAAAAAAAAAAAAID//wMAAPj/EAAAAABwAgAAAAAAAACA//8BAAD+fwwAAAAAHwMAAAAAAAAAwP8fAADA/+cAAAAA/DsAAAAAAAAAAPz/AQAA/g8HAAAA4P8BAAAAAAAAAPj/AQAA/A8HAAAA/P8DAAAAAAAAAPh/AAAA/A8DAAAA//8BAAAAAAAAAP8DAADAfxgAAAD4/x8AAAAAAAAA/A8AAAD/AAAAAPD/PwAAAAAAAAD/AwAAgB8AAAAA/P8DAAAAAAAA4B8AAAD4AAAAAOD/HwAAAAAAAOAfAAAAeAAAAADw8AcAAAAAAADwAQAAAAAAAAAAAHwAAAAAAADgBwAAAAAAAAAAADwAAAAAAADwAAAAAAAAAAAAAAAwAAAAAMABAAAAAAAAAAAAABAAAAAA4AEAAAAAAAAAAECAAAAAAAADAAAAAAAAAAAAMAAAAADAAAAAAAAAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAwK8BAAAYAECf/x8AABSA//v/BwA48P/+f4Dzgf//P/AH//8/+MP///Hn/x///w8AAAA="

let LAND: Float32Array | null = null

/**
 * Every dot on land, as a point on a sphere of radius 1: x east, y up, z
 * towards longitude 0. Read from the mask once per page and kept: the
 * globe mounts again every time Home is opened, and both renderers use it.
 * Two passes over the bits, the first to count, so the one array is made
 * at its size and nothing else is allocated.
 */
export function landDots(): Float32Array {
  if (LAND) return LAND
  const text = atob(LAND_MASK)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  const rows = Math.round(180 / GLOBE_STEP)
  const perRow = new Int32Array(rows)
  let total = 0
  let set = 0
  for (let r = 0; r < rows; r++) {
    const lat = 90 - GLOBE_STEP / 2 - r * GLOBE_STEP
    perRow[r] = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / GLOBE_STEP))
    for (let i = 0; i < perRow[r]; i++, total++) if (bytes[total >> 3] & (1 << (total & 7))) set++
  }
  const out = new Float32Array(set * 3)
  let bit = 0
  let n = 0
  for (let r = 0; r < rows; r++) {
    const lat = 90 - GLOBE_STEP / 2 - r * GLOBE_STEP
    const φ = (lat * Math.PI) / 180
    const cφ = Math.cos(φ)
    const sφ = Math.sin(φ)
    const count = perRow[r]
    for (let i = 0; i < count; i++, bit++) {
      if (!(bytes[bit >> 3] & (1 << (bit & 7)))) continue
      const λ = ((-180 + ((i + (r % 2) * 0.5) * 360) / count) * Math.PI) / 180
      out[n++] = cφ * Math.sin(λ)
      out[n++] = sφ
      out[n++] = cφ * Math.cos(λ)
    }
  }
  LAND = out
  return out
}

/** Latitude and longitude in degrees, to x, y, z on a sphere of radius 1. */
export function toSphere(lat: number, lon: number): [number, number, number] {
  const φ = (lat * Math.PI) / 180
  const λ = (lon * Math.PI) / 180
  return [Math.cos(φ) * Math.sin(λ), Math.sin(φ), Math.cos(φ) * Math.cos(λ)]
}
