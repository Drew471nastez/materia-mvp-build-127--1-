/**
 * ===========================================================================
 *  OPTIONS AND THE VARIANTS THEY MAKE
 * ===========================================================================
 * Up to three options (Size, Color, Material...), each with its values.
 * Every combination is a variant (Size M / Color Black), stored on the
 * existing product_variants with option1..option3. A product with no
 * options still has exactly one variant, "Default", so stock, SKU and
 * weight always belong to a variant and every part reads them one way.
 *
 * Pure: the editor previews with it and the server saves with it, so the
 * two cannot disagree about which variants exist.
 */

import { cleanSwatches } from "@/lib/products/option-swatches"
import type { ProductOption } from "./types"

export const MAX_OPTIONS = 3
export const MAX_VALUES = 100
export const MAX_VARIANTS = 250
export const DEFAULT_VARIANT_NAME = "Default"

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** Options as typed, made safe: named, deduplicated (case-blind), at most three, each with at least one value. */
export function normaliseOptions(input: unknown): ProductOption[] {
  if (!Array.isArray(input)) return []
  const out: ProductOption[] = []
  const seenNames = new Set<string>()
  for (const raw of input.slice(0, 10)) {
    if (out.length >= MAX_OPTIONS) break
    const name = clean((raw as { name?: unknown })?.name, 40)
    if (!name || seenNames.has(name.toLowerCase())) continue
    const rawValues = Array.isArray((raw as { values?: unknown })?.values) ? ((raw as { values: unknown[] }).values) : []
    const values: string[] = []
    const seen = new Set<string>()
    for (const v of rawValues) {
      const value = clean(v, 100)
      if (!value || seen.has(value.toLowerCase())) continue
      seen.add(value.toLowerCase())
      values.push(value)
      if (values.length >= MAX_VALUES) break
    }
    if (values.length === 0) continue
    seenNames.add(name.toLowerCase())
    const swatches = cleanSwatches((raw as { swatches?: unknown })?.swatches, values)
    out.push({ position: (out.length + 1) as 1 | 2 | 3, name, values, ...(Object.keys(swatches).length ? { swatches } : {}) })
  }
  return out
}

export type Combination = [string | null, string | null, string | null]

/** Every combination, in the order a merchant reads them: the first option slowest. */
export function combinations(options: ProductOption[]): Combination[] {
  if (options.length === 0) return [[null, null, null]]
  let rows: string[][] = [[]]
  for (const option of options) {
    const next: string[][] = []
    for (const row of rows) for (const value of option.values) next.push([...row, value])
    rows = next
    if (rows.length > MAX_VARIANTS) throw new Error(`At most ${MAX_VARIANTS} variants. Remove some option values.`)
  }
  return rows.map((r) => [r[0] ?? null, r[1] ?? null, r[2] ?? null])
}

export function combinationKey(c: Combination | readonly (string | null | undefined)[]): string {
  return [c[0] ?? "", c[1] ?? "", c[2] ?? ""].map((v) => v.toLowerCase()).join("\u0001")
}

/** "M / Black", or "Default" for a product without options. */
export function variantName(c: Combination | readonly (string | null | undefined)[]): string {
  const parts = [c[0], c[1], c[2]].filter((v): v is string => typeof v === "string" && v !== "")
  return parts.length ? parts.join(" / ") : DEFAULT_VARIANT_NAME
}

/**
 * Which existing variants survive a change of options, which are new, and
 * which go: matched by their option values, so a variant keeps its id (and
 * its stock, orders and history) through an edit that does not remove it.
 */
export function planVariants<T extends { id: string; options: readonly (string | null)[] }>(
  existing: T[],
  options: ProductOption[],
): { keep: { id: string; options: Combination }[]; create: Combination[]; remove: string[] } {
  const wanted = combinations(options)
  const byKey = new Map(existing.map((v) => [combinationKey(v.options), v]))
  const keep: { id: string; options: Combination }[] = []
  const create: Combination[] = []
  const used = new Set<string>()
  for (const c of wanted) {
    const hit = byKey.get(combinationKey(c))
    if (hit && !used.has(hit.id)) {
      keep.push({ id: hit.id, options: c })
      used.add(hit.id)
    } else {
      create.push(c)
    }
  }
  /* One variant and no options before or after (the Default one): keep it whatever its stored values. */
  if (options.length === 0 && keep.length === 0 && existing.length > 0) {
    return { keep: [{ id: existing[0].id, options: [null, null, null] }], create: [], remove: existing.slice(1).map((v) => v.id) }
  }
  const remove = existing.filter((v) => !used.has(v.id)).map((v) => v.id)
  return { keep, create, remove }
}

/** The variant a buyer means by their chosen values, if it exists. */
export function findVariant<T extends { options: readonly (string | null)[] }>(variants: T[], chosen: readonly (string | null | undefined)[]): T | null {
  const key = combinationKey(chosen)
  return variants.find((v) => combinationKey(v.options) === key) ?? null
}
