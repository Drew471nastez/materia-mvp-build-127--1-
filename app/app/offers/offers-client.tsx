"use client"

/**
 * UPSELLS AND BUNDLES: a store's offers (lib/offers, /api/store/offers).
 *
 *   Bundle          two to five products bought together, with a discount on
 *                   each complete set. Shown on each product's page with
 *                   "Add all to cart".
 *   Checkout offer  one product suggested in the checkout, for any order or
 *                   when the cart holds certain products, with an optional
 *                   discount on it.
 *
 * Each offer can be switched off without deleting it. The checkout works the
 * discount out on the server whenever a cart qualifies, before any code.
 */
import * as React from "react"
import { Check, Package, Plus, Search, ShoppingCart, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Empty, Field, Modal, Notice, Pill, TextInput, api, money } from "@/components/physical/ui"
import { MAX_BUNDLE, MAX_PERCENT, bundlePrice, discountLabel, offerUnitPrice, type DiscountType, type Offer, type OfferKind } from "@/lib/offers/offers"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, card } from "../orders/order-parts"
import { tt } from "@/lib/i18n/text"

interface Product {
  id: string
  title: string
  type: string
  published: boolean
  priceCents: number
  imageUrl: string | null
}

type Draft = { id: string | null; kind: OfferKind; title: string; productIds: string[]; triggerIds: string[]; anyOrder: boolean; discountType: DiscountType; amount: string; active: boolean }

const blank = (kind: OfferKind): Draft => ({ id: null, kind, title: kind === "bundle" ? tt("Buy it together") : tt("Add to your order"), productIds: [], triggerIds: [], anyOrder: true, discountType: "percent", amount: "10", active: true })

export function OffersClient() {
  const [offers, setOffers] = React.useState<Offer[] | null>(null)
  const [products, setProducts] = React.useState<Product[]>([])
  const [ready, setReady] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)

  const load = React.useCallback(async () => {
    const r = await api<{ offers: Offer[]; products: Product[]; ready: boolean }>("/api/store/offers")
    if ("error" in r) return setError(r.error)
    setOffers(r.data.offers)
    setProducts(r.data.products)
    setReady(r.data.ready)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const toggle = async (o: Offer, active: boolean) => {
    setOffers((list) => list?.map((x) => (x.id === o.id ? { ...x, active } : x)) ?? null)
    const r = await api<{ offer: Offer }>("/api/store/offers", { method: "PUT", body: { ...o, active } })
    if ("error" in r) {
      toast.error(r.error)
      setOffers((list) => list?.map((x) => (x.id === o.id ? { ...x, active: !active } : x)) ?? null)
    }
  }

  const edit = (o: Offer) =>
    setDraft({ id: o.id, kind: o.kind, title: o.title, productIds: o.productIds, triggerIds: o.triggerIds, anyOrder: o.triggerIds.length === 0, discountType: o.discountType, amount: o.discountType === "fixed" ? (o.discountValue / 100).toFixed(2) : o.discountType === "percent" ? String(o.discountValue) : "", active: o.active })

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-offers="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[28px] sm:leading-9">{tt("Upsells and bundles")}</h1>
        <button type="button" className={cn(BTN_PRIMARY, "shrink-0 gap-1.5 whitespace-nowrap")} onClick={() => setDraft(blank("bundle"))} data-offer-new="" disabled={!ready} aria-label={tt("Create offer")}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="sm:hidden">{tt("Create")}</span>
          <span className="hidden sm:inline">{tt("Create offer")}</span>
        </button>
      </PaneBar>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <p className="mb-3 text-[13.5px] leading-5 text-[#6b7280]">{tt("Sell more to people already buying. A bundle shows on each of its products' pages; a checkout offer shows in the checkout. Discounts come off at checkout, before any code.")}</p>
        {error ? <Notice className="mb-3">{error}</Notice> : null}
        {!ready ? <Notice tone="amber" className="mb-3">{tt("Upsells and bundles need SQL part 116 (supabase/sql/run-now/116_store_offers.sql). Run it in Supabase and come back.")}</Notice> : null}
        {offers === null ? (
          <div className="min-h-[240px]" aria-busy="true" />
        ) : offers.length === 0 ? (
          <section className={cn(card, "p-2")}>
            <Empty
              title={tt("No offers yet")}
              action={
                ready ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={BTN_PRIMARY} onClick={() => setDraft(blank("bundle"))}>
                      {tt("Create a bundle")}
                    </button>
                    <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(blank("checkout"))}>
                      {tt("Create a checkout offer")}
                    </button>
                  </div>
                ) : null
              }
            >
              {tt("Pair products people buy together at a better price, or suggest one more thing right before they pay.")}
            </Empty>
          </section>
        ) : (
          <ul className="space-y-2.5" data-offer-list="">
            {offers.map((o) => {
              const items = o.productIds.map((id) => byId.get(id)).filter(Boolean) as Product[]
              const missing = items.length !== o.productIds.length
              return (
                <li key={o.id} className={cn(card, "flex items-center gap-3 px-4 py-3.5")} data-offer={o.id}>
                  <button type="button" onClick={() => edit(o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="flex shrink-0 -space-x-2">
                      {items.slice(0, 3).map((p) => (
                        <Thumb key={p.id} p={p} className="h-10 w-10 ring-2 ring-white" />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">{o.title}</span>
                      <span className="block truncate text-[12.5px] text-[#6b7280]">
                        {o.kind === "bundle" ? tt("{length} products together", { length: o.productIds.length }) : tt("Offers {value}", { value: items[0]?.title ?? tt("a product") })} · {discountLabel(o)}
                      </span>
                      {missing ? <span className="block text-[12px] text-[#b45309]">{tt("A product in it was deleted. Edit it to fix.")}</span> : null}
                    </span>
                  </button>
                  <Pill tone={o.kind === "bundle" ? "blue" : "gray"} className="hidden shrink-0 sm:inline-flex">
                    {o.kind === "bundle" ? tt("Bundle") : tt("Checkout")}
                  </Pill>
                  <Switch checked={o.active} onCheckedChange={(v) => void toggle(o, v)} aria-label={o.active ? tt("Switch off {title}", { title: o.title }) : tt("Switch on {title}", { title: o.title })} />
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {draft ? (
        <Editor
          draft={draft}
          products={products}
          onClose={() => setDraft(null)}
          onSaved={(o, isNew) => {
            setOffers((list) => (isNew ? [...(list ?? []), o] : (list ?? []).map((x) => (x.id === o.id ? o : x))))
            setDraft(null)
          }}
          onDeleted={(id) => {
            setOffers((list) => (list ?? []).filter((x) => x.id !== id))
            setDraft(null)
          }}
        />
      ) : null}
    </div>
  )
}

function Thumb({ p, className }: { p: Pick<Product, "imageUrl" | "type">; className?: string }) {
  return p.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.imageUrl} alt="" className={cn("rounded-lg border border-[#eceef1] bg-[#f8f9fa] object-cover", className)} />
  ) : (
    <span className={cn("grid place-items-center rounded-lg border border-[#eceef1] bg-[#f3f4f6] text-[#9ca3af]", className)}>
      <Package className="h-4 w-4" aria-hidden />
    </span>
  )
}

function Editor({ draft: start, products, onClose, onSaved, onDeleted }: { draft: Draft; products: Product[]; onClose: () => void; onSaved: (o: Offer, isNew: boolean) => void; onDeleted: (id: string) => void }) {
  const [d, setD] = React.useState<Draft>(start)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const byId = new Map(products.map((p) => [p.id, p]))
  const chosen = d.productIds.map((id) => byId.get(id)).filter(Boolean) as Product[]

  const value = d.discountType === "fixed" ? Math.round(Number(d.amount.replace(",", ".")) * 100) : d.discountType === "percent" ? Math.round(Number(d.amount)) : 0
  const preview = (() => {
    if (d.kind === "bundle") {
      if (chosen.length < 2) return null
      const { fullCents, priceCents } = bundlePrice({ discountType: d.discountType, discountValue: value || 0 }, chosen.map((p) => p.priceCents))
      return priceCents < fullCents ? tt("Together {amount}, instead of {amount2}.", { amount: money(priceCents), amount2: money(fullCents) }) : tt("Together {amount}.", { amount: money(fullCents) })
    }
    const p = chosen[0]
    if (!p) return null
    const at = offerUnitPrice({ discountType: d.discountType, discountValue: value || 0 }, p.priceCents)
    return at < p.priceCents ? tt("Buyers add it for {amount}, instead of {amount2}.", { amount: money(at), amount2: money(p.priceCents) }) : tt("Buyers add it for {amount}.", { amount: money(p.priceCents) })
  })()

  const save = async () => {
    setBusy(true)
    setError(null)
    const body = { id: d.id, kind: d.kind, title: d.title, productIds: d.productIds, triggerIds: d.kind === "checkout" && !d.anyOrder ? d.triggerIds : [], discountType: d.discountType, discountValue: value, active: d.active }
    const r = await api<{ offer: Offer }>("/api/store/offers", { method: d.id ? "PUT" : "POST", body })
    setBusy(false)
    if ("error" in r) return setError(r.error)
    toast.success(d.id ? tt("Saved") : tt("Offer created"))
    onSaved(r.data.offer, !d.id)
  }

  const remove = async () => {
    if (!d.id) return
    setBusy(true)
    const r = await api("/api/store/offers", { method: "DELETE", body: { id: d.id, title: d.title } })
    setBusy(false)
    if ("error" in r) return setError(r.error)
    toast.success(tt("Offer removed"))
    onDeleted(d.id)
  }

  const pickProduct = (id: string) => {
    if (d.kind === "checkout") return set({ productIds: [id], triggerIds: d.triggerIds.filter((t) => t !== id) })
    if (d.productIds.includes(id)) return set({ productIds: d.productIds.filter((x) => x !== id) })
    if (d.productIds.length >= MAX_BUNDLE) return toast.error(tt("A bundle has up to {maxBundle} products.", { maxBundle: MAX_BUNDLE }))
    set({ productIds: [...d.productIds, id] })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? tt("Edit offer") : tt("Create offer")}
      wide
      footer={
        <>
          {d.id ? (
            <button type="button" className={cn(BTN_DANGER, "mr-auto gap-1.5")} onClick={() => void remove()} disabled={busy}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {tt("Remove")}
            </button>
          ) : null}
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={busy} data-offer-save="">
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </>
      }
    >
      <div className="space-y-5" data-offer-editor="">
        {error ? <Notice>{error}</Notice> : null}
        {!d.id ? (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tt("Kind of offer")}>
            {(
              [
                ["bundle", Package, tt("Bundle"), tt("Products bought together, for less")],
                ["checkout", ShoppingCart, tt("Checkout offer"), tt("One more thing, suggested before they pay")],
              ] as const
            ).map(([k, Icon, name, line]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={d.kind === k}
                onClick={() => setD({ ...blank(k), discountType: d.discountType, amount: d.amount })}
                className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", d.kind === k ? "border-[#1a1a2e] bg-[#fafafa] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:bg-[#fafafa]")}
                data-offer-kind={k}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#4b5563]" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{name}</span>
                  <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{line}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <Field label={tt("Name buyers see")} htmlFor="offer-title">
          <TextInput id="offer-title" value={d.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        <Field label={d.kind === "bundle" ? tt("Products in the bundle (2 to {maxBundle})", { maxBundle: MAX_BUNDLE }) : tt("Product to offer")} hint={d.kind === "bundle" ? tt("{length} chosen", { length: d.productIds.length }) : undefined}>
          <ProductPicker products={products} chosen={d.productIds} onPick={pickProduct} single={d.kind === "checkout"} name="offer-products" />
        </Field>

        {d.kind === "checkout" ? (
          <Field label={tt("Show it when")}>
            <div className="space-y-2">
              <div className="inline-flex rounded-lg border border-[#e5e7eb] p-0.5" role="radiogroup" aria-label={tt("Show it when")}>
                {[
                  [true, tt("Any order")],
                  [false, tt("The cart has certain products")],
                ].map(([v, label]) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={d.anyOrder === v} onClick={() => set({ anyOrder: v as boolean })} className={cn("h-9 rounded-md px-3 text-[13px] font-medium", d.anyOrder === v ? "bg-[#1a1a2e] text-white" : "text-[#4b5563]")}>
                    {label as string}
                  </button>
                ))}
              </div>
              {!d.anyOrder ? <ProductPicker products={products.filter((p) => !d.productIds.includes(p.id))} chosen={d.triggerIds} onPick={(id) => set({ triggerIds: d.triggerIds.includes(id) ? d.triggerIds.filter((x) => x !== id) : [...d.triggerIds, id].slice(0, 20) })} name="offer-triggers" /> : null}
            </div>
          </Field>
        ) : null}

        <Field label={tt("Discount")} hint={d.kind === "bundle" ? (d.discountType === "fixed" ? tt("Off each complete set.") : tt("Off every product in each complete set.")) : tt("Off one of it.")}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#e5e7eb] p-0.5" role="radiogroup" aria-label={tt("Discount type")}>
              {(
                [
                  ["percent", tt("Percent")],
                  ["fixed", tt("Amount")],
                  ["none", tt("None")],
                ] as const
              ).map(([t, label]) => (
                <button key={t} type="button" role="radio" aria-checked={d.discountType === t} onClick={() => set({ discountType: t, amount: t === "percent" ? "10" : t === "fixed" ? "5.00" : "" })} className={cn("h-9 rounded-md px-3 text-[13px] font-medium", d.discountType === t ? "bg-[#1a1a2e] text-white" : "text-[#4b5563]")} data-discount-type={t}>
                  {label}
                </button>
              ))}
            </div>
            {d.discountType !== "none" ? (
              <label className="relative w-[120px]">
                <span className="sr-only">{d.discountType === "percent" ? tt("Percent off") : tt("Amount off")}</span>
                {d.discountType === "fixed" ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">$</span> : null}
                <TextInput id="offer-amount" inputMode="decimal" value={d.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^0-9.,]/g, "") })} className={d.discountType === "fixed" ? "pl-7" : "pr-8"} />
                {d.discountType === "percent" ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">%</span> : null}
              </label>
            ) : null}
          </div>
          {d.discountType === "percent" && (value < 1 || value > MAX_PERCENT) ? <p className="mt-1.5 text-[12.5px] text-[#b42318]">{tt("1 to")} {MAX_PERCENT} {tt("percent.")}</p> : null}
        </Field>

        {preview ? (
          <p className="rounded-xl bg-[#f3f4f6] px-3.5 py-2.5 text-[13.5px] text-[#1a1a2e]" data-offer-preview="">
            {preview}
          </p>
        ) : null}

        <label className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("On")}</span>
          <Switch checked={d.active} onCheckedChange={(v) => set({ active: v })} aria-label={tt("Offer on")} />
        </label>
      </div>
    </Modal>
  )
}

function ProductPicker({ products, chosen, onPick, single = false, name }: { products: Product[]; chosen: string[]; onPick: (id: string) => void; single?: boolean; name: string }) {
  const [q, setQ] = React.useState("")
  const words = q.toLowerCase().trim()
  const shown = products.filter((p) => !words || p.title.toLowerCase().includes(words)).slice(0, 100)
  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e7eb]" data-product-picker={name}>
      <label className="relative block border-b border-[#f1f2f4]">
        <span className="sr-only">{tt("Search products")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
        <input type="search" data-no-autofocus="" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Search products")} className="h-10 w-full bg-white pl-9 pr-3 text-[16px] outline-none sm:text-[14px]" />
      </label>
      <ul className="max-h-[240px] divide-y divide-[#f5f5f6] overflow-y-auto" role={single ? "radiogroup" : "group"} aria-label={tt("Products")}>
        {shown.length === 0 ? <li className="px-3.5 py-4 text-[13px] text-[#6b7280]">{tt("No products match.")}</li> : null}
        {shown.map((p) => {
          const on = chosen.includes(p.id)
          return (
            <li key={p.id}>
              <button type="button" role={single ? "radio" : "checkbox"} aria-checked={on} onClick={() => onPick(p.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#fafafa]" data-pick={p.id}>
                <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center border", single ? "rounded-full" : "rounded-md", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d1d5db] bg-white")}>
                  {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <Thumb p={p} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[#1a1a2e]">{p.title}</span>
                  <span className="block text-[12px] text-[#6b7280]">
                    {money(p.priceCents)}
                    {!p.published ? tt(" · Not published") : ""}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
