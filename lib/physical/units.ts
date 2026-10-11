/**
 * Grams and millimetres are stored; a merchant types and reads kilograms,
 * pounds, ounces, centimetres or inches. Conversions round to whole stored
 * units, so a value typed and read back is the value typed.
 */

export type WeightUnit = "g" | "kg" | "oz" | "lb"
export type DimensionUnit = "cm" | "in"

const GRAMS: Record<WeightUnit, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 }
const MM: Record<DimensionUnit, number> = { cm: 10, in: 25.4 }

export function toGrams(value: number | string | null | undefined, unit: WeightUnit): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null
  return Math.round(n * GRAMS[unit])
}

/**
 * The shortest number (up to three decimals) that reads back to the same
 * stored value. A pound typed is 454 g, and 454 g read back is "1", not
 * "1.001"; a kilo is "1", and 1234 g is "1.234".
 */
function shortest(stored: number, per: number, back: (v: number) => number): number {
  const exact = stored / per
  for (let d = 0; d <= 3; d++) {
    const f = 10 ** d
    const v = Math.round(exact * f) / f
    if (back(v) === stored) return v
  }
  return Math.round(exact * 1000) / 1000
}

export function fromGrams(grams: number | null | undefined, unit: WeightUnit): number | null {
  if (grams === null || grams === undefined || !Number.isFinite(grams)) return null
  return shortest(grams, GRAMS[unit], (v) => Math.round(v * GRAMS[unit]))
}

export function toMm(value: number | string | null | undefined, unit: DimensionUnit): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null
  return Math.round(n * MM[unit])
}

export function fromMm(mm: number | null | undefined, unit: DimensionUnit): number | null {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return null
  return shortest(mm, MM[unit], (v) => Math.round(v * MM[unit]))
}

export function formatLength(mm: number | null | undefined, unit: DimensionUnit): string {
  const v = fromMm(mm, unit)
  return v === null ? "" : `${v} ${unit}`
}

export function formatWeight(grams: number | null | undefined, unit: WeightUnit): string {
  const v = fromGrams(grams, unit)
  return v === null ? "" : `${v} ${unit}`
}

/** The shop's measuring system (Settings > Shipping): what new products and rate tiers are typed in. */
export type UnitSystem = "metric" | "imperial"

export function weightUnitFor(system: UnitSystem): WeightUnit {
  return system === "imperial" ? "lb" : "kg"
}

export function dimensionUnitFor(system: UnitSystem): DimensionUnit {
  return system === "imperial" ? "in" : "cm"
}

/** For light things, like an empty box or a mailer: grams or ounces. */
export function smallWeightUnitFor(system: UnitSystem): WeightUnit {
  return system === "imperial" ? "oz" : "g"
}

/** "30 × 20 × 10 cm" or "11.81 × 7.87 × 3.94 in": a box's size in the shop's system. */
export function formatSize(lengthMm: number, widthMm: number, heightMm: number, system: UnitSystem): string {
  const unit = dimensionUnitFor(system)
  return `${[lengthMm, widthMm, heightMm].map((n) => fromMm(n, unit) ?? 0).join(" × ")} ${unit}`
}

/** "1.5 kg" or "3.31 lb": a stored weight in the shop's system. */
export function formatSystemWeight(grams: number | null | undefined, system: UnitSystem): string {
  return formatWeight(grams, weightUnitFor(system))
}
