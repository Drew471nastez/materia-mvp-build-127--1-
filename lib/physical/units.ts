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

export function fromGrams(grams: number | null | undefined, unit: WeightUnit): number | null {
  if (grams === null || grams === undefined) return null
  const v = grams / GRAMS[unit]
  return Math.round(v * 1000) / 1000
}

export function toMm(value: number | string | null | undefined, unit: DimensionUnit): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null
  return Math.round(n * MM[unit])
}

export function fromMm(mm: number | null | undefined, unit: DimensionUnit): number | null {
  if (mm === null || mm === undefined) return null
  return Math.round((mm / MM[unit]) * 100) / 100
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

/** "1.5 kg" or "3.31 lb": a stored weight in the shop's system. */
export function formatSystemWeight(grams: number | null | undefined, system: UnitSystem): string {
  return formatWeight(grams, weightUnitFor(system))
}
