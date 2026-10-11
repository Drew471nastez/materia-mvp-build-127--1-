/**
 * Collections: a hand-picked list, or a smart one whose products are the
 * ones matching its rules (all of them, or any). Pure, so the storefront,
 * the editor's preview and the discount check agree on who is in.
 */

/* `category` is the product's category from the editor (lib/products/category-groups.ts), the same value the website's Product type filter and an imported theme's product.type read. */
export const RULE_FIELDS = ["title", "type", "tag", "vendor", "price", "compare_at_price", "inventory", "weight", "category"] as const
export type RuleField = (typeof RULE_FIELDS)[number]
export const RULE_OPS = ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "less_than"] as const
export type RuleOp = (typeof RULE_OPS)[number]

export interface CollectionRule {
  field: RuleField
  op: RuleOp
  value: string
}

export interface RuleProduct {
  id: string
  title: string
  type: string
  tags: string[]
  vendor: string | null
  priceCents: number
  compareAtCents: number | null
  inventory: number | null
  weightGrams: number | null
  createdAt?: string
  /** The product's category, "T-Shirts" or "Candles"; missing where a reader did not ask for it. */
  category?: string | null
}

const NUMERIC: RuleField[] = ["price", "compare_at_price", "inventory", "weight"]

export const RULE_FIELD_LABEL: Record<RuleField, string> = {
  title: "Title",
  type: "Product type",
  tag: "Tag",
  vendor: "Vendor",
  price: "Price",
  compare_at_price: "Compare-at price",
  inventory: "Inventory",
  weight: "Weight (g)",
  category: "Category",
}

export const RULE_OP_LABEL: Record<RuleOp, string> = {
  equals: "is equal to",
  not_equals: "is not equal to",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  greater_than: "is greater than",
  less_than: "is less than",
}

export function readRules(input: unknown): CollectionRule[] {
  if (!Array.isArray(input)) return []
  const out: CollectionRule[] = []
  for (const raw of input.slice(0, 20)) {
    const r = raw as Partial<CollectionRule>
    if (!RULE_FIELDS.includes(r?.field as RuleField) || !RULE_OPS.includes(r?.op as RuleOp)) continue
    const value = typeof r.value === "string" ? r.value.trim().slice(0, 200) : typeof r.value === "number" ? String(r.value) : ""
    if (!value) continue
    if (NUMERIC.includes(r.field as RuleField) && !Number.isFinite(Number(value))) continue
    out.push({ field: r.field as RuleField, op: r.op as RuleOp, value })
  }
  return out
}

function numberOf(p: RuleProduct, field: RuleField): number | null {
  if (field === "price") return p.priceCents / 100
  if (field === "compare_at_price") return p.compareAtCents === null ? null : p.compareAtCents / 100
  if (field === "inventory") return p.inventory
  if (field === "weight") return p.weightGrams
  return null
}

function textCompare(value: string, op: RuleOp, want: string): boolean {
  const v = value.toLowerCase()
  const w = want.toLowerCase()
  switch (op) {
    case "equals":
      return v === w
    case "not_equals":
      return v !== w
    case "contains":
      return v.includes(w)
    case "not_contains":
      return !v.includes(w)
    case "starts_with":
      return v.startsWith(w)
    case "ends_with":
      return v.endsWith(w)
    default:
      return false
  }
}

export function ruleMatches(rule: CollectionRule, p: RuleProduct): boolean {
  if (NUMERIC.includes(rule.field)) {
    const n = numberOf(p, rule.field)
    const want = Number(rule.value)
    if (n === null) return rule.op === "not_equals"
    if (rule.op === "equals") return n === want
    if (rule.op === "not_equals") return n !== want
    if (rule.op === "greater_than") return n > want
    if (rule.op === "less_than") return n < want
    return false
  }
  if (rule.field === "tag") {
    const tags = p.tags.map((t) => t.toLowerCase())
    const want = rule.value.toLowerCase()
    if (rule.op === "equals") return tags.includes(want)
    if (rule.op === "not_equals") return !tags.includes(want)
    if (rule.op === "not_contains") return !tags.some((t) => t.includes(want))
    return tags.some((t) => textCompare(t, rule.op, want))
  }
  const value = rule.field === "title" ? p.title : rule.field === "type" ? p.type : rule.field === "category" ? (p.category ?? "") : (p.vendor ?? "")
  return textCompare(value, rule.op, rule.value)
}

export function inSmartCollection(rules: CollectionRule[], match: "all" | "any", p: RuleProduct): boolean {
  if (rules.length === 0) return false
  return match === "any" ? rules.some((r) => ruleMatches(r, p)) : rules.every((r) => ruleMatches(r, p))
}

export const COLLECTION_SORTS = ["manual", "best_selling", "title", "price_asc", "price_desc", "newest"] as const
export type CollectionSort = (typeof COLLECTION_SORTS)[number]

export function sortProducts<T extends RuleProduct & { position?: number; sales?: number }>(products: T[], sort: CollectionSort): T[] {
  const list = [...products]
  const created = (p: T) => (p.createdAt ? Date.parse(p.createdAt) || 0 : 0)
  switch (sort) {
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title))
    case "price_asc":
      return list.sort((a, b) => a.priceCents - b.priceCents)
    case "price_desc":
      return list.sort((a, b) => b.priceCents - a.priceCents)
    case "newest":
      return list.sort((a, b) => created(b) - created(a))
    case "best_selling":
      return list.sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))
    default:
      return list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
