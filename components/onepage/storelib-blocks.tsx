"use client"
import {VisualLinkCard} from "./block-presentation"
import { ColorRow, LabeledRow, Segmented, Switch } from "./editor-kit"
import { OnePageProductBlock } from "./product-block"
import { ProductLayoutThumb, layoutHasCard, layoutLabel, useCreatorProducts, type CreatorProduct } from "./tabs/product-block-editor"
import { OnePageImageField } from "@/components/onepage/image-field"
import type { ProductBlockData, ProductBlockStyle } from "@/lib/onepage/types"
import { useBlockPart } from "./block-part"
import { ArrangePicker, CardsInViewControl, EditorThemeContext, HowManyControl } from "./layout-pickers"
import { ChoiceMark } from "./choice-marks"
import { PRODUCT_LAYOUTS, productLayoutOf } from "@/lib/onepage/product-block"
import type { BlockPresentation } from "@/lib/onepage/block-presentation"
import {CompactInstagramPost} from "./compact-post"

/**
 * ===========================================================================
 *  STORELIB'S OWN THINGS ON THE ONEPAGE, AND THE CREATOR'S REACH
 * ===========================================================================
 * Round 40, the owner: "Let me show on the one page: online course,
 * membership, custom link, my Storelib community, physical products,
 * digital products, courses, ... lead magnet, referral", "more lead
 * magnets", "carousels of my social media posts that sync", and "show total
 * followers like Link Me". Five blocks, drawn by one component for the
 * editor's preview and the live page (through ./extra-blocks ExtraBlock and
 * ./creator-blocks CreatorBlock), their rules in
 * lib/onepage/storelib-blocks.ts:
 *
 *   SHELF        the creator's live products of one kind (digital, physical,
 *                courses, memberships, or all of them) or their public
 *                communities, read from Storelib each time the page is drawn
 *                (lib/onepage/storelib-blocks-server). Sliding cards or a list.
 *   LEAD MAGNET  a free download, a discount code or a waitlist, given for an
 *                email in a sheet that slides up (a window on a computer):
 *                the download is emailed (app/api/onepage/email-capture), the
 *                code is shown once the address is kept, never before
 *                (app/api/onepage/lead-magnet), the waitlist keeps its name
 *                with the lead.
 *   POSTS        a sliding row of a YouTube channel's latest videos (synced
 *                from its public feed every hour), or Instagram, TikTok and
 *                YouTube posts pasted by address. A video plays where it is,
 *                on a press.
 *   FOLLOWERS    "1.2M followers" summed over the creator's networks, each
 *                mark beside it; Bluesky and YouTube counts read again from
 *                the network, the others typed.
 *   CODE         a referral or discount code for another brand: the code, a
 *                Copy button and where it is used.
 *
 * Every size is the page's (px(n, scale)), every colour the page's theme,
 * so a block sits in the page it is on. Nothing moves while it arrives: a
 * shelf or a row of posts reserves its cards before they are read.
 */

import * as React from "react"
import dynamic from "next/dynamic"
import { buttonPadScale, pressableProps } from "@/lib/onepage/block-look"
import { teamStoreForProducts } from "@/lib/onepage/team-context"
import { Check, ChevronRight, Copy, Loader2, Play, RefreshCw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePageMoney } from "@/components/platform/price-currency"
import { createClient } from "@/lib/supabase/client"
import { platformHref } from "@/lib/onepage/return-address"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { pixelLead } from "@/lib/analytics/pixels"
import { tt } from "@/lib/i18n/text"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { GlyphEmail, GlyphProduct, GlyphSocial, GlyphStore, GlyphTestimonials, type Glyph } from "@/components/onepage/block-icons"
import { EmbedFrame } from "@/components/onepage/embed-frame"
import { tiktokPlayerUrl } from "@/lib/onepage/creator-blocks"
import {
  FOLLOWER_NETWORKS,
  REFRESHABLE_NETWORKS,
  SHELF_LIMIT_MAX,
  SHELF_SOURCES,
  compactCount,
  followerTotal,
  isStorelibBlock,
  leadMagnetButton,
  leadMagnetKind,
  leadMagnetReady,
  parseCount,
  pastedPosts,
  promoCode,
  shelfLimit,
  shelfPick,
  shelfPickedIds,
  shelfSource,
  shelfTakes,
  shelfUsesProductCards,
  socialPost,
  youtubeChannel,
  type FollowerEntry,
  type FollowerNetwork,
  type FollowersBlockData,
  type LeadMagnetBlockData,
  type LeadMagnetKind,
  type PromoCodeBlockData,
  type ShelfItem,
  type ShelfPick,
  type ShelfSource,
  type SocialPostItem,
  type SocialPostsBlockData,
  type SocialPostsNetwork,
  type StorelibShelfBlockData,
} from "@/lib/onepage/storelib-blocks"
import type { OnePageBlock, OnePageBlockData, OnePageTheme } from "@/lib/onepage/types"

type Scale = "small" | "normal" | "live"

export interface StorelibBlockLook {
  theme: OnePageTheme
  scale: Scale
  preview?: boolean
  sellerId?: string | null
  onepageId?: string | null
  button: React.CSSProperties
  /** Round 41: inside a group or a carousel, where a button keeps still. */
  still?: boolean
}

const k = (scale: Scale) => (scale === "small" ? 0.8 : 1)
const px = (n: number, scale: Scale) => `${Math.round(n * k(scale) * 10) / 10}px`
const radiusOf = (theme: OnePageTheme, max = 22) => Math.min(Number(theme.button_border_radius) || 0, max)

/* ─── The live fill, for the editor's preview ──────────────────────────── */

/**
 * THE PREVIEW ASKS FOR WHAT THE LIVE PAGE IS GIVEN. The live page's server
 * fills a shelf, a posts row and a follower count before it is sent
 * (lib/onepage/storelib-blocks-server); a draft in the editor's preview has
 * not been through it, so it asks /api/onepage/blocks-live for the same,
 * after the typing stops. A block that already has its items (the live
 * page) asks nothing.
 */
function useLiveData<T extends object>(block: OnePageBlock, look: StorelibBlockLook, has: (d: T) => boolean): { data: T; loading: boolean } {
  const data = block.data as unknown as T
  const need = !has(data) && !!look.sellerId
  const key = need ? JSON.stringify({ t: block.type, d: { ...(data as object), items: undefined } }) : ""
  const [answer, setAnswer] = React.useState<{ key: string; data: T } | null>(null)
  React.useEffect(() => {
    if (!need) return
    let live = true
    const t = window.setTimeout(() => {
      fetch("/api/onepage/blocks-live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seller_id: look.sellerId, blocks: [{ id: block.id, type: block.type, data: { ...(data as object), items: undefined } }] }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const got = d?.blocks?.[0]?.data
          if (live) setAnswer({ key, data: (got && typeof got === "object" ? got : { ...(data as object), items: [] }) as T })
        })
        .catch(() => live && setAnswer({ key, data: { ...(data as object), items: [] } as T }))
    }, 450)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!need) return { data, loading: false }
  if (answer && answer.key === key) return { data: answer.data, loading: false }
  /*
    Round AR: A SETTING CHANGED, THE PRODUCTS STAY. Every setting is part of the key, so changing a title or a
    layout asked again and drew the grey stand-ins until the answer came: the owner's product block that "hides,
    unhides and reveals again". What the last answer filled in stays, under the settings as they are now, until
    the new answer replaces it in place.
  */
  if (answer) {
    const now = Object.fromEntries(Object.entries(data as object).filter(([, v]) => v !== undefined))
    return { data: { ...(answer.data as object), ...now } as T, loading: false }
  }
  return { data, loading: true }
}

function BlockTitle({ text, look }: { text: string | null | undefined; look: StorelibBlockLook }) {
  if (!text?.trim()) return null
  return (
    <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
      {text}
    </p>
  )
}

/* ─── Shelf ─────────────────────────────────────────────────────────────── */

function priceLine(item: ShelfItem, money: (c: number) => string): string | null {
  if (item.kind === "community") return item.meta ?? null
  if (typeof item.price_cents !== "number") return null
  if (item.price_cents <= 0) return tt("Free")
  const p = money(item.price_cents)
  if (item.interval === "year") return tt("{value}/year", { value: p })
  if (item.interval === "month" || item.kind === "membership") return tt("{value}/month", { value: p })
  return p
}

/** A shelf carousel's card width for its cards in view (round AL); null keeps the width it always had. */
function shelfSlideWidth(view: StorelibShelfBlockData["carousel_view"], gap: number): string | null {
  switch (view) {
    case "1": return "100%"
    case "1.2": return "82%"
    case "1.5": return "64%"
    case "2": return `calc(50% - ${gap / 2}px)`
    default: return null
  }
}

function ShelfView({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  const money = usePageMoney()
  const { data, loading } = useLiveData<StorelibShelfBlockData>(block, look, (d) => Array.isArray(d.items))
  /* Round AP: picked products show every one picked, in the creator's order; otherwise as many as How many says. */
  const picked = shelfPickedIds(data)
  const limit = picked ? Math.max(1, picked.length) : shelfLimit(data.limit)
  const items = (data.items ?? []).slice(0, limit)
  const list = data.layout === "list"
  /* Plain cards two to a row; before the Layout tab offered it, Grid without product cards slid as a row. */
  const simpleGrid = data.layout === "grid"
  const radius = radiusOf(look.theme)
  if (!loading && items.length === 0) {
    /* The preview says why it is empty; the live page leaves it out (lib/onepage/storelib-blocks storelibBlockHasContent). */
    return look.preview ? (
      <div data-onepage-shelf="empty" className="w-full text-center" style={{ ...look.button, borderRadius: radius, padding: px(16, look.scale), fontSize: px(13, look.scale), opacity: 0.75 }}>
        {shelfSource(data.source) === "community" ? tt("No public community yet") : tt("Nothing published here yet")}
      </div>
    ) : null
  }
  const ghosts = loading ? Array.from({ length: Math.min(limit, list ? 3 : 4) }, (_, i) => i) : []
  return (
    <div data-onepage-shelf={shelfSource(data.source)} className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      <BlockTitle text={data.title} look={look} />
      {shelfSource(data.source) === "community" && data.layout === "featured" ? (
        /*
          ROUND AR: A COMMUNITY, FEATURED. One large card per community: its cover across the top, its name, its
          line (members, the price) and Join in the page's button colours, pressed like every card on the page.
        */
        <div className="flex flex-col" style={{ gap: px(10, look.scale) }} data-shelf-arrange="featured">
          {items.map((item) => (
            <a key={item.id} href={platformHref(item.href)} className="op-card flex w-full flex-col overflow-hidden no-underline transition-[scale] duration-150 active:scale-[0.99]" style={{ ...look.button, borderRadius: radius, padding: 0 }} data-community-card="">
              <span className="relative block w-full overflow-hidden bg-black/10" style={{ aspectRatio: "16 / 9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.image ? <img src={item.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : null}
              </span>
              <span className="flex items-center text-left" style={{ padding: px(14, look.scale), gap: px(12, look.scale) }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" style={{ fontSize: px(16, look.scale) }}>{item.title}</span>
                  {priceLine(item, money) ? <span className="mt-0.5 block truncate opacity-75" style={{ fontSize: px(13, look.scale) }}>{priceLine(item, money)}</span> : null}
                </span>
                <span className="inline-flex shrink-0 items-center rounded-full font-semibold" style={{ background: (look.button.color as string) || "#fff", color: (look.button.backgroundColor as string) || "#111", fontSize: px(13.5, look.scale), padding: `${px(8, look.scale)} ${px(16, look.scale)}` }}>
                  {tt("Join")}
                </span>
              </span>
            </a>
          ))}
          {ghosts.map((i) => (
            <span key={`g${i}`} aria-hidden className="block w-full animate-pulse motion-reduce:animate-none" style={{ ...look.button, borderRadius: radius, aspectRatio: "16 / 11", opacity: 0.5 }} />
          ))}
        </div>
      ) : shelfUsesProductCards(data) && shelfSource(data.source)!=="community" ? <div className={data.layout==="carousel"?"flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none]":data.layout==="grid"?"grid grid-cols-2 gap-3":"flex flex-col gap-3"}>
       {items.map(item=><div key={item.id} className={data.layout==="carousel"?"w-[85%] shrink-0 snap-start":"min-w-0"} style={data.layout==="carousel"&&shelfSlideWidth(data.carousel_view,12)?{width:shelfSlideWidth(data.carousel_view,12)!}:undefined}><OnePageProductBlock block={{id:`${block.id}:${item.id}`,type:"product",enabled:true,sort_order:0,data:{show_price:true,show_description:true,cta_text:tt("View product"),style:"callout",...data.product_settings,...data.product_overrides?.[item.id],product_id:item.id,product_title:item.title,product_thumbnail:item.image,product_slug:item.href.split('/').filter(Boolean).pop(),product_type:item.kind,product_price_cents:item.price_cents,product_variant_min_cents:item.variant_min_price_cents,product_variant_max_cents:item.variant_max_price_cents,product_variant_count:item.variant_count,product_single_variant_id:item.single_variant_id}}} theme={look.theme} quiet={look.still} inPair={data.layout==="grid"} seller={{name:"",avatarUrl:null}} pageMoney={money} plainText={s=>s?.replace(/<[^>]*>/g,'')||''} trackClick={()=>{}} animationClass="" quick={null}/></div>)}
      </div> : list ? (        <div className="flex flex-col" style={{ gap: px(8, look.scale) }}>
          {items.map((item) => (
            <a key={item.id} href={platformHref(item.href)} className="op-card flex w-full items-center no-underline transition-[scale] duration-150 active:scale-[0.99]" style={{ ...look.button, borderRadius: radius, padding: px(8, look.scale), gap: px(12, look.scale) }}>
              <span className="relative shrink-0 overflow-hidden bg-black/10" style={{ width: px(52, look.scale), height: px(52, look.scale), borderRadius: Math.max(radius - 6, 6) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.image ? <img src={item.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : null}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold" style={{ fontSize: px(14.5, look.scale) }}>{item.title}</span>
                {priceLine(item, money) ? <span className="mt-0.5 block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{priceLine(item, money)}</span> : null}
              </span>
              <ChevronRight aria-hidden className="shrink-0 opacity-60" style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
            </a>
          ))}
          {ghosts.map((i) => (
            <span key={`g${i}`} aria-hidden className="block w-full animate-pulse motion-reduce:animate-none" style={{ ...look.button, borderRadius: radius, height: px(68, look.scale), opacity: 0.5 }} />
          ))}
        </div>
      ) : (
        <div data-shelf-arrange={simpleGrid ? "grid" : "carousel"} className={simpleGrid ? "grid grid-cols-2" : "-mx-1 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"} style={{ gap: px(10, look.scale) }}>
          {items.map((item) => (
            <a key={item.id} href={platformHref(item.href)} className="op-card flex shrink-0 snap-start flex-col no-underline transition-[scale] duration-150 active:scale-[0.99]" style={{ ...look.button, width: simpleGrid ? "100%" : shelfSlideWidth(data.carousel_view, 10) ?? px(158, look.scale), minWidth: 0, borderRadius: radius, padding: px(6, look.scale) }}>
              <span className="relative block w-full overflow-hidden bg-black/10" style={{ aspectRatio: "1 / 1", borderRadius: Math.max(radius - 4, 6) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.image ? <img src={item.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : null}
              </span>
              <span className="block text-left" style={{ padding: `${px(8, look.scale)} ${px(4, look.scale)} ${px(4, look.scale)}` }}>
                <span className="line-clamp-2 block font-semibold leading-snug" style={{ fontSize: px(13.5, look.scale), minHeight: px(36, look.scale) }}>{item.title}</span>
                <span className="mt-1 block truncate opacity-75" style={{ fontSize: px(12.5, look.scale), minHeight: px(16, look.scale) }}>{priceLine(item, money) ?? ""}</span>
              </span>
            </a>
          ))}
          {ghosts.map((i) => (
            <span key={`g${i}`} aria-hidden className="block shrink-0 animate-pulse motion-reduce:animate-none" style={{ ...look.button, width: simpleGrid ? "100%" : px(158, look.scale), height: px(230, look.scale), borderRadius: radius, opacity: 0.5 }} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Lead magnet ───────────────────────────────────────────────────────── */

type MagnetDone = { code?: string | null; ended?: boolean; downloadLink?: string | null }

function magnetKey(onepageId: string | null | undefined, blockId: string) {
  return `onepage_magnet_${onepageId || "draft"}_${blockId}`
}

function readDone(key: string): MagnetDone | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || "null")
    return v && typeof v === "object" ? (v as MagnetDone) : null
  } catch {
    return null
  }
}

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)")
    const sync = () => setPhone(m.matches)
    sync()
    m.addEventListener("change", sync)
    return () => m.removeEventListener("change", sync)
  }, [])
  return phone
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CodeBox({ code, onDark = false }: { code: string; onDark?: boolean }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border border-dashed p-1.5 pl-4", onDark ? "border-white/40" : "border-black/25")} data-code-box="">
      <span className="min-w-0 flex-1 truncate font-mono text-[17px] font-semibold tracking-[0.06em]">{code}</span>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          }
        }}
        className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium transition-colors", onDark ? "bg-white text-[#111113]" : "bg-[#111113] text-white")}
      >
        {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
        {copied ? tt("Copied") : tt("Copy")}
      </button>
    </div>
  )
}

function LeadMagnetView({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  const data = block.data as LeadMagnetBlockData
  const kind = leadMagnetKind(data.kind)
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [company, setCompany] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<MagnetDone | null>(null)
  const shownAt = React.useRef(0)
  const storeKey = magnetKey(look.onepageId, block.id)
  React.useEffect(() => {
    if (!look.preview) setDone(readDone(storeKey))
  }, [storeKey, look.preview])
  React.useEffect(() => {
    if (open) shownAt.current = Date.now()
  }, [open])
  if (!leadMagnetReady(data)) return null

  const image = data.image_url || (kind === "download" ? data.product_thumbnail : null) || null
  const button = (data.button_text ?? "").trim() || tt(leadMagnetButton(kind))
  const press = pressableProps(look.theme, look.still)
  const radius = radiusOf(look.theme)
  const line = data.description?.trim() || (kind === "discount" && data.coupon_label ? tt("{value} with your email", { value: data.coupon_label }) : kind === "download" && data.product_title ? data.product_title : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    if (look.preview) {
      setError(tt("Signups work on your live page."))
      return
    }
    const address = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(tt("Enter a valid email address."))
      return
    }
    if (!look.onepageId) {
      setError(tt("This page is not published yet."))
      return
    }
    setError(null)
    setSending(true)
    const params = new URLSearchParams(window.location.search)
    const common = {
      onepage_id: look.onepageId,
      block_id: block.id,
      email: address,
      name: data.ask_name ? name.trim() || undefined : undefined,
      company,
      elapsed: Date.now() - shownAt.current,
      referrer: document.referrer || null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      origin: pageOrigin(),
    }
    try {
      const res = await fetch(kind === "download" ? "/api/onepage/email-capture" : "/api/onepage/lead-magnet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "download" ? { ...common, digital_product_id: data.product_id } : common),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof out?.error === "string" ? out.error : tt("That did not work. Try again."))
      const result: MagnetDone = { code: typeof out.code === "string" ? out.code : null, ended: out.ended === true, downloadLink: typeof out.downloadLink === "string" ? out.downloadLink : null }
      setDone(result)
      /* Round 41: the store's pixels hear the signup (lib/analytics/pixels pixelLead). */
      pixelLead(window, { form: "lead_magnet", eventId: typeof out.lead_id === "string" ? out.lead_id : null })
      try {
        window.localStorage.setItem(storeKey, JSON.stringify(result))
      } catch {
        /* a private window: it shows the form again next visit */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("That did not work. Try again."))
    } finally {
      setSending(false)
    }
  }

  const success =
    kind === "discount"
      ? done?.code
        ? null
        : tt("You are on the list. This code has ended, so watch your inbox for the next one.")
      : kind === "waitlist"
        ? (data.success_message ?? "").trim() || tt("You are on the list. We will email you first.")
        : (data.success_message ?? "").trim() || tt("Check your inbox. The download is on its way.")

  return (
    <>
      <button
        type="button"
        data-onepage-magnet={kind}
        onClick={() => setOpen(true)}
        /* Round 41: the page's button, its hover and size too (lib/onepage/block-look). */
        data-hover={press["data-hover"]}
        data-shadow={press["data-shadow"]}
        className={cn(press.className, "flex w-full items-center text-left")}
        style={{ ...press.style, borderRadius: radius, padding: px(10 * buttonPadScale(look.theme), look.scale), gap: px(12, look.scale) }}
      >
        {image ? (
          <span className="relative shrink-0 overflow-hidden bg-black/10" style={{ width: px(56, look.scale), height: px(56, look.scale), borderRadius: Math.max(radius - 6, 6) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1" style={{ paddingLeft: image ? 0 : px(6, look.scale) }}>
          <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{data.title || button}</span>
          {line ? <span className="mt-0.5 block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{line}</span> : null}
        </span>
        <span className="shrink-0 font-medium" style={{ fontSize: px(13, look.scale), padding: `0 ${px(6, look.scale)}` }}>
          {done ? <Check aria-hidden style={{ width: px(17, look.scale), height: px(17, look.scale) }} /> : button}
        </span>
      </button>
      <SheetDialog
        open={open}
        onClose={() => setOpen(false)}
        phone={phone}
        label={data.title || button}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex flex-col gap-0 overflow-hidden rounded-[20px] border-[#ececf1] bg-white p-0 sm:max-w-[440px]"
      >
        <div data-magnet-sheet={kind} className="flex flex-col gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6">
          {image ? (
            <span className="relative block w-full overflow-hidden rounded-2xl bg-[#f2f2f4]" style={{ aspectRatio: "16 / 9" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </span>
          ) : null}
          <div className="space-y-1">
            <SheetDialogTitle className="text-[20px] font-semibold leading-snug tracking-[-0.01em] text-[#111113]">{data.title || button}</SheetDialogTitle>
            {line ? <p className="text-[14.5px] leading-relaxed text-[#4b5563]">{line}</p> : null}
          </div>
          {done ? (
            <div role="status" className="space-y-3" data-magnet-done="">
              {kind === "discount" && done.code ? (
                <>
                  <p className="text-[14.5px] text-[#111113]">{tt("Your code")}</p>
                  <CodeBox code={done.code} />
                </>
              ) : (
                <p className="flex items-start gap-2 text-[15px] leading-relaxed text-[#111113]">
                  <Check aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                  {success}
                </p>
              )}
              {kind === "download" && done.downloadLink ? (
                <a href={done.downloadLink} className="flex h-12 items-center justify-center rounded-xl bg-[#111113] text-[15px] font-semibold text-white">
                  {tt("Download now")}
                </a>
              ) : null}
            </div>
          ) : (
            <form noValidate onSubmit={submit} className="flex flex-col gap-2.5">
              <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden value={company} onChange={(e) => setCompany(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" />
              {data.ask_name ? (
                <input aria-label={tt("First name")} placeholder={tt("First name")} autoComplete="given-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={sending} className="h-12 w-full rounded-xl border border-[#e3e4e8] bg-white px-4 text-[16px] text-[#111113] outline-none transition-[border-color,box-shadow] focus:border-[#111113] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.08)]" />
              ) : null}
              <input
                aria-label={tt("Email")}
                placeholder={tt("you@example.com")}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                disabled={sending}
                className="h-12 w-full rounded-xl border border-[#e3e4e8] bg-white px-4 text-[16px] text-[#111113] outline-none transition-[border-color,box-shadow] focus:border-[#111113] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.08)]"
              />
              {error ? <p role="alert" className="text-[13px] text-[#b42318]">{error}</p> : null}
              <button type="submit" disabled={sending} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#111113] text-[15px] font-semibold text-white transition-opacity disabled:opacity-60">
                {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                {button}
              </button>
              <p className="text-center text-[12px] text-[#9ca3af]">{tt("You join the email list. Leave any time.")}</p>
            </form>
          )}
        </div>
      </SheetDialog>
    </>
  )
}

/* ─── Social posts ─────────────────────────────────────────────────────── */

function PostSlide({ item, look }: { item: SocialPostItem; look: StorelibBlockLook }) {
  const [playing, setPlaying] = React.useState(false)
  const radius = Math.min(Math.max(radiusOf(look.theme), 10), 16)
  if (item.kind === "instagram") {
    return (
      <div className="shrink-0 snap-start" style={{ width: "100%" }}>
        <CompactInstagramPost src={`https://www.instagram.com/p/${item.id}/embed/`} title={tt("Instagram post")} radius={radius}/>
      </div>
    )
  }
  const tall = item.kind === "tiktok"
  const width = "100%"
  const src = item.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0&playsinline=1` : tiktokPlayerUrl(item.id)
  return (
    <div className="flex shrink-0 snap-start flex-col" style={{ width, gap: px(6, look.scale) }}>
      <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: tall ? "9 / 16" : "16 / 9", maxHeight: tall ? 380 : undefined, borderRadius: radius }}>
        {playing ? (
          <iframe title={item.title || (tall ? "TikTok" : "YouTube")} src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
        ) : (
          <button type="button" aria-label={tt("Play {value}", { value: item.title || (tall ? "TikTok" : "YouTube") })} onClick={() => setPlaying(true)} className="group absolute inset-0 grid h-full w-full cursor-pointer place-items-center">
            {item.thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#26262b] to-[#111113]">
                <SocialIcon platform={item.kind} size={28} color="#ffffff" />
              </span>
            )}
            <span className="relative grid place-items-center rounded-full bg-black/60 text-white transition-[scale] duration-150 group-active:scale-95" style={{ width: px(46, look.scale), height: px(46, look.scale) }}>
              <Play aria-hidden fill="currentColor" style={{ width: px(18, look.scale), height: px(18, look.scale), marginLeft: px(2, look.scale) }} />
            </span>
          </button>
        )}
      </div>
      {item.title ? (
        <p className="line-clamp-2 text-left leading-snug" style={{ color: look.theme.text_color, fontSize: px(12.5, look.scale) }}>
          {item.title}
        </p>
      ) : null}
    </div>
  )
}

/** A post drawn as a card or a media tile: the link card's own look (./block-presentation VisualLinkCard), so it matches a link block. */
function postCardLook(raw: SocialPostsBlockData, image: string | undefined): BlockPresentation {
  const aspect = raw.aspect && raw.aspect !== "auto" ? raw.aspect : undefined
  if (raw.presentation === "tile") return { variant: "tile", image_url: image, align: "left", overlay: 70, aspect, fade: raw.fade }
  return { variant: image ? "visual" : "compact", image_url: image, align: "left", overlay: 70, aspect, fade: raw.fade }
}

function PostsView({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  const raw = block.data as SocialPostsBlockData
  /* Pasted posts need no server unless a TikTok wants its picture or a channel is named. */
  const ready = (d: SocialPostsBlockData) => Array.isArray(d.items) || (!(d.network === "youtube" && youtubeChannel(d.channel_url)) && !pastedPosts(d).some((p) => p.kind === "tiktok"))
  const { data, loading } = useLiveData<SocialPostsBlockData>(block, look, ready)
  const items = Array.isArray(data.items) ? data.items : pastedPosts(raw)
  if (!loading && items.length === 0) return null
  const tall = raw.network === "tiktok"
  const cardish = raw.presentation === "card" || raw.presentation === "tile"
  return (
    <div data-onepage-posts={raw.network} className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      <BlockTitle text={raw.title} look={look} />
      <div className={raw.layout==="grid"?(cardish?"grid grid-cols-2 gap-3":"grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3"):raw.layout==="list"||raw.layout==="single"?"flex flex-col gap-3":"flex w-full snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"} style={{ gap: px(10, look.scale) }}>
        {loading
          ? [0, 1, 2].map((i) => <span key={i} aria-hidden className="block shrink-0 animate-pulse rounded-xl bg-[rgba(127,127,127,0.14)] motion-reduce:animate-none" style={{ width: "100%", maxHeight: tall || raw.network === "instagram" ? 380 : undefined, aspectRatio: tall ? "9 / 16" : raw.network === "instagram" ? "326 / 470" : "16 / 9" }} />)
          : (raw.layout==="single"?items.slice(0,1):items).map((item) => <div key={`${item.kind}:${item.id}`} className={raw.layout&&raw.layout!=="carousel"?(cardish?"min-w-0":"min-w-0 flex justify-center"):"w-full min-w-0 shrink-0 snap-start"}>
            {cardish?<VisualLinkCard block={{id:item.id,type:"link_button",enabled:true,sort_order:0,data:{url:item.url,label:item.title||item.kind},style:{presentation:postCardLook(raw,raw.thumbnails?.[item.url]||item.thumb||undefined)}}} theme={look.theme} onClick={()=>{}}/>:<PostSlide item={{...item,thumb:raw.thumbnails?.[item.url]||item.thumb}} look={look}/>} </div>)}
      </div>
    </div>
  )
}

/* ─── Followers ─────────────────────────────────────────────────────────── */

/* i18n-ignore-start: brand names. */
const NETWORK_NAME: Record<FollowerNetwork, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", twitter: "X", facebook: "Facebook", threads: "Threads", bluesky: "Bluesky", twitch: "Twitch", linkedin: "LinkedIn", pinterest: "Pinterest", snapchat: "Snapchat", spotify: "Spotify" }
/* i18n-ignore-end */

function FollowersView({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  const data = block.data as FollowersBlockData
  const counted = (data.networks || []).filter((e) => typeof e.count === "number" && e.count > 0)
  const total = followerTotal(data.networks)
  if (total <= 0) return null
  const label = (data.label ?? "").trim() || tt("followers")
  const color = look.theme.text_color
  if (data.style === "card") {
    return (
      <div data-onepage-followers="card" className="w-full text-center" style={{ ...look.button, borderRadius: radiusOf(look.theme), padding: `${px(14, look.scale)} ${px(16, look.scale)}` }}>
        <p className="font-bold tabular-nums tracking-[-0.02em]" style={{ fontSize: px(28, look.scale), lineHeight: 1.1 }}>
          {compactCount(total)}
        </p>
        <p className="opacity-75" style={{ fontSize: px(13, look.scale) }}>{label}</p>
        <div className="mt-2.5 flex flex-wrap items-center justify-center" style={{ gap: `${px(6, look.scale)} ${px(14, look.scale)}` }}>
          {counted.map((e) => (
            <span key={e.network} className="inline-flex items-center tabular-nums" style={{ gap: px(5, look.scale), fontSize: px(12.5, look.scale) }}>
              <SocialIcon platform={e.network === "twitter" ? "twitter" : e.network} size={px(14, look.scale)} color="currentColor" title={NETWORK_NAME[e.network]} />
              {compactCount(e.count as number)}
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <p data-onepage-followers="line" className="flex w-full flex-wrap items-center justify-center" style={{ color, fontSize: px(14, look.scale), gap: px(8, look.scale) }}>
      <span className="inline-flex items-center" style={{ gap: px(4, look.scale) }} aria-hidden>
        {counted.slice(0, 6).map((e) => (
          <SocialIcon key={e.network} platform={e.network} size={px(15, look.scale)} color="currentColor" />
        ))}
      </span>
      <span>
        <span className="font-semibold tabular-nums">{compactCount(total)}</span> {label}
      </span>
    </p>
  )
}

/* ─── Promo and referral codes ─────────────────────────────────────────── */

function PromoCodeView({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  const data = block.data as PromoCodeBlockData
  const code = promoCode(data.code)
  const [copied, setCopied] = React.useState(false)
  if (!code) return null
  let href: string | null = null
  try {
    href = data.url ? new URL(/^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`).toString() : null
  } catch {
    href = null
  }
  const radius = radiusOf(look.theme)
  return (
    <div data-onepage-code="" className="w-full" style={{ ...look.button, borderRadius: radius, padding: px(12, look.scale) }}>
      <div className="flex items-center" style={{ gap: px(10, look.scale) }}>
        <span className="min-w-0 flex-1 text-left" style={{ paddingLeft: px(4, look.scale) }}>
          <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{data.title || code}</span>
          {data.description?.trim() ? <span className="mt-0.5 block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{data.description}</span> : null}
        </span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium underline underline-offset-2" style={{ fontSize: px(13, look.scale) }}>
            {tt("Use it")}
          </a>
        ) : null}
      </div>
      <button
        type="button"
        data-code-copy=""
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          }
        }}
        className="mt-2.5 flex w-full items-center justify-between border border-dashed border-current/40 font-mono font-semibold tracking-[0.06em]"
        style={{ borderRadius: Math.max(radius - 4, 8), padding: `${px(10, look.scale)} ${px(14, look.scale)}`, fontSize: px(15, look.scale), borderColor: "color-mix(in srgb, currentColor 40%, transparent)" }}
      >
        <span className="truncate">{code}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-sans font-medium tracking-normal" style={{ fontSize: px(13, look.scale) }}>
          {copied ? <Check aria-hidden style={{ width: px(15, look.scale), height: px(15, look.scale) }} /> : <Copy aria-hidden style={{ width: px(15, look.scale), height: px(15, look.scale) }} />}
          {copied ? tt("Copied") : tt("Copy")}
        </span>
      </button>
    </div>
  )
}

/** Draws one of the five, or null for another type. */
export function StorelibBlock({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  switch (block.type) {
    case "storelib_shelf":
      return <ShelfView block={block} look={look} />
    case "lead_magnet":
      return <LeadMagnetView block={block} look={look} />
    case "social_posts":
      return <PostsView block={block} look={look} />
    case "followers":
      return <FollowersView block={block} look={look} />
    case "promo_code":
      return <PromoCodeView block={block} look={look} />
    default:
      return null
  }
}

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
      const synced = data.network === "youtube" && youtubeChannel(data.channel_url)
      return { title: data.title?.trim() || tt("Posts"), subtitle: synced ? tt("Latest videos, synced") : n ? tt("{count, plural, one {# post} other {# posts}}", { count: n }) : tt("Paste your posts"), icon: GlyphSocial }
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
    .select("id, title, thumbnail_url, price_cents, status, type")
    .eq("creator_id", (creator as { id: string }).id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(200)
  return ((data ?? []) as (FreeProduct & { price_cents: number | null; type: string | null })[]).filter((p) => !(p.price_cents && p.price_cents > 0) && (p.type ?? "digital") === "digital")
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
  const channelOk = !data.channel_url?.trim() || youtubeChannel(data.channel_url) !== null
  const shown = data.presentation || "native"
  const settingsHalf = (
    <div className="space-y-4" data-posts-settings="">
      <div className={fieldBox}>
        <Label className={fieldLabel}>{tt("Network")}</Label>
        <Segmented<SocialPostsNetwork> label={tt("Network")} value={network} options={[{ id: "youtube", label: "YouTube" }, { id: "instagram", label: "Instagram" }, { id: "tiktok", label: "TikTok" }]} onChange={(v) => updateData({ network: v })} />
      </div>
      {network === "youtube" ? (
        <div className={fieldBox}>
          <Label className={fieldLabel}>{tt("Your channel")}</Label>
          <Input value={data.channel_url || ""} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://www.youtube.com/@you" onChange={(e) => updateData({ channel_url: e.target.value.trim() })} aria-invalid={!channelOk || undefined} />
          <p className={cn("text-[12px]", channelOk ? "text-[#6b7280]" : "text-[#b42318]")}>{channelOk ? tt("Your latest videos show by themselves, checked every hour.") : tt("Paste your channel link, like youtube.com/@you.")}</p>
        </div>
      ) : (
        <p className="rounded-xl bg-[#f6f6f7] p-3 text-[12.5px] leading-relaxed text-[#4b5563]">
          {network === "instagram" ? tt("Instagram has no public feed to read, so paste the posts and reels you want to show.") : tt("Paste the TikToks you want to show. Each shows its cover and plays on a tap.")}
        </p>
      )}
      <div className={fieldBox}>
        <Label className={fieldLabel}>{network === "youtube" ? tt("Or pick videos (one link a line)") : tt("Post links (one a line)")}</Label>
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
  const refresh = async (e: FollowerEntry) => {
    setBusy(e.network)
    setNote(null)
    try {
      const r = await fetch("/api/onepage/followers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ network: e.network, handle: e.handle }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setNote(typeof d?.error === "string" ? d.error : tt("That could not be read."))
      else set(e.network, { count: d.count, refreshed_at: d.refreshed_at })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-3">
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
