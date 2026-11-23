"use client"

/**
 * ===========================================================================
 *  ONE OFFER, NEW OR SAVED, ON A PAGE OF ITS OWN
 * ===========================================================================
 * Round 60: "I choose what kind of offer I create, then it takes me to the
 * subpage. Not a modal for creating the offer." New offer asks the kind in
 * a small modal over the list (./offer-kind-chooser.tsx); the pick lands
 * here, /app/offers/new?kind=bundle|checkout|quantity_break, and a saved
 * offer opens here too, /app/offers/<id>.
 *
 * The frame is the coupon editor's (../coupons/coupon-editor.tsx), which is
 * the product editor's:
 *
 *   ON A PHONE a full screen layer over the app's header (./new/layout,
 *   ./[id]/layout, components/app/page-layer), its own bar at the top under
 *   the status bar: Cancel (or Back, with nothing to lose) and Create (or
 *   Save). The bar is at the top, so the keyboard never covers it. The
 *   sections in one column under the page's title.
 *
 *   FROM 768 TO 1023 a page in the shell, the same bar stuck to the top of
 *   the content area, one column of 760px.
 *
 *   FROM lg the 1200px page: a header (back to Upsells and bundles, the
 *   title, where it stands), the offer on the left and whether it is on on
 *   the right, and Cancel and Save in a bar along the foot of the pane.
 *
 * The form is the one round 58 made, in the order a person decides it: the
 * name buyers see, the products, an upsell's condition, the discount (or a
 * quantity break's tiers) with what a buyer pays in one line under it, then
 * More options folded (where it shows, dates, a limit per order, codes on
 * top). Every setting is a field the server stores and a rule the checkout
 * applies (lib/offers/offers.ts readOffer, applyOffers); the server checks
 * all of it again and never takes a price from here. What is wrong is said
 * under its own field when Create is pressed, and the first one is brought
 * into view. Cmd or Ctrl and S saves. Leaving with changes asks first; a
 * save or a delete goes back to the list, which says so and tints the row
 * (./list-return).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { MAX_BUNDLE, MAX_TRIGGERS, PLACEMENTS_FOR, bundlePrice, offerState, offerUnitPrice, type DiscountType, type Offer, type OfferKind, type Placement } from "@/lib/offers/offers"
import { DRAFT_ID, offerWarnings } from "@/lib/offers/try-cart"
import { amountOf, bodyOf, draftOf, problemsOf, type Draft, type Problems } from "./offer-draft"
import { FormSwitch, SWITCH_GROUP, SwitchRow } from "../products/new/editor-controls"
import { LeaveButton } from "../products/new/editor-buttons"
import { useConfirm } from "../products/new/confirm-sheet"
import { StatusBadge, iconButton } from "../orders/order-parts"
import { CouponSaveButton, Tick, quietDanger } from "../coupons/coupon-parts"
import { KIND_WORD, PLACEMENT_WORD, STATE_TONE, STATE_WORD, currencySign, moneyIn, type OfferCollection, type OfferProduct } from "./offer-parts"
import { BAD, ChoiceGrid, ERR, FIELD, HINT, LABEL, MoneyField, ProductPicker, Radio, RadioRows, TierEditor } from "./offer-fields"
import { sendOffer } from "./offer-api"
import { offersReturn } from "./list-return"

/* The coupon editor's card (CLAUDE.md's /app card), its sideways padding from --app-card-x. */
const CARD = "scroll-mt-20 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:py-6 lg:scroll-mt-6"
const CARD_TITLE = "block text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
const OPTIONAL = "ml-1 font-normal text-[#9ca3af]"
const ROW_BUTTON = "flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-3.5 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[44px] sm:hover:bg-[#fafafb]"

/** "a", "a and b", "a, b and c". */
const listWords = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} ${tt("and")} ${words[words.length - 1]}`)

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export interface OfferEditorProps {
  /** The saved offer, or null for a new one. */
  offer: Offer | null
  /** A new offer's kind (a saved one keeps its own). */
  kind: OfferKind
  products: OfferProduct[]
  collections: OfferCollection[]
  /** The store's offers, for what competes with this one on the same products. */
  others: Offer[]
  currency: string
  /** Physical commerce is on: free shipping can be offered. */
  physical: boolean
  /** SQL part 116 has run: offers can be saved at all. */
  ready: boolean
  /** SQL part 230 has run: dates, places, limits and the rest can be saved. */
  settingsReady: boolean
  /** SQL part 304 has run: a quantity break can be saved. */
  breaksReady: boolean
  /** Units this offer sold in the last 90 days. */
  sold: number
}

/** The products a buyer would pay for, and what with the offer: one line under the discount. */
function priceLine(d: Draft, discountValue: number, byId: Map<string, OfferProduct>, money: (minor: number) => string): string | null {
  const items = d.productIds.map((id) => byId.get(id)).filter(Boolean) as OfferProduct[]
  if (d.kind === "bundle") {
    if (items.length < 2) return null
    const { fullCents, priceCents } = bundlePrice({ discountType: d.discountType, discountValue }, items.map((p) => p.priceCents), items.map((p) => p.payWhatYouWant))
    return priceCents < fullCents ? tt("The set costs {price} instead of {full}.", { price: money(priceCents), full: money(fullCents) }) : tt("The set costs {price}.", { price: money(fullCents) })
  }
  if (d.kind === "checkout") {
    const p = items[0]
    if (!p) return null
    const at = offerUnitPrice({ discountType: d.discountType, discountValue }, p.priceCents, p.payWhatYouWant)
    return at < p.priceCents ? tt("{title} is added for {price} instead of {full}.", { title: p.title, price: money(at), full: money(p.priceCents) }) : tt("{title} is added at {price}.", { title: p.title, price: money(p.priceCents) })
  }
  return null
}

export function OfferEditor({ offer, kind, products, collections, others, currency: currencyNow, physical, ready, settingsReady, breaksReady, sold }: OfferEditorProps) {
  const router = useRouter()
  /* The currency this offer's amounts were typed in, kept while it is open: a save after the store's currency changed is refused (lib/store/currency-guard), never written over the converted amounts. */
  const [currency] = React.useState(currencyNow)
  const startKind: OfferKind = offer ? offer.kind : kind
  const [initial] = React.useState(() => JSON.stringify(draftOf(offer, startKind, currency)))
  const [d, setD] = React.useState<Draft>(() => draftOf(offer, startKind, currency))
  const dirty = JSON.stringify(d) !== initial
  const [tried, setTried] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [leaving, setLeaving] = React.useState(false)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const busy = saving || deleting
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [ask, confirmSheet] = useConfirm()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const problems = problemsOf(d, currency)
  const shown: Problems = tried ? problems : {}
  const moreShown = moreOpen || !!(shown.places || shown.dates || shown.limit)
  const sign = currencySign(currency)
  const money = moneyIn(currency)
  const body = bodyOf(d, currency)
  const asOffer = React.useMemo((): Offer => ({ ...(bodyOf(d, currency) as Omit<Offer, "id">), id: offer?.id ?? DRAFT_ID }), [d, currency, offer?.id])
  const warnings = React.useMemo(() => (Object.keys(problems).length ? [] : offerWarnings(asOffer, others, products)), [asOffer, others, products, problems])
  const [now] = React.useState(() => new Date())
  const state = offer ? offerState(offer, now) : null

  /* The list, ready for the way back, and whether it opened this page (./list-return). */
  React.useEffect(() => {
    offersReturn.warm(router)
  }, [router])
  offersReturn.useOrigin()

  /* A reload or a closed tab with changes: the browser's own question. */
  React.useEffect(() => {
    if (!dirty || saving || deleting) return
    const stop = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", stop)
    return () => window.removeEventListener("beforeunload", stop)
  }, [dirty, saving, deleting])

  const point = () => {
    window.requestAnimationFrame(() => {
      const at = paneRef.current?.querySelector<HTMLElement>("[data-problem]")
      if (!at) return
      at.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
      at.querySelector<HTMLElement>("input:not([type=search]),[role=radio],[role=checkbox]")?.focus({ preventScroll: true })
    })
  }

  const canSave = ready && !busy && !leaving && (offer ? dirty : true)

  const save = async () => {
    if (busy || leaving || !ready) return
    if (offer && !dirty) return
    setTried(true)
    setError(null)
    if (Object.keys(problems).length) return point()
    setSaving(true)
    const sent = { ...body, formCurrency: currency }
    const r = await sendOffer(offer ? "PUT" : "POST", offer ? { ...sent, id: offer.id } : sent)
    if (r.ok === false) {
      setSaving(false)
      setError((r as { error: string }).error)
      paneRef.current?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" })
      return
    }
    const saved = (r as { offer?: Offer }).offer ?? (offer ? { ...offer, ...(body as Omit<Offer, "id">) } : null)
    /* Save stays busy while the page leaves: the list says the rest. */
    offersReturn.leave(router, { id: saved?.id ?? offer?.id ?? null, saved, message: offer ? tt("{value} saved", { value: d.title.trim() }) : tt("{value} created", { value: d.title.trim() }) })
  }

  /* Cancel while something would be lost, which asks first; Back once everything on the screen is saved. */
  const leaveMode = dirty || !offer ? "cancel" : "back"
  const leave = async () => {
    if (busy || leaving) return
    if (dirty) {
      const yes = await ask(
        offer
          ? { title: tt("Discard changes?"), body: tt("Your edits to this offer will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }
          : { title: tt("Discard this offer?"), body: tt("It has not been saved yet, so it will not be kept."), confirm: tt("Discard"), cancel: tt("Keep editing") },
      )
      if (!yes) return
    }
    setLeaving(true)
    offersReturn.leave(router, { id: offer?.id ?? null })
  }

  const remove = async () => {
    if (!offer || busy) return
    const yes = await ask({ title: tt("Delete {title}?", { title: offer.title }), body: tt("It stops showing and applying at once. Orders already placed keep their discount. To stop it for now instead, turn it off."), confirm: tt("Delete"), cancel: tt("Keep it") })
    if (!yes) return
    setDeleting(true)
    setError(null)
    const r = await sendOffer("DELETE", { id: offer.id, title: offer.title })
    if (r.ok === false) {
      setDeleting(false)
      setError((r as { error: string }).error)
      paneRef.current?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" })
      return
    }
    offersReturn.leave(router, { id: offer.id, deleted: true, message: tt("{title} deleted", { title: offer.title }) })
  }

  /* Cmd or Ctrl and S (or Enter), from anywhere on the page. */
  const saveRef = React.useRef(save)
  React.useEffect(() => {
    saveRef.current = save
  })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.key.toLowerCase() !== "s" && e.key !== "Enter") return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const pickProduct = (id: string) => {
    if (d.kind === "checkout") return set({ productIds: [id], triggerIds: d.triggerIds.filter((t) => t !== id) })
    if (d.productIds.includes(id)) return set({ productIds: d.productIds.filter((x) => x !== id) })
    if (d.productIds.length >= MAX_BUNDLE) return
    set({ productIds: [...d.productIds, id] })
  }
  const toggle = (list: string[], id: string, max = MAX_TRIGGERS) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, max))
  const togglePlace = (p: Placement) => set({ placements: d.placements.includes(p) ? d.placements.filter((x) => x !== p) : PLACEMENTS_FOR[d.kind].filter((x) => x === p || d.placements.includes(x)) })

  const discountOptions: { value: DiscountType; label: string }[] = [
    { value: "percent", label: tt("Percent") },
    { value: "fixed", label: tt("Amount") },
    ...(physical || d.discountType === "free_shipping" ? [{ value: "free_shipping" as const, label: tt("Free shipping") }] : []),
    { value: "none", label: tt("None") },
  ]
  /* What More options holds, in one line, while it is folded. */
  const placesLine = d.placements.length === 0 ? tt("Shown nowhere yet") : tt("Shown on {places}", { places: listWords(d.placements.map((p) => PLACEMENT_WORD[p]().toLowerCase())) })
  const dateWord = (v: string) => new Date(v).toLocaleDateString(appLocale(), { day: "numeric", month: "short" })
  const datesLine = d.endsAt ? tt("ends {date}", { date: dateWord(d.endsAt) }) : d.startsAt ? tt("starts {date}", { date: dateWord(d.startsAt) }) : tt("no end date")
  const moreLine = `${placesLine}, ${datesLine}${d.combinesWithCodes ? "" : `, ${tt("no codes on top")}`}`
  const newSettingsUsed = !settingsReady && (d.condition === "collections" || d.placements.length !== PLACEMENTS_FOR[d.kind].length || !!d.startsAt || !!d.endsAt || !!d.maxPerOrder || !d.combinesWithCodes || !!d.minSubtotal || d.discountType === "free_shipping")
  /* English reads "New bundle"; the other catalogs write "New offer: {kind}", where the kind keeps its own capital (German nouns). */
  const kindWord = tt("New offer") === "New offer" ? KIND_WORD[d.kind]().toLowerCase() : KIND_WORD[d.kind]()
  const title = offer ? offer.title : tt("New {kind}", { kind: kindWord })
  const price = priceLine(d, Number.isFinite(body.discountValue) ? body.discountValue : 0, byId, money)
  const problemCount = Object.keys(shown).length
  const saveWord = offer ? tt("Save") : tt("Create")

  const saveState: "saving" | "unsaved" | "new" | "saved" = saving ? "saving" : dirty ? "unsaved" : offer ? "saved" : "new"
  const stateLine = saveState === "saving" ? tt("Saving") : saveState === "unsaved" ? tt("Unsaved changes") : saveState === "new" ? tt("Not saved yet") : `${STATE_WORD[state!]()} · ${tt("{n} sold through it in the last 90 days.", { n: sold })}`

  return (
    <div
      ref={paneRef}
      data-offer-editor=""
      data-kind={d.kind}
      className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pb-[calc(32px+env(safe-area-inset-bottom))] lg:flex lg:flex-col"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {saving ? tt("Saving") : deleting ? tt("Deleting") : ""}
      </p>

      {/* THE TOP BAR, BELOW lg: Cancel or Back, and Create or Save, under the status bar on a phone. */}
      <div data-editor-bar="" className={cn("sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150 max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden", scrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "")}>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <LeaveButton mode={leaveMode} disabled={busy} leaving={leaving} asks={dirty} label={tt("Going back to offers")} onLeave={() => void leave()} />
          <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
        </div>
      </div>

      <div data-editor-page="" className="mx-auto w-full max-w-[760px] app-gutter pb-6 pt-1 sm:pb-16 sm:pt-2 lg:max-w-[1200px] lg:pb-8 lg:pt-6">
        {/* The page header: back to Upsells and bundles (from lg; below, the bar is the way back), the title, where it stands. */}
        <header data-editor-head="" className="mb-4 flex min-h-9 items-center gap-2 lg:mb-5">
          <button type="button" aria-label={tt("Back to offers")} title={tt("Upsells and bundles")} disabled={busy} onClick={() => void leave()} className={cn(iconButton, "-ml-1.5 hidden h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea] lg:inline-flex")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 data-offer-title="" className="min-w-0 truncate text-[22px] font-bold leading-8 text-[#1a1a2e] sm:text-[24px] lg:text-[28px] lg:leading-9">
            {title}
          </h1>
          {state ? (
            <span className="ml-1 shrink-0">
              <StatusBadge tone={STATE_TONE[state]}>{STATE_WORD[state]()}</StatusBadge>
            </span>
          ) : null}
        </header>

        {!ready ? (
          <p data-sql-needed="116" className="mb-3 rounded-xl bg-[#fff8e6] px-4 py-3 text-[14px] leading-5 text-[#5c4300] lg:mb-4">
            {tt("Upsells and bundles need SQL part 116 (supabase/sql/run-now/116_store_offers.sql). Run it in Supabase and come back.")}
          </p>
        ) : null}
        {error ? (
          <div role="alert" data-offer-error="" className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f] lg:mb-4">
            {error}
          </div>
        ) : problemCount > 0 ? (
          <div role="alert" data-problem-count={problemCount} className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f] lg:mb-4">
            {tt("{n, plural, one {One thing to fix before it can be saved.} other {# things to fix before it can be saved.}}", { n: problemCount })}
          </div>
        ) : null}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(272px,1fr)] lg:items-start"
        >
          <div data-editor-main="" className="flex min-w-0 flex-col gap-3 sm:gap-4">
            {/* ── The name ─────────────────────────────────────────── */}
            <section className={CARD} {...(shown.title ? { "data-problem": "" } : {})}>
              <label htmlFor="offer-title" className={CARD_TITLE}>
                {tt("Name buyers see")}
              </label>
              <div className="space-y-1.5">
                <input id="offer-title" value={d.title} maxLength={80} autoComplete="off" enterKeyHint="done" onChange={(e) => set({ title: e.target.value })} aria-invalid={!!shown.title || undefined} className={cn(FIELD, shown.title && BAD)} />
                {shown.title ? <p className={cn(ERR, "mt-0")}>{shown.title}</p> : <p className={HINT}>{d.kind === "quantity_break" ? tt("Shown above the tiers on the product page.") : d.kind === "bundle" ? tt("Shown above the set on each product's page.") : tt("Shown above the product you offer.")}</p>}
              </div>
            </section>

            {/* ── The products ─────────────────────────────────────── */}
            {d.kind === "quantity_break" ? (
              <section className={CARD} {...(shown.products ? { "data-problem": "" } : {})}>
                <h2 className={CARD_TITLE}>{tt("Applies to")}</h2>
                {collections.length || d.scope === "collection" ? (
                  <ChoiceGrid
                    label={tt("Applies to")}
                    value={d.scope}
                    onChange={(scope) => set({ scope })}
                    options={[
                      { value: "product", label: tt("One product") },
                      { value: "collection", label: tt("A collection") },
                    ]}
                  />
                ) : null}
                {d.scope === "product" ? (
                  <ProductPicker products={products} chosen={d.productIds} onPick={(id) => set({ productIds: [id] })} single money={money} name="offer-products" />
                ) : (
                  <ul role="radiogroup" aria-label={tt("Collections")} className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb]">
                    {collections.map((c) => {
                      const on = d.triggerCollectionIds[0] === c.id
                      return (
                        <li key={c.id}>
                          <button type="button" role="radio" aria-checked={on} data-pick-collection={c.id} onClick={() => set({ triggerCollectionIds: [c.id] })} className={ROW_BUTTON}>
                            <Radio on={on} />
                            <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e] sm:text-[14px]">{c.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {shown.products ? <p className={ERR}>{shown.products}</p> : null}
              </section>
            ) : (
              <section className={CARD} {...(shown.products ? { "data-problem": "" } : {})}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={CARD_TITLE}>{d.kind === "bundle" ? tt("Products in the bundle") : tt("Product to offer")}</h2>
                  {d.kind === "bundle" ? <span className={cn(HINT, "tabular-nums")}>{tt("{n} of {max}", { n: d.productIds.length, max: MAX_BUNDLE })}</span> : null}
                </div>
                <ProductPicker products={products} chosen={d.productIds} onPick={pickProduct} single={d.kind === "checkout"} money={money} name="offer-products" full={d.kind === "bundle" && d.productIds.length >= MAX_BUNDLE} />
                {shown.products ? <p className={ERR}>{shown.products}</p> : null}
              </section>
            )}

            {/* ── An upsell: when it shows ─────────────────────────── */}
            {d.kind === "checkout" ? (
              <section className={CARD} {...(shown.triggers || shown.minimum ? { "data-problem": "" } : {})}>
                <h2 className={CARD_TITLE}>{tt("Show it when the cart has")}</h2>
                <RadioRows
                  label={tt("Show it when the cart has")}
                  value={d.condition}
                  onChange={(condition) => set({ condition })}
                  options={[
                    { value: "any", label: tt("Anything") },
                    { value: "products", label: tt("Certain products") },
                    ...(collections.length || d.condition === "collections" ? [{ value: "collections" as const, label: tt("A product from a collection") }] : []),
                  ]}
                />
                {d.condition === "products" ? <ProductPicker products={products.filter((p) => !d.productIds.includes(p.id))} chosen={d.triggerIds} onPick={(id) => set({ triggerIds: toggle(d.triggerIds, id) })} money={money} name="offer-triggers" /> : null}
                {d.condition === "collections" ? (
                  <ul aria-label={tt("Collections")} className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb]">
                    {collections.map((c) => {
                      const on = d.triggerCollectionIds.includes(c.id)
                      return (
                        <li key={c.id}>
                          <button type="button" role="checkbox" aria-checked={on} onClick={() => set({ triggerCollectionIds: toggle(d.triggerCollectionIds, c.id) })} className={ROW_BUTTON}>
                            <Tick on={on} />
                            <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e] sm:text-[14px]">{c.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                {shown.triggers ? <p className={ERR}>{shown.triggers}</p> : null}
                <div className="border-t border-[#eef0f2] pt-4">
                  <label htmlFor="offer-minimum" className={LABEL}>
                    {tt("And the rest of the order is at least")}
                    <span className={OPTIONAL}>{tt("optional")}</span>
                  </label>
                  <MoneyField id="offer-minimum" sign={sign} value={d.minSubtotal} onChange={(minSubtotal) => set({ minSubtotal })} bad={!!shown.minimum} placeholder="0" />
                  {shown.minimum ? <p className={ERR}>{shown.minimum}</p> : null}
                </div>
              </section>
            ) : null}

            {/* ── The discount, or the tiers ───────────────────────── */}
            {d.kind === "quantity_break" ? (
              <section className={CARD}>
                <TierEditor tiers={d.tiers} onChange={(tiers) => set({ tiers })} problems={shown.tier ?? {}} problem={shown.tiers ?? null} sign={sign} money={money} currency={currency} />
                {!breaksReady ? (
                  <p data-sql-needed="304" className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">
                    {tt("Quantity breaks need SQL part 304 before they can be saved.")}
                  </p>
                ) : null}
              </section>
            ) : (
              <section className={CARD} {...(shown.amount ? { "data-problem": "" } : {})}>
                <h2 className={CARD_TITLE}>{tt("Discount")}</h2>
                <ChoiceGrid label={tt("Discount type")} value={d.discountType} onChange={(t) => set({ discountType: t, amount: t === "percent" ? "10" : t === "fixed" ? amountOf(500, currency) : "" })} options={discountOptions} />
                {d.discountType === "percent" || d.discountType === "fixed" ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {d.discountType === "fixed" ? (
                      <MoneyField id="offer-amount" sign={sign} value={d.amount} onChange={(amount) => set({ amount })} bad={!!shown.amount} className="w-[150px]" />
                    ) : (
                      <label className="relative block w-[120px]">
                        <span className="sr-only">{tt("Percent off")}</span>
                        <input id="offer-amount" inputMode="numeric" value={d.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!shown.amount || undefined} className={cn(FIELD, "pr-8 tabular-nums", shown.amount && BAD)} />
                        <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">%</span>
                      </label>
                    )}
                    <p className={HINT}>{d.kind === "bundle" ? (d.discountType === "fixed" ? tt("Off each complete set.") : tt("Off every product in each complete set.")) : tt("Off the product it offers.")}</p>
                  </div>
                ) : (
                  <p className={HINT}>{d.discountType === "free_shipping" ? (d.kind === "bundle" ? tt("The whole order ships free once the set is in the cart.") : tt("The whole order ships free once it's added.")) : tt("It's suggested at its own price.")}</p>
                )}
                {shown.amount ? <p className={ERR}>{shown.amount}</p> : null}
                {price && !shown.amount ? (
                  <p data-offer-price="" className="rounded-xl bg-[#f4f5f7] px-3.5 py-2.5 text-[14px] font-medium leading-5 text-[#1a1a2e] sm:text-[13px]">
                    {price}
                  </p>
                ) : null}
              </section>
            )}

            {warnings.length ? (
              <ul data-offer-warnings="" className="space-y-1 rounded-xl bg-[#fff8e6] px-4 py-3 text-[14px] leading-5 text-[#5c4300] sm:text-[13px]">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            {/* ── More options: where it shows, dates and limits, folded until wanted ── */}
            <section data-offer-more={moreShown ? "open" : "closed"} className="scroll-mt-20 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:scroll-mt-6">
              <button
                type="button"
                aria-expanded={moreShown}
                aria-controls="offer-more"
                onClick={() => setMoreOpen(!moreShown)}
                className="flex min-h-[64px] w-full cursor-pointer items-center gap-3 app-card-x py-3 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#fafafb] sm:min-h-[72px]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">{tt("More options")}</span>
                  <span data-offer-more-line="" className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#6b7280]">
                    {moreLine}
                  </span>
                </span>
                <ChevronDown aria-hidden className={cn("h-5 w-5 shrink-0 text-[#6b7280] transition-[rotate] duration-200 motion-reduce:transition-none", moreShown && "rotate-180")} />
              </button>
              {moreShown ? (
                <div id="offer-more" className="space-y-5 border-t border-[#eef0f2] app-card-x pb-5 pt-4 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                  <div className="space-y-2" role="group" aria-labelledby="offer-places" {...(shown.places ? { "data-problem": "" } : {})}>
                    <p id="offer-places" className={LABEL}>
                      {tt("Show it on")}
                    </p>
                    <div className={cn(SWITCH_GROUP, "divide-y")}>
                      {PLACEMENTS_FOR[d.kind].map((p) => {
                        const on = d.placements.includes(p)
                        return (
                          <button key={p} type="button" role="checkbox" aria-checked={on} data-place={p} onClick={() => togglePlace(p)} className={ROW_BUTTON}>
                            <Tick on={on} />
                            <span className="min-w-0 flex-1 text-[15px] text-[#1a1a2e] sm:text-[14px]">{PLACEMENT_WORD[p]()}</span>
                          </button>
                        )
                      })}
                    </div>
                    {shown.places ? <p className={ERR}>{shown.places}</p> : null}
                  </div>

                  <div className="space-y-2" {...(shown.dates ? { "data-problem": "" } : {})}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label htmlFor="offer-start" className={LABEL}>
                          {tt("Starts")}
                          <span className={OPTIONAL}>{tt("optional")}</span>
                        </label>
                        <input id="offer-start" type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={cn(FIELD, "appearance-none tabular-nums")} />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="offer-end" className={LABEL}>
                          {tt("Ends")}
                          <span className={OPTIONAL}>{tt("optional")}</span>
                        </label>
                        <input id="offer-end" type="datetime-local" value={d.endsAt} min={d.startsAt || undefined} onChange={(e) => set({ endsAt: e.target.value })} aria-invalid={!!shown.dates || undefined} className={cn(FIELD, "appearance-none tabular-nums", shown.dates && BAD)} />
                      </div>
                    </div>
                    {shown.dates ? <p className={ERR}>{shown.dates}</p> : <p className={HINT}>{tt("Dates are in your own time zone.")}</p>}
                  </div>

                  {d.discountType === "percent" || d.discountType === "fixed" ? (
                    <div {...(shown.limit ? { "data-problem": "" } : {})}>
                      <label htmlFor="offer-limit" className={LABEL}>
                        {d.kind === "bundle" ? tt("Discounted sets per order") : tt("Discounted items per order")}
                      </label>
                      <input id="offer-limit" inputMode="numeric" value={d.maxPerOrder} placeholder={d.kind === "bundle" ? tt("No limit") : "1"} onChange={(e) => set({ maxPerOrder: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!shown.limit || undefined} className={cn(FIELD, "w-[150px] tabular-nums", shown.limit && BAD)} />
                      {shown.limit ? <p className={ERR}>{shown.limit}</p> : null}
                    </div>
                  ) : null}

                  <div className={SWITCH_GROUP}>
                    <SwitchRow title={tt("Discount codes can be used too")} hint={d.combinesWithCodes ? tt("A code comes off what is left after this offer.") : tt("With a code, the buyer gets whichever saves more.")} checked={d.combinesWithCodes} onChange={(combinesWithCodes) => set({ combinesWithCodes })} />
                  </div>
                  {newSettingsUsed ? <p className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">{tt("Dates, places, limits, collections, free shipping and the code rule need SQL part 230 before they can be saved.")}</p> : null}
                </div>
              ) : null}
            </section>
          </div>

          {/* From lg the side column stays in view while the offer is filled in. */}
          <div data-editor-side="" className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-6">
            <section data-offer-status="" className={CARD} aria-labelledby="offer-active-title">
              {/* The whole row turns it, as a SwitchRow does (../products/new/editor-controls). */}
              <div
                data-switch-row=""
                className="-my-1 flex min-h-11 cursor-pointer items-center gap-3 py-1"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[role=switch]")) return
                  set({ active: !d.active })
                }}
              >
                <div className="min-w-0 flex-1">
                  <h2 id="offer-active-title" className={CARD_TITLE}>
                    {tt("Active")}
                  </h2>
                  <p className={cn(HINT, "mt-0.5")}>{d.active ? tt("Buyers see it where it shows.") : tt("Off. Buyers do not see it until you turn it on.")}</p>
                </div>
                <div>
                  <FormSwitch checked={d.active} onChange={(active) => set({ active })} label={tt("Active")} />
                </div>
              </div>
              {offer ? (
                <p data-offer-sold={sold} className={cn(HINT, "border-t border-[#eef0f2] pt-4")}>
                  {tt("{n} sold through it in the last 90 days.", { n: sold })}
                </p>
              ) : null}
            </section>

            {offer ? (
              <div className="flex justify-start lg:justify-end">
                <button type="button" data-delete-offer="" disabled={busy} onClick={() => void remove()} className={cn(quietDanger, "h-11 rounded-[10px] px-4 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                  {tt("Delete offer")}
                </button>
              </div>
            ) : null}
          </div>
        </form>
      </div>

      {/* THE FOOT BAR, FROM lg: where the page stands on the left, Cancel (or Back) and Create (or Save) on the right. */}
      <div data-editor-foot="" data-app-foot="up" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p data-editor-state={saveState} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", saveState === "unsaved" ? "bg-[#111113]" : saveState === "saved" && state === "active" ? "bg-[#22a06b]" : "bg-[#b6bac1]")} />
            <span className={cn("truncate", saveState === "unsaved" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{stateLine}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={leaveMode} disabled={busy} leaving={leaving} asks={dirty} label={tt("Going back to offers")} onLeave={() => void leave()} />
            <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
          </div>
        </div>
      </div>

      {confirmSheet}
    </div>
  )
}
