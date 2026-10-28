/**
 * ===========================================================================
 *  BUNDLES AND UPSELLS, AS AN APP BLOCK FOR AN IMPORTED THEME
 * ===========================================================================
 * Storelib's own product section draws the store's offers in its "Bundles
 * and upsells" block (components/website-builder/sections/renderers/product/
 * offers-block.tsx). An imported Shopify theme had only the JSON of them
 * (product.metafields.storelib.offers), and no theme on Shopify reads it, so
 * a store on Dawn, Horizon or the owner's Materia showed no quantity break,
 * bundle or upsell on any product. This is that block for a theme that takes
 * `{ "type": "@app" }` blocks: its main product and its Featured product
 * section, placed from Add block like Stock status (./product-app-blocks.ts).
 *
 *   quantity breaks   each tier of the product's break, its name, its total
 *                     and what it would cost without the offer; pressing it
 *                     sets the theme's own quantity box to the tier's units
 *   bundles           each item and the set's price; Add all to cart puts
 *                     every line in through /cart/add.js, this product at
 *                     the option picked in the theme's form, then opens the
 *                     cart
 *   upsells           the checkout offers this product triggers on product
 *                     pages, with Add
 *
 * EVERY NUMBER IS THE CHECKOUT'S. The figures are worked out on the server by
 * the checkout's own arithmetic (lib/offers applyOffers) and, in a market's
 * currency, its own conversion (lib/markets/checkout-charge convertOrder),
 * per option of the product (offersShown), so what a tier or a set says is
 * what /cart.js and the checkout then charge. The script only swaps the
 * option's figures when the theme's picker changes and posts the lines; it
 * never works out a price.
 *
 * Its words are Storelib's Shop words in the page's language (Translate ›
 * Shop words); a tier the store named keeps its name.
 */
import type { BlockSchema } from "@/lib/website-builder/types"
import { applyOffers, offerUnitPrice, type Offer } from "@/lib/offers/offers"
import { fillWords, tierNameIn, tierTotals, type Tier } from "@/lib/offers/pricing"
import { convertOrder, type MarketCharge } from "@/lib/markets/checkout-charge"
import { formatMinor } from "@/lib/markets/money"
import { shopMoneyIn } from "@/lib/store/shop-money"

export const OFFERS_APP_BLOCK = "shopify://apps/storelib/blocks/offers/storelib"

export const OFFERS_APP_BLOCK_SCHEMA: BlockSchema = {
  type: OFFERS_APP_BLOCK,
  name: "Bundles and upsells",
  theme: true,
  limit: 1,
  fields: [
    { id: "show_breaks", label: "Quantity breaks", type: "toggle", default: true },
    { id: "show_bundles", label: "Bundles", type: "toggle", default: true },
    { id: "show_upsells", label: "Upsells", type: "toggle", default: true },
    { id: "add_all_label", label: "Bundle button", type: "text", default: "", placeholder: "Add all to cart" },
    { id: "add_label", label: "Upsell button", type: "text", default: "", placeholder: "Add" },
  ],
}

/* ─────────────────── the figures, worked out on the server ─────────────────── */

interface OfferCardItem {
  id: string
  title: string
  imageUrl: string | null
  type?: string
  priceCents: number
  variants: { id: string; name: string; priceCents: number }[]
  payWhatYouWant?: boolean
}

/** The JSON of product.metafields.storelib.offers (lib/offers/offers-public.ts ProductOffers), read leniently. */
export interface OffersJson {
  bundles?: { offerId: string; title: string; label: string | null; discountType: Offer["discountType"]; discountValue: number; items: OfferCardItem[] }[]
  quantityBreaks?: { offerId: string; title: string; tiers: Tier[] }[]
  checkoutOffers?: { offerId: string; title: string; label: string | null; discountType: Offer["discountType"]; discountValue: number; product: OfferCardItem }[]
}

/** One figure set for one option of the product: written amounts, ready to print. */
type TierAt = { total: string; was: string | null; each: string }
type BundleAt = { thisPrice: string; full: string; price: string }

export interface OffersShown {
  /* A tier's `amount`: its amount off written in the page's money, for a default name (tierNameIn) said in the page's words when drawn. */
  breaks: { offerId: string; title: string; tiers: { label: string; discountType: Tier["discountType"]; discountValue: number; amount: string; badge: string; units: number; at: Record<string, TierAt> }[] }[]
  bundles: { offerId: string; title: string; label: string | null; items: { id: string; title: string; imageUrl: string | null; variantId: string; variantName: string | null; price: string; mine: boolean }[]; at: Record<string, BundleAt> }[]
  upsells: { offerId: string; title: string; label: string | null; id: string; variantId: string; title2: string; variantName: string | null; imageUrl: string | null; price: string; was: string | null }[]
}

export interface ShownContext {
  /** The market's conversion when the page shows its currency; null for the store's own prices. */
  charge: MarketCharge | null
  /** The currency the page writes amounts in: the market's, else the store's. */
  currency: string
  locale: string
  /** A market rounded to whole numbers writes them whole ("439 lei"). */
  whole?: boolean
}

const TIER_KEYS = { free: "offer_tier_free", percent: "offer_tier_percent", amount: "offer_tier_amount", plain: "offer_tier_plain" } as const
const TIER_EN = { free: "Buy {quantity} get {free} free", percent: "Buy {quantity}, save {percent}%", amount: "Buy {quantity}, save {amount}", plain: "Buy {quantity}" } as const

/**
 * Every figure the block prints, per option of this product (`own`: each
 * option's id and price in the store's minor units; a product without
 * options is its own id). Lines at a price, through applyOffers, then the
 * checkout's conversion: the very path a cart of them takes.
 */
export function offersShown(offers: OffersJson, productId: string, own: { id: string; minor: number }[], ctx: ShownContext): OffersShown {
  const write = (minor: number) => (ctx.charge ? formatMinor(minor, ctx.currency, ctx.locale, { wholeAsWhole: ctx.whole === true }) : shopMoneyIn(minor, ctx.currency))
  const price = (minor: number) => (ctx.charge ? ctx.charge.price(minor) : minor)
  /* Lines in the store's money, as the checkout charges them in the page's: each unit as its card, each discount the same share of its line. */
  const charged = (lines: { unitCents: number; quantity: number; discountCents: number }[]) => {
    const full = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0)
    const off = lines.reduce((n, l) => n + l.discountCents, 0)
    if (!ctx.charge) return { full, total: full - off }
    const t = convertOrder(lines, { itemsSubtotalCents: full, discountCents: off, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: full - off }, ctx.charge).totals
    return { full: t.itemsSubtotalCents, total: t.itemsSubtotalCents - t.discountCents }
  }
  const amountOff = (minor: number) => write(ctx.charge ? ctx.charge.amount(minor) : minor)

  const breaks = (offers.quantityBreaks ?? []).filter((b) => Array.isArray(b.tiers) && b.tiers.length).slice(0, 1).map((b) => ({
    offerId: String(b.offerId),
    title: String(b.title ?? ""),
    tiers: b.tiers.map((t) => {
      const units = t.quantity + t.freeQuantity
      const at: Record<string, TierAt> = {}
      for (const o of own) {
        const r = applyOffers([{ productId: "p", unitCents: o.minor, quantity: units }], [{ id: "q", kind: "quantity_break", title: "", productIds: ["p"], triggerIds: [], discountType: "none", discountValue: 0, active: true, tiers: b.tiers }])
        const c = charged([{ unitCents: o.minor, quantity: units, discountCents: r.discounts[0] }])
        const plain = tierTotals(o.minor, t)
        at[o.id] = { total: write(c.total), was: c.full > c.total && plain.compareCents > plain.totalCents ? write(c.full) : null, each: write(Math.round(c.total / Math.max(1, units))) }
      }
      return { label: String(t.label ?? ""), discountType: t.discountType, discountValue: t.discountValue, amount: t.discountType === "amount" ? amountOff(t.discountValue) : "", badge: String(t.badge ?? ""), units, at }
    }),
  }))

  const firstOption = (i: OfferCardItem) => i.variants?.[0] ?? null
  const bundles = (offers.bundles ?? []).map((b) => {
    const items = b.items.map((i) => {
      const v = firstOption(i)
      return { id: i.id, title: i.title, imageUrl: i.imageUrl ?? null, variantId: v?.id ?? i.id, variantName: v && i.variants.length > 1 && i.id !== productId ? v.name : null, minor: v?.priceCents ?? i.priceCents, named: i.payWhatYouWant === true, mine: i.id === productId }
    })
    /* This product: the one item whose id is the product's (offers-public puts it first). */
    const mineAt = items.findIndex((x) => x.mine)
    const at: Record<string, BundleAt> = {}
    for (const o of own) {
      const units = items.map((x, k) => (k === mineAt ? o.minor : x.minor))
      const r = applyOffers(items.map((x, k) => ({ productId: `${k}`, unitCents: units[k], quantity: 1, payWhatYouWant: x.named })), [{ id: b.offerId, kind: "bundle", title: b.title, productIds: items.map((_, k) => `${k}`), triggerIds: [], discountType: b.discountType, discountValue: b.discountValue, active: true }])
      const c = charged(units.map((u, k) => ({ unitCents: u, quantity: 1, discountCents: r.discounts[k] ?? 0 })))
      at[o.id] = { thisPrice: write(price(o.minor)), full: write(c.full), price: write(c.total) }
    }
    return { offerId: String(b.offerId), title: String(b.title ?? ""), label: b.label ?? null, items: items.map((x) => ({ id: x.id, title: x.title, imageUrl: x.imageUrl, variantId: x.variantId, variantName: x.variantName, price: write(price(x.minor)), mine: x.mine })), at }
  })

  const upsells = (offers.checkoutOffers ?? []).map((u) => {
    const p = u.product
    const v = firstOption(p)
    const unit = v?.priceCents ?? p.priceCents
    const after = offerUnitPrice(u, unit, p.payWhatYouWant === true)
    const c = charged([{ unitCents: unit, quantity: 1, discountCents: unit - after }])
    return { offerId: String(u.offerId), title: String(u.title ?? ""), label: u.label ?? null, id: p.id, variantId: v?.id ?? p.id, title2: p.title, variantName: v && p.variants.length > 1 ? v.name : null, imageUrl: p.imageUrl ?? null, price: write(c.total), was: c.full > c.total ? write(c.full) : null }
  })
  return { breaks, bundles, upsells }
}

/* ─────────────────── drawing ─────────────────── */

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "")
/* JSON inside an attribute: escaped as one, and never able to close a script. */
const attrJson = (v: unknown) => esc(JSON.stringify(v).replace(/</g, "\\u003c"))

const STYLE = `<style>
.slof{display:grid;gap:1rem;margin:1rem 0;font:inherit;color:inherit;line-height:1.4}
.slof-box{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:12px;padding:1rem}
.slof-h{display:flex;justify-content:space-between;align-items:baseline;gap:.75rem;margin:0 0 .75rem;font-weight:600;font-size:1em}
.slof-badge{flex:none;border-radius:999px;padding:.1em .6em;font-size:.8em;font-weight:500;background:color-mix(in srgb,#16a34a 14%,transparent);color:inherit}
.slof-tiers{display:grid;gap:.5rem}
.slof-tier{display:flex;justify-content:space-between;align-items:center;gap:.75rem;width:100%;min-height:44px;padding:.6rem .75rem;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.slof-tier[aria-checked=true]{border-color:currentColor;box-shadow:inset 0 0 0 1px currentColor}
.slof-name{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;font-weight:500}
.slof-each,.slof-muted{display:block;font-size:.85em;opacity:.65}
.slof-sum{flex:none;text-align:right;font-variant-numeric:tabular-nums}
.slof-sum b{display:block;font-weight:600}
.slof-sum s{display:block;font-size:.85em;opacity:.6}
.slof-items{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.slof-item{display:flex;justify-content:space-between;gap:.75rem;font-size:.95em}
.slof-item span:last-child{flex:none;font-variant-numeric:tabular-nums;opacity:.7}
.slof-row{display:flex;align-items:center;gap:.75rem}
.slof-row img,.slof-pic{flex:none;width:48px;height:48px;border-radius:8px;object-fit:cover;background:color-mix(in srgb,currentColor 6%,transparent)}
.slof-pics{display:flex;gap:.4rem;margin:0 0 .75rem}
.slof-pics img,.slof-pics .slof-pic{width:56px;height:56px}
.slof-grow{min-width:0;flex:1}
.slof-together{display:flex;justify-content:space-between;align-items:baseline;gap:.75rem;margin-top:.75rem;padding-top:.75rem;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent);font-variant-numeric:tabular-nums}
.slof-together s{opacity:.6;margin-right:.5rem}
.slof-btn{margin-top:.75rem;width:100%;min-height:44px;cursor:pointer}
.slof-btn:disabled{opacity:.6;cursor:default}
.slof-up .slof-btn{margin-top:0;width:auto;flex:none}
.slof-say{margin:.5rem 0 0;font-size:.85em}
.slof-say:empty{display:none}
.slof-note{opacity:.6;font-size:.875em;margin:0}
</style>`

/** The block's script: the option picked in the theme's form, its figures, a tier into the quantity box, the lines into /cart/add.js. */
const SCRIPT = `<script>(function(){var s=document.currentScript,r=s&&s.parentNode;if(!r||r.__slof)return;r.__slof=1;var at={};try{at=JSON.parse(r.getAttribute("data-at")||"{}")}catch(e){}
function form(){var sec=r.closest(".shopify-section")||document;return sec.querySelector('form[action*="/cart/add"]')||document.querySelector('form[action*="/cart/add"]')}
function id(){var f=form(),i=f&&f.querySelector('[name="id"]');var u=new URLSearchParams(location.search).get("variant");return(i&&i.value)||u||r.getAttribute("data-selected")}
function qty(){var f=form(),sec=r.closest(".shopify-section")||document;return(f&&f.querySelector('[name="quantity"]'))||sec.querySelector('input[name="quantity"]')}
function draw(){var v=at[id()]||at[r.getAttribute("data-selected")];if(!v)return;r.querySelectorAll("[data-f]").forEach(function(el){var k=el.getAttribute("data-f").split("."),x=v;for(var n=0;n<k.length&&x!=null;n++)x=x[k[n]];if(x===undefined)return;if(x===null){el.hidden=true;return}el.hidden=false;el.textContent=x});var q=qty(),n=q?parseInt(q.value,10)||1:1;r.querySelectorAll(".slof-tier").forEach(function(b){b.setAttribute("aria-checked",String(+b.getAttribute("data-units")===n))})}
r.addEventListener("click",function(e){var t=e.target.closest(".slof-tier");if(t){var q=qty(),u=t.getAttribute("data-units");if(q){var m=parseInt(q.getAttribute("max"),10);q.value=m&&m<+u?m:u;q.dispatchEvent(new Event("input",{bubbles:true}));q.dispatchEvent(new Event("change",{bubbles:true}))}draw();return}
var a=e.target.closest("[data-add]");if(!a||a.disabled)return;var items=[];try{items=JSON.parse(a.getAttribute("data-add"))}catch(x){}var me=id();items=items.map(function(i){return i.mine?{id:me,quantity:1,properties:i.properties}:{id:i.id,quantity:1,properties:i.properties}});var say=a.parentNode.querySelector(".slof-say");a.disabled=true;
fetch("/cart/add.js",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({items:items})}).then(function(res){return res.json().then(function(j){if(!res.ok)throw new Error(j&&(j.description||j.message)||"");location.href="/cart"})}).catch(function(x){a.disabled=false;if(say)say.textContent=x&&x.message||""})});
document.addEventListener("change",function(){setTimeout(draw,0)},true);["variant:change","variant:update","variant:changed","on:variant:change"].forEach(function(n){document.addEventListener(n,function(){setTimeout(draw,0)})});addEventListener("popstate",draw);document.addEventListener("click",function(){setTimeout(draw,60);setTimeout(draw,450)},true);draw()})()</script>`

export interface OffersBlockInput {
  shown: OffersShown | null
  /** The option the page opens on (the theme's selected_or_first_available_variant), else the product's own id. */
  selectedId: string | null
  settings: Record<string, unknown>
  words: Record<string, string>
  inEditor: boolean
}

/** The block's HTML: nothing for a product with no offer, a quiet line in the builder. */
export function offersBlockHtml(input: OffersBlockInput): string {
  const s = input.settings
  const w = (k: string, d: string) => input.words[k] || d
  /* A tier the store named keeps its name; a default one is said in the page's words, its amount in the page's money. */
  const say = (kind: keyof typeof TIER_KEYS, vars: Record<string, string>) => fillWords(w(TIER_KEYS[kind], TIER_EN[kind]), vars)
  const nameOf = (t: OffersShown["breaks"][number]["tiers"][number]) => tierNameIn(t.label, say, t, () => t.amount)
  const shown = input.shown
  const breaks = shown && s.show_breaks !== false ? shown.breaks : []
  const bundles = shown && s.show_bundles !== false ? shown.bundles : []
  const upsells = shown && s.show_upsells !== false ? shown.upsells : []
  if (!breaks.length && !bundles.length && !upsells.length) return input.inEditor ? `${STYLE}<p class="slof-note">Bundles, quantity breaks and upsells set up in Offers show here.</p>` : ""
  const firstKey = (m: Record<string, unknown>) => (input.selectedId && m[input.selectedId] ? input.selectedId : Object.keys(m)[0])
  /* Every option's figures, keyed by block part: the script swaps them as the picker changes. */
  const at: Record<string, Record<string, unknown>> = {}
  const put = (opt: string, key: string, value: unknown) => ((at[opt] ??= {})[key] = value)
  const each = (price: string) => fillWords(w("offer_each", "{price} each"), { price })
  breaks.forEach((b, bi) => b.tiers.forEach((t, ti) => Object.entries(t.at).forEach(([opt, v]) => put(opt, `b${bi}t${ti}`, { ...v, each: each(v.each) }))))
  bundles.forEach((b, bi) => Object.entries(b.at).forEach(([opt, v]) => put(opt, `s${bi}`, v)))
  const pic = (src: string | null) => (src ? `<img src="${esc(src)}" alt="" loading="lazy" width="48" height="48">` : `<span class="slof-pic" aria-hidden="true"></span>`)
  const badge = (t: string | null) => (t ? `<span class="slof-badge">${esc(t)}</span>` : "")
  const parts: string[] = []
  breaks.forEach((b, bi) => {
    const tiers = b.tiers
      .map((t, ti) => {
        const v = t.at[firstKey(t.at)]
        const f = `b${bi}t${ti}`
        return `<button type="button" role="radio" aria-checked="false" class="slof-tier" data-units="${t.units}"><span><span class="slof-name">${esc(nameOf(t))}${badge(t.badge || null)}</span>${t.units > 1 ? `<span class="slof-each" data-f="${f}.each">${esc(each(v.each))}</span>` : ""}</span><span class="slof-sum"><b data-f="${f}.total">${esc(v.total)}</b><s data-f="${f}.was"${v.was ? "" : " hidden"}>${esc(v.was ?? "")}</s></span></button>`
      })
      .join("")
    parts.push(`<section class="slof-box slof-qb" aria-label="${esc(b.title)}"><p class="slof-h">${esc(b.title)}</p><div class="slof-tiers" role="radiogroup" aria-label="${esc(b.title)}">${tiers}</div></section>`)
  })
  bundles.forEach((b, bi) => {
    const v = b.at[firstKey(b.at)]
    const f = `s${bi}`
    const lines = b.items.map((i) => ({ id: i.variantId, mine: i.mine, properties: { _sl_offer_id: b.offerId } }))
    const items = b.items
      .map((i) => `<li class="slof-item"><span>${i.mine ? `<strong>${esc(w("offer_this_item", "This item:"))}</strong> ` : ""}${esc(i.title)}${i.variantName ? ` <span class="slof-muted" style="display:inline">${esc(i.variantName)}</span>` : ""}</span><span${i.mine ? ` data-f="${f}.thisPrice"` : ""}>${esc(i.mine ? v.thisPrice : i.price)}</span></li>`)
      .join("")
    parts.push(
      `<section class="slof-box slof-bundle" aria-label="${esc(b.title)}"><p class="slof-h"><span>${esc(b.title)}</span>${badge(b.label)}</p><div class="slof-pics" aria-hidden="true">${b.items.map((i) => pic(i.imageUrl)).join("")}</div><ul class="slof-items">${items}</ul><p class="slof-together"><span>${esc(w("offer_together", "Together"))}</span><span><s data-f="${f}.full"${v.full !== v.price ? "" : " hidden"}>${esc(v.full)}</s><b data-f="${f}.price">${esc(v.price)}</b></span></p><button type="button" class="slof-btn button" data-add="${attrJson(lines)}">${esc(text(s.add_all_label) || w("offer_add_all", "Add all to cart"))}</button><p class="slof-say" role="status"></p></section>`,
    )
  })
  upsells.forEach((u) => {
    const line = [{ id: u.variantId, mine: false, properties: { _sl_offer_id: u.offerId } }]
    parts.push(
      `<section class="slof-box slof-up" aria-label="${esc(u.title)}"><p class="slof-h"><span>${esc(u.title)}</span>${badge(u.label)}</p><div class="slof-row">${pic(u.imageUrl)}<div class="slof-grow"><span>${esc(u.title2)}${u.variantName ? ` <span class="slof-muted" style="display:inline">${esc(u.variantName)}</span>` : ""}</span><span class="slof-muted" style="opacity:1"><b>${esc(u.price)}</b>${u.was ? ` <s style="opacity:.6">${esc(u.was)}</s>` : ""}</span></div><button type="button" class="slof-btn button button--secondary" data-add="${attrJson(line)}">${esc(text(s.add_label) || w("offer_add", "Add"))}</button></div><p class="slof-say" role="status"></p></section>`,
    )
  })
  return `${STYLE}<div class="slof" data-sl-offers="" data-selected="${esc(input.selectedId ?? "")}" data-at="${attrJson(at)}">${parts.join("")}${SCRIPT}</div>`
}

/* ─────────────────── from a product's card ─────────────────── */

const hundredths = (v: unknown): number => {
  if (typeof v === "number") return Math.round(v)
  const s = String(v ?? "").replace(/[^0-9.,-]/g, "")
  const n = Number(s.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/**
 * A product card's options at the store's prices, in its minor units: each
 * variant's (the card writes prices as hundredths of the currency, "36.00"),
 * or the product itself when it has none. Read off the card before a market
 * converts it.
 */
export function cardOptions(card: { id: string; settings: Record<string, unknown> }, storeCurrency: string, minorUnitsOf: (currency: string) => number): { id: string; minor: number }[] {
  const s = card.settings
  const mu = minorUnitsOf(storeCurrency)
  const toMinor = (v: unknown) => Math.round((hundredths(v) / 100) * 10 ** mu)
  const variants = Array.isArray(s.variants) ? (s.variants as Record<string, unknown>[]).filter((v) => typeof v?.id === "string") : []
  return variants.length ? variants.map((v) => ({ id: String(v.id), minor: toMinor(v.price ?? s.price) })) : [{ id: card.id, minor: toMinor(s.price) }]
}

/** The card's settings with the block's figures (`storelib_offers_shown`), when the card carries the product's offers (`storelib_offers`). */
export function withOffersShown(card: { id: string; settings: Record<string, unknown> }, own: { id: string; minor: number }[], ctx: ShownContext): Record<string, unknown> {
  const offers = card.settings.storelib_offers as OffersJson | undefined
  if (!offers || typeof offers !== "object") return card.settings
  try {
    return { ...card.settings, storelib_offers_shown: offersShown(offers, card.id, own, ctx) }
  } catch {
    return card.settings
  }
}
