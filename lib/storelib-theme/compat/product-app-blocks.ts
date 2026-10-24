/**
 * ===========================================================================
 *  STORELIB'S OWN PRODUCT PAGE APP BLOCKS, FOR AN IMPORTED THEME
 * ===========================================================================
 * Beside Storelib Reviews' two (./review-app-blocks.ts), two blocks a store
 * would get from an app on Shopify, kept on the page by their address the
 * same way, so a theme that takes `{ "type": "@app" }` (Dawn's main product
 * and featured product, Horizon's product information) lists them in Add
 * block and draws them where they were placed:
 *
 *   Stock status         In stock, Only 3 left or Out of stock for the
 *                        option picked, from the product page's own read
 *                        of its stock (./product-facts.ts), following the
 *                        theme's option picker as it changes
 *   Estimated delivery   the days a product that ships should arrive
 *                        between, from the cheapest rate home's business
 *                        days (Settings › Shipping and delivery) and the
 *                        days the shop takes to get an order ready; nothing
 *                        for a download
 *
 * Their words are Storelib's in the page's language (Translate › Shop
 * words); the block's own text, when the store typed one, wins. Each carries
 * a few lines of script, so a page held in a cache says the visitor's own
 * today and the option they picked. The names and panels are here without
 * the engine, for the builder's sidebar; the drawing below is pure.
 */
import type { BlockSchema } from "@/lib/website-builder/types"
import { DELIVERY_WINDOW_WORDS, deliveryWindow, deliveryWindowLine } from "@/lib/physical/delivery-lines"

export const STOCK_STATUS_BLOCK = "shopify://apps/storelib/blocks/stock-status/storelib"
export const ESTIMATED_DELIVERY_BLOCK = "shopify://apps/storelib/blocks/estimated-delivery/storelib"

export function isStorelibProductAppBlock(type: unknown): boolean {
  return type === STOCK_STATUS_BLOCK || type === ESTIMATED_DELIVERY_BLOCK
}

export const PRODUCT_APP_BLOCK_SCHEMAS: readonly BlockSchema[] = [
  {
    type: STOCK_STATUS_BLOCK,
    name: "Stock status",
    theme: true,
    limit: 1,
    fields: [
      { id: "threshold", label: "Say Only N left from", type: "range", default: 5, min: 1, max: 10, step: 1 },
      { id: "show_in_stock", label: "Say In stock when there are more", type: "toggle", default: true },
      { id: "low_text", label: "Few left text", type: "text", default: "", placeholder: "Only {count} left" },
      { id: "in_stock_text", label: "In stock text", type: "text", default: "", placeholder: "In stock" },
      { id: "color", label: "Dot colour", type: "color", default: "" },
    ],
  },
  {
    type: ESTIMATED_DELIVERY_BLOCK,
    name: "Estimated delivery",
    theme: true,
    limit: 1,
    fields: [
      { id: "processing_days", label: "Business days to get an order ready", type: "range", default: 1, min: 0, max: 10, step: 1 },
      { id: "cutoff_hour", label: "Orders after this hour start the next day (24 for none)", type: "range", default: 24, min: 0, max: 24, step: 1 },
      { id: "text", label: "Text", type: "text", default: "", placeholder: "Arrives {from} to {to}" },
      { id: "color", label: "Icon colour", type: "color", default: "" },
    ],
  },
]

export function productAppBlockSchema(type: string): BlockSchema | undefined {
  return PRODUCT_APP_BLOCK_SCHEMAS.find((b) => b.type === type)
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const safeColour = (v: unknown) => (typeof v === "string" && /^[#a-z0-9(),.%\s-]{1,64}$/i.test(v.trim()) ? v.trim() : "")
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "")
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d)

const STYLE = `<style>
.slpb{display:flex;align-items:center;gap:.5em;margin:.5em 0;font:inherit;font-size:.95em;color:inherit;line-height:1.4}
.slpb-dot{flex:none;width:.55em;height:.55em;border-radius:50%;background:var(--slpb-dot,#16a34a)}
.slpb[data-state=low] .slpb-dot{background:var(--slpb-dot,#d97706)}
.slpb[data-state=out] .slpb-dot{background:color-mix(in srgb,currentColor 35%,transparent)}
.slpb-icon{flex:none;width:1.15em;height:1.15em;color:var(--slpb-dot,currentColor)}
.slpb-note{opacity:.6;font-size:.875em}
.slpb[hidden]{display:none}
</style>`

/** One option's stock as the theme was told it (./objects.ts stockOf). */
export interface StockOfVariant {
  id: string
  available: boolean
  /** Shopify's inventory_management: "shopify" when Storelib counts it and may say so. */
  management: string | null
  quantity: number
  policy: string
}

export interface StockStatusInput {
  variants: StockOfVariant[]
  selectedId: string | null
  settings: Record<string, unknown>
  words: Record<string, string>
  inEditor: boolean
  blockId: string
}

type StockState = { state: "in" | "low" | "out"; line: string } | null

/** What the block says about one option. Null: nothing (plenty, or uncounted, with In stock off). */
export function stockLine(v: StockOfVariant | undefined, settings: Record<string, unknown>, words: Record<string, string>): StockState {
  if (!v) return null
  const threshold = Math.max(1, Math.min(10, Math.floor(num(settings.threshold, 5))))
  const showIn = settings.show_in_stock !== false
  const low = text(settings.low_text) || words.only_left || "Only {count} left"
  const inStock = text(settings.in_stock_text) || words.in_stock || "In stock"
  if (!v.available) return { state: "out", line: words.out_of_stock || "Out of stock" }
  const counted = v.management === "shopify" && v.policy !== "continue"
  if (counted && v.quantity > 0 && v.quantity <= threshold) return { state: "low", line: low.replace(/\{count\}/g, String(v.quantity)) }
  return showIn ? { state: "in", line: inStock } : null
}

/** The script that says the option picked: the theme's own form input `id`, else `?variant=`, read after every change. */
const STOCK_SCRIPT = `<script>(function(){var s=document.currentScript,r=s&&s.parentNode;if(!r||r.__slpb)return;r.__slpb=1;var d={};try{d=JSON.parse(r.getAttribute("data-stock")||"{}")}catch(e){}
function id(){var sec=r.closest(".shopify-section")||document,i=sec.querySelector('form[action*="/cart/add"] [name="id"]')||document.querySelector('form[action*="/cart/add"] [name="id"]');var u=new URLSearchParams(location.search).get("variant");return(i&&i.value)||u||r.getAttribute("data-selected")}
function draw(){var v=d[id()];if(v===undefined)return;var t=r.querySelector(".slpb-t");if(!v){r.hidden=true;return}r.hidden=false;r.setAttribute("data-state",v[0]);if(t)t.textContent=v[1]}
document.addEventListener("change",function(){setTimeout(draw,0)},true);["variant:change","variant:update","variant:changed","on:variant:change"].forEach(function(n){document.addEventListener(n,function(){setTimeout(draw,0)})});addEventListener("popstate",draw);document.addEventListener("click",function(){setTimeout(draw,60);setTimeout(draw,450)},true)})()</script>`

export function stockStatusHtml(input: StockStatusInput): string {
  const map: Record<string, [string, string] | null> = {}
  for (const v of input.variants) {
    const s = stockLine(v, input.settings, input.words)
    map[v.id] = s ? [s.state, s.line] : null
  }
  const selected = input.variants.find((v) => v.id === input.selectedId) ?? input.variants.find((v) => v.available) ?? input.variants[0]
  const now = selected ? stockLine(selected, input.settings, input.words) : null
  if (!input.variants.length) return input.inEditor ? `${STYLE}<p class="slpb slpb-note">Stock status shows on a product's page</p>` : ""
  const colour = safeColour(input.settings.color)
  return `${STYLE}<p class="slpb slpb-stock" role="status" data-state="${now?.state ?? "in"}"${now ? "" : " hidden"} data-selected="${esc(selected?.id ?? "")}" data-stock="${esc(JSON.stringify(map))}"${colour ? ` style="--slpb-dot: ${esc(colour)};"` : ""}><span class="slpb-dot" aria-hidden="true"></span><span class="slpb-t">${esc(now?.line ?? "")}</span>${STOCK_SCRIPT}</p>`
}

export interface EstimatedDeliveryInput {
  /** The product ships (a download never shows the block). */
  ships: boolean
  /** The cheapest rate home's business days (lib/physical/storefront-facts.ts productDelivery). Null: no rate says. */
  days: { minDays: number | null; maxDays: number | null } | null
  settings: Record<string, unknown>
  words: Record<string, string>
  locale: string
  inEditor: boolean
  now?: Date
}

const TRUCK = `<svg class="slpb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17.5" cy="17" r="1.6"/></svg>`

/** Counts again in the visitor's browser, from their own today and clock, with the same rule (lib/physical/delivery-lines.ts deliveryWindow). */
const DELIVERY_SCRIPT = `<script>(function(){var s=document.currentScript,r=s&&s.parentNode;if(!r)return;var a=JSON.parse(r.getAttribute("data-window")||"null");if(!a)return;
function we(d){return d.getDay()===0||d.getDay()===6}function add(f,n){var d=new Date(f.getFullYear(),f.getMonth(),f.getDate());while(we(d))d.setDate(d.getDate()+1);while(n>0){d.setDate(d.getDate()+1);if(!we(d))n--}return d}
var now=new Date(),st=we(now)?add(now,0):(a.c!==null&&now.getHours()>=a.c)?add(now,1):new Date(now.getFullYear(),now.getMonth(),now.getDate()),sh=add(st,a.p),f=add(sh,a.lo),t=add(sh,a.hi);
function day(d){try{return new Intl.DateTimeFormat(a.l,{weekday:"short",month:"short",day:"numeric"}).format(d)}catch(e){return d.toDateString()}}
var x=day(f),y=day(t),el=r.querySelector(".slpb-t");if(el)el.textContent=x===y?a.one.replace(/\\{date\\}|\\{from\\}|\\{to\\}/g,x):a.two.replace(/\\{from\\}/g,x).replace(/\\{to\\}/g,y)})()</script>`

export function estimatedDeliveryHtml(input: EstimatedDeliveryInput): string {
  if (!input.ships) return input.inEditor ? `${STYLE}<p class="slpb slpb-note">Estimated delivery shows for a product that ships</p>` : ""
  const s = input.settings
  const processing = Math.max(0, Math.min(10, Math.floor(num(s.processing_days, 1))))
  const cut = Math.floor(num(s.cutoff_hour, 24))
  const cutoffHour = cut >= 0 && cut < 24 ? cut : null
  const win = input.days ? deliveryWindow({ minDays: input.days.minDays, maxDays: input.days.maxDays, processingDays: processing, cutoffHour }, input.now) : null
  if (!win || !input.days) return input.inEditor ? `${STYLE}<p class="slpb slpb-note">Add delivery days to a rate in Settings, Shipping and delivery to show when it arrives</p>` : ""
  const own = text(s.text)
  const words = {
    range: own || input.words.arrives_between || DELIVERY_WINDOW_WORDS.range,
    single: own || input.words.arrives_on || DELIVERY_WINDOW_WORDS.single,
  }
  const lo = Math.max(0, Math.floor(input.days.minDays ?? input.days.maxDays ?? 0))
  const hi = Math.max(lo, Math.floor(input.days.maxDays ?? input.days.minDays ?? 0))
  const data = { lo, hi, p: processing, c: cutoffHour, l: input.locale, two: words.range, one: words.single }
  const colour = safeColour(s.color)
  return `${STYLE}<p class="slpb slpb-delivery" data-window="${esc(JSON.stringify(data))}"${colour ? ` style="--slpb-dot: ${esc(colour)};"` : ""}>${TRUCK}<span class="slpb-t">${esc(deliveryWindowLine(win, words, input.locale))}</span>${DELIVERY_SCRIPT}</p>`
}
