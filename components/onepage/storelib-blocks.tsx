"use client"
import { signupEmailReady } from "@/lib/onepage/email-signup"
import { VisualLinkCard } from "./block-presentation"
import { OnePageProductBlock } from "./product-block"
import { presentationOf, type BlockPresentation } from "@/lib/onepage/block-presentation"
import { blockIconLookOf } from "@/lib/onepage/social-look"
import { BlockMarkTile } from "./block-mark"
import { CompactInstagramPost } from "./compact-post"
import * as React from "react"
import { buttonPadScale, pressableProps } from "@/lib/onepage/block-look"
import { onCardButtonTheme } from "@/lib/onepage/button-style"
import { Check, ChevronRight, Copy, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePageMoney } from "@/components/platform/price-currency"
import { platformHref } from "@/lib/onepage/return-address"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { newLeadEventId, pixelLead } from "@/lib/analytics/pixels"
import { tt } from "@/lib/i18n/text"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { CardRatingLine } from "@/components/onepage/rating-stars"
import { tiktokPlayerUrl } from "@/lib/onepage/creator-blocks"
import { compactCount, followerTotal, leadMagnetButton, leadMagnetKind, leadMagnetReady, pastedPosts, promoCode, shelfLimit, shelfPickedIds, shelfSource, shelfUsesProductCards, type FollowerNetwork, type FollowersBlockData, type LeadMagnetBlockData, type PromoCodeBlockData, type ShelfItem, type SocialPostItem, type SocialPostsBlockData, type StorelibShelfBlockData } from "@/lib/onepage/storelib-blocks"
import type { OnePageBlock, OnePageTheme } from "@/lib/onepage/types"

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
  /* Round AR3: Cover, Fit or Full for the shelf's pictures, the plain cards and the product cards alike (product_settings.image_fit). */
  const shelfFit = (() => { const f = (block.data as StorelibShelfBlockData | undefined)?.product_settings?.image_fit; return f === "contain" || f === "full" ? f : "cover" })()
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
      ) : shelfUsesProductCards(data) && shelfSource(data.source)!=="community" ? <div className={data.layout==="carousel"?"op-rail flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden":data.layout==="grid"?"grid grid-cols-2 gap-3":"flex flex-col gap-3"}>
       {items.map(item=><div key={item.id} className={data.layout==="carousel"?"w-[85%] shrink-0 snap-start":"min-w-0"} style={data.layout==="carousel"&&shelfSlideWidth(data.carousel_view,12)?{width:shelfSlideWidth(data.carousel_view,12)!}:undefined}><OnePageProductBlock block={{id:`${block.id}:${item.id}`,type:"product",enabled:true,sort_order:0,data:{show_price:true,show_description:true,cta_text:tt("View product"),style:"callout",...data.product_settings,...data.product_overrides?.[item.id],product_id:item.id,product_title:item.title,product_thumbnail:item.image,product_slug:item.href.split('/').filter(Boolean).pop(),product_type:item.kind,product_price_cents:item.price_cents,product_variant_min_cents:item.variant_min_price_cents,product_variant_max_cents:item.variant_max_price_cents,product_variant_count:item.variant_count,product_single_variant_id:item.single_variant_id,product_rating:item.rating??null}}} theme={look.theme} quiet={look.still} inPair={data.layout==="grid"} seller={{name:"",avatarUrl:null}} pageMoney={money} plainText={s=>s?.replace(/<[^>]*>/g,'')||''} trackClick={()=>{}} animationClass="" quick={null}/></div>)}
      </div> : list ? (        <div className="flex flex-col" style={{ gap: px(8, look.scale) }}>
          {items.map((item) => (
            <a key={item.id} href={platformHref(item.href)} className="op-card flex w-full items-center no-underline transition-[scale] duration-150 active:scale-[0.99]" style={{ ...look.button, borderRadius: radius, padding: px(8, look.scale), gap: px(12, look.scale) }}>
              <span className="relative shrink-0 overflow-hidden bg-black/10" style={{ width: px(52, look.scale), height: px(52, look.scale), borderRadius: Math.max(radius - 6, 6) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.image ? <img src={item.image} alt="" loading="lazy" data-picture-fit={shelfFit === "cover" ? "cover" : "contain"} className={cn("absolute inset-0 h-full w-full", shelfFit === "cover" ? "object-cover" : "object-contain")} /> : null}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold" style={{ fontSize: px(14.5, look.scale) }}>{item.title}</span>
                <CardRatingLine rating={item.rating} className="mt-0.5" />
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
        <div data-shelf-arrange={simpleGrid ? "grid" : "carousel"} className={simpleGrid ? "grid grid-cols-2" : "op-rail flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"} style={{ gap: px(10, look.scale) }}>
          {items.map((item) => (
            <a key={item.id} href={platformHref(item.href)} className="op-card flex shrink-0 snap-start flex-col no-underline transition-[scale] duration-150 active:scale-[0.99]" style={{ ...look.button, width: simpleGrid ? "100%" : shelfSlideWidth(data.carousel_view, 10) ?? px(158, look.scale), minWidth: 0, borderRadius: radius, padding: px(6, look.scale) }}>
              <span className="relative block w-full overflow-hidden bg-black/10" data-picture-fit={shelfFit} style={{ aspectRatio: shelfFit === "full" && item.image ? undefined : "1 / 1", borderRadius: Math.max(radius - 4, 6) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.image ? <img src={item.image} alt="" loading="lazy" className={shelfFit === "full" ? "relative block h-auto w-full" : cn("absolute inset-0 h-full w-full", shelfFit === "cover" ? "object-cover" : "object-contain")} /> : null}
              </span>
              <span className="block text-left" style={{ padding: `${px(8, look.scale)} ${px(4, look.scale)} ${px(4, look.scale)}` }}>
                <span className="line-clamp-2 block font-semibold leading-snug" style={{ fontSize: px(13.5, look.scale), minHeight: px(36, look.scale) }}>{item.title}</span>
                <CardRatingLine rating={item.rating} className="mt-1" size={11} />
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
  const press = pressableProps(look.theme)
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
    if (!signupEmailReady(address)) {
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
    const leadId = newLeadEventId()
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
      /* The Lead's id, the same for the pixels below and the server's own Lead (lib/analytics/pixels newLeadEventId). */
      event_id: leadId,
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
      pixelLead(window, { form: "lead_magnet", eventId: typeof out.lead_id === "string" ? out.lead_id : leadId })
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
              {/* Changed on purpose (round AT): at full strength from the start; submit checks the address and shows the error above. */}
              <button type="submit" disabled={sending} data-email-ready={signupEmailReady(email) ? "" : undefined} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#111113] text-[15px] font-semibold text-white transition-opacity duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-45">
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
  /* Pasted posts need no server unless a TikTok wants its picture. Nothing is pulled from a profile or a channel. */
  const ready = (d: SocialPostsBlockData) => Array.isArray(d.items) || !pastedPosts(d).some((p) => p.kind === "tiktok")
  const { data, loading } = useLiveData<SocialPostsBlockData>(block, look, ready)
  const items = Array.isArray(data.items) ? data.items : pastedPosts(raw)
  if (!loading && items.length === 0) return null
  const tall = raw.network === "tiktok"
  const cardish = raw.presentation === "card" || raw.presentation === "tile"
  return (
    <div data-onepage-posts={raw.network} className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      <BlockTitle text={raw.title} look={look} />
      <div className={raw.layout==="grid"?(cardish?"grid grid-cols-2 gap-3":"grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3"):raw.layout==="list"||raw.layout==="single"?"flex flex-col gap-3":"op-rail flex snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"} style={{ gap: px(10, look.scale) }}>
        {loading
          ? [0, 1, 2].map((i) => <span key={i} aria-hidden className="block shrink-0 animate-pulse rounded-xl bg-[rgba(127,127,127,0.14)] motion-reduce:animate-none" style={{ width: "100%", maxHeight: tall || raw.network === "instagram" ? 380 : undefined, aspectRatio: tall ? "9 / 16" : raw.network === "instagram" ? "326 / 470" : "16 / 9" }} />)
          : (raw.layout==="single"?items.slice(0,1):items).map((item) => <div key={`${item.kind}:${item.id}`} className={raw.layout&&raw.layout!=="carousel"?(cardish?"min-w-0":"min-w-0 flex justify-center"):cardish?"w-[86%] min-w-0 shrink-0 snap-start":"w-full min-w-0 shrink-0 snap-start"}>
            {cardish?<VisualLinkCard block={{id:item.id,type:"link_button",enabled:true,sort_order:0,data:{url:item.url,label:item.title||item.kind},style:{presentation:postCardLook(raw,raw.thumbnails?.[item.url]||item.thumb||undefined)}}} theme={look.theme} onClick={()=>{}}/>:<PostSlide item={{...item,thumb:raw.thumbnails?.[item.url]||item.thumb}} look={look}/>} </div>)}
      </div>
    </div>
  )
}

/* ─── Followers ─────────────────────────────────────────────────────────── */

/* i18n-ignore-start: brand names. */
export const NETWORK_NAME: Record<FollowerNetwork, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", twitter: "X", facebook: "Facebook", threads: "Threads", bluesky: "Bluesky", twitch: "Twitch", linkedin: "LinkedIn", pinterest: "Pinterest", snapchat: "Snapchat", spotify: "Spotify" }
/* i18n-ignore-end */

function FollowersView({ block, look }: { block: OnePageBlock; look: StorelibBlockLook }) {
  const data = block.data as FollowersBlockData
  const counted = (data.networks || []).filter((e) => typeof e.count === "number" && e.count > 0)
  const total = followerTotal(data.networks)
  if (total <= 0) return null
  const label = (data.label ?? "").trim() || tt("followers")
  const color = look.theme.text_color
  /* Round 3: Layout › Icon style (components/onepage/block-mark). Original is each mark in the words' colour, no tile. */
  const iconLook = blockIconLookOf(presentationOf(block).icon_look)
  const mark = (network: string, size: number, title?: string) =>
    iconLook === "original" ? (
      <SocialIcon key={network} platform={network} size={px(size, look.scale)} color="currentColor" title={title} />
    ) : (
      <BlockMarkTile key={network} look={iconLook} size={Math.round((size + 12) * k(look.scale))} inner={Math.round(size * k(look.scale))} draw={(tone, inner) => <SocialIcon platform={network} size={inner} color="currentColor" tone={tone} title={title} />} />
    )
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
              {mark(e.network, 14, NETWORK_NAME[e.network])}
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
          mark(e.network, 15)
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
  /*
    Round AR: Copy is the page's button made to read on the code's card
    (lib/onepage/button-style onCardButtonTheme), with the page's fill,
    border, shadow and hover. It was a dashed box in the card's words
    whatever the page's buttons were.
  */
  const copyPress = pressableProps(onCardButtonTheme(look.theme))
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
        className={cn(copyPress.className, "mt-2.5 flex w-full items-center justify-between font-mono font-semibold tracking-[0.06em]")}
        data-hover={copyPress["data-hover"]}
        data-shadow={copyPress["data-shadow"]}
        style={{ ...copyPress.style, borderRadius: Math.max(radius - 4, Math.min(radius, 8)), padding: `${px(10, look.scale)} ${px(14, look.scale)}`, fontSize: px(15, look.scale) }}
      >
        {/* The code in a fixed width face; Copy in the page's own (round W9: font-sans drew it in Inter on every theme). */}
        <span className="truncate font-mono tracking-[0.06em]">{code}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium" style={{ fontSize: px(13, look.scale) }}>
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
