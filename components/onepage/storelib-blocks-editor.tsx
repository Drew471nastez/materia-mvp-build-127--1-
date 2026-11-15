"use client"

/*
 * THE EDITOR'S HALF OF ./storelib-blocks (round 63): each Storelib block's row in the editor's list
 * and its editor. Split out so a visitor's OnePage downloads the blocks it draws, not the product
 * picker, the image field and the Files library behind it, or a database client.
*/
import { ColorRow, LabeledRow, Segmented, Switch } from "./editor-kit"
import { ProductLayoutThumb, layoutHasCard, layoutLabel, useCreatorProducts, type CreatorProduct } from "./tabs/product-block-editor"
import { OnePageImageField } from "@/components/onepage/image-field"
import type { ProductBlockData, ProductBlockStyle } from "@/lib/onepage/types"
import { useBlockPart } from "./block-part"
import { ArrangePicker, CardsInViewControl, EditorThemeContext, HowManyControl, PictureFitControl } from "./layout-pickers"
import { ChoiceMark } from "./choice-marks"
import { productLayoutOf } from "@/lib/onepage/product-block"
import * as React from "react"
import dynamic from "next/dynamic"
import { teamStoreForProducts } from "@/lib/onepage/team-context"
import { Check, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { usePageMoney } from "@/components/platform/price-currency"
import { createClient } from "@/lib/supabase/client"
import { tt } from "@/lib/i18n/text"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { GlyphEmail, GlyphProduct, GlyphSocial, GlyphStore, GlyphTestimonials, type Glyph } from "@/components/onepage/block-icons"
import { FOLLOWER_NETWORKS, detectFollowerInput, REFRESHABLE_NETWORKS, SHELF_LIMIT_MAX, SHELF_SOURCES, compactCount, followerTotal, isStorelibBlock, leadMagnetButton, leadMagnetKind, leadMagnetReady, parseCount, pastedPosts, promoCode, shelfLimit, shelfPick, shelfPickedIds, shelfSource, shelfTakes, shelfUsesProductCards, socialPost, type FollowerEntry, type FollowerNetwork, type FollowersBlockData, type LeadMagnetBlockData, type LeadMagnetKind, type PromoCodeBlockData, type ShelfPick, type ShelfSource, type SocialPostsBlockData, type SocialPostsNetwork, type StorelibShelfBlockData } from "@/lib/onepage/storelib-blocks"
import type { OnePageBlock, OnePageBlockData } from "@/lib/onepage/types"
import { NETWORK_NAME } from "./storelib-blocks"
import { PRODUCT_LAYOUTS } from "@/lib/onepage/product-block"

/* ─── The editor's rows ────────────────────────────────────────────────── */

const SHELF_WORD: Record<ShelfSource, () => string> = {
  all: () => tt("All products"),
  digital: () => tt("Digital products"),
  physical: () => tt("Physical products"),
  course: () => tt("Courses"),
  membership: () => tt("Memberships"),
  community: () => tt("Community"),
}

const MAGNET_WORD: Record<LeadMagnetKind, () => string> = {
  download: () => tt("Free download"),
  discount: () => tt("Discount code"),
  waitlist: () => tt("Waitlist"),
}

/** The title, line and icon the editor's list shows for one of these blocks, or null for another type. */
export function storelibBlockRow(block: OnePageBlock): { title: string; subtitle: string; icon: Glyph } | null {
  if (!isStorelibBlock(block)) return null
  const d = block.data as unknown as Record<string, unknown>
  switch (block.type) {
    case "storelib_shelf": {
      const s = shelfSource(d.source)
      /* Round AP: the row says which, when the creator picked them. */
      const ids = shelfPickedIds(d as unknown as StorelibShelfBlockData)
      const subtitle = !ids ? tt("Shelf, read live from Storelib") : ids.length === 0 ? tt("Pick the products to show") : tt("{count, plural, one {# product} other {# products}}", { count: ids.length })
      return { title: (d.title as string)?.trim() || SHELF_WORD[s](), subtitle, icon: GlyphStore }
    }
    case "lead_magnet": {
      const data = d as unknown as LeadMagnetBlockData
      const kind = leadMagnetKind(data.kind)
      return { title: data.title?.trim() || MAGNET_WORD[kind](), subtitle: leadMagnetReady(data) ? MAGNET_WORD[kind]() : kind === "download" ? tt("Pick a free product") : tt("Pick a code"), icon: GlyphEmail }
    }
    case "social_posts": {
      const data = d as unknown as SocialPostsBlockData
      const n = pastedPosts(data).length
      return { title: data.title?.trim() || tt("Posts"), subtitle: n ? tt("{count, plural, one {# post} other {# posts}}", { count: n }) : tt("Paste your posts"), icon: GlyphSocial }
    }
    case "followers": {
      const total = followerTotal((d as unknown as FollowersBlockData).networks)
      return { title: total ? tt("{value} followers", { value: compactCount(total) }) : tt("Followers"), subtitle: total ? tt("Total followers") : tt("Add your networks"), icon: GlyphTestimonials }
    }
    case "promo_code": {
      const data = d as unknown as PromoCodeBlockData
      return { title: data.title?.trim() || tt("Code"), subtitle: promoCode(data.code) ?? tt("Add the code"), icon: GlyphProduct }
    }
    default:
      return null
  }
}

/* ─── The editors ──────────────────────────────────────────────────────── */

const fieldBox = "space-y-2"
const fieldLabel = "text-xs"

/*
  ROUND AN: ONE WAY TO CHOOSE. These editors had their own black pills
  (Chips) beside the editor kit's Segmented that every other block uses, and
  native selects that opened the phone's wheel. A few short words are the
  kit's Segmented now, and a list is Storelib's ChoicePicker
  (./editor-choice), loaded only when an editor draws one, since this file
  also draws these blocks on the live page.
*/
const FieldStandIn = () => <div aria-hidden className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white" />
const EditorSelect = dynamic(() => import("./editor-choice").then((m) => m.EditorSelect), { ssr: false, loading: FieldStandIn })
const AddFromList = dynamic(() => import("./editor-choice").then((m) => m.AddFromList), { ssr: false, loading: FieldStandIn })

/** A plain shelf card drawn small, beside the product layouts. */
function SimpleShelfThumb() {
  return (
    <span aria-hidden className="flex h-full w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[#f7f7f8] px-[10%]">
      {[0, 1].map((i) => (
        <span key={i} className="flex w-[42%] flex-col gap-1 rounded-[6px] bg-white p-1 shadow-[inset_0_0_0_1px_#e3e4e8]" style={{ opacity: i ? 0.55 : 1 }}>
          <span className="block aspect-square w-full rounded-[4px] bg-[#e5e7eb]" />
          <span className="block h-[3px] w-[70%] rounded-full bg-[#9ca3af]" />
          <span className="block h-[3px] w-[40%] rounded-full bg-[#d1d5db]" />
        </span>
      ))}
    </span>
  )
}

/** Plain cards or one of the product block's eight layouts, as pictures (components/onepage/tabs/product-block-editor). */
function ShelfCardPicker({ data, onPick, image }: { data: StorelibShelfBlockData; onPick: (id: "simple" | ProductBlockStyle) => void; image?: string | null }) {
  const settings = data.product_settings || {}
  /* Round AL: drawn in the page's colours with one of the shelf's own products, as the product block's picker is. */
  const theme = React.useContext(EditorThemeContext)
  const current = shelfUsesProductCards(data) ? productLayoutOf({ style: settings.style ?? "callout", style_chosen: true }) : "simple"
  const options: ("simple" | ProductBlockStyle)[] = ["simple", ...PRODUCT_LAYOUTS.filter((id) => id !== "button")]
  return (
    <div className="space-y-2.5" data-shelf-cards="">
      <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Cards")}</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {options.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(id)}
              data-shelf-card-choice={id}
              {...(id === "simple" ? {} : { "data-product-layout-choice": id })}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                {id === "simple" ? <SimpleShelfThumb /> : <ProductLayoutThumb id={id} theme={theme as never} image={image} />}
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{id === "simple" ? tt("Simple") : layoutLabel(id)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/*
  ROUND AP, THE OWNER: "I might want to be able to select what digital products to show specifically, or all
  digital products ... or I might want to add only one digital product to show". Which of the shelf's kind it
  shows: All of them (newest first, How many in Layout), the ones picked here (in the order they were picked),
  or One. The list is the creator's own products (useCreatorProducts: the signed in creator's, or the store a
  team member edits), of the shelf's kind; a draft is listed with its badge and shows on the page once it is
  published. Only ids are saved; the page reads the products live, and only the page owner's.
*/
function ShelfProductPick({
  data,
  source,
  products,
  updateData,
}: {
  data: StorelibShelfBlockData
  source: ShelfSource
  products: ReturnType<typeof useCreatorProducts>
  updateData: (u: Partial<StorelibShelfBlockData>) => void
}) {
  const pick = shelfPick(data)
  const chosen = shelfPickedIds({ ...data, pick: pick === "all" ? "some" : pick }) ?? []
  const list = (products ?? []).filter((p) => p.status !== "archived" && !p.archived && shelfTakes(source, p.type))
  const toggle = (id: string) => {
    if (pick === "one") return updateData({ product_ids: [id] })
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(0, SHELF_LIMIT_MAX)
    updateData({ product_ids: next })
  }
  return (
    <div className={fieldBox} data-shelf-pick={pick}>
      <Label className={fieldLabel}>{tt("Products")}</Label>
      <Segmented<ShelfPick>
        label={tt("Products")}
        value={pick}
        options={[
          { id: "all", label: tt("All") },
          { id: "some", label: tt("Choose") },
          { id: "one", label: tt("One") },
        ]}
        onChange={(next) => updateData({ pick: next, ...(next === "one" ? { product_ids: chosen.slice(0, 1) } : {}) })}
      />
      {pick !== "all" ? (
        products === null ? (
          <div aria-hidden className="h-[120px] animate-pulse rounded-xl bg-[#f3f4f6]" />
        ) : list.length === 0 ? (
          <p className="text-[12.5px] leading-snug text-[#6b7280]">{tt("No products of this kind yet.")}</p>
        ) : (
          <div
            role={pick === "one" ? "radiogroup" : "group"}
            aria-label={tt("Products")}
            className="max-h-[288px] overflow-y-auto overscroll-contain rounded-xl border border-[#e3e4e8] bg-white"
            data-shelf-pick-list=""
          >
            {list.map((p) => {
              const on = chosen.includes(p.id)
              const order = pick === "some" && on ? chosen.indexOf(p.id) + 1 : null
              return (
                <button
                  key={p.id}
                  type="button"
                  role={pick === "one" ? "radio" : "checkbox"}
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  data-shelf-pick-item={p.id}
                  className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-b border-[#f0f1f3] px-2.5 py-2 text-left outline-none last:border-b-0 hover:bg-[#fafafb] focus-visible:bg-[#f4f4f6]"
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-[#f1f2f4] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" draggable={false} decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium text-[#1a1a2e]">{p.title}</span>
                      {p.status === "draft" ? <span className="shrink-0 rounded-full bg-[#f4f4f6] px-1.5 text-[10.5px] font-semibold leading-[18px] text-[#4b5563]">{tt("Draft")}</span> : null}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center text-[12px] font-semibold transition-colors duration-150",
                      pick === "one" ? "rounded-full" : "rounded-[7px]",
                      on ? "bg-[#1a1a2e] text-white" : "bg-white text-transparent shadow-[inset_0_0_0_1.5px_#d1d5db]",
                    )}
                  >
                    {order ?? (on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null)}
                  </span>
                </button>
              )
            })}
          </div>
        )
      ) : null}
      {pick === "some" && chosen.length === 0 && list.length > 0 ? <p className="text-[12.5px] leading-snug text-[#6b7280]">{tt("Pick the products to show, in the order you want them.")}</p> : null}
    </div>
  )
}

/*
  THE SHELF'S TWO HALVES (components/onepage/block-settings useBlockPart).
  Settings: what it shows (the kind, the title, how many, and for product
  cards the button words, the price and what a tap opens, and a picture of
  its own for any product). Layout: how the shelf is arranged and how each
  card is drawn, with the card colours where a card has its own.
*/
/** The first three products a shelf shows, for the pictures of its arrangements: its picks in order, else the newest of its kind. */
function shelfPreviewItems(data: StorelibShelfBlockData, source: ReturnType<typeof shelfSource>, products: CreatorProduct[] | null, money: ((cents: number) => string) | null) {
  if (!products?.length || source === "community") return []
  const picked = shelfPickedIds(data)
  const byId = new Map(products.map((p) => [p.id.toLowerCase(), p]))
  const shown = picked ? picked.map((id) => byId.get(id)).filter((p): p is CreatorProduct => !!p) : products.filter((p) => source === "all" || p.type === source)
  return shown.slice(0, 3).map((p) => ({
    image: data.product_overrides?.[p.id]?.custom_thumbnail || p.thumbnail_url || null,
    title: p.title,
    meta: money ? (p.price_cents > 0 ? money(p.price_cents) : tt("Free")) : null,
  }))
}

function ShelfEditor({ data, updateData }: { data: StorelibShelfBlockData; updateData: (u: Partial<StorelibShelfBlockData>) => void }) {
  const part = useBlockPart()
  const money = usePageMoney()
  const source = shelfSource(data.source)
  const products = useCreatorProducts(true)
  const [editing, setEditing] = React.useState("")
  const settings = data.product_settings || {}
  const setSettings = (patch: Partial<ProductBlockData>) => updateData({ product_settings: { ...settings, ...patch } })
  const productCards = source !== "community" && shelfUsesProductCards(data)
  const arrange: NonNullable<StorelibShelfBlockData["layout"]> = data.layout || (productCards ? "list" : "carousel")
  const settingsHalf = (
    <div className="space-y-4" data-shelf-settings="">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Show")}</Label>
        <EditorSelect name="shelf-source" title={tt("Show")} value={source} choices={SHELF_SOURCES.map((s) => ({ value: s, label: SHELF_WORD[s]() }))} emptyLabel={SHELF_WORD.all()} onChange={(v) => updateData({ source: v as typeof source })} />
      </div>
      {source !== "community" ? <ShelfProductPick data={data} source={source} products={products} updateData={updateData} /> : null}
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title ?? ""} maxLength={60} placeholder={SHELF_WORD[source]()} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      {productCards ? (
        <div className="space-y-3 border-t border-[#eef0f2] pt-4" data-shelf-product-settings="">
          <label className="block space-y-1.5 text-xs font-medium text-[#6b7280]">
            {tt("Button text")}
            <Input value={settings.cta_text ?? ""} placeholder={tt("View product")} onChange={(e) => setSettings({ cta_text: e.target.value })} />
          </label>
          <div className="flex min-h-11 items-center justify-between">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Show price")}</span>
            <Switch label={tt("Show price")} checked={settings.show_price !== false} onChange={(show_price) => setSettings({ show_price })} />
          </div>
          <div className="flex min-h-11 items-center justify-between">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Show description")}</span>
            <Switch label={tt("Show description")} checked={settings.show_description !== false} onChange={(show_description) => setSettings({ show_description })} />
          </div>
          <div className="flex min-h-11 items-center justify-between">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Open product sheet")}</span>
            <Switch label={tt("Open product sheet")} checked={settings.tap_action === "sheet"} onChange={(on) => setSettings({ tap_action: on ? "sheet" : "page", instant_checkout: on })} />
          </div>
        </div>
      ) : null}
      {source !== "community" ? (
        <div className="space-y-2 border-t border-[#eef0f2] pt-4" data-shelf-thumbnails="">
          <div className={fieldBox}>
            <Label className={fieldLabel}>{tt("Custom thumbnail")}</Label>
            <EditorSelect
              name="shelf-thumbnail"
              title={tt("Choose a product")}
              value={editing || null}
              emptyLabel={tt("Choose a product")}
              choices={(products ?? []).filter((p) => source === "all" || p.type === source).map((p) => ({ value: p.id, label: p.title }))}
              onChange={setEditing}
            />
          </div>
          {/*
            Round AP, the owner: "the image under the custom thumbnail selector is not displaying well, and I cannot
            delete it". It was a wide upload box cut from the product's cover, and its X set the custom picture to
            nothing, which showed the product's own picture again in the same box, so nothing seemed to go. Now it
            is the editor's picture row: the picture whole in a rounded square, Replace and Remove beside it.
            Remove is there only while a picture of its own is set, takes it off the block (saved with the page),
            and the square shows the product's own picture again, which is what the page then shows.
          */}
          {editing ? (
            <OnePageImageField
              key={editing}
              prefix={`thumb_shelf_${editing}`}
              value={data.product_overrides?.[editing]?.custom_thumbnail || null}
              fallback={products?.find((p) => p.id === editing)?.thumbnail_url || null}
              onChange={(url) => {
                const { custom_thumbnail: _was, ...rest } = data.product_overrides?.[editing] ?? {}
                updateData({ product_overrides: { ...data.product_overrides, [editing]: url ? { ...rest, custom_thumbnail: url } : rest } })
              }}
            />
          ) : null}
        </div>
      ) : null}
      <p className="text-[12.5px] leading-relaxed text-[#6b7280]">
        {source === "community" ? tt("Your public communities, biggest first.") : tt("Published products only, newest first.")}
      </p>
    </div>
  )
  const layoutHalf = (
    <div className="space-y-5" data-shelf-layout="">
      {/*
        Round AL: the arrangement as pictures, then for a carousel its cards
        in view, then how many (from Settings): everything about how the
        shelf sits on the page, in one place.
      */}
      <ArrangePicker
        /* Product cards with no arrangement saved have always been drawn as a list. */
        value={arrange}
        options={[
          { id: "list", kind: "list", label: tt("List") },
          { id: "grid", kind: "grid", label: tt("Grid") },
          { id: "carousel", kind: "carousel", label: tt("Carousel") },
          /* Round AR: a community as one large card with its cover and Join. */
          ...(source === "community" ? [{ id: "featured" as const, kind: "single" as const, label: tt("Featured") }] : []),
        ]}
        /* Round AQ: the shelf's own products, the picked ones in their order, with the picture, name and price the page draws. */
        items={shelfPreviewItems(data, source, products, settings.show_price !== false ? money : null)}
        onChange={(v) => updateData({ layout: v })}
      />
      {arrange === "carousel" ? (
        <CardsInViewControl value={data.carousel_view || (productCards ? "1.2" : "2")} onChange={(carousel_view) => updateData({ carousel_view })} />
      ) : null}
      {/* Picked products are as many as were picked (Settings › Products). */}
      {shelfPick(data) === "all" ? <HowManyControl value={shelfLimit(data.limit)} options={[3, 6, 9, 12]} onChange={(limit) => updateData({ limit })} /> : null}
      {source !== "community" ? (
        <ShelfCardPicker
          data={data}
          image={products?.find((p) => (source === "all" || p.type === source) && p.thumbnail_url)?.thumbnail_url ?? null}
          onPick={(id) =>
            id === "simple"
              ? updateData({ card_style: "simple" })
              : updateData({ card_style: null, product_settings: { ...settings, style: id, style_chosen: true }, ...(id === "tile" ? { layout: "grid" as const } : {}) })
          }
        />
      ) : null}
      {source !== "community" ? <PictureFitControl value={settings.image_fit} onChange={(image_fit) => setSettings({ image_fit })} /> : null}
      {productCards && layoutHasCard(productLayoutOf({ style: settings.style ?? "callout", style_chosen: true })) ? (
        <div className="space-y-3 border-t border-[#eef0f2] pt-4" data-shelf-colours="">
          <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Card colours")}</p>
          {([[tt("Background"), "block_background_color"], [tt("Text"), "text_color"], [tt("Button"), "button_color"], [tt("Button text"), "button_text_color"]] as const).map(([label, key]) => (
            <ColorRow key={key} label={label} value={settings[key]} onChange={(v) => setSettings({ [key]: v })} onClear={() => setSettings({ [key]: null })} emptyLabel={tt("Page default")} />
          ))}
        </div>
      ) : null}
    </div>
  )
  if (part === "settings") return settingsHalf
  if (part === "layout") return layoutHalf
  return (
    <div className="space-y-5">
      {settingsHalf}
      {layoutHalf}
    </div>
  )
}

type FreeProduct = { id: string; title: string; thumbnail_url: string | null }
type CouponRow = { id: string; code: string; discount_type: string; discount_value: number | string; is_active: boolean; expires_at: string | null }

async function loadFreeProducts(): Promise<FreeProduct[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  /* Round 41: a team member lists the store's free products (lib/onepage/team-context), never their own account's. */
  const teamStore = teamStoreForProducts()
  const { data: creator } = teamStore ? { data: { id: teamStore } } : await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return []
  const { data } = await supabase
    .from("products")
    .select("id, title, thumbnail_url, price_cents, status, type, pay_what_you_want, pwyw_min_price_cents")
    .eq("creator_id", (creator as { id: string }).id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(200)
  type Row = FreeProduct & { price_cents: number | null; type: string | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }
  /*
    FREE AS THE DOWNLOAD FORM DECIDES IT (app/api/onepage/email-capture): no
    price, not pay what you want above nothing, and no paid option. A product
    the form would refuse to hand over is not offered here.
  */
  const rows = ((data ?? []) as Row[]).filter((p) => !(p.price_cents && p.price_cents > 0) && !(p.pay_what_you_want && Number(p.pwyw_min_price_cents) > 0) && (p.type ?? "digital") === "digital")
  if (rows.length === 0) return []
  const { data: paid } = await supabase.from("product_variants").select("product_id").in("product_id", rows.map((p) => p.id)).or("price_cents.gt.0,pay_what_you_want.eq.true")
  const withPaidOption = new Set(((paid ?? []) as { product_id: string }[]).map((v) => v.product_id))
  return rows.filter((p) => !withPaidOption.has(p.id)).map(({ id, title, thumbnail_url }) => ({ id, title, thumbnail_url }))
}

function LeadMagnetEditor({ data, updateData }: { data: LeadMagnetBlockData; updateData: (u: Partial<LeadMagnetBlockData>) => void }) {
  const money = usePageMoney()
  const kind = leadMagnetKind(data.kind)
  const [products, setProducts] = React.useState<FreeProduct[] | null>(null)
  const [coupons, setCoupons] = React.useState<CouponRow[] | null>(null)
  React.useEffect(() => {
    let live = true
    if (kind === "download" && products === null) loadFreeProducts().then((r) => live && setProducts(r)).catch(() => live && setProducts([]))
    if (kind === "discount" && coupons === null)
      fetch("/api/coupons")
        .then((r) => (r.ok ? r.json() : { coupons: [] }))
        .then((d) => live && setCoupons(Array.isArray(d?.coupons) ? d.coupons : []))
        .catch(() => live && setCoupons([]))
    return () => {
      live = false
    }
  }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const couponText = (c: CouponRow) => {
    const v = typeof c.discount_value === "string" ? Number.parseFloat(c.discount_value) : c.discount_value
    return c.discount_type === "percentage" ? tt("{value}% off", { value: Math.round(v) }) : tt("{value} off", { value: money(Math.round(v * 100)) })
  }

  return (
    <div className="space-y-3">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("They get")}</Label>
        <Segmented label={tt("They get")} value={kind} options={(["download", "discount", "waitlist"] as const).map((id) => ({ id, label: MAGNET_WORD[id]() }))} onChange={(v) => updateData({ kind: v })} />
      </div>

      {kind === "download" ? (
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Free product")}</Label>
          {products === null ? (
            <div className="flex h-12 items-center gap-2 rounded-xl border border-[#e3e4e8] px-3 text-[13px] text-[#6b7280]">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {tt("Loading your products")}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d9dbe0] p-4 text-center">
              <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("No free products yet")}</p>
              <p className="mt-0.5 text-[12px] text-[#6b7280]">{tt("Publish a digital product at a price of 0, then pick it here.")}</p>
              <a href="/app/products/new?type=digital" className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white">{tt("New product")}</a>
            </div>
          ) : (
            <div role="listbox" aria-label={tt("Free product")} className="max-h-[240px] space-y-1 overflow-y-auto rounded-xl border border-[#e3e4e8] p-1">
              {products.map((p) => {
                const on = data.product_id === p.id
                return (
                  <button key={p.id} type="button" role="option" aria-selected={on} onClick={() => updateData({ product_id: p.id, product_title: p.title, product_thumbnail: p.thumbnail_url })} className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-150", on ? "bg-[#f2f2f4]" : "hover:bg-[#f7f7f8]")}>
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[#eceef1]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#1a1a2e]">{p.title}</span>
                    {on ? <Check aria-hidden className="h-4 w-4 shrink-0 text-[#1a1a2e]" /> : null}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[12px] text-[#6b7280]">{tt("They get a download link by email, good for 30 days.")}</p>
        </div>
      ) : null}

      {kind === "discount" ? (
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Code")}</Label>
          {coupons === null ? (
            <div className="flex h-12 items-center gap-2 rounded-xl border border-[#e3e4e8] px-3 text-[13px] text-[#6b7280]">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {tt("Loading your codes")}
            </div>
          ) : coupons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d9dbe0] p-4 text-center">
              <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("No codes yet")}</p>
              <a href="/app/coupons" className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white">{tt("New code")}</a>
            </div>
          ) : (
            <div role="listbox" aria-label={tt("Code")} className="max-h-[240px] space-y-1 overflow-y-auto rounded-xl border border-[#e3e4e8] p-1">
              {coupons.map((c) => {
                const on = data.coupon_id === c.id
                return (
                  <button key={c.id} type="button" role="option" aria-selected={on} onClick={() => updateData({ coupon_id: c.id, coupon_label: couponText(c) })} className={cn("flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors duration-150", on ? "bg-[#f2f2f4]" : "hover:bg-[#f7f7f8]")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13.5px] font-semibold text-[#1a1a2e]">{c.code}</span>
                      <span className="block truncate text-[12px] text-[#6b7280]">{[couponText(c), c.is_active === false ? tt("Off") : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {on ? <Check aria-hidden className="h-4 w-4 shrink-0 text-[#1a1a2e]" /> : null}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[12px] text-[#6b7280]">{tt("The code shows only after they give their email. It is never in your page.")}</p>
        </div>
      ) : null}

      {kind === "waitlist" ? (
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Waiting for")}</Label>
          <Input value={data.waitlist_name || ""} maxLength={80} placeholder={tt("My next course")} onChange={(e) => updateData({ waitlist_name: e.target.value })} />
          <p className="text-[12px] text-[#6b7280]">{tt("Kept with each signup in Leads, so you can email them when it opens.")}</p>
        </div>
      ) : null}

      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title")}</Label>
        <Input value={data.title ?? ""} maxLength={60} placeholder={MAGNET_WORD[kind]()} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Text (optional)")}</Label>
        <Input value={data.description ?? ""} maxLength={140} onChange={(e) => updateData({ description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Button")}</Label>
          <Input value={data.button_text ?? ""} maxLength={24} placeholder={tt(leadMagnetButton(kind))} onChange={(e) => updateData({ button_text: e.target.value })} />
        </div>
        {kind !== "discount" ? (
          <div className={fieldBox}>
            <Label className={fieldLabel}>{tt("After signing up")}</Label>
            <Input value={data.success_message ?? ""} maxLength={100} onChange={(e) => updateData({ success_message: e.target.value })} />
          </div>
        ) : null}
      </div>
      {/* Round AN: the editor's one switch, not a bare checkbox. */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Ask for a first name")}</span>
        <Switch label={tt("Ask for a first name")} checked={!!data.ask_name} onChange={(ask_name) => updateData({ ask_name })} />
      </div>
      <p className="text-[12px] text-[#6b7280]">{tt("Everyone who signs up joins Emails, Subscribers and your connected email tools.")}</p>
    </div>
  )
}

function PostsEditor({ data, updateData }: { data: SocialPostsBlockData; updateData: (u: Partial<SocialPostsBlockData>) => void }) {
  const part = useBlockPart()
  const [thumbnailPost, setThumbnailPost] = React.useState("")
  const network = (["youtube", "instagram", "tiktok"] as const).includes(data.network) ? data.network : "youtube"
  const urls = Array.isArray(data.post_urls) ? data.post_urls : []
  const [text, setText] = React.useState(urls.join("\n"))
  const valid = pastedPosts({ post_urls: text.split(/\s+/), network })
  const bad = text.split(/\s+/).filter((u) => u.trim() && !socialPost(u)).length
  /* A block from before posts were picked by hand: its channel is no longer read, so it says so until posts are pasted. */
  const oldChannel = network === "youtube" && !!data.channel_url?.trim() && urls.length === 0
  const shown = data.presentation || "native"
  const settingsHalf = (
    <div className="space-y-4" data-posts-settings="">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Network")}</Label>
        <Segmented<SocialPostsNetwork> label={tt("Network")} value={network} options={[{ id: "youtube", label: "YouTube" }, { id: "instagram", label: "Instagram" }, { id: "tiktok", label: "TikTok" }]} onChange={(v) => updateData({ network: v })} />
      </div>
      {oldChannel ? (
        <p className="rounded-xl bg-[#f6f6f7] p-3 text-[12.5px] leading-relaxed text-[#4b5563]" data-posts-old-channel="">
          {tt("Videos no longer come from your channel by themselves. Paste the ones you want to show.")}
        </p>
      ) : null}
      <div className={fieldBox} data-posts-paste="">
        <Label className={fieldLabel}>{network === "youtube" ? tt("Video links (optional, one a line)") : network === "instagram" ? tt("Post and reel links (optional, one a line)") : tt("TikTok links (optional, one a line)")}</Label>
        <Textarea
          value={text}
          rows={4}
          spellCheck={false}
          placeholder={network === "instagram" ? "https://www.instagram.com/p/..." : network === "tiktok" ? "https://www.tiktok.com/@you/video/..." : "https://youtu.be/..."}
          onChange={(e) => {
            setText(e.target.value)
            updateData({ post_urls: e.target.value.split(/\s+/).map((u) => u.trim()).filter(Boolean).slice(0, 24) })
          }}
        />
        <p className={cn("text-[12px]", bad ? "text-[#b42318]" : "text-[#6b7280]")}>
          {bad ? tt("{count, plural, one {# link is not a post} other {# links are not posts}}", { count: bad }) : tt("{count, plural, one {# post} other {# posts}}", { count: valid.length })}
        </p>
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title (optional)")}</Label>
        <Input value={data.title ?? ""} maxLength={60} placeholder={tt("Latest posts")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      {urls.length ? (
        <div className="space-y-2" data-posts-covers="">
          <div className={fieldBox}>
            <Label className={fieldLabel}>{tt("Cover picture")}</Label>
            <EditorSelect
              name="posts-cover"
              title={tt("Choose a post")}
              value={thumbnailPost || null}
              emptyLabel={tt("Choose a post")}
              choices={Array.from(new Set(urls)).map((url, i) => ({ value: url, label: tt("Post {n}", { n: i + 1 }), detail: url.replace(/^https?:\/\/(www\.)?/, "") }))}
              onChange={setThumbnailPost}
            />
          </div>
          {/* Round AP: the editor's picture row, as a shelf's custom thumbnail is (above). */}
          {thumbnailPost ? (
            <OnePageImageField
              key={thumbnailPost}
              prefix="cover_post"
              value={data.thumbnails?.[thumbnailPost] || null}
              onChange={(url) => {
                const { [thumbnailPost]: _was, ...rest } = data.thumbnails ?? {}
                updateData({ thumbnails: url ? { ...rest, [thumbnailPost]: url } : rest, ...(network === "instagram" && url && shown === "native" ? { presentation: "card" as const } : {}) })
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
  const layoutHalf = (
    <div className="space-y-5" data-posts-layout="">
      <div className="space-y-2.5">
        <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Show as")}</p>
        <Segmented
          label={tt("Show as")}
          value={shown}
          options={[
            { id: "native", label: tt("Embed") },
            { id: "card", label: tt("Card") },
            { id: "tile", label: tt("Media tile") },
          ]}
          onChange={(presentation) => updateData({ presentation: presentation as SocialPostsBlockData["presentation"] })}
        />
      </div>
      <div className="space-y-2.5">
        <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Arrange")}</p>
        <Segmented
          label={tt("Arrange")}
          value={data.layout || "carousel"}
          options={[
            { id: "carousel", label: tt("Carousel") },
            { id: "grid", label: tt("Grid") },
            { id: "list", label: tt("List") },
            { id: "single", label: tt("Single") },
          ]}
          onChange={(layout) => updateData({ layout: layout as SocialPostsBlockData["layout"] })}
        />
      </div>
      {shown !== "native" ? (
        <div className="space-y-4 border-t border-[#eef0f2] pt-4">
          <Segmented
            label={tt("Picture shape")}
            value={data.aspect || "auto"}
            options={(["auto", "1/1", "4/5", "16/9", "9/16"] as const).map((a) => ({ id: a, label: a === "auto" ? tt("Auto") : a.replace("/", ":") }))}
            onChange={(aspect) => updateData({ aspect: aspect as SocialPostsBlockData["aspect"] })}
          />
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Fade at the bottom")}</span>
            <Switch label={tt("Fade at the bottom")} checked={data.fade !== false} onChange={(fade) => updateData({ fade })} />
          </div>
        </div>
      ) : null}
    </div>
  )
  if (part === "settings") return settingsHalf
  if (part === "layout") return layoutHalf
  return (
    <div className="space-y-5">
      {settingsHalf}
      {layoutHalf}
    </div>
  )
}

function FollowersEditor({ data, updateData }: { data: FollowersBlockData; updateData: (u: Partial<FollowersBlockData>) => void }) {
  const entries = Array.isArray(data.networks) ? data.networks : []
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const set = (network: string, patch: Partial<FollowerEntry>) => updateData({ networks: entries.map((e) => (e.network === network ? { ...e, ...patch } : e)) })
  const unused = FOLLOWER_NETWORKS.filter((n) => !entries.some((e) => e.network === n))
  /* `list`: the networks as they are about to be (a network just added is not in `entries` yet). */
  const refresh = async (e: FollowerEntry, list: FollowerEntry[] = entries) => {
    setBusy(e.network)
    setNote(null)
    try {
      const r = await fetch("/api/onepage/followers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ network: e.network, handle: e.handle }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setNote(typeof d?.error === "string" ? d.error : tt("That could not be read. Type the number instead."))
      else updateData({ networks: list.map((x) => (x.network === e.network ? { ...x, count: d.count, refreshed_at: d.refreshed_at } : x)) })
    } finally {
      setBusy(null)
    }
  }
  /*
    Round AR3: one field first. Paste a profile link or type @handle; the
    network is read from the link (lib/onepage/storelib-blocks
    detectFollowerInput), its count is read at once where Storelib can, and
    where it cannot the number box says so.
  */
  const [quick, setQuick] = React.useState("")
  const [asking, setAsking] = React.useState<string | null>(null)
  const addFrom = (network: FollowerNetwork, handle: string) => {
    const entry: FollowerEntry = { network, handle, count: entries.find((x) => x.network === network)?.count ?? null }
    const next = [...entries.filter((x) => x.network !== network), entry]
    updateData({ networks: next })
    setQuick("")
    setAsking(null)
    if (handle && REFRESHABLE_NETWORKS.includes(network)) void refresh(entry, next)
  }
  const submitQuick = () => {
    const found = detectFollowerInput(quick)
    if (!found) return setNote(tt("Paste a profile link, or type @ and the account name."))
    setNote(null)
    if (found.network) addFrom(found.network, found.handle)
    else setAsking(found.handle)
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2" data-followers-quick="">
        <div className="flex gap-2">
          <Input
            value={quick}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            placeholder={tt("Paste a profile link or @handle")}
            aria-label={tt("Paste a profile link or @handle")}
            onChange={(ev) => { setQuick(ev.target.value); setAsking(null) }}
            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); submitQuick() } }}
          />
          <button type="button" onClick={submitQuick} disabled={!quick.trim()} className="h-11 shrink-0 rounded-xl bg-[#1a1a2e] px-4 text-[13.5px] font-medium text-white transition-opacity disabled:opacity-40">
            {tt("Add")}
          </button>
        </div>
        {asking !== null ? (
          <div className="space-y-1.5" data-followers-ask="">
            <p className="text-[12.5px] text-[#6b7280]">{tt("Which network is @{value} on?", { value: asking })}</p>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOWER_NETWORKS.map((n) => (
                <button key={n} type="button" onClick={() => addFrom(n, asking)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e3e4e8] bg-white px-3 text-[12.5px] font-medium text-[#1a1a2e] hover:border-[#c9cbd1]">
                  <SocialIcon platform={n} size={14} color="#1a1a2e" tone="brand" />
                  {NETWORK_NAME[n]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {entries.map((e) => {
        const canRefresh = REFRESHABLE_NETWORKS.includes(e.network)
        return (
          <div key={e.network} className="space-y-2 rounded-xl border border-[#e3e4e8] p-3">
            <div className="flex items-center gap-2">
              <SocialIcon platform={e.network} size={18} color="#1a1a2e" tone="brand" />
              <span className="flex-1 text-[13.5px] font-medium text-[#1a1a2e]">{NETWORK_NAME[e.network]}</span>
              <button type="button" aria-label={tt("Remove")} onClick={() => updateData({ networks: entries.filter((x) => x.network !== e.network) })} className="grid h-8 w-8 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f2f2f4] hover:text-[#1a1a2e]">
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_112px] gap-2">
              <Input value={e.handle || ""} maxLength={120} autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={e.network === "bluesky" ? "you.bsky.social" : e.network === "youtube" ? "@you" : tt("Account (optional)")} onChange={(ev) => set(e.network, { handle: ev.target.value.trim() })} />
              <Input value={typeof e.count === "number" ? String(e.count) : ""} inputMode="numeric" placeholder="12.5k" onChange={(ev) => set(e.network, { count: parseCount(ev.target.value) })} aria-label={tt("Followers")} />
            </div>
            {!canRefresh ? <p className="text-[12px] text-[#6b7280]" data-followers-manual="">{tt("{value} does not share follower counts with other sites. Type your number.", { value: NETWORK_NAME[e.network] })}</p> : null}
            {canRefresh ? (
              <button type="button" disabled={!e.handle || busy === e.network} onClick={() => refresh(e)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e3e4e8] px-2.5 text-[12.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] disabled:opacity-50">
                <RefreshCw aria-hidden className={cn("h-3.5 w-3.5", busy === e.network && "animate-spin")} />
                {tt("Read from {value}", { value: NETWORK_NAME[e.network] })}
              </button>
            ) : null}
          </div>
        )
      })}
      {note ? <p className="text-[12px] text-[#b42318]">{note}</p> : null}
      {/*
        Round AN (127.png): the networks, then what they are counted in. "Add a
        network" is Storelib's list, not the phone's wheel; the line about
        which counts refresh sits under the list it is about, short; Look and
        the word after the number each have a row of their own, named.
      */}
      {unused.length ? (
        <AddFromList
          name="followers-network"
          title={tt("Add a network")}
          label={tt("Add a network")}
          choices={unused.map((n) => ({ value: n, label: NETWORK_NAME[n], detail: REFRESHABLE_NETWORKS.includes(n) ? tt("Count updates itself") : undefined }))}
          leading={(c) => <SocialIcon platform={c.value} size={18} color="#1a1a2e" tone="brand" />}
          onPick={(n) => updateData({ networks: [...entries, { network: n as FollowerNetwork, handle: "", count: null }] })}
        />
      ) : null}
      <p className="text-[12.5px] leading-[1.4] text-[#6b7280]">{tt("Bluesky and YouTube counts update every few hours. Others stay as you type them.")}</p>
      <div className="space-y-4 border-t border-[#eef0f2] pt-4">
        <LabeledRow label={tt("Look")}>
          <Segmented label={tt("Look")} value={data.style === "card" ? "card" : "line"} options={[{ id: "line", label: tt("Line") }, { id: "card", label: tt("Card") }]} onChange={(v) => updateData({ style: v })} />
        </LabeledRow>
        <LabeledRow label={tt("Word after the number")} htmlFor="followers-word">
          <Input id="followers-word" value={data.label ?? ""} maxLength={24} placeholder={tt("followers")} onChange={(ev) => updateData({ label: ev.target.value })} />
        </LabeledRow>
      </div>
    </div>
  )
}

function PromoCodeEditor({ data, updateData }: { data: PromoCodeBlockData; updateData: (u: Partial<PromoCodeBlockData>) => void }) {
  const ok = !data.code?.trim() || promoCode(data.code) !== null
  /* Round AR: one of the store's own codes, or a code for another brand typed by hand. */
  const fromStore = !!data.coupon_id || (data as { code_source?: string }).code_source === "store"
  const [coupons, setCoupons] = React.useState<CouponRow[] | null>(null)
  React.useEffect(() => {
    if (!fromStore || coupons !== null) return
    let live = true
    fetch("/api/coupons")
      .then((r) => (r.ok ? r.json() : { coupons: [] }))
      .then((d) => live && setCoupons(Array.isArray(d?.coupons) ? d.coupons : []))
      .catch(() => live && setCoupons([]))
    return () => {
      live = false
    }
  }, [fromStore, coupons])
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#f4f4f6] p-1" role="radiogroup" aria-label={tt("Code")} data-promo-source="">
        {([
          ["store", tt("From your store")],
          ["typed", tt("Another brand's code")],
        ] as const).map(([id, label]) => {
          const on = (id === "store") === fromStore
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => updateData(id === "store" ? ({ code_source: "store" } as never) : ({ code_source: "typed", coupon_id: null } as never))} className={cn("h-9 rounded-lg text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150", on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}>
              {label}
            </button>
          )
        })}
      </div>
      {fromStore ? (
        <div className={fieldBox} data-promo-coupons="">
          <Label className={fieldLabel}>{tt("Code")}</Label>
          {coupons === null ? (
            <div className="flex h-12 items-center gap-2 rounded-xl border border-[#e3e4e8] px-3 text-[13px] text-[#6b7280]">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              {tt("Loading your codes")}
            </div>
          ) : coupons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d9dbe0] p-4 text-center">
              <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("No codes yet")}</p>
              <a href="/app/coupons" className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white">{tt("New code")}</a>
            </div>
          ) : (
            <div role="listbox" aria-label={tt("Code")} className="max-h-[240px] space-y-1 overflow-y-auto rounded-xl border border-[#e3e4e8] p-1">
              {coupons.map((c) => {
                const on = data.coupon_id === c.id
                return (
                  <button key={c.id} type="button" role="option" aria-selected={on} onClick={() => updateData({ coupon_id: c.id, code: c.code, ...(data.title?.trim() ? {} : { title: c.code }) })} className={cn("flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors duration-150", on ? "bg-[#f2f2f4]" : "hover:bg-[#f7f7f8]")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13.5px] font-semibold text-[#1a1a2e]">{c.code}</span>
                      {c.is_active === false ? <span className="block truncate text-[12px] text-[#6b7280]">{tt("Off")}</span> : null}
                    </span>
                    {on ? <Check aria-hidden className="h-4 w-4 shrink-0 text-[#1a1a2e]" /> : null}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[12px] text-[#6b7280]">{tt("Your page shows the code while it can be used, and hides the block once it is off, used up or ended.")}</p>
        </div>
      ) : (
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Code")}</Label>
        <Input value={data.code || ""} maxLength={40} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="ANNA15" onChange={(e) => updateData({ code: e.target.value.trim() })} aria-invalid={!ok || undefined} />
        {!ok ? <p className="text-[12px] text-[#b42318]">{tt("Letters, numbers and - _ . only, no spaces.")}</p> : null}
      </div>
      )}
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Title")}</Label>
        <Input value={data.title ?? ""} maxLength={60} placeholder={tt("15% off at Gymshark")} onChange={(e) => updateData({ title: e.target.value })} />
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Text (optional)")}</Label>
        <Input value={data.description ?? ""} maxLength={120} onChange={(e) => updateData({ description: e.target.value })} />
      </div>
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Where it is used (optional)")}</Label>
        <Input value={data.url || ""} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://" onChange={(e) => updateData({ url: e.target.value.trim() })} />
      </div>
    </div>
  )
}

/** The settings of one of the five, or null for another type. */
export function StorelibBlockEditor({ block, updateData }: { block: OnePageBlock; updateData: (updates: Partial<OnePageBlockData>) => void }) {
  const update = updateData as (u: object) => void
  switch (block.type) {
    case "storelib_shelf":
      return <ShelfEditor data={block.data as StorelibShelfBlockData} updateData={update} />
    case "lead_magnet":
      return <LeadMagnetEditor data={block.data as LeadMagnetBlockData} updateData={update} />
    case "social_posts":
      return <PostsEditor data={block.data as SocialPostsBlockData} updateData={update} />
    case "followers":
      return <FollowersEditor data={block.data as FollowersBlockData} updateData={update} />
    case "promo_code":
      return <PromoCodeEditor data={block.data as PromoCodeBlockData} updateData={update} />
    default:
      return null
  }
}
