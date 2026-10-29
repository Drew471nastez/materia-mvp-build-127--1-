"use client"

/**
 * ===========================================================================
 *  ONE COLLECTION, NEW OR SAVED, ON A PAGE OF ITS OWN
 * ===========================================================================
 * /app/products/collections/new and /app/products/collections/<id> (round
 * 41, the owner: "Collections and edit collections should act as subpages,
 * not modals"). Framed exactly as a size chart or an offer is (../size-charts/
 * size-chart-page.tsx): on a phone a layer over the app's header with Cancel
 * or Back and Save at the top; from lg the 1200px page with a back arrow and
 * the title, the form on the left and whether it is shown on the right, Cancel and
 * Save along the foot with the save state. It was a SheetDialog over the
 * list; a long rule list or a hundred products to pick did not fit a sheet.
 *
 * The form, in the order a person decides it: the name and the words, then
 * which products are in it, and beside it whether it is shown and in what
 * order. Products are either picked by hand from every product of every
 * kind, or matched by rules, written as sentences ("Product type is
 * Course"), with the products they catch counted and shown as the rules are
 * typed, by the same rules the storefront applies (lib/physical/
 * collections.ts inSmartCollection).
 *
 * A save or a delete goes back to the list, which says so, tints the row
 * and reads its rows again (./list-return). The questions (discard the
 * changes, delete it) are the app's confirm, asked on this page: nothing is
 * under it any more.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { secondaryDepth } from "@/components/ui/depth-button"
import { ThumbScroll } from "@/components/app/thumb-scroll"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { RULE_FIELDS, inSmartCollection, type CollectionRule, type RuleField, type RuleOp } from "@/lib/physical/collections"
import { CATEGORY_GROUPS, PHYSICAL_CATEGORY_GROUPS } from "@/lib/products/category-groups"
import { FormSwitch, Segmented, SwapPanels } from "../new/editor-controls"
import { LeaveButton } from "../new/editor-buttons"
import { useConfirm } from "../new/confirm-sheet"
import { StatusBadge, iconButton } from "../../orders/order-parts"
import { CouponSaveButton, Tick } from "../../coupons/coupon-parts"
import { collectionsReturn } from "./list-return"
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
  type Collection,
  type CollectionProduct,
} from "./collection-parts"
import { tt } from "@/lib/i18n/text"
import { useMoneyMark } from "@/lib/store/currency-context"
import { Rich } from "@/lib/i18n/rich"

/* The coupon editor's fields (../../coupons/coupon-editor.tsx): 16px on a phone so iOS does not zoom, 44px to press. */
const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
/* Spaces in the data URL written as %20: a bare space ends Tailwind's arbitrary value and the chevron never drew. */
const CHEVRON =
  "appearance-none bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2212%22%20height=%2212%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%236b7280%22%20stroke-width=%222%22><path%20d=%22m6%209%206%206%206-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8"
const SELECT = cn(FIELD, CHEVRON, "cursor-pointer truncate")
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
const HINT = "text-[13px] leading-5 text-[#6b7280]"
const ERR = "mt-1.5 text-[13px] font-medium leading-5 text-[#b42318]"
/* The size chart page's cards (../size-charts/size-chart-page.tsx), so the sub pages under Products are one place. */
const CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:py-6"
const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"

const blankRule = (): CollectionRule => ({ field: "type", op: "equals", value: "" })

/** What the API takes to create or save a collection. */
export interface SaveBody {
  title: string
  description: string
  kind: "manual" | "smart"
  rules: Collection["rules"]
  match: "all" | "any"
  sort: string
  published: boolean
  productIds: string[]
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: true; collections: Collection[]; id: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !Array.isArray(data?.collections)) return { ok: false, error: typeof data?.error === "string" ? data.error : tt("That did not go through. Try again.") }
    const id = typeof data?.id === "string" ? data.id : typeof data?.collection?.id === "string" ? data.collection.id : null
    return { ok: true, collections: data.collections as Collection[], id }
  } catch {
    return { ok: false, error: tt("No connection. Try again in a moment.") }
  }
}

export function CollectionPage({ collection, products }: { collection: Collection | null; products: CollectionProduct[] }) {
  const router = useRouter()
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
  const [titleProblem, setTitleProblem] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const busy = saving || deleting
  const titleRef = React.useRef<HTMLInputElement>(null)
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [ask, confirmSheet] = useConfirm()

  React.useEffect(() => {
    collectionsReturn.warm(router)
  }, [router])
  collectionsReturn.useOrigin()

  const body: SaveBody = { title: title.trim(), description, kind, rules: finishedRules(rules), match, sort, published, productIds: kind === "manual" ? picked : [] }
  const [initial, setInitial] = React.useState(() => JSON.stringify(body))
  const dirty = JSON.stringify(body) !== initial
  const isNew = !c
  const canSave = !busy && (isNew || dirty)

  const showError = (message: string) => {
    setError(message)
    paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const save = async () => {
    if (!canSave) return
    if (!body.title) {
      /* Said under the field, which takes the focus. */
      setTitleProblem(tt("Give the collection a title."))
      titleRef.current?.focus()
      titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }
    if (kind === "smart" && body.rules.length === 0) {
      setError(tt("Finish at least one condition: a field, how it compares and a value."))
      paneRef.current?.querySelector<HTMLElement>("[data-rules-panel]")?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }
    setSaving(true)
    setError(null)
    const r = await send(c ? `/api/collections/${c.id}` : "/api/collections", c ? "PUT" : "POST", body)
    if (!r.ok) {
      setSaving(false)
      return showError(r.error)
    }
    /* Nothing to lose now: a back while the list comes in does not ask. */
    setInitial(JSON.stringify(body))
    const id = c?.id ?? r.id ?? r.collections.find((x) => x.title === body.title)?.id ?? null
    collectionsReturn.leave(router, { id, collections: r.collections, message: c ? tt("{value} saved", { value: body.title }) : tt("{value} created", { value: body.title }) })
  }

  const leaveMode = c && !dirty ? "back" : "cancel"
  const leave = async () => {
    if (busy) return
    if (dirty) {
      const yes = await ask(
        c
          ? { title: tt("Discard changes?"), body: tt("Your edits to this collection will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }
          : { title: tt("Discard this collection?"), body: tt("It has not been saved yet, so it will not be kept."), confirm: tt("Discard"), cancel: tt("Keep editing") },
      )
      if (!yes) return
    }
    collectionsReturn.leave(router, { id: c?.id ?? null })
  }

  const remove = async () => {
    if (!c || busy) return
    const yes = await ask({
      title: tt("Delete {title}?", { title: c.title }),
      body: tt("The collection and its page on your website go. The products in it stay as they are."),
      confirm: tt("Delete"),
      cancel: tt("Keep it"),
    })
    if (!yes) return
    setDeleting(true)
    setError(null)
    const r = await send(`/api/collections/${c.id}`, "DELETE")
    if (!r.ok) {
      setDeleting(false)
      return showError(r.error)
    }
    collectionsReturn.leave(router, { id: c.id, deleted: true, collections: r.collections, message: tt("{title} deleted", { title: c.title }) })
  }

  /* Cmd or Ctrl and S, from anywhere on the page. */
  const saveRef = React.useRef(save)
  React.useEffect(() => {
    saveRef.current = save
  })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
          {/* The offer picker's box (../../offers/offer-fields.tsx ProductPicker), with the app's own slim bar over its edge. */}
          <ThumbScroll className="max-h-[336px] overflow-y-auto overscroll-contain rounded-xl border border-[#e5e7eb]">
            <ul aria-label={tt("Products")} className="divide-y divide-[#eef0f2]">
              {shown.map((p) => {
                const on = pickedSet.has(p.id)
                return (
                  <li key={p.id} className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      data-pick={p.id}
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
          </ThumbScroll>
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

  const heading = c ? c.title : tt("New collection")
  const count = kind === "manual" ? picked.length : caught.length
  const saveState = saving ? "saving" : isNew ? "new" : dirty ? "unsaved" : "saved"
  const stateLine = saveState === "saving" ? tt("Saving") : saveState === "unsaved" ? tt("Unsaved changes") : saveState === "new" ? tt("Not saved yet") : countWords(count)
  const saveWord = isNew ? tt("Create") : tt("Save")

  return (
    <div
      ref={paneRef}
      data-collection-page=""
      className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pb-[calc(32px+env(safe-area-inset-bottom))] lg:flex lg:flex-col"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {saving ? tt("Saving") : deleting ? tt("Deleting") : ""}
      </p>

      <div data-editor-bar="" className={cn("sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150 max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden", scrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "")}>
        <h1 className="sr-only">{c ? tt("Edit collection {title}", { title: c.title }) : tt("New collection")}</h1>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label={tt("Going back to collections")} onLeave={() => void leave()} />
          <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
        </div>
      </div>

      <div data-editor-page="" data-collection-editor="" className="mx-auto w-full max-w-[760px] app-gutter pb-6 pt-3 sm:pb-16 sm:pt-4 lg:max-w-[1200px] lg:pb-8 lg:pt-6">
        <header data-editor-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex">
          <button type="button" aria-label={tt("Back to collections")} title={tt("Collections")} disabled={busy} onClick={() => void leave()} className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]">{heading}</h1>
          {/* Where it stands, as the coupon's header says it: the saved state, so it changes on Save, not on the switch. */}
          {c ? (
            <span className="ml-1 shrink-0" data-collection-state={c.published ? "published" : "hidden"}>
              <StatusBadge tone={c.published ? "success" : "neutral"}>{c.published ? tt("Published") : tt("Hidden")}</StatusBadge>
            </span>
          ) : null}
        </header>

        {error ? (
          <div role="alert" className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f] lg:mb-4">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(272px,1fr)] lg:items-start">
          <div data-editor-main="" className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <section className={CARD} aria-label={tt("Title")}>
              <div>
                <label htmlFor="collection-title" className={LABEL}>
                  {tt("Title")}
                </label>
                <input
                  id="collection-title"
                  ref={titleRef}
                  value={title}
                  maxLength={120}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    if (titleProblem) setTitleProblem(null)
                  }}
                  placeholder={tt("New in, Courses, Under $30")}
                  autoComplete="off"
                  aria-invalid={!!titleProblem}
                  className={cn(FIELD, titleProblem && "border-[#f0b4ab] focus:border-[#e3897c]")}
                />
                {titleProblem ? <p className={ERR}>{titleProblem}</p> : null}
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
            </section>

            <section aria-labelledby="collection-products" className={CARD}>
              <h2 id="collection-products" className={CARD_TITLE}>
                {tt("Products")}
              </h2>
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
          </div>

          {/* From lg the side column stays in view while the collection is filled in, drawn as the coupon editor's side is (../../coupons/coupon-editor.tsx): a card with its switch, not a settings list. */}
          <div data-editor-side="" className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-6">
            {/* ── Shown or not, and in what order ─────────────────────── */}
            <section data-collection-status="" className={CARD} aria-labelledby="collection-status-title">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="collection-status-title" className={CARD_TITLE}>
                    {tt("Published")}
                  </h2>
                  <p className={cn(HINT, "mt-0.5")}>{published ? tt("Its page is on your website, and menus and sections can show it.") : tt("Hidden. Nobody sees it on your website until you turn it on.")}</p>
                </div>
                <div className="pt-0.5">
                  <FormSwitch checked={published} onChange={setPublished} label={tt("Published")} />
                </div>
              </div>
              <div className="border-t border-[#eef0f2] pt-4">
                <label htmlFor="collection-sort" className={LABEL}>
                  {tt("Products are shown")}
                </label>
                <select id="collection-sort" value={sort} onChange={(e) => setSort(e.target.value)} className={SELECT}>
                  {SORTS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {tt(label)}
                    </option>
                  ))}
                </select>
                {sort === "manual" && kind === "manual" ? <p className={cn(HINT, "mt-1.5")}>{tt("In the order you picked them.")}</p> : null}
              </div>
            </section>

            {c ? (
              <div className="flex justify-start lg:justify-end">
                <button type="button" data-delete-collection="" disabled={busy} onClick={() => void remove()} className={cn(secondaryDepth, "h-11 w-full rounded-xl text-[15px] text-[#4b5563] sm:h-8 sm:w-auto sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                  {tt("Delete collection")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div data-editor-foot="" data-app-foot="up" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p data-editor-state={saveState} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", saveState === "unsaved" ? "bg-[#111113]" : "bg-[#b6bac1]")} />
            <span className={cn("truncate", saveState === "unsaved" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{stateLine}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label={tt("Going back to collections")} onLeave={() => void leave()} />
            <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
          </div>
        </div>
      </div>

      {confirmSheet}
    </div>
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
  /* The store's own currency mark, before or after the amount ("$30", "30 lei"), as every price field in /app writes it. */
  const mark = useMoneyMark("text-[16px] text-[#9ca3af] sm:text-[14px]")
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
            {money ? mark.node : null}
            <input
              value={rule.value}
              onChange={(e) => onValue(e.target.value)}
              inputMode={NUMERIC_FIELDS.has(rule.field) ? "decimal" : undefined}
              aria-label={tt("Condition {n}: value", { n })}
              placeholder={money ? "30" : rule.field === "weight" ? tt("Grams") : rule.field === "inventory" ? "10" : rule.field === "tag" ? "summer" : rule.field === "category" ? tt("T-Shirts") : tt("Word")}
              autoComplete="off"
              list={rule.field === "category" ? `collection-categories-${n}` : undefined}
              style={money ? mark.pad : undefined}
              className={cn(FIELD, NUMERIC_FIELDS.has(rule.field) && "tabular-nums")}
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
            <Rich text={tt("{n, plural, one {{products} matches} other {{products} match}}", { n: caught.length })} parts={{ products: <span className="font-semibold tabular-nums text-[#1a1a2e]">{countWords(caught.length)}</span> }} />
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
