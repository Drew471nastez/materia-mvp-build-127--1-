"use client"

/**
 * ===========================================================================
 *  PRODUCTS › COLLECTIONS: THE PIECES THE LIST AND THE EDITOR SHARE
 * ===========================================================================
 * The words a collection is described with, its cover, and the phone
 * breakpoint the editor's sheet opens at. Everything here is drawn the way
 * the products list draws a product (../products-client.tsx Thumb), so a
 * collection sits beside its products as one of them.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { PORTRAIT_QUALITY, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { readRules, type CollectionRule, type RuleField, type RuleOp, type RuleProduct } from "@/lib/physical/collections"
import type { CollectionProduct, CollectionView } from "@/lib/physical/collections-server"
import { tt, msg } from "@/lib/i18n/text"
import { currencyMark } from "@/lib/store/currency"

export type Collection = CollectionView
export type { CollectionProduct }

/** The kinds a product can be, as a rule on Product type reads them. */
export const PRODUCT_KINDS = [
  ["digital", msg("Digital product")],
  ["course", msg("Course")],
  ["membership", msg("Membership")],
  ["community", msg("Community")],
  ["service", msg("Service")],
  ["physical", msg("Physical product")],
] as const
export const KIND_LABEL: Record<string, string> = Object.fromEntries(PRODUCT_KINDS)

/** Rules that only mean something for goods with stock and weight: offered only while physical commerce is on. */
export const PHYSICAL_RULES: ReadonlySet<string> = new Set(["vendor", "inventory", "weight"])

export const NUMERIC_FIELDS: ReadonlySet<RuleField> = new Set(["price", "compare_at_price", "inventory", "weight"])

/** The words between a field and its value, as a sentence reads them. */
export const OP_WORDS: Record<RuleOp, string> = {
  equals: "is",
  get not_equals() { return tt("is not") },
  contains: "contains",
  not_contains: "does not contain",
  get starts_with() { return tt("starts with") },
  get ends_with() { return tt("ends with") },
  get greater_than() { return tt("is more than") },
  get less_than() { return tt("is less than") },
}

/** Which conditions make sense for a field: a number compares, a kind is or is not, words match. */
export function opsFor(field: RuleField): RuleOp[] {
  if (NUMERIC_FIELDS.has(field)) return ["equals", "not_equals", "greater_than", "less_than"]
  if (field === "type") return ["equals", "not_equals"]
  if (field === "category") return ["equals", "not_equals", "contains", "not_contains"]
  return ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with"]
}

export const SORTS = [
  ["manual", msg("Your order")],
  ["best_selling", msg("Best selling")],
  ["newest", msg("Newest")],
  ["price_asc", msg("Price, low to high")],
  ["price_desc", msg("Price, high to low")],
  ["title", msg("Name, A to Z")],
] as const

/** A rule's value as a person would say it: Course, not course; $30 or 30 lei, not 30 (in the store's currency, which a price rule compares in). */
export function valueWords(rule: CollectionRule, currency = "USD"): string {
  if (rule.field === "type") return KIND_LABEL[rule.value] ? tt(KIND_LABEL[rule.value]) : rule.value
  if (rule.field === "price" || rule.field === "compare_at_price") {
    const mark = currencyMark(currency)
    return mark.position === "prefix" ? `${mark.symbol}${rule.value}` : `${rule.value} ${mark.symbol}`
  }
  if (rule.field === "weight") return `${rule.value} g`
  return rule.value
}

const FIELD_WORDS: Record<RuleField, string> = {
  get title() { return tt("Title") },
  type: "Product type",
  get tag() { return tt("Tag") },
  get vendor() { return tt("Vendor") },
  get price() { return tt("Price") },
  get compare_at_price() { return tt("Compare at price") },
  get inventory() { return tt("Stock") },
  get weight() { return tt("Weight") },
  get category() { return tt("Category") },
}

export const fieldWords = (field: RuleField) => FIELD_WORDS[field]

/** What decides a collection's products, in one line: "Product type is Course and 1 more", or "Picked by hand". */
export function howWords(c: Pick<Collection, "kind" | "rules" | "match">, currency = "USD"): string {
  if (c.kind !== "smart") return tt("Picked by hand")
  const [first, ...rest] = c.rules
  if (!first) return tt("No conditions yet")
  const lead = `${FIELD_WORDS[first.field]} ${OP_WORDS[first.op]} ${valueWords(first, currency)}`
  return rest.length ? tt("{lead} {value} {length} more", { lead, value: c.match === "any" ? "or" : "and", length: rest.length }) : lead
}

export const countWords = (n: number) => tt("{n, plural, one {# product} other {# products}}", { n })

/** A product as a rule reads it (lib/physical/collections), from what the server sent. */
export function ruleProduct(p: CollectionProduct): RuleProduct {
  return {
    id: p.id,
    title: p.title ?? "",
    type: p.type ?? "",
    tags: p.tags ?? [],
    vendor: p.vendor ?? null,
    priceCents: p.price_cents ?? 0,
    compareAtCents: p.compare_at_price_cents ?? null,
    inventory: p.inventory_count ?? null,
    weightGrams: p.weight_grams ?? null,
    category: p.category ?? null,
  }
}

/** The conditions that would be saved: the server drops the unfinished ones the same way (readRules). */
export const finishedRules = (rules: CollectionRule[]) => readRules(rules)

/** The editor's phone breakpoint, the app's confirm sheet's (../new/confirm-sheet.tsx). */
const PHONE = "(max-width: 639px)"

/**
 * Read on the first render, not after it: the editor is only ever mounted by
 * a press in the browser, and a first frame that guessed "computer" would
 * draw the dialog on a phone for one frame before the sheet.
 */
export function usePhone(): boolean {
  const [phone, setPhone] = React.useState(() => typeof window !== "undefined" && !!window.matchMedia?.(PHONE).matches)
  React.useEffect(() => {
    const mql = window.matchMedia(PHONE)
    const check = () => setPhone(mql.matches)
    check()
    mql.addEventListener("change", check)
    return () => mql.removeEventListener("change", check)
  }, [])
  return phone
}

/* ─── Pictures ─────────────────────────────────────────────────────────── */

export type CoverSize = "phone" | "table" | "pick"

/** The box each size is drawn in, and the files offered for it at 1x, 2x and 3x (the products list's own). */
const BOX: Record<CoverSize, number> = { phone: 50, table: 48, pick: 40 }
const FILES: Record<CoverSize, number[]> = { phone: [64, 128, 256], table: [48, 96, 128], pick: [48, 96, 128] }
const SIZES: Record<CoverSize, string> = { phone: "50px", table: "(min-width: 1280px) 48px, (min-width: 1024px) 44px, 40px", pick: "40px" }
const FRAME: Record<CoverSize, string> = {
  phone: "h-[50px] w-[50px] rounded-[11px]",
  table: "h-10 w-10 rounded-[9px] lg:h-[44px] lg:w-[44px] lg:rounded-[10px] xl:h-[48px] xl:w-[48px] xl:rounded-[11px]",
  pick: "h-10 w-10 rounded-[9px]",
}

function Picture({ src, size, className }: { src: string; size: CoverSize; className?: string }) {
  const srcSet = optimizedSrcSet(src, FILES[size], PORTRAIT_QUALITY)
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- the files are chosen here, as the products list chooses them */
    <img
      src={srcSet ? optimizedImageUrl(src, BOX[size], PORTRAIT_QUALITY) : src}
      srcSet={srcSet || undefined}
      sizes={SIZES[size]}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("h-full w-full object-cover", className)}
    />
  )
}

/** The first letter of a name, on the grey a missing picture shows. */
function Letter({ title, size }: { title: string; size: CoverSize }) {
  const letter = (Array.from(title.trim())[0] || "").toUpperCase()
  return (
    <span aria-hidden className={cn("flex h-full w-full items-center justify-center font-semibold text-[#9ca3af]", size === "phone" ? "text-[18px]" : "text-[15px] lg:text-[16.5px]")}>
      {letter}
    </span>
  )
}

/** The frame every picture here is drawn in: the products list's grey under it, and a hairline inside so a white picture still has an edge. */
const FRAME_LOOK =
  "pointer-events-none relative shrink-0 overflow-hidden bg-[#eceef1] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)] after:content-['']"

/** A product's picture in the picker: the products list's Thumb, at 40px. */
export function ProductThumb({ src, title }: { src: string | null; title: string }) {
  return <span className={cn(FRAME_LOOK, FRAME.pick)}>{src ? <Picture src={src} size="pick" /> : <Letter title={title} size="pick" />}</span>
}

/**
 * A COLLECTION'S COVER. Its own picture when it has one. Otherwise the
 * pictures of what is in it, the way a photo album shows its first photos:
 * one fills the square, two share it side by side, three are one tall and
 * two stacked. With no pictures at all, its first letter on grey, as a
 * product without a cover is drawn, so two collections can still be told
 * apart at a glance.
 */
export function CollectionCover({ collection, pictures, size }: { collection: Pick<Collection, "title" | "imageUrl">; pictures: string[]; size: CoverSize }) {
  const shown = collection.imageUrl ? [collection.imageUrl] : pictures.slice(0, 3)
  return (
    <span data-cover={shown.length} className={cn(FRAME_LOOK, FRAME[size])}>
      {shown.length === 0 ? (
        <Letter title={collection.title} size={size} />
      ) : shown.length === 1 ? (
        <Picture src={shown[0]} size={size} />
      ) : (
        <span className={cn("grid h-full w-full gap-px bg-white", shown.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2")}>
          {shown.map((src, i) => (
            <span key={`${i}-${src}`} className={cn("min-h-0 min-w-0 overflow-hidden bg-[#eceef1]", shown.length === 3 && i === 0 && "row-span-2")}>
              <Picture src={src} size={size} />
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

/** The pictures a cover can use: the products in the collection that have one, in the collection's order. */
export function picturesOf(collection: Pick<Collection, "productIds">, byId: Map<string, CollectionProduct>): string[] {
  const out: string[] = []
  for (const id of collection.productIds) {
    const src = byId.get(id)?.thumbnail_url
    if (src) out.push(src)
    if (out.length === 3) break
  }
  return out
}

/** Published or hidden, as a small dot and a word (the products list's StatusMark). */
export function StatusMark({ published, strong = false }: { published: boolean; strong?: boolean }) {
  return (
    <span data-status={published ? "published" : "hidden"} className={cn("inline-flex items-center gap-1.5 align-top", strong ? "text-[#303036]" : "text-[#6b7280]")}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", published ? "bg-[#22a06b]" : "bg-[#b6bac1]")} />
      <span>{published ? tt("Published") : tt("Hidden")}</span>
    </span>
  )
}
