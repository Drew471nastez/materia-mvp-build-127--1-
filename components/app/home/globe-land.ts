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
export const GLOBE_STEP = 1.5

const LAND_MASK =
  "AAAAAAAAAAAAAMA9EAAA9AeMAADwPwAAAABK/iAABACACH4AEBwCAACAHwAIHgAA8BH+AAD0PwDePwoH/P/bAJAfPnRh/AE40P//Zw4AvvTA/4EFAAAAPAAAGAP/DwgIAAAACgAAHI+PPzMAAAAAAPz/vzAcCHD//////z/4///TggEQ7///////Hfj+/4MDBAC8///////nAAz8/8EBAAB4/v////8jAcCA/x/4AAAQjP//////wABAgP//4QMAgFD+/////w8YAADg///9AwCggP//////H2AAAAD+/7//AABo/v///////2CAAADw/3//AQDQ/f///////w8CAAAA/P//DwAAAP7///////8fAAAAAPD//38GAAD+/////////wcAAAAA4P//fwAAAPj/////////FwAAAACA////FwAAAP8/ff7/////AAAAAACA////CwAAAPz84Pn/////RwAAAAAA+P//HwAAAPBhPnD8/////yAAAAAAAPD//z8AAADAB/adx/////8HAAAAAAAA/v//AwAAAPAAyP/z////vwIBAAAAAAD4//8PAAAAgAeA/h//////YRAAAAAAAAD///8BAAAAwHhA9e//////MwwAAAAAAAD8//8DAAAAAPsDo///////H/MAAAAAAACA//8fAAAAAOB/AOD//////w8aAAAAAAAAAP7/HwAAAADA/8+A//////9/AAAAAAAAAADA//8AAAAAAP7//f///////w8AAAAAAAAAAND/gAAAAAAA/v////f/////PwAAAAAAAAAAYP8AAwAAAAD+///fP///////AAAAAAAAAAAAwB9AAAAAAMD////nH/7///8/AAAAAAAAAAAAyA8AAAAAAMD////PPwH///9/AQAAAAAAAAAAgHwAAAAAAAD+////+X/g////JwAAAAAAAAAAAIAPgAEAAADA////f/4f8P/+PwAAAAAAAAAAAACAHwMGAAAAgP/////8H8B/+A8AAAAAAAAAAAAAED4GcAAAAAD/////8z8A/8CfAAAAAAAAAAAAAACAfwAAAAAA4P/////8A8AP+AcQAAAAAAAAAAAAAEA/AAAAAAD8////Pz8A8AD4AwYAAAAAAAAAAAAAAHwAAAAAAPz/////HgDgAfAPGAAAAAAAAAAAAAAA4AAAAAAA+P////8HAIADQB8AAAAAAAAAAAAAAAAAAgoAAACA/////x8CABwA8gAEAAAAAAAAAAAAAAAw2A8AAADw/////z8AgAEgBCAAAAAAAAAAAAAAAACQ/wcAAAD8/////w8AgAAYACAAAAAAAAAAAAAAAADg/wMAAAD//////wEAIAAEIAQAAAAAAAAAAAAAAADw/w8AAAA++P//fwAAAEAMMAAAAAAAAAAAAAAAAAD8/w8AAAAA8P//HwAAAEADDgAAAAAAAAAAAAAAAAD+/w8AAAAA8P//DwAAAIAEDwAAAAAAAAAAAAAAAAD//wcAAAAA+P//AwAAAIDB7wQAAAAAAAAAAAAAAAD//zcAAAAA+P//AwAAAADHr2QAAAAAAAAAAAAAAID//38AAAAA+P//AAAAAIDHNyADAAAAAAAAAAAAAID///8HAAAA8P9/AAAAAAAGMuAfAAAAAAAAAAAAAMD///8PAAAA8P8fAAAAAAACEIAPAAAAAAAAAAAAAMD///8HAAAA+P8PAAAAAAADAMAPAgAAAAAAAAAAAPD///8BAAAA/v8DAAAAAAAMBGgCAgAAAAAEAAAAAPz//z8AAACA//8AAAAAAACAAICBAAAAAAAAAAAAgP///wEAAAD4/w8AAAAAAAAAQAAAAAAAAAAAAAAA+P//DwAAAOD/fxAAAAAAAAAeAgAAAAAAAAAAAADw//8PAAAA4P//MAAAAAAAgB4GAAAAAAAAAAAAAMD//x8AAADA//8wAAAAAADAPwYAAAAAAAAAAAAAwP//BwAAAPj/DwcAAAAAAP7vAAAAAAAAAAAAAADw/38AAAAA/39wAAAAAADg/w8AAAAAAAAAAAAAwP//AAAAAPx/4CAAAAAA8P8/AAAAAAAAAAAAAID//wEAAAD4/+AAAAAAAP7/fwAAAAAAAAAAAADw/w8AAAAA/x8cAAAAAOD//w8AAAAAAAAAAAAA/n8AAAAA8P/BAAAAAAD///8AAAAAAAAAAAAA/n8AAAAA8H8AAAAAAID//38AAAAAAAAAAAAA/x8AAAAA+B8AAAAAAOD//w8AAAAAAAAAAAD8fwAAAADgPwAAAAAAwP//HwAAAAAAAAAAAPx/AAAAAMAfAAAAAADg//8HAAAAAAAAAACA/wMAAAAA/AAAAAAAAH74PwAAAAAAAAAAAPwPAAAAAPAAAAAAAAA+4D8AAAAAAAAAAAD/AAAAAAAAAAAAAAAAAPwBIAAAAAAAAAD8BwAAAAAAAAAAAAAAAPABAAAAAAAAAAD+AQAAAAAAAAAAAAAAAA4ADAAAAAAAAPADAAAAAAAAAAAAAAAAAAAQAAAAAAAAeAAAAAAAAAAAAAAAAAADwAAAAAAAAMAHAAAAAAAAAAAAAAAABEAAAAAAAADgAQAAAAAAAAAAAAAAAAADAAAAAAAABwAAAAAAAAAAAAAAAIABAAAAAADgAQAAAAAAAAAAAAAAAAAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAABgCAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAQAAgAH8cQAAAAAAAAAAf/7/AwAAADgAAPDv//8BAAAwAPL/+///AAAQAvj///9/AIg/gP///38A/x/w////B/0P+P///8D/6P//f/Cf/P//4J///8f//38CAAAAAAAA"

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
