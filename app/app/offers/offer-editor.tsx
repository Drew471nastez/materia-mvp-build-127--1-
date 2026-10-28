"use client"

/**
 * ===========================================================================
 *  ONE OFFER, NEW OR SAVED, ON A PAGE OF ITS OWN
 * ===========================================================================
 * /app/offers/new?kind=bundle|checkout|quantity_break and /app/offers/<id>,
 * framed as a coupon is (app/app/coupons/coupon-editor.tsx), not a dialog
 * over the list:
 *
 *   ON A PHONE a full screen layer over the app's header (./new/layout,
 *   ./[id]/layout, components/app/page-layer), its own bar at the top under
 *   the status bar: Cancel (or Back, with nothing to lose) and Save. The
 *   cards in one column under it.
 *
 *   FROM 768 TO 1023 a page in the shell, the same bar stuck to the top of
 *   the content area, one column of 760px.
 *
 *   FROM lg the 1200px page: a header (back to Upsells and bundles, the
 *   offer's name, where it stands), two columns (the offer on the left; on
 *   the right whether it is on, how it looks to a buyer and a cart to try
 *   it in), and Cancel and Save in a bar along the foot of the pane.
 *
 * The form, in the order a person decides it:
 *
 *   1. what kind (a new one only): a bundle, an upsell, a quantity break
 *   2. the name buyers see
 *   3. the products: the bundle's, the one to offer, or what a break is for
 *   4. an upsell's condition: any order, certain products, a collection,
 *      and an order minimum
 *   5. the discount: a percent, an amount, free shipping, or none
 *   6. where it shows: product page, cart, checkout
 *   7. dates, a limit per order, and whether a code can be used on top
 *   8. on or off, and how it looks to a buyer, drawn live from the same
 *      arithmetic the checkout charges by
 *
 * Every setting here is a field of the offer the server stores and a rule
 * the checkout applies (lib/offers/offers.ts readOffer, applyOffers). What
 * is wrong is said under its own field when Save is pressed, and the first
 * one is brought into view. Ctrl or Cmd and S (or Enter) saves. Leaving with
 * changes asks first; a save or a delete goes back to the list, which says
 * so and tints the row (./list-return).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { secondaryDepth } from "@/components/ui/depth-button"
import { MAX_BUNDLE, MAX_TRIGGERS, PLACEMENTS_FOR, offerState, type DiscountType, type Offer, type OfferKind, type Placement } from "@/lib/offers/offers"
import { amountOf, bodyOf, draftOf, problemsOf, tierOf, type Draft, type Problems } from "./offer-draft"
import { SWITCH_GROUP, Segmented, SwapPanels, SwitchRow } from "../products/new/editor-controls"
import { LeaveButton } from "../products/new/editor-buttons"
import { useConfirm } from "../products/new/confirm-sheet"
import { StatusBadge, iconButton } from "../orders/order-parts"
import { CouponSaveButton, Tick, quietDanger } from "../coupons/coupon-parts"
import { BreakPreview, KIND_WORD, OfferPreview, PLACEMENT_WORD, STATE_TONE, STATE_WORD, currencySign, moneyIn, type OfferCollection, type OfferProduct } from "./offer-parts"
import { BAD, ChoiceGrid, ERR, FIELD, HINT, LABEL, MoneyField, ProductPicker, Radio, RadioRows, TierEditor } from "./offer-fields"
import { DRAFT_ID, offerWarnings, type Tried } from "@/lib/offers/try-cart"
import { sendOffer } from "./offer-api"
import { newOfferHref, offersReturn } from "./list-return"

/* What each kind does, in one line, under the kind picker. */
const KIND_HINT: Record<OfferKind, () => string> = {
  bundle: () => tt("Two to five products bought together, for less."),
  checkout: () => tt("One product suggested when the cart has others, at a lower price."),
  quantity_break: () => tt("Buy more of one product, pay less each, or get some free."),
}

/* The coupon editor's card (CLAUDE.md's /app card), its padding from --app-card-x. */
const CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:py-6"
const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
/* A line inside a card that groups the rows under it. */
const SUB_TITLE = "text-[14px] font-medium text-[#1a1a2e]"

/** The products a sample cart starts with: the offer's own, at the quantities that set it off. */
function sampleCart(o: Offer, products: OfferProduct[]): { productId: string; quantity: number }[] {
  if (o.kind === "quantity_break") {
    const last = o.tiers?.[o.tiers.length - 1]
    return o.productIds[0] ? [{ productId: o.productIds[0], quantity: last ? last.quantity + last.freeQuantity : 2 }] : []
  }
  if (o.kind === "bundle") return o.productIds.map((productId) => ({ productId, quantity: 1 }))
  const trigger = o.triggerIds[0] ?? products.find((p) => p.id !== o.productIds[0] && p.published)?.id
  return [...(trigger ? [{ productId: trigger, quantity: 1 }] : []), ...(o.productIds[0] ? [{ productId: o.productIds[0], quantity: 1 }] : [])]
}

/**
 * TRY IT IN A CART: a sample cart of the offer's products, its quantities
 * changeable, priced on the server by the checkout's own offers (this one in
 * its place among the store's, as if on now; app/api/store/offers/try).
 * Each line with what it saves and by which offer, then the total.
 */
function TryCart({ offer, id, body, products, money }: { offer: Offer; id: string | null; body: ReturnType<typeof bodyOf>; products: OfferProduct[]; money: (minor: number) => string }) {
  const start = React.useMemo(() => sampleCart(offer, products), [offer, products])
  const startKey = JSON.stringify(start)
  const [items, setItems] = React.useState(start)
  const [tried, setTried] = React.useState<Tried | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /* A new product or tier starts the cart again. */
  React.useEffect(() => {
    setItems(JSON.parse(startKey))
    setTried(null)
  }, [startKey])
  const title = (pid: string) => products.find((p) => p.id === pid)?.title ?? tt("Product")
  const price = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/store/offers/try", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: body, id, items }) })
      const data = (await res.json().catch(() => null)) as (Tried & { error?: string }) | null
      if (!res.ok || !data || data.error) setError(data?.error ?? tt("That cart could not be priced. Try again."))
      else setTried(data)
    } catch {
      setError(tt("That cart could not be priced. Try again."))
    }
    setBusy(false)
  }
  if (items.length === 0) return null
  return (
    <div data-try-cart="" className="rounded-xl border border-[#e5e7eb] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-[#4b5563]">{tt("Try it in a cart")}</p>
        <button type="button" data-try-price="" onClick={() => void price()} disabled={busy} className={cn(secondaryDepth, "h-9 rounded-lg px-3 text-[14px] sm:h-8 sm:text-[13px]")}>
          {busy ? tt("Pricing…") : tt("Price this cart")}
        </button>
      </div>
      <ul className="mt-2 divide-y divide-[#eef0f2]">
        {items.map((it, i) => {
          const line = tried?.lines.find((l) => l.productId === it.productId)
          return (
            <li key={it.productId} className="flex items-center gap-3 py-2 text-[14px] sm:text-[13px]">
              <input
                inputMode="numeric"
                aria-label={tt("Quantity of {title}", { title: title(it.productId) })}
                value={String(it.quantity)}
                onChange={(e) => {
                  const q = Math.max(0, Math.min(99, Math.floor(Number(e.target.value.replace(/[^0-9]/g, ""))) || 0))
                  setItems(items.map((x, n) => (n === i ? { ...x, quantity: q } : x)))
                  setTried(null)
                }}
                className={cn(FIELD, "h-9 w-[56px] px-2 text-center tabular-nums sm:h-8")}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[#1a1a2e]">{title(it.productId)}</span>
                {line?.offers.length ? <span className="block truncate text-[12.5px] text-[#6b7280]">{line.offers.map((o) => `${o.title} −${money(o.savedCents)}`).join(" · ")}</span> : null}
              </span>
              {line ? (
                <span className="shrink-0 text-right tabular-nums">
                  {line.savedCents > 0 ? <s className="block text-[12.5px] text-[#9ca3af]">{money(line.unitCents * line.quantity)}</s> : null}
                  <span className="block text-[#1a1a2e]">{money(line.unitCents * line.quantity - line.savedCents)}</span>
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {tried ? (
        <p data-try-total={tried.totalCents} className="mt-1 flex justify-between border-t border-[#eef0f2] pt-2 text-[14px] font-medium tabular-nums text-[#1a1a2e] sm:text-[13px]">
          <span>{tried.savedCents > 0 ? tt("Total, {saved} off", { saved: money(tried.savedCents) }) : tt("Total, no offer applies")}</span>
          <span>{money(tried.totalCents)}</span>
        </p>
      ) : null}
      {error ? <p className={ERR}>{error}</p> : null}
    </div>
  )
}

export function OfferEditor({
  offer,
  kind,
  products,
  collections,
  others = [],
  currency: currencyNow,
  physical,
  ready = true,
  settingsReady,
  breaksReady,
  sold = 0,
}: {
  /** Null for a new offer. */
  offer: Offer | null
  /** A new offer's kind to start with. */
  kind: OfferKind
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
  /** Units it sold in the last 90 days (lib/offers/offers-server soldThrough). */
  sold?: number
}) {
  const router = useRouter()
  /* The currency this offer's amounts were typed in, kept while it is open: a save after the store's currency changed is refused (lib/store/currency-guard), never written over the converted amounts. */
  const [currency] = React.useState(currencyNow)
  const [d, setD] = React.useState<Draft>(() => draftOf(offer, kind, currency))
  const [initial, setInitial] = React.useState(() => JSON.stringify(draftOf(offer, kind, currency)))
  const dirty = JSON.stringify(d) !== initial
  const [tried, setTried] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const busy = saving || deleting
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [ask, confirmSheet] = useConfirm()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const problems = problemsOf(d, currency)
  const shown: Problems = tried ? problems : {}
  const sign = currencySign(currency)
  const money = moneyIn(currency)
  /* What to watch for before saving (lib/offers/try-cart.ts offerWarnings): a draft product, a tier that costs more per item, another offer on the same products. */
  const asOffer = React.useMemo((): Offer => ({ ...(bodyOf(d, currency) as Omit<Offer, "id">), id: offer?.id ?? DRAFT_ID }), [d, currency, offer?.id])
  const warnings = React.useMemo(() => (Object.keys(problems).length ? [] : offerWarnings(asOffer, others, products)), [asOffer, others, products, problems])

  /* The list, ready for the way back, and whether it opened this page (./list-return). */
  React.useEffect(() => {
    offersReturn.warm(router)
  }, [router])
  offersReturn.useOrigin()

  /* Where the saved offer stands, by the checkout's own rule. */
  const [now] = React.useState(() => new Date())
  const state = offer ? offerState(offer, now) : null

  const save = async () => {
    if (busy || !ready) return
    setTried(true)
    if (Object.keys(problems).length) {
      /* The first field with something to fix, brought into view. */
      window.requestAnimationFrame(() => paneRef.current?.querySelector<HTMLElement>("[data-problem]")?.scrollIntoView({ block: "center", behavior: "smooth" }))
      return
    }
    setSaving(true)
    setError(null)
    const body = { ...bodyOf(d, currency), formCurrency: currency }
    const r = await sendOffer(offer ? "PUT" : "POST", offer ? { ...body, id: offer.id } : body)
    if (r.ok === false) {
      setSaving(false)
      setError((r as { error: string }).error)
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const saved = (r as { offer?: Offer }).offer ?? null
    const name = (saved?.title ?? body.title).trim()
    /* Nothing to lose now: a back while the list comes in does not ask. */
    setInitial(JSON.stringify(d))
    /* Save stays busy while the page leaves: the list says the rest. */
    offersReturn.leave(router, { id: saved?.id ?? offer?.id ?? null, saved, message: offer ? tt("{value} saved", { value: name }) : tt("{value} created", { value: name }) })
  }

  /*
    CANCEL, OR BACK, as the coupon and product editors: Cancel while
    something would be lost (a change, or a new offer never saved), which
    asks first; Back once everything on the screen is saved.
  */
  const leaveMode = offer && !dirty ? "back" : "cancel"
  const leave = async () => {
    if (busy) return
    if (dirty) {
      const yes = await ask(
        offer
          ? { title: tt("Discard changes?"), body: tt("Your edits to this offer will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }
          : { title: tt("Discard this offer?"), body: tt("It has not been saved yet, so it will not be kept."), confirm: tt("Discard"), cancel: tt("Keep editing") },
      )
      if (!yes) return
    }
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
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    offersReturn.leave(router, { id: offer.id, deleted: true, message: tt("{title} deleted", { title: offer.title }) })
  }

  /* Cmd or Ctrl and S, or Enter, from anywhere on the page. */
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

  const changeKind = (k: OfferKind) => {
    /* A name typed by hand stays; the other kind's own default name replaces the default one. */
    const fresh = draftOf(null, k, currency)
    const typed = d.title !== draftOf(null, d.kind, currency).title
    /* A bundle's and an upsell's discount carry across; a quantity break's are its tiers. */
    const sameDiscount = k !== "quantity_break" && d.kind !== "quantity_break"
    setD({ ...fresh, title: typed ? d.title : fresh.title, ...(sameDiscount ? { discountType: d.discountType, amount: d.amount } : {}), startsAt: d.startsAt, endsAt: d.endsAt, combinesWithCodes: d.combinesWithCodes, active: d.active })
    /* The address says the kind, so a reload or a shared link opens the same one. Nothing is fetched. */
    try {
      window.history.replaceState(window.history.state, "", newOfferHref(k))
    } catch {
      /* The page still works on the address it had. */
    }
  }

  const discountOptions: { value: DiscountType; label: string }[] = [
    { value: "percent", label: tt("Percent") },
    { value: "fixed", label: tt("Amount") },
    ...(physical || d.discountType === "free_shipping" ? [{ value: "free_shipping" as const, label: tt("Free shipping") }] : []),
    { value: "none", label: tt("None") },
  ]
  const heading = offer ? offer.title : tt("New offer")
  const newSettingsUsed = !settingsReady && (d.condition === "collections" || d.placements.length !== PLACEMENTS_FOR[d.kind].length || !!d.startsAt || !!d.endsAt || !!d.maxPerOrder || !d.combinesWithCodes || !!d.minSubtotal || d.discountType === "free_shipping")
  const canSave = ready && !busy && (offer ? dirty : true)
  const saveWord = offer ? tt("Save") : tt("Create")
  const problemCount = Object.keys(shown).length

  const saveState: "saving" | "unsaved" | "new" | "saved" = saving ? "saving" : !offer ? "new" : dirty ? "unsaved" : "saved"
  const stateLine =
    saveState === "saving"
      ? tt("Saving")
      : saveState === "unsaved"
        ? tt("Unsaved changes")
        : saveState === "new"
          ? tt("Not saved yet")
          : `${STATE_WORD[state!]()} · ${tt("{n} sold in 90 days", { n: sold })}`

  return (
    <div
      ref={paneRef}
      data-offer-editor=""
      className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pb-[calc(32px+env(safe-area-inset-bottom))] lg:flex lg:flex-col"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {saving ? tt("Saving") : deleting ? tt("Deleting") : ""}
      </p>

      {/* THE TOP BAR, BELOW lg: Cancel or Back, and Save. Under the status bar on a phone, where the page is a layer over the header. */}
      <div
        data-editor-bar=""
        className={cn(
          "sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150 max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden",
          scrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "",
        )}
      >
        <h1 className="sr-only">{offer ? tt("Edit offer {title}", { title: offer.title }) : tt("New offer")}</h1>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label={tt("Going back to upsells and bundles")} onLeave={() => void leave()} />
          <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
        </div>
      </div>

      <div data-editor-page="" className="mx-auto w-full max-w-[760px] app-gutter pb-6 pt-3 sm:pb-16 sm:pt-4 lg:max-w-[1200px] lg:pb-8 lg:pt-6">
        {/* The page header, from lg: back to the list, the offer, where it stands. */}
        <header data-editor-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex">
          <button
            type="button"
            aria-label={tt("Back to upsells and bundles")}
            title={tt("Upsells and bundles")}
            disabled={busy}
            onClick={() => void leave()}
            className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]">{heading}</h1>
          {offer ? <span className="ml-1 shrink-0 text-[14px] text-[#6b7280]">{KIND_WORD[d.kind]()}</span> : null}
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
          <div role="alert" className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f] lg:mb-4">
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
          className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start"
        >
          <div data-editor-main="" className="flex min-w-0 flex-col gap-3 sm:gap-4">
            {/* ── What kind, and its name ──────────────────────────── */}
            <section className={CARD} aria-labelledby="offer-name-title">
              {!offer ? (
                <div className="space-y-2">
                  <Segmented
                    label={tt("Kind of offer")}
                    value={d.kind}
                    /* Three kinds on a phone's width: each as wide as its name, so "Quantity break" is never cut. */
                    fit="content"
                    onChange={changeKind}
                    options={[
                      { value: "bundle", label: tt("Bundle") },
                      { value: "checkout", label: tt("Upsell") },
                      { value: "quantity_break", label: tt("Quantity break") },
                    ]}
                  />
                  <p data-kind-hint={d.kind} className={HINT}>
                    {KIND_HINT[d.kind]()}
                  </p>
                </div>
              ) : null}
              <div {...(shown.title ? { "data-problem": "" } : {})}>
                <label id="offer-name-title" htmlFor="offer-title" className={cn(CARD_TITLE, "mb-2 block")}>
                  {tt("Name buyers see")}
                </label>
                <input id="offer-title" value={d.title} maxLength={80} autoComplete="off" enterKeyHint="done" onChange={(e) => set({ title: e.target.value })} aria-invalid={!!shown.title} className={cn(FIELD, shown.title && BAD)} />
                {shown.title ? <p className={ERR}>{shown.title}</p> : <p className={cn(HINT, "mt-1.5")}>{tt("Shown above the offer on your website.")}</p>}
              </div>
            </section>

            {/* ── A quantity break: what it is for, and its tiers ──── */}
            {d.kind === "quantity_break" ? (
              <>
                <section className={CARD} aria-labelledby="offer-products" {...(shown.products ? { "data-problem": "" } : {})}>
                  <h2 id="offer-products" className={CARD_TITLE}>
                    {tt("Applies to")}
                  </h2>
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
                  {/* One product or a collection: the two lists cross-fade in one place, and the card eases to the new height. */}
                  <SwapPanels
                    active={d.scope}
                    panels={[
                      { key: "product", node: <ProductPicker products={products} chosen={d.productIds} onPick={(id) => set({ productIds: [id] })} single money={money} name="offer-products" /> },
                      {
                        key: "collection",
                        node: (
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
                        ),
                      },
                    ]}
                  />
                  {shown.products ? <p className={ERR}>{shown.products}</p> : null}
                </section>

                <div className={CARD}>
                  <TierEditor tiers={d.tiers} onChange={(tiers) => set({ tiers })} problems={shown.tier ?? {}} problem={shown.tiers ?? null} sign={sign} money={money} currency={currency} />
                  {!breaksReady ? (
                    <p data-sql-needed="304" className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">
                      {tt("Quantity breaks need SQL part 304 before they can be saved.")}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              /* ── The products: the bundle's, or the one to offer ── */
              <section className={CARD} aria-labelledby="offer-products" {...(shown.products ? { "data-problem": "" } : {})}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="offer-products" className={CARD_TITLE}>
                    {d.kind === "bundle" ? tt("Products in the bundle") : tt("Product to offer")}
                  </h2>
                  {d.kind === "bundle" ? <span className={cn(HINT, "tabular-nums")}>{tt("{n} of {max}", { n: d.productIds.length, max: MAX_BUNDLE })}</span> : null}
                </div>
                <ProductPicker products={products} chosen={d.productIds} onPick={pickProduct} single={d.kind === "checkout"} money={money} name="offer-products" full={d.kind === "bundle" && d.productIds.length >= MAX_BUNDLE} />
                {shown.products ? <p className={ERR}>{shown.products}</p> : null}
              </section>
            )}

            {/* ── An upsell: when it shows ─────────────────────────── */}
            {d.kind === "checkout" ? (
              <section className={CARD} aria-labelledby="offer-when" {...(shown.triggers || shown.minimum ? { "data-problem": "" } : {})}>
                <h2 id="offer-when" className={CARD_TITLE}>
                  {tt("Show it when the cart has")}
                </h2>
                <RadioRows
                  label={tt("Show it when the cart has")}
                  value={d.condition}
                  onChange={(condition) => set({ condition })}
                  options={[
                    { value: "any", label: tt("Anything") },
                    { value: "products", label: tt("Certain products") },
                    ...(collections.length || d.condition === "collections" ? [{ value: "collections" as const, label: tt("A collection") }] : []),
                  ]}
                />
                {/* What the choice asks next, in one place: the hint, the products or the collections, cross-faded, the card easing to its height. */}
                <SwapPanels
                  active={d.condition}
                  panels={[
                    { key: "any", node: <p className={HINT}>{tt("Any cart without this product in it.")}</p> },
                    { key: "products", node: <ProductPicker products={products.filter((p) => !d.productIds.includes(p.id))} chosen={d.triggerIds} onPick={(id) => set({ triggerIds: toggle(d.triggerIds, id) })} money={money} name="offer-triggers" /> },
                    {
                      key: "collections",
                      node: (
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
                      ),
                    },
                  ]}
                />
                {shown.triggers ? <p className={ERR}>{shown.triggers}</p> : null}
                <div>
                  <label htmlFor="offer-minimum" className={LABEL}>
                    {tt("And the rest of the order is at least")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </label>
                  <MoneyField id="offer-minimum" sign={sign} value={d.minSubtotal} onChange={(minSubtotal) => set({ minSubtotal })} bad={!!shown.minimum} placeholder="0" />
                  {shown.minimum ? <p className={ERR}>{shown.minimum}</p> : null}
                </div>
              </section>
            ) : null}

            {/* ── What it takes off ────────────────────────────────── */}
            {d.kind !== "quantity_break" ? (
              <section className={CARD} aria-labelledby="offer-discount" {...(shown.amount ? { "data-problem": "" } : {})}>
                <h2 id="offer-discount" className={CARD_TITLE}>
                  {tt("Discount")}
                </h2>
                <ChoiceGrid label={tt("Discount type")} value={d.discountType} onChange={(t) => set({ discountType: t, amount: t === "percent" ? "10" : t === "fixed" ? amountOf(500, currency) : "" })} options={discountOptions} />
                {/* An amount to type, or a line that says what happens: one place, cross-faded, so the card never jumps. */}
                <SwapPanels
                  active={d.discountType === "percent" || d.discountType === "fixed" ? "amount" : "words"}
                  panels={[
                    {
                      key: "amount",
                      node: (
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
                      ),
                    },
                    { key: "words", node: <p className={HINT}>{d.discountType === "free_shipping" ? (d.kind === "bundle" ? tt("The whole order ships free once the set is in the cart.") : tt("The whole order ships free once it's added.")) : tt("It's suggested at its own price.")}</p> },
                  ]}
                />
                {shown.amount ? <p className={ERR}>{shown.amount}</p> : null}
              </section>
            ) : null}

            {/* ── Where it shows ───────────────────────────────────── */}
            <section className={CARD} aria-labelledby="offer-places" {...(shown.places ? { "data-problem": "" } : {})}>
              <h2 id="offer-places" className={CARD_TITLE}>
                {tt("Show it on")}
              </h2>
              <div className={cn(SWITCH_GROUP, "divide-y")}>
                {PLACEMENTS_FOR[d.kind].map((p) => {
                  const on = d.placements.includes(p)
                  return (
                    <button key={p} type="button" role="checkbox" aria-checked={on} data-place={p} onClick={() => togglePlace(p)} className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 text-left outline-none focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[44px] sm:hover:bg-[#fafafb]">
                      <Tick on={on} />
                      <span className="min-w-0 flex-1 text-[15px] text-[#1a1a2e] sm:text-[14px]">{PLACEMENT_WORD[p]()}</span>
                    </button>
                  )
                })}
              </div>
              {shown.places ? <p className={ERR}>{shown.places}</p> : null}
            </section>

            {/* ── Dates and limits ─────────────────────────────────── */}
            <section className={CARD} aria-labelledby="offer-rules">
              <h2 id="offer-rules" className={CARD_TITLE}>
                {tt("Dates and limits")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2" {...(shown.dates ? { "data-problem": "" } : {})}>
                <div>
                  <label htmlFor="offer-start" className={LABEL}>
                    {tt("Starts")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </label>
                  <input id="offer-start" type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={cn(FIELD, "appearance-none tabular-nums")} />
                </div>
                <div>
                  <label htmlFor="offer-end" className={LABEL}>
                    {tt("Ends")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </label>
                  <input id="offer-end" type="datetime-local" value={d.endsAt} min={d.startsAt || undefined} onChange={(e) => set({ endsAt: e.target.value })} aria-invalid={!!shown.dates} className={cn(FIELD, "appearance-none tabular-nums", shown.dates && BAD)} />
                </div>
              </div>
              {shown.dates ? <p className={ERR}>{shown.dates}</p> : <p className={cn(HINT, "-mt-1")}>{tt("Dates are in your own time zone.")}</p>}
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
              {newSettingsUsed ? (
                <p className="rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">{tt("Dates, places, limits, collections, free shipping and the code rule need SQL part 230 before they can be saved.")}</p>
              ) : null}
            </section>
          </div>

          {/* From lg the side column stays in view while the offer is filled in, so the preview follows the change. */}
          <div data-editor-side="" className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-6">
            {/* ── On or off ────────────────────────────────────────── */}
            <section data-offer-status="" className={CARD} aria-label={tt("Status")}>
              <div className={SWITCH_GROUP}>
                <SwitchRow title={tt("Active")} hint={d.active ? tt("Buyers see it where it shows.") : tt("Off. Buyers do not see it until you turn it on.")} checked={d.active} onChange={(active) => set({ active })} />
              </div>
              {offer ? (
                <dl className="grid grid-cols-2 gap-3">
                  {/* From lg the badge is in the page header, right above. */}
                  <div className="lg:hidden">
                    <dt className={HINT}>{tt("Status")}</dt>
                    <dd className="mt-1">
                      <StatusBadge tone={STATE_TONE[state!]}>{STATE_WORD[state!]()}</StatusBadge>
                    </dd>
                  </div>
                  <div>
                    <dt className={HINT}>{tt("Sold, 90 days")}</dt>
                    <dd data-offer-sold={sold} className="mt-1 text-[15px] font-medium tabular-nums text-[#1a1a2e] sm:text-[14px]">
                      {sold}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </section>

            {/* ── How it looks to a buyer ──────────────────────────── */}
            <section className={CARD} aria-labelledby="offer-preview">
              <h2 id="offer-preview" className={CARD_TITLE}>
                {tt("Preview")}
              </h2>
              {d.kind === "quantity_break" ? (
                d.scope === "collection" ? (
                  <p className={HINT}>{tt("Each product in the collection shows these tiers at its own price.")}</p>
                ) : (
                  <BreakPreview tiers={d.tiers.map((t) => tierOf(t, currency)).filter((t) => t.quantity >= 1)} product={byId.get(d.productIds[0]) ?? null} currency={currency} />
                )
              ) : (
                <OfferPreview draft={{ kind: d.kind, title: d.title, productIds: d.productIds, discountType: d.discountType, discountValue: bodyOf(d, currency).discountValue || 0 }} byId={byId} currency={currency} />
              )}
              {warnings.length ? (
                <ul data-offer-warnings="" className="space-y-1 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] leading-5 text-[#5c4300]">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {Object.keys(problems).length === 0 ? <TryCart offer={asOffer} id={offer?.id ?? null} body={bodyOf(d, currency)} products={products} money={money} /> : null}
            </section>

            {offer ? (
              <div className="flex justify-start lg:justify-end">
                <button type="button" data-delete-offer="" disabled={busy} onClick={() => void remove()} className={cn(quietDanger, "h-10 rounded-[10px] px-3.5 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                  {tt("Delete offer")}
                </button>
              </div>
            ) : null}
          </div>
        </form>
      </div>

      {/* THE FOOT BAR, FROM lg: where the page stands on the left, Cancel (or Back) and Save on the right. */}
      <div data-editor-foot="" data-app-foot="up" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p data-editor-state={saveState} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", saveState === "unsaved" ? "bg-[#111113]" : saveState === "saved" && state === "active" ? "bg-[#22a06b]" : "bg-[#b6bac1]")} />
            <span className={cn("truncate", saveState === "unsaved" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{stateLine}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label={tt("Going back to upsells and bundles")} onLeave={() => void leave()} />
            <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
          </div>
        </div>
      </div>

      {confirmSheet}
    </div>
  )
}
