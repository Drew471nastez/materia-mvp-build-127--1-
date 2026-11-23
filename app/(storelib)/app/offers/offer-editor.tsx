"use client"

/**
 * ===========================================================================
 *  ONE OFFER, NEW OR SAVED, IN A MODAL OVER THE LIST
 * ===========================================================================
 * Round 58: "creating an offer becomes a modal, like the Add product modal
 * on the Products page". The same shell as Add product
 * (../products/new/kind-chooser.tsx): components/ui/sheet-dialog, a centred
 * dialog from 768px and the shared bottom sheet on a phone, its title and
 * close button on one line at the top.
 *
 *   NEW OFFER asks what kind first, as Add product does: Bundle, Upsell,
 *   Quantity break, one row each with its small drawing and one line. A
 *   pick moves to the form in the same modal; the arrow goes back. A link
 *   with ?kind= (Create bundle, an app's page) starts on the form.
 *
 *   THE FORM is one column, in the order a person decides it: the name
 *   buyers see, the products, an upsell's condition, the discount (or a
 *   quantity break's tiers), then More options folded (where it shows,
 *   dates, a limit per order, codes on top), and whether it is on. What a
 *   buyer pays is said in one line under the discount, worked out by the
 *   checkout's own arithmetic (lib/offers/offers.ts bundlePrice,
 *   offerUnitPrice).
 *
 *   THE FOOT holds Cancel and Create (or Save), and Delete for a saved one.
 *
 * Every setting is a field the server stores and a rule the checkout
 * applies (lib/offers/offers.ts readOffer, applyOffers); the server checks
 * all of it again and never takes a price from here. What is wrong is said
 * under its own field when Create is pressed, and the first one is brought
 * into view. Ctrl or Cmd and S (or Enter) saves. Closing with changes asks
 * first.
 */

import * as React from "react"
import { ArrowLeft, ChevronDown, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { LAYER_PHONE } from "@/components/app/page-layer"
import { hapticTap } from "@/lib/native-bridge"
import { MAX_BUNDLE, MAX_TRIGGERS, PLACEMENTS_FOR, bundlePrice, offerUnitPrice, type DiscountType, type Offer, type OfferKind, type Placement } from "@/lib/offers/offers"
import { amountOf, bodyOf, draftOf, problemsOf, type Draft, type Problems } from "./offer-draft"
import { SWITCH_GROUP, Segmented, SwitchRow } from "../products/new/editor-controls"
import { useConfirm } from "../products/new/confirm-sheet"
import { buttonAccent, buttonSecondary } from "../orders/order-parts"
import { Tick, quietDanger } from "../coupons/coupon-parts"
import { KIND_WORD, PLACEMENT_WORD, currencySign, moneyIn, type OfferCollection, type OfferProduct } from "./offer-parts"
import { BAD, ChoiceGrid, ERR, FIELD, HINT, KindDrawing, LABEL, MoneyField, ProductPicker, Radio, RadioRows, TierEditor } from "./offer-fields"
import { DRAFT_ID, offerWarnings } from "@/lib/offers/try-cart"
import { sendOffer } from "./offer-api"

/* What each kind does, in one line, under its name. */
const KIND_HINT: Record<OfferKind, () => string> = {
  bundle: () => tt("Two to five products bought together, for less."),
  checkout: () => tt("One more product, suggested on the product page, in the cart or at checkout."),
  quantity_break: () => tt("Buy more, pay less each. Or buy 2, get 1 free."),
}

/* The order the kinds are offered in. */
export const KIND_ORDER: OfferKind[] = ["bundle", "checkout", "quantity_break"]

/** "a", "a and b", "a, b and c". */
const listWords = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} ${tt("and")} ${words[words.length - 1]}`)

/* A part of the form: its words above, the field under, no box around it (the modal is the box). */
const PART = "scroll-mt-4 space-y-2.5"
const PART_TITLE = "block text-[14px] font-semibold leading-5 text-[#1a1a2e] max-sm:text-[15px]"
const OPTIONAL = "ml-1 font-normal text-[#9ca3af]"

/* Add product's kind rows (../products/new/kind-chooser.tsx ROW), a little shorter: the drawing is smaller. */
const KIND_ROW =
  "group/kind flex min-h-[76px] w-full cursor-pointer items-center gap-4 rounded-2xl border border-[#e2e4e8] bg-white px-4 py-3 text-left outline-none transition-[background-color,border-color] duration-150 hover:border-[#c9cdd5] hover:bg-[#fafbfc] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

const CLOSE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] [-webkit-tap-highlight-color:transparent]"

/** What the modal opens on: a saved offer, or a new one (with its kind when the link named one). */
export type OfferOpen = { offer: Offer } | { offer: null; kind: OfferKind | null }

export interface OfferEditorProps {
  open: boolean
  /** What it is open on; kept while it closes, so the content leaves with it. */
  target: OfferOpen | null
  onClose: () => void
  /** Saved: the offer as the server stored it, and whether it is new. */
  onSaved: (offer: Offer, created: boolean) => void
  onDeleted: (offer: Offer) => void
  products: OfferProduct[]
  collections: OfferCollection[]
  /** The store's offers, for what competes with this one on the same products. */
  others?: Offer[]
  currency: string
  /** Physical commerce is on: free shipping can be offered. */
  physical: boolean
  /** SQL part 116 has run: offers can be saved at all. */
  ready?: boolean
  /** SQL part 230 has run: dates, places, limits and the rest can be saved. */
  settingsReady: boolean
  /** SQL part 304 has run: a quantity break can be saved. */
  breaksReady: boolean
  /** Units each offer sold in the last 90 days. */
  sold?: Record<string, number>
}

/**
 * THE MODAL. A phone gets the shared sheet, a computer the dialog, by the
 * app's own phone width (components/app/page-layer LAYER_PHONE), as Add
 * product does. The form inside is new each time it opens.
 */
export function OfferEditor(props: OfferEditorProps) {
  const { open, target, onClose } = props
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia(LAYER_PHONE)
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  /* A new form for each open, so nothing typed last time is kept. */
  const [session, setSession] = React.useState(0)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((n) => n + 1)
  }
  /* The form says whether closing would lose something; the sheet asks it before going. */
  const guard = React.useRef<() => Promise<boolean>>(async () => true)
  const [busy, setBusy] = React.useState(false)
  const close = React.useCallback(async () => {
    if (await guard.current()) onClose()
  }, [onClose])
  const label = target?.offer ? tt("Edit offer") : tt("New offer")

  return (
    <SheetDialog
      open={open}
      onClose={() => void close()}
      phone={phone}
      label={label}
      showCloseButton={false}
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        document.querySelector<HTMLElement>("[data-offer-editor] [data-kind], [data-offer-editor] #offer-title")?.focus({ preventScroll: true })
      }}
      sheet={{ fill: true, aboveKeyboard: true, dismissible: !busy, maxHeight: "calc(var(--vv-h, 100dvh) - max(env(safe-area-inset-top, 0px), 16px) - 12px)" }}
      dialog={{ "aria-describedby": undefined, onInteractOutside: (e) => e.preventDefault() }}
      className="flex max-h-[min(820px,calc(100dvh-48px))] w-[calc(100%-32px)] max-w-[600px] flex-col gap-0 overflow-hidden rounded-2xl border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] sm:max-w-[600px]"
    >
      {target ? <OfferForm key={session} {...props} target={target} phone={phone} guard={guard} onBusy={setBusy} onClose={() => void close()} onLeave={onClose} /> : null}
    </SheetDialog>
  )
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

function OfferForm({
  target,
  products,
  collections,
  others = [],
  currency: currencyNow,
  physical,
  ready = true,
  settingsReady,
  breaksReady,
  sold = {},
  phone,
  guard,
  onBusy,
  onClose,
  onLeave,
  onSaved,
  onDeleted,
}: OfferEditorProps & { target: OfferOpen; phone: boolean; guard: React.RefObject<() => Promise<boolean>>; onBusy: (b: boolean) => void; onClose: () => void; onLeave: () => void }) {
  const offer = target.offer
  const startKind: OfferKind = target.offer ? target.offer.kind : (target.kind ?? "bundle")
  /* The currency this offer's amounts were typed in, kept while it is open: a save after the store's currency changed is refused (lib/store/currency-guard), never written over the converted amounts. */
  const [currency] = React.useState(currencyNow)
  const [d, setD] = React.useState<Draft>(() => draftOf(offer, startKind, currency))
  const [initial, setInitial] = React.useState(() => JSON.stringify(draftOf(offer, startKind, currency)))
  const dirty = JSON.stringify(d) !== initial
  /* A new offer with no kind in its link starts on the choice of kind, as Add product does. */
  const [step, setStep] = React.useState<"kind" | "form">(offer || (target as { kind: OfferKind | null }).kind ? "form" : "kind")
  const [tried, setTried] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const busy = saving || deleting
  React.useEffect(() => onBusy(busy), [busy, onBusy])
  const bodyRef = React.useRef<HTMLDivElement>(null)
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

  /* Closing asks first while something would be lost: a change, or a new offer past the choice of kind. */
  React.useEffect(() => {
    guard.current = async () => {
      if (busy) return false
      if (!dirty) return true
      return ask(
        offer
          ? { title: tt("Discard changes?"), body: tt("Your edits to this offer will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }
          : { title: tt("Discard this offer?"), body: tt("It has not been saved yet, so it will not be kept."), confirm: tt("Discard"), cancel: tt("Keep editing") },
      )
    }
  })

  const save = async () => {
    if (busy || !ready || step !== "form") return
    setTried(true)
    if (Object.keys(problems).length) {
      /* The first field with something to fix, brought into view. */
      window.requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>("[data-problem]")?.scrollIntoView({ block: "center", behavior: "smooth" }))
      return
    }
    setSaving(true)
    setError(null)
    const sent = { ...body, formCurrency: currency }
    const r = await sendOffer(offer ? "PUT" : "POST", offer ? { ...sent, id: offer.id } : sent)
    if (r.ok === false) {
      setSaving(false)
      setError((r as { error: string }).error)
      bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const saved = (r as { offer?: Offer }).offer ?? (offer ? { ...offer, ...(body as Omit<Offer, "id">) } : null)
    setInitial(JSON.stringify(d))
    setSaving(false)
    if (saved) onSaved(saved, !offer)
    onLeave()
  }

  const remove = async () => {
    if (!offer || busy) return
    const yes = await ask({ title: tt("Delete {title}?", { title: offer.title }), body: tt("It stops showing and applying at once. Orders already placed keep their discount. To stop it for now instead, turn it off."), confirm: tt("Delete"), cancel: tt("Keep it") })
    if (!yes) return
    setDeleting(true)
    setError(null)
    const r = await sendOffer("DELETE", { id: offer.id, title: offer.title })
    setDeleting(false)
    if (r.ok === false) {
      setError((r as { error: string }).error)
      bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    onDeleted(offer)
    onLeave()
  }

  /* Cmd or Ctrl and S, or Enter, while the modal is open. */
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

  const pickKind = (k: OfferKind) => {
    if (phone) hapticTap("soft")
    const fresh = draftOf(null, k, currency)
    setD(fresh)
    setInitial(JSON.stringify(fresh))
    setTried(false)
    setStep("form")
    window.requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0 })
      if (!phone) bodyRef.current?.querySelector<HTMLInputElement>("#offer-title")?.focus({ preventScroll: true })
    })
  }

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
  const canSave = ready && !busy && step === "form" && (offer ? dirty : true)
  const title = step === "kind" ? tt("New offer") : offer ? tt("Edit {kind}", { kind: KIND_WORD[d.kind]().toLowerCase() }) : tt("New {kind}", { kind: KIND_WORD[d.kind]().toLowerCase() })
  const price = priceLine(d, Number.isFinite(body.discountValue) ? body.discountValue : 0, byId, money)
  const problemCount = Object.keys(shown).length

  /* The title row: back to the kinds (a new offer past the choice), the title, the close button. On a phone it is drawn inside the sheet, under its handle. */
  const head = (
    <div data-offer-head="" className="flex shrink-0 items-center gap-1 px-5 pb-3 pt-2 md:border-b md:border-[#eef0f2] md:px-6 md:py-4">
      {step === "form" && !offer && !(target as { kind: OfferKind | null }).kind ? (
        <button type="button" aria-label={tt("Back to the kinds of offer")} data-offer-back="" disabled={busy} onClick={() => setStep("kind")} className={cn(CLOSE, "-ml-2")}>
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
      ) : null}
      <SheetDialogTitle className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-6 text-[#1a1a2e]">{title}</SheetDialogTitle>
      <button type="button" onClick={onClose} aria-label={tt("Close")} data-offer-close="" className={cn(CLOSE, "-mr-2")}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )

  return (
    <div data-offer-editor="" data-step={step} className="flex min-h-0 flex-1 flex-col">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {saving ? tt("Saving") : deleting ? tt("Deleting") : ""}
      </p>
      {head}

      {step === "kind" ? (
        /* ── What kind: Add product's rows ─────────────────────────── */
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[calc(16px+env(safe-area-inset-bottom))] md:px-6 md:pb-6 md:pt-5">
          <ul className="space-y-2.5" data-kind-list="" role="list">
            {KIND_ORDER.map((k) => (
              <li key={k}>
                <button type="button" data-kind={k} onClick={() => pickKind(k)} className={KIND_ROW}>
                  <span aria-hidden className="flex h-[52px] w-[76px] shrink-0 items-center rounded-xl bg-[#f4f5f7] px-1.5">
                    <KindDrawing kind={k} on={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold leading-5 text-[#1a1a2e]">{KIND_WORD[k]()}</span>
                    <span data-kind-hint={k} className="mt-0.5 block text-[13px] leading-[18px] text-[#6b7280] max-sm:text-[14px] max-sm:leading-5">
                      {KIND_HINT[k]()}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2] transition-[translate,color] duration-150 group-hover/kind:translate-x-0.5 group-hover/kind:text-[#6b7280]" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div ref={bodyRef} data-offer-body="" className="page-scroll min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 md:px-6 md:pt-5">
            {!ready ? (
              <p data-sql-needed="116" className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">
                {tt("Upsells and bundles need SQL part 116 (supabase/sql/run-now/116_store_offers.sql). Run it in Supabase and come back.")}
              </p>
            ) : null}
            {error ? (
              <p role="alert" data-offer-error="" className="rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[13px] leading-5 text-[#b42318]">
                {error}
              </p>
            ) : problemCount > 0 ? (
              <p role="alert" data-problem-count={problemCount} className="rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[13px] leading-5 text-[#b42318]">
                {tt("{n, plural, one {One thing to fix before it can be saved.} other {# things to fix before it can be saved.}}", { n: problemCount })}
              </p>
            ) : null}

            {/* ── The name ─────────────────────────────────────────── */}
            <div className={PART} {...(shown.title ? { "data-problem": "" } : {})}>
              <label htmlFor="offer-title" className={PART_TITLE}>
                {tt("Name buyers see")}
              </label>
              <input id="offer-title" value={d.title} maxLength={80} autoComplete="off" enterKeyHint="done" onChange={(e) => set({ title: e.target.value })} aria-invalid={!!shown.title} className={cn(FIELD, shown.title && BAD)} />
              {shown.title ? <p className={ERR}>{shown.title}</p> : <p className={HINT}>{d.kind === "quantity_break" ? tt("Shown above the tiers on the product page.") : d.kind === "bundle" ? tt("Shown above the set on each product's page.") : tt("Shown above the product you offer.")}</p>}
            </div>

            {/* ── The products ─────────────────────────────────────── */}
            {d.kind === "quantity_break" ? (
              <div className={PART} {...(shown.products ? { "data-problem": "" } : {})}>
                <p className={PART_TITLE}>{tt("Applies to")}</p>
                {collections.length || d.scope === "collection" ? (
                  <Segmented
                    label={tt("Applies to")}
                    value={d.scope}
                    fit="content"
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
                          <button type="button" role="radio" aria-checked={on} data-pick-collection={c.id} onClick={() => set({ triggerCollectionIds: [c.id] })} className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-3.5 text-left outline-none focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[44px] sm:hover:bg-[#fafafb]">
                            <Radio on={on} />
                            <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e] sm:text-[14px]">{c.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {shown.products ? <p className={ERR}>{shown.products}</p> : null}
              </div>
            ) : (
              <div className={PART} {...(shown.products ? { "data-problem": "" } : {})}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className={PART_TITLE}>{d.kind === "bundle" ? tt("Products in the bundle") : tt("Product to offer")}</p>
                  {d.kind === "bundle" ? <span className={cn(HINT, "tabular-nums")}>{tt("{n} of {max}", { n: d.productIds.length, max: MAX_BUNDLE })}</span> : null}
                </div>
                <ProductPicker products={products} chosen={d.productIds} onPick={pickProduct} single={d.kind === "checkout"} money={money} name="offer-products" full={d.kind === "bundle" && d.productIds.length >= MAX_BUNDLE} />
                {shown.products ? <p className={ERR}>{shown.products}</p> : null}
              </div>
            )}

            {/* ── An upsell: when it shows ─────────────────────────── */}
            {d.kind === "checkout" ? (
              <div className={PART} {...(shown.triggers || shown.minimum ? { "data-problem": "" } : {})}>
                <p className={PART_TITLE}>{tt("Show it when the cart has")}</p>
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
                          <button type="button" role="checkbox" aria-checked={on} onClick={() => set({ triggerCollectionIds: toggle(d.triggerCollectionIds, c.id) })} className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-3.5 text-left outline-none focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[44px] sm:hover:bg-[#fafafb]">
                            <Tick on={on} />
                            <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e] sm:text-[14px]">{c.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                {shown.triggers ? <p className={ERR}>{shown.triggers}</p> : null}
                <div className="pt-1">
                  <label htmlFor="offer-minimum" className={LABEL}>
                    {tt("And the rest of the order is at least")}
                    <span className={OPTIONAL}>{tt("optional")}</span>
                  </label>
                  <MoneyField id="offer-minimum" sign={sign} value={d.minSubtotal} onChange={(minSubtotal) => set({ minSubtotal })} bad={!!shown.minimum} placeholder="0" />
                  {shown.minimum ? <p className={ERR}>{shown.minimum}</p> : null}
                </div>
              </div>
            ) : null}

            {/* ── The discount, or the tiers ───────────────────────── */}
            {d.kind === "quantity_break" ? (
              <div className={PART}>
                <TierEditor tiers={d.tiers} onChange={(tiers) => set({ tiers })} problems={shown.tier ?? {}} problem={shown.tiers ?? null} sign={sign} money={money} currency={currency} />
                {!breaksReady ? (
                  <p data-sql-needed="304" className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">
                    {tt("Quantity breaks need SQL part 304 before they can be saved.")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className={PART} {...(shown.amount ? { "data-problem": "" } : {})}>
                <p className={PART_TITLE}>{tt("Discount")}</p>
                <ChoiceGrid label={tt("Discount type")} value={d.discountType} onChange={(t) => set({ discountType: t, amount: t === "percent" ? "10" : t === "fixed" ? amountOf(500, currency) : "" })} options={discountOptions} />
                {d.discountType === "percent" || d.discountType === "fixed" ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {d.discountType === "fixed" ? (
                      <MoneyField id="offer-amount" sign={sign} value={d.amount} onChange={(amount) => set({ amount })} bad={!!shown.amount} className="w-[150px]" />
                    ) : (
                      <label className="relative block w-[120px]">
                        <span className="sr-only">{tt("Percent off")}</span>
                        <input id="offer-amount" inputMode="numeric" value={d.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!shown.amount} className={cn(FIELD, "pr-8 tabular-nums", shown.amount && BAD)} />
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
                  <p data-offer-price="" className="text-[13px] font-medium leading-5 text-[#1a1a2e] max-sm:text-[14px]">
                    {price}
                  </p>
                ) : null}
              </div>
            )}

            {warnings.length ? (
              <ul data-offer-warnings="" className="space-y-1 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}

            {/* ── On or off ────────────────────────────────────────── */}
            <div className={SWITCH_GROUP} data-offer-status="">
              <SwitchRow title={tt("Active")} hint={d.active ? tt("Buyers see it where it shows.") : tt("Off. Buyers do not see it until you turn it on.")} checked={d.active} onChange={(active) => set({ active })} />
            </div>

            {/* ── More options: where it shows, dates and limits, folded until wanted ── */}
            <div data-offer-more={moreShown ? "open" : "closed"} className="rounded-xl border border-[#e5e7eb]">
              <button
                type="button"
                aria-expanded={moreShown}
                aria-controls="offer-more"
                onClick={() => setMoreOpen(!moreShown)}
                className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[0_0_0_3px_rgba(17,17,19,0.08)] sm:min-h-[52px]"
              >
                <span className="min-w-0 flex-1">
                  <span id="offer-more-title" className="block text-[15px] font-medium leading-5 text-[#1a1a2e] sm:text-[14px]">
                    {tt("More options")}
                  </span>
                  <span data-offer-more-line="" className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#6b7280]">
                    {moreLine}
                  </span>
                </span>
                <ChevronDown aria-hidden className={cn("h-5 w-5 shrink-0 text-[#6b7280] transition-[rotate] duration-200 motion-reduce:transition-none", moreShown && "rotate-180")} />
              </button>
              {moreShown ? (
                <div id="offer-more" className="space-y-5 border-t border-[#eef0f2] px-4 pb-4 pt-4">
                  <div className="space-y-2" role="group" aria-labelledby="offer-places" {...(shown.places ? { "data-problem": "" } : {})}>
                    <p id="offer-places" className={LABEL}>
                      {tt("Show it on")}
                    </p>
                    <div className={cn(SWITCH_GROUP, "divide-y")}>
                      {PLACEMENTS_FOR[d.kind].map((p) => {
                        const on = d.placements.includes(p)
                        return (
                          <button key={p} type="button" role="checkbox" aria-checked={on} data-place={p} onClick={() => togglePlace(p)} className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 px-3.5 text-left outline-none focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[40px] sm:hover:bg-[#fafafb]">
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
                      <div>
                        <label htmlFor="offer-start" className={LABEL}>
                          {tt("Starts")}
                          <span className={OPTIONAL}>{tt("optional")}</span>
                        </label>
                        <input id="offer-start" type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={cn(FIELD, "appearance-none tabular-nums")} />
                      </div>
                      <div>
                        <label htmlFor="offer-end" className={LABEL}>
                          {tt("Ends")}
                          <span className={OPTIONAL}>{tt("optional")}</span>
                        </label>
                        <input id="offer-end" type="datetime-local" value={d.endsAt} min={d.startsAt || undefined} onChange={(e) => set({ endsAt: e.target.value })} aria-invalid={!!shown.dates} className={cn(FIELD, "appearance-none tabular-nums", shown.dates && BAD)} />
                      </div>
                    </div>
                    {shown.dates ? <p className={ERR}>{shown.dates}</p> : <p className={HINT}>{tt("Dates are in your own time zone.")}</p>}
                  </div>

                  {d.discountType === "percent" || d.discountType === "fixed" ? (
                    <div {...(shown.limit ? { "data-problem": "" } : {})}>
                      <label htmlFor="offer-limit" className={LABEL}>
                        {d.kind === "bundle" ? tt("Discounted sets per order") : tt("Discounted items per order")}
                      </label>
                      <input id="offer-limit" inputMode="numeric" value={d.maxPerOrder} placeholder={d.kind === "bundle" ? tt("No limit") : "1"} onChange={(e) => set({ maxPerOrder: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!shown.limit} className={cn(FIELD, "w-[150px] tabular-nums", shown.limit && BAD)} />
                      {shown.limit ? <p className={ERR}>{shown.limit}</p> : null}
                    </div>
                  ) : null}

                  <div className={SWITCH_GROUP}>
                    <SwitchRow title={tt("Discount codes can be used too")} hint={d.combinesWithCodes ? tt("A code comes off what is left after this offer.") : tt("With a code, the buyer gets whichever saves more.")} checked={d.combinesWithCodes} onChange={(combinesWithCodes) => set({ combinesWithCodes })} />
                  </div>
                  {newSettingsUsed ? <p className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">{tt("Dates, places, limits, collections, free shipping and the code rule need SQL part 230 before they can be saved.")}</p> : null}
                </div>
              ) : null}
            </div>

            {offer ? (
              <p data-offer-sold={sold[offer.id] ?? 0} className={HINT}>
                {tt("{n} sold through it in the last 90 days.", { n: sold[offer.id] ?? 0 })}
              </p>
            ) : null}
          </div>

          {/* ── The foot: Delete on the left for a saved one, Cancel and Create (or Save) ── */}
          <div data-offer-foot="" className="flex shrink-0 items-center gap-2 border-t border-[#eef0f2] bg-white px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:px-6 md:pb-3 max-sm:[&>button]:h-11 max-sm:[&>button]:rounded-xl max-sm:[&>button]:text-[15px]">
            {offer ? (
              <button type="button" data-delete-offer="" disabled={busy} onClick={() => void remove()} className={cn(quietDanger, "h-8 rounded-lg px-3 text-[13px] max-sm:px-3.5")}>
                {tt("Delete")}
              </button>
            ) : null}
            <span className="flex-1 max-sm:hidden" />
            <button type="button" className={cn(buttonSecondary, "max-sm:flex-1")} disabled={busy} onClick={onClose} data-offer-cancel="">
              {tt("Cancel")}
            </button>
            <button type="submit" data-offer-save="" aria-busy={saving || undefined} aria-keyshortcuts="Meta+S Control+S" disabled={!canSave && !saving} className={cn(buttonAccent, "min-w-[84px] max-sm:flex-1 disabled:cursor-default disabled:opacity-50")}>
              {saving ? tt("Saving…") : offer ? tt("Save") : tt("Create")}
            </button>
          </div>
        </form>
      )}
      {confirmSheet}
    </div>
  )
}
