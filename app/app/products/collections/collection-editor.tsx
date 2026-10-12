"use client"

/**
 * ===========================================================================
 *  ONE COLLECTION, NEW OR SAVED
 * ===========================================================================
 * Storelib's SheetDialog (components/ui/sheet-dialog.tsx): on a phone the
 * app's shared bottom sheet, with its grabber, its drag and its motion, and
 * no close button, since a pull down or a tap above it closes it; on a
 * computer a dialog in the middle of the page. Both draw the same thing: a
 * title, the form that scrolls, and Cancel and Save at the foot, which on a
 * phone stays on the bottom of the sheet above the home indicator.
 *
 * The form, in the order a person decides it: the name and the words, whether
 * it is shown and in what order, then which products are in it. Either
 * picked by hand from every product of every kind, or matched by rules,
 * written as sentences ("Product type is Course"), with the products they
 * catch counted and shown as the rules are typed, by the same rules the
 * storefront applies (lib/physical/collections.ts inSmartCollection).
 *
 * Questions (discard the changes, delete it) are asked by the page, once
 * this has gone: see ONE QUESTION AT A TIME in ./collections-client.tsx.
 */

import * as React from "react"
import { Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { RULE_FIELDS, inSmartCollection, type CollectionRule, type RuleField, type RuleOp } from "@/lib/physical/collections"
import { CATEGORY_GROUPS, PHYSICAL_CATEGORY_GROUPS } from "@/lib/products/category-groups"
import { SWITCH_GROUP, Segmented, SwapPanels, SwitchRow } from "../new/editor-controls"
import { Tick } from "../../coupons/coupon-parts"
import type { SaveBody } from "./collections-client"
import {
  KIND_LABEL,
  NUMERIC_FIELDS,
  OP_WORDS,
  PHYSICAL_RULES,
  PRODUCT_KINDS,
  ProductThumb,
  SORTS,
  countWords,
  fieldWords,
  finishedRules,
  opsFor,
  ruleProduct,
  usePhone,
  type Collection,
  type CollectionProduct,
} from "./collection-parts"
import { tt } from "@/lib/i18n/text"

/** On a phone the sheet is the form's height whatever is in it, so switching between picking and rules never moves its top edge. */
const SHEET_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.9)"

/* The coupon editor's fields (../../coupons/coupon-editor.tsx): 16px on a phone so iOS does not zoom, 44px to press. */
const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const CHEVRON =
  "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7280%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8"
const SELECT = cn(FIELD, CHEVRON, "cursor-pointer truncate")
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
const HINT = "text-[13px] leading-5 text-[#6b7280]"
const SECTION_TITLE = "text-[15px] font-semibold text-[#1a1a2e] sm:text-[14px]"

/* The foot's two buttons: the confirm sheet's 48px pair on a phone, the app's 32px buttons on a computer. */
const FOOT_BUTTON = "h-12 min-w-0 rounded-xl text-[16px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]"

const blankRule = (): CollectionRule => ({ field: "type", op: "equals", value: "" })

export function CollectionEditor({
  open,
  collection,
  products,
  onRequestClose,
  onSave,
  onDelete,
  onClosed,
  leaveMs,
}: {
  open: boolean
  /** Null for a new collection. */
  collection: Collection | null
  products: CollectionProduct[]
  /** Every way out: a pull down, a tap above the sheet, Escape, Cancel. The page asks first when something would be lost. */
  onRequestClose: (dirty: boolean) => void
  /** Saves, and answers with what went wrong, or null. */
  onSave: (id: string | null, body: SaveBody) => Promise<string | null>
  onDelete: (collection: Collection) => void
  /** Once it has finished leaving. */
  onClosed: () => void
  /** How long the computer's dialog takes to leave. */
  leaveMs: number
}) {
  const phone = usePhone()
  const physical = usePhysicalCommerceEnabled()
  const c = collection

  const [title, setTitle] = React.useState(c?.title ?? "")
  const [description, setDescription] = React.useState(c?.description ?? "")
  const [kind, setKind] = React.useState<"manual" | "smart">(c?.kind ?? "manual")
  const [rules, setRules] = React.useState<CollectionRule[]>(c?.rules.length ? c.rules : [blankRule()])
  const [match, setMatch] = React.useState<"all" | "any">(c?.match ?? "all")
  const [sort, setSort] = React.useState<string>(c?.sort ?? "manual")
  const [published, setPublished] = React.useState(c?.published ?? true)
  /* A smart collection switched to picking starts from the products its rules catch now. */
  const [picked, setPicked] = React.useState<string[]>(c?.productIds ?? [])
  const [query, setQuery] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const titleRef = React.useRef<HTMLInputElement>(null)

  const body: SaveBody = { title: title.trim(), description, kind, rules: finishedRules(rules), match, sort, published, productIds: kind === "manual" ? picked : [] }
  const [initial] = React.useState(() => JSON.stringify(body))
  const dirty = JSON.stringify(body) !== initial

  /* The computer's dialog has no "gone" of its own to report: its fade is a fixed length. The phone's sheet says when it has gone (onClosed below). */
  React.useEffect(() => {
    if (open || phone) return
    const t = window.setTimeout(onClosed, leaveMs)
    return () => window.clearTimeout(t)
  }, [open, phone, onClosed, leaveMs])

  const close = () => {
    if (!busy) onRequestClose(dirty)
  }

  const save = async () => {
    if (busy) return
    if (!body.title) {
      setError(tt("Give the collection a title."))
      titleRef.current?.focus()
      return
    }
    if (kind === "smart" && body.rules.length === 0) return setError(tt("Finish at least one condition: a field, how it compares and a value."))
    setBusy(true)
    setError(null)
    const problem = await onSave(c?.id ?? null, body)
    setBusy(false)
    if (problem) setError(problem)
  }

  /* ── Rules ─────────────────────────────────────────────────────────── */
  const fields = RULE_FIELDS.filter((f) => physical || !PHYSICAL_RULES.has(f) || rules.some((r) => r.field === f))
  const change = (i: number, next: (r: CollectionRule) => CollectionRule) => setRules((list) => list.map((r, j) => (j === i ? next(r) : r)))
  const setField = (i: number, field: RuleField) =>
    change(i, (r) => {
      const ops = opsFor(field)
      /* A value carries over only where it still means the same thing: words to words, a number to a number. */
      const same = (r.field === "type") === (field === "type") && NUMERIC_FIELDS.has(r.field) === NUMERIC_FIELDS.has(field)
      return { field, op: ops.includes(r.op) ? r.op : ops[0], value: same ? r.value : "" }
    })

  const finished = body.rules
  const ruleProducts = React.useMemo(() => products.map(ruleProduct), [products])
  const caught = React.useMemo(
    () => (finished.length ? products.filter((_, i) => inSmartCollection(finished, match, ruleProducts[i])) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `finished` is rebuilt every render; its text is what changes
    [JSON.stringify(finished), match, products, ruleProducts],
  )

  /* ── Picking ───────────────────────────────────────────────────────── */
  const q = query.trim().toLowerCase()
  const shown = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products
  const pickedSet = new Set(picked)
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const heading = c ? tt("Edit collection") : tt("New collection")

  const pickPanel = (
    <div data-pick-panel="" className="space-y-2">
      {products.length === 0 ? (
        <p className={HINT}>{tt("Add a product first, then pick it here.")}</p>
      ) : (
        <>
          {products.length > 6 ? (
            <label className="relative block">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search products")} aria-label={tt("Search products")} className={cn(FIELD, "pl-9 [&::-webkit-search-cancel-button]:hidden")} />
            </label>
          ) : null}
          {/* On a phone the list is part of the sheet's scroll, never a scroll inside a scroll; on a computer it keeps the dialog short. */}
          <ul aria-label={tt("Products")} className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb] sm:max-h-[296px] sm:overflow-y-auto sm:overscroll-contain">
            {shown.map((p) => {
              const on = pickedSet.has(p.id)
              return (
                <li key={p.id} className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(p.id)}
                    className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[52px] sm:hover:bg-[#fafafb]"
                  >
                    <Tick on={on} />
                    <ProductThumb src={p.thumbnail_url} title={p.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] leading-5 text-[#1a1a2e] sm:text-[14px]">{p.title}</span>
                      <span className="block truncate text-[13px] leading-[18px] text-[#6b7280] sm:text-[12px]">
                        {KIND_LABEL[p.type] ? tt(KIND_LABEL[p.type]) : tt("Product")}
                        {p.status !== "published" ? tt(" · Draft") : ""}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
            {shown.length === 0 ? <li className="px-4 py-6 text-center text-[14px] text-[#6b7280]">{tt("No product matches that.")}</li> : null}
          </ul>
          <div className="flex min-h-8 items-center justify-between gap-3">
            <p className={HINT}>{picked.length === 0 ? tt("None picked yet.") : tt("{length} of {length2} picked", { length: picked.length, length2: products.length })}</p>
            {picked.length > 0 ? (
              <button type="button" onClick={() => setPicked([])} className="relative h-8 shrink-0 cursor-pointer rounded-lg px-2 text-[14px] font-medium text-[#4b5563] after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:text-[13px] sm:after:hidden">
                {tt("Clear")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )

  const rulesPanel = (
    <div data-rules-panel="" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[15px] text-[#4b5563] sm:text-[14px]">
        <span>{tt("Products must match")}</span>
        <select value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")} aria-label={tt("Which conditions")} className={cn(SELECT, "h-10 w-auto rounded-[10px] font-medium sm:h-8 sm:rounded-lg sm:text-[13px]")}>
          <option value="all">{tt("all conditions")}</option>
          <option value="any">{tt("any condition")}</option>
        </select>
      </div>
      <div data-conditions="" className="overflow-hidden rounded-xl border border-[#e5e7eb]">
        {rules.map((r, i) => (
          <RuleRow
            key={i}
            rule={r}
            index={i}
            fields={fields}
            physical={physical}
            onField={(f) => setField(i, f)}
            onOp={(op) => change(i, (x) => ({ ...x, op }))}
            onValue={(value) => change(i, (x) => ({ ...x, value }))}
            onRemove={() => setRules((list) => list.filter((_, j) => j !== i))}
          />
        ))}
        {rules.length < 20 ? (
          <button
            type="button"
            data-add-condition=""
            onClick={() => setRules((list) => [...list, blankRule()])}
            className={cn(
              "flex h-12 w-full cursor-pointer items-center gap-2 px-3.5 text-left text-[15px] font-medium text-[#4b5563] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:h-10 sm:text-[13px] sm:hover:bg-[#fafafb] sm:hover:text-[#1a1a2e]",
              rules.length > 0 && "border-t border-[#eef0f2]",
            )}
          >
            <Plus aria-hidden className="h-4 w-4" />
            {tt("Add condition")}
          </button>
        ) : null}
      </div>
      <Caught finished={finished.length} caught={caught} />
    </div>
  )

  return (
    <SheetDialog
      open={open}
      onClose={close}
      phone={phone}
      label={heading}
      showCloseButton={false}
      /* A new collection starts in its title; a saved one opens on the dialog itself, rather than with its name selected. */
      onOpenAutoFocus={(e) => {
        if (!c) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement | null)?.focus?.()
      }}
      className="flex max-h-[min(88vh,820px)] flex-col gap-0 overflow-hidden rounded-2xl outline-none border-[#e5e7eb] p-0 shadow-[0_20px_48px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] sm:max-w-[600px]"
      sheet={{ height: SHEET_HEIGHT, maxHeight: SHEET_HEIGHT, dismissible: !busy, onClosed }}
    >
      <div data-collection-editor="" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-5">
          <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{heading}</SheetDialogTitle>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="collection-title" className={LABEL}>
                {tt("Title")}
              </label>
              <input id="collection-title" ref={titleRef} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={tt("New in, Courses, Under $30")} autoComplete="off" className={FIELD} />
            </div>
            <div>
              <label htmlFor="collection-description" className={LABEL}>
                {tt("Description")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
              </label>
              <textarea
                id="collection-description"
                value={description}
                maxLength={5000}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={tt("Shown at the top of the collection's page")}
                className={cn(FIELD, "h-auto min-h-[88px] resize-none py-2.5 sm:resize-y leading-[1.45]")}
              />
            </div>
          </div>

          <div className={cn(SWITCH_GROUP, "mt-5")}>
            <SwitchRow title={tt("Published")} hint={tt("Can be shown on your website")} checked={published} onChange={setPublished} />
            <label className="flex min-h-[56px] items-center gap-3 px-4 py-2 sm:min-h-[52px]">
              <span className="min-w-0 flex-1 text-[15px] font-medium leading-5 text-[#1a1a2e] sm:text-[14px]">{tt("Sort by")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className={cn(SELECT, "h-10 w-auto max-w-[58%] rounded-[10px] sm:h-8 sm:rounded-lg sm:text-[13px]")}>
                {SORTS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {tt(label)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section aria-labelledby="collection-products" className="mt-6 space-y-3">
            <h3 id="collection-products" className={SECTION_TITLE}>
              {tt("Products")}
            </h3>
            <Segmented
              label={tt("How products get in")}
              value={kind}
              onChange={setKind}
              options={[
                { value: "manual", label: tt("Pick products") },
                { value: "smart", label: tt("Match by rules") },
              ]}
            />
            <SwapPanels
              active={kind}
              panels={[
                { key: "manual", node: pickPanel },
                { key: "smart", node: rulesPanel },
              ]}
            />
          </section>

          {error ? (
            <p role="alert" className="mt-4 text-[14px] font-medium leading-5 text-[#b42318] sm:text-[13px]">
              {error}
            </p>
          ) : null}

          {c ? (
            <div className="mt-6 border-t border-[#eef0f2] pt-4">
              <button type="button" data-delete-collection="" disabled={busy} onClick={() => onDelete(c)} className={cn(secondaryDepth, "h-11 w-full rounded-xl text-[15px] text-[#4b5563] sm:h-8 sm:w-auto sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                {tt("Delete collection")}
              </button>
            </div>
          ) : null}
        </div>

        <div data-editor-foot="" className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-[#eef0f2] px-5 pt-3 sm:flex sm:justify-end sm:gap-2 sm:px-6 sm:pb-3">
          <button type="button" onClick={close} disabled={busy} className={cn(secondaryDepth, FOOT_BUTTON)}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            data-save-collection=""
            onClick={() => void save()}
            disabled={!busy && !!c && !dirty}
            aria-busy={busy || undefined}
            className={cn(primaryDepth, FOOT_BUTTON, "relative sm:min-w-[60px]", "disabled:cursor-default disabled:bg-[#ebebef] disabled:text-[#a1a1aa] disabled:shadow-none", busy && "cursor-default")}
          >
            <span className={cn(busy && "opacity-0")}>{c ? tt("Save") : tt("Create")}</span>
            {busy ? (
              <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                <ActivitySpinner size={18} label={tt("Saving")} className="text-white" />
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </SheetDialog>
  )
}

/**
 * ONE CONDITION, AS A SENTENCE: field, how it compares, value. From 640px
 * one line; on a phone the field and the comparison share the first line
 * and the value takes the second, with Remove at its end.
 */
function RuleRow({
  rule,
  index,
  fields,
  physical,
  onField,
  onOp,
  onValue,
  onRemove,
}: {
  rule: CollectionRule
  index: number
  fields: readonly RuleField[]
  physical: boolean
  onField: (f: RuleField) => void
  onOp: (op: RuleOp) => void
  onValue: (v: string) => void
  onRemove: () => void
}) {
  const ops = opsFor(rule.field)
  /* A saved rule from before these choices keeps its own comparison. */
  if (!ops.includes(rule.op)) ops.push(rule.op)
  const money = rule.field === "price" || rule.field === "compare_at_price"
  const n = index + 1
  return (
    <div data-condition="" className="grid grid-cols-2 gap-2 border-[#eef0f2] p-3 [div+&]:border-t sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] sm:items-center sm:p-2.5">
      <select value={rule.field} onChange={(e) => onField(e.target.value as RuleField)} aria-label={tt("Condition {n}: field", { n })} className={SELECT}>
        {fields.map((f) => (
          <option key={f} value={f}>
            {fieldWords(f)}
          </option>
        ))}
      </select>
      <select value={rule.op} onChange={(e) => onOp(e.target.value as RuleOp)} aria-label={tt("Condition {n}: how it compares", { n })} className={SELECT}>
        {ops.map((o) => (
          <option key={o} value={o}>
            {OP_WORDS[o]}
          </option>
        ))}
      </select>
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:contents">
        {rule.field === "type" ? (
          <select value={rule.value} onChange={(e) => onValue(e.target.value)} aria-label={tt("Condition {n}: product type", { n })} className={cn(SELECT, "flex-1", !rule.value && "text-[#9ca3af]")}>
            <option value="" disabled>
              {tt("Choose a type")}
            </option>
            {PRODUCT_KINDS.filter(([k]) => physical || k !== "physical" || rule.value === k).map(([k, label]) => (
              <option key={k} value={k} className="text-[#1a1a2e]">
                {tt(label)}
              </option>
            ))}
          </select>
        ) : (
          <span className="relative block min-w-0 flex-1">
            {money ? <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-[#9ca3af] sm:text-[14px]">$</span> : null}
            <input
              value={rule.value}
              onChange={(e) => onValue(e.target.value)}
              inputMode={NUMERIC_FIELDS.has(rule.field) ? "decimal" : undefined}
              aria-label={tt("Condition {n}: value", { n })}
              placeholder={money ? "30" : rule.field === "weight" ? tt("Grams") : rule.field === "inventory" ? "10" : rule.field === "tag" ? "summer" : rule.field === "category" ? tt("T-Shirts") : tt("Word")}
              autoComplete="off"
              list={rule.field === "category" ? `collection-categories-${n}` : undefined}
              className={cn(FIELD, money && "pl-7", NUMERIC_FIELDS.has(rule.field) && "tabular-nums")}
            />
            {/* The product categories the editor files products under, things that ship first while they can be sold (lib/products/category-groups.ts). */}
            {rule.field === "category" ? (
              <datalist id={`collection-categories-${n}`}>
                {[...(physical ? PHYSICAL_CATEGORY_GROUPS : []), ...CATEGORY_GROUPS].flatMap((g) => g.categories).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            ) : null}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={tt("Remove condition {n}", { n })}
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-[#6b7280] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:bg-[#f1f2f4] active:bg-[#eceef1] sm:h-8 sm:w-8 sm:rounded-lg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** Which products the rules catch, as they are typed: how many, and the first few. */
function Caught({ finished, caught }: { finished: number; caught: CollectionProduct[] }) {
  const first = caught.slice(0, 4)
  return (
    <div data-caught="" aria-live="polite" className="rounded-xl bg-[#f6f7f8] px-3.5 py-3">
      {finished === 0 ? (
        <p className={HINT}>{tt("Finish a condition to see which products it catches.")}</p>
      ) : caught.length === 0 ? (
        <p className={HINT}>{tt("No products match yet.")}</p>
      ) : (
        <>
          <p className="text-[13px] leading-5 text-[#4b5563]">
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{countWords(caught.length)}</span> {caught.length === 1 ? "matches" : "match"}
          </p>
          <ul className="mt-2 space-y-2">
            {first.map((p) => (
              <li key={p.id} className="flex min-w-0 items-center gap-2.5">
                <ProductThumb src={p.thumbnail_url} title={p.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-5 text-[#1a1a2e] sm:text-[13px]">{p.title}</span>
                  <span className="block truncate text-[12px] leading-4 text-[#6b7280]">{KIND_LABEL[p.type] ? tt(KIND_LABEL[p.type]) : tt("Product")}</span>
                </span>
              </li>
            ))}
          </ul>
          {caught.length > first.length ? <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("and {value} more", { value: caught.length - first.length })}</p> : null}
        </>
      )}
    </div>
  )
}
