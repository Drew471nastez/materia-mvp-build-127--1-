"use client"

/**
 * ===========================================================================
 *  THE APP BLOCKS ON THE PAGE: ONE RENDERER FOR EVERY SERVICE (round AL)
 * ===========================================================================
 * The owner, round AL: "Instagram, display your posts and Reels ... Multiple
 * ways to display, like how you display your content, classic, cards, grid,
 * carousel, profile, single ... Interaction, when a visitor clicks the
 * button, go to URL, display Instagram post ... The same with the TikTok."
 *
 * Every provider in lib/onepage/app-blocks is drawn here, by its shape and
 * the layout the creator picked:
 *
 *   classic     the page's own button, the service's mark at its left
 *   card        a card in the page's button colours: the mark on its round
 *               tile, a name, a line, and the button
 *   profile     the same card, centred, the mark (or the creator's picture)
 *               large, as a profile is
 *   featured    a picture (or the service's colour) with the name over it
 *   single      the post or player itself, in place, loaded lazily
 *   grid        a list (products, books, stats) two across
 *   carousel    a list, or several posts, sliding
 *
 * A tap does what the creator chose (Interaction): go to the address, or
 * open it in the block sheet (components/onepage/block-sheet useBlockSheet)
 * with the post, the player or the details in it and the button at its
 * foot. Where no sheet is drawn, a tap always goes to the address.
 *
 * Each tap is counted as the page's links are (app/api/onepage/track): the
 * block, or `<block>__<item>` for one item of a list (lib/onepage/link-keys
 * socialLinkId), which the block's own figures fold back in.
 */

import * as React from "react"
import { Check, ChevronRight, Copy, Download, Mail, Phone, Globe, MapPin, Star, Ticket } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { boxRadius, buttonPadScale, pressableProps } from "@/lib/onepage/block-look"
import { themeButtonStyle } from "@/lib/onepage/button-style"
import { getOrCreateSessionId, getOrCreateVisitorId } from "@/lib/analytics-utils"
import { socialLinkId } from "@/lib/onepage/link-keys"
import {
  appEmail,
  appEmbeds,
  appItems,
  appLayoutOf,
  appOpenModeOf,
  appRating,
  appStores,
  appTarget,
  contactVCard,
  isRetiredAppProvider,
  eventDay,
  itemHref,
  parseAppUrl,
  pollOptions,
  providerOf,
  tipService,
  upcomingEvents,
  type AppBlockData,
  type AppEmbed,
  type AppItem,
  type AppProvider,
  type AppProviderId,
} from "@/lib/onepage/app-blocks"
import { useBlockSheet } from "@/components/onepage/block-sheet"
import { EMBED_MAX_WIDTH, EmbedFrame } from "@/components/onepage/embed-frame"
import { noteTracked } from "@/components/onepage/block-activity"
import { CompactInstagramPost } from "@/components/onepage/compact-post"
import { AppMark, INSTAGRAM_FILL, isMulticolorMark, markOn } from "@/components/onepage/brand-icons"
import { APP_GLYPHS, RoundTile } from "@/components/onepage/block-icons"
import type { OnePageBlock, OnePageTheme } from "@/lib/onepage/types"
import { DataEventView, DataFeedList, DataPollView, DataReviewsView, DataStatsView, DataTipsView, DataPaidView } from "@/components/onepage/data-blocks"
import { tipModeOf } from "@/lib/onepage/tips"

type Scale = "small" | "normal" | "live"

export interface AppBlockLook {
  theme: OnePageTheme
  scale: Scale
  /** The editor's preview: nothing is counted there. */
  preview?: boolean
  onepageId?: string | null
  /** Round AR: the page's seller, for the editor's preview to ask for what the live page is given (app/api/onepage/blocks-live). */
  sellerId?: string | null
  /** Inside a group or a carousel, where a button keeps still. */
  still?: boolean
}

/* i18n-ignore-start: CSS values and the stores' own names. */
export const MIX: Record<number, string> = Object.fromEntries([10, 12, 14, 16, 35].map((n) => [n, `color-mix(in srgb, currentColor ${n}%, transparent)`]))
const STORE_NAME = { ios: "App Store", android: "Google Play" } as const
/* i18n-ignore-end */

const k = (scale: Scale) => (scale === "small" ? 0.8 : 1)
export const px = (n: number, scale: Scale) => `${Math.round(n * k(scale) * 10) / 10}px`

/* ─── Names and words ─────────────────────────────────────────────────── */

/** A provider's name: the service's own, or ours in the creator's language. */
export function appProviderName(id: AppProviderId): string {
  const p = providerOf({ provider: id })
  if (p.brand) return p.brand
  switch (id) {
    case "podcasts":
      return tt("Podcasts")
    case "whatsapp_group":
      return tt("WhatsApp group")
    case "books":
      return tt("Books")
    case "affiliate":
      return tt("Affiliate products")
    case "tips":
      return tt("Tips")
    case "mobile_app":
      return tt("Mobile app")
    case "events":
      return tt("Events")
    case "stats":
      return tt("Stats")
    case "poll":
      return tt("Poll")
    case "event":
      return tt("Event")
    case "paid":
      return tt("Paid access")
    case "reviews":
      return tt("Reviews")
    case "contact":
      return tt("Contact details")
    case "email":
      return tt("Email")
    default:
      return tt("Text and button")
  }
}

/** What the block's button says before the creator types their own. */
export function appDefaultButton(p: AppProvider): string {
  switch (p.id) {
    case "instagram":
    case "tiktok":
    case "x":
    case "threads":
    case "facebook":
    case "pinterest":
    case "reddit":
      return tt("Follow on {name}", { name: p.brand ?? "" })
    case "snapchat":
      return tt("Add me on Snapchat")
    case "twitch":
      return tt("Watch on Twitch")
    case "rss":
      return tt("Subscribe")
    case "cameo":
      return tt("Book a Cameo")
    case "google_reviews":
      return tt("Read reviews")
    case "audiomack":
    case "podcasts":
      return tt("Listen")
    case "typeform":
      return tt("Open the form")
    case "discord":
      return tt("Join the server")
    case "whatsapp_group":
      return tt("Join the group")
    case "bonfire":
    case "fourthwall":
      return tt("Shop now")
    case "books":
      return tt("Get the book")
    case "affiliate":
      return tt("Shop")
    case "tips":
      return tt("Send a tip")
    case "mobile_app":
      return tt("Get the app")
    case "events":
    case "event":
      return tt("Tickets")
    case "paid":
      return tt("Get access")
    case "contact":
      return tt("Save contact")
    case "email":
      return tt("Email me")
    default:
      return tt("Open")
  }
}

/* ─── Counting a tap ──────────────────────────────────────────────────── */

/** The page's own click count (as public-onepage trackClick), sent with keepalive so a link that leaves still counts. Nothing from the editor. */
export function useTrack(look: AppBlockLook) {
  const { onepageId, preview } = look
  return React.useCallback(
    (linkId: string, url: string) => {
      if (preview || !onepageId || typeof window === "undefined") return
      /* Round AN: said, so the page's one listener (./block-activity) does not count the same tap a second time. */
      noteTracked()
      try {
        void fetch("/api/onepage/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            onepage_id: onepageId,
            block_id: linkId,
            event_type: "click",
            url,
            href: window.location.href,
            session_id: getOrCreateSessionId() || undefined,
            visitor_id: getOrCreateVisitorId() || undefined,
          }),
        }).catch(() => {})
      } catch {
        /* A count is never worth an error on the page. */
      }
    },
    [onepageId, preview],
  )
}

/* ─── The mark ────────────────────────────────────────────────────────── */


/** The service's mark on its round tile: white (or near black) on the service's colour, a several coloured mark on white. */
export function AppTileMark({ provider, size, mark }: { provider: AppProvider; size: number; mark?: string | null }) {
  const key = mark || provider.mark
  const glyph = APP_GLYPHS[key]
  const multi = isMulticolorMark(key)
  const fill = provider.color === "instagram" ? INSTAGRAM_FILL : multi ? "#ffffff" : provider.color
  const ink = provider.color === "instagram" ? "#ffffff" : multi ? "#1a1a2e" : markOn(provider.color)
  const inner = Math.round(size * 0.5)
  return (
    <RoundTile color={fill} ink={ink} size={size} style={multi || provider.color === "#ffffff" ? { boxShadow: "inset 0 0 0 1px rgba(17,17,19,0.1)" } : undefined}>
      {glyph ? React.createElement(glyph, { style: { width: inner, height: inner } }) : <AppMark id={key} size={inner} color={ink} />}
    </RoundTile>
  )
}

/** A tip page's own mark (Ko-fi, PayPal...) when its address is one. */
const markFor = (data: AppBlockData) => (data.provider === "tips" ? tipService(data.url) : null)

/* ─── Frames ──────────────────────────────────────────────────────────── */

const noHost = () => () => {}
const readHost = () => (typeof window === "undefined" ? null : window.location.hostname)
const serverHost = () => null

/**
 * ONE POST OR PLAYER, IN THE SERVICE'S OWN FRAME, LAZILY. An embed the
 * embed block already knows (Instagram, X, Twitch, Typeform, Apple
 * Podcasts) goes through its frame (./embed-frame), which follows the
 * post's own height; any other is a frame of its fixed height or shape. A
 * frame that has not loaded after a while gives way to a card that opens the
 * address, so a blocked or missing post never leaves a blank box.
 */
export function AppEmbedView({ embed, href, title, radius, compact = false, fallback }: { embed: AppEmbed; href: string; title: string; radius: number; compact?: boolean; fallback: React.ReactNode }) {
  const host = React.useSyncExternalStore(noHost, readHost, serverHost)
  const [loaded, setLoaded] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    if (loaded || embed.embedKind) return
    const t = window.setTimeout(() => setFailed(true), 15000)
    return () => window.clearTimeout(t)
  }, [loaded, embed.embedKind])
  if (failed) return <>{fallback}</>
  let src = embed.src
  if (embed.embedKind === "twitch") {
    if (!host) return <div aria-hidden className="w-full" style={{ aspectRatio: "16 / 9" }} />
    src = `${src}&parent=${encodeURIComponent(host)}`
  }
  if (embed.embedKind === "instagram" && compact) return <CompactInstagramPost src={src} title={title} radius={radius} />
  if (embed.embedKind) {
    return <EmbedFrame src={src} kind={embed.embedKind} title={title} height={embed.height} resizes={!!embed.resizes} radius={radius} maxWidth={EMBED_MAX_WIDTH[embed.embedKind]} fillWidth={embed.embedKind === "x"} />
  }
  const tall = embed.aspect === "9 / 16"
  return (
    <div
      data-app-frame=""
      data-loaded={loaded ? "" : undefined}
      className={cn("relative mx-auto w-full overflow-hidden", tall ? "max-w-[340px]" : "max-w-[560px]")}
      style={{ borderRadius: radius, ...(embed.height ? { height: embed.height } : { aspectRatio: embed.aspect || "16 / 9" }) }}
    >
      {!loaded ? (
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/[0.04]">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-40 motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
        </span>
      ) : null}
      <iframe
        title={title}
        src={src}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={cn("absolute inset-0 h-full w-full border-0 transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
        data-href={href}
      />
    </div>
  )
}

/* ─── Pieces in the page's colours ───────────────────────────────────── */

export function useParts(look: AppBlockLook) {
  const surface = React.useMemo(() => themeButtonStyle(look.theme), [look.theme])
  const radius = boxRadius(look.theme)
  const press = pressableProps(look.theme, look.still)
  const pad = buttonPadScale(look.theme)
  /* A button on the card: the card's colours the other way round. */
  const ink = (surface.color as string) || look.theme.button_text_color || "#ffffff"
  const paper = (surface.backgroundColor as string) || look.theme.button_color || "#1a1a2e"
  return { surface, radius, press, pad, ink, paper }
}

export function CardButton({ label, look, onClick, href, wide = false }: { label: string; look: AppBlockLook; onClick?: (e: React.MouseEvent) => void; href?: string | null; wide?: boolean }) {
  const { ink, paper } = useParts(look)
  const cls = cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", wide && "w-full")
  const style: React.CSSProperties = { background: ink, color: paper, fontSize: px(13, look.scale), padding: `${px(8, look.scale)} ${px(14, look.scale)}`, minHeight: px(36, look.scale) }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls} style={style} data-app-cta="">
        {label}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={style} data-app-cta="">
      {label}
    </button>
  )
}

/* ─── The block ───────────────────────────────────────────────────────── */

export function AppBlock({ block, look }: { block: OnePageBlock; look: AppBlockLook }) {
  const data = (block.data ?? {}) as AppBlockData
  const provider = providerOf(data)
  if (isRetiredAppProvider(data.provider)) return <RetiredView block={block} data={data} look={look} />
  switch (provider.shape) {
    case "items":
      return appItems(data).length ? <ItemsView block={block} data={data} provider={provider} look={look} /> : <LinkView block={block} data={data} provider={provider} look={look} />
    case "events":
      return <EventsView block={block} data={data} provider={provider} look={look} />
    case "stats":
      /* Round AR: counted up into view, from typed or tracked numbers (./data-blocks). */
      return <DataStatsView block={block} data={data} look={look} />
    case "poll":
      /* Round AR: votes kept on the server, one each, with the totals after (./data-blocks). */
      return <DataPollView block={block} data={data} look={look} />
    case "event":
      return <DataEventView block={block} data={data} look={look} />
    case "paid":
      return <DataPaidView block={block} data={data} look={look} />
    case "review_wall":
      return <DataReviewsView block={block} data={data} look={look} />
    case "contact":
      return <ContactView block={block} data={data} provider={provider} look={look} />
    case "app":
      return <MobileAppView block={block} data={data} provider={provider} look={look} />
    case "email":
      return <EmailView block={block} data={data} provider={provider} look={look} />
    case "note":
      return <NoteView block={block} data={data} look={look} />
    default:
      /* Round AR: tips through Storelib checkout, and an RSS feed's latest posts under its card (./data-blocks). */
      if (provider.id === "tips" && tipModeOf(data) === "storelib") return <DataTipsView block={block} data={data} look={look} />
      if (provider.id === "rss")
        return (
          <>
            <LinkView block={block} data={data} provider={provider} look={look} />
            <DataFeedList block={block} data={data} look={look} />
          </>
        )
      return <LinkView block={block} data={data} provider={provider} look={look} />
  }
}

type ViewProps = { block: OnePageBlock; data: AppBlockData; provider: AppProvider; look: AppBlockLook }

/**
 * A SAVED FOURTHWALL OR BONFIRE BLOCK (round AR): the services are gone from
 * the sheet, and a block saved with one is drawn as the page's plain buttons,
 * its shop first and then each item with an address, with no service mark.
 */
function RetiredView({ block, data, look }: Omit<ViewProps, "provider">) {
  const track = useTrack(look)
  const parts = useParts(look)
  const shop = appTarget(data)?.href ?? parseAppUrl(data.url)?.toString() ?? null
  const host = shop ? new URL(shop).hostname.replace(/^www\./, "") : ""
  const links = [
    ...(shop ? [{ id: "shop", title: data.title?.trim() || data.button_text?.trim() || host, href: shop }] : []),
    ...appItems(data).map((i) => ({ id: i.id, title: i.title || "", href: itemHref(i) })).filter((i): i is { id: string; title: string; href: string } => !!i.href && !!i.title),
  ]
  if (!links.length) return null
  return (
    <div data-onepage-app="retired" className="flex w-full flex-col" style={{ gap: px(10, look.scale) }}>
      {links.map((l) => (
        <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => track(l.id === "shop" ? block.id : socialLinkId(block.id, l.id), l.href)} data-hover={parts.press["data-hover"]} data-shadow={parts.press["data-shadow"]} className={cn(parts.press.className, "flex w-full items-center justify-center font-medium")} style={{ ...parts.press.style, padding: `${px(14 * parts.pad, look.scale)} ${px(20, look.scale)}`, fontSize: px(15, look.scale) }}>
          <span className="op-label relative truncate" data-block-title={l.id === "shop" ? "" : undefined}>{l.title}</span>
        </a>
      ))}
    </div>
  )
}

/** The sheet's own light card for a page with nothing to embed: the mark, the name, the handle. */
function SheetSummary({ provider, data, handle, children }: { provider: AppProvider; data: AppBlockData; handle?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-6 text-center text-[#111113]" data-app-sheet-summary="">
      {data.image_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={data.image_url} alt="" className="h-20 w-20 rounded-full object-cover" />
      ) : (
        <AppTileMark provider={provider} size={72} mark={markFor(data)} />
      )}
      <div>
        <p className="text-[18px] font-semibold">{data.title?.trim() || appProviderName(provider.id)}</p>
        {handle || data.subtitle?.trim() ? <p className="mt-0.5 text-[14px] text-[#6b7280]">{data.subtitle?.trim() || handle}</p> : null}
      </div>
      {children}
    </div>
  )
}

/**
 * A PROFILE, A PAGE, A PLAYER: everything with one address. The layout says
 * how it is drawn; the Interaction what a tap does.
 */
function LinkView({ block, data, provider, look }: ViewProps) {
  const sheet = useBlockSheet()
  const track = useTrack(look)
  const parts = useParts(look)
  const target = appTarget(data)
  const embeds = React.useMemo(() => appEmbeds(data), [data])
  const layout = appLayoutOf(data)
  const mode = appOpenModeOf(data)
  const name = appProviderName(provider.id)
  const title = data.title?.trim() || target?.handle || name
  const line = data.subtitle?.trim() || (data.title?.trim() ? target?.handle : null) || null
  const button = data.button_text?.trim() || appDefaultButton(provider)
  const href = target?.href ?? null
  const rating = appRating(data.rating)
  if (!href) return null

  const sheetBody = () =>
    embeds.length ? (
      <div className="flex flex-col gap-4 py-2" data-app-sheet-embeds="">
        {embeds.map((e) => (
          <AppEmbedView key={e.embed.src} embed={e.embed} href={e.href} title={title} radius={12} fallback={<SheetSummary provider={provider} data={data} handle={target?.handle} />} />
        ))}
      </div>
    ) : (
      <SheetSummary provider={provider} data={data} handle={target?.handle}>
        {provider.shape === "reviews" && rating ? <Stars value={rating} count={data.reviews_count} color="#111113" scale="live" /> : null}
      </SheetSummary>
    )

  /* Go to the address, or open it in the sheet: the creator's choice, and always the address where no sheet is drawn. */
  const tap = (e: React.MouseEvent) => {
    track(block.id, href)
    if (mode === "sheet" && sheet.available) {
      e.preventDefault()
      sheet.open({
        blockId: block.id,
        title: name,
        body: sheetBody(),
        cta: { label: button, href },
        shareUrl: href,
        fill: embeds.length === 1 && provider.shape === "player",
      })
    }
  }

  const fallbackCard = <LinkCard {...{ provider, data, look, title, line, button, href, tap, parts }} />

  /*
    Round AR3, the owner: "the layouts of the TikTok block, some of them are not
    working at all ... single, carousel, profile card, classic". Single and
    Carousel used to fall back to the Card when the address was a profile with
    no post to play, so three of the five drew the same. Now Single without a
    post is the profile as one large card, and Carousel always slides: the
    posts, then the profile as its last card.
  */
  const spotlight = (
    <div data-onepage-app={provider.id} data-app-layout="single" data-app-spotlight="" className="flex w-full flex-col overflow-hidden" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(10, look.scale), gap: px(12, look.scale) }}>
      <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "4 / 3", borderRadius: Math.max(6, parts.radius - 6), background: provider.color === "instagram" ? INSTAGRAM_FILL : provider.color }}>
        {data.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={data.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <AppTileMark provider={provider} size={Math.round(72 * k(look.scale))} mark={markFor(data)} />
          </span>
        )}
      </span>
      <span className="min-w-0 px-1 text-left">
        <span className="block truncate font-semibold" style={{ fontSize: px(17, look.scale) }} data-block-title="">{title}</span>
        {line ? <span className="block truncate opacity-75" style={{ fontSize: px(13, look.scale) }}>{line}</span> : null}
      </span>
      <CardButton label={button} look={look} href={href} onClick={tap} wide />
    </div>
  )
  const profileSlide = (
    <div key="profile" data-app-profile-slide="" className="flex h-full flex-col items-center justify-center text-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: `${px(20, look.scale)} ${px(14, look.scale)}`, gap: px(10, look.scale), minHeight: px(220, look.scale) }}>
      {data.image_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={data.image_url} alt="" loading="lazy" className="rounded-full object-cover" style={{ width: px(56, look.scale), height: px(56, look.scale) }} />
      ) : (
        <AppTileMark provider={provider} size={Math.round(52 * k(look.scale))} mark={markFor(data)} />
      )}
      <span className="min-w-0 max-w-full">
        <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{title}</span>
        {line ? <span className="block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{line}</span> : null}
      </span>
      <CardButton label={button} look={look} href={href} onClick={tap} />
    </div>
  )

  if (layout === "single" || layout === "carousel") {
    const radius = Math.min(Math.max(parts.radius, 10), 16)
    if (layout === "single" && !embeds.length) return spotlight
    if (layout === "carousel") {
      const titled = !!data.title?.trim() && embeds.length > 0
      return (
        <div data-onepage-app={provider.id} data-app-layout="carousel" className="w-full">
          {titled ? <p className="mb-2 text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">{data.title}</p> : null}
          <div className="-mx-1 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {embeds.map((e) => (
              <div key={e.embed.src} className="w-[78%] max-w-[320px] shrink-0 snap-start">
                <AppEmbedView embed={e.embed} href={e.href} title={title} radius={radius} compact fallback={null} />
              </div>
            ))}
            <div className="w-[62%] max-w-[260px] shrink-0 snap-start">{profileSlide}</div>
          </div>
        </div>
      )
    }
    if (layout === "single") {
      return (
        <div data-onepage-app={provider.id} data-app-layout="single" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
          {data.title?.trim() ? <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">{data.title}</p> : null}
          <AppEmbedView embed={embeds[0].embed} href={embeds[0].href} title={title} radius={radius} compact fallback={fallbackCard} />
        </div>
      )
    }
  }

  if (layout === "classic") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={tap}
        data-onepage-app={provider.id}
        data-app-layout="classic"
        data-hover={parts.press["data-hover"]}
        data-shadow={parts.press["data-shadow"]}
        className={cn(parts.press.className, "relative flex w-full items-center justify-center font-medium")}
        style={{ ...parts.press.style, padding: `${px(14 * parts.pad, look.scale)} ${px(48, look.scale)}`, fontSize: px(15, look.scale) }}
      >
        <span className="absolute grid place-items-center" style={{ left: px(10, look.scale) }}>
          <AppTileMark provider={provider} size={Math.round(30 * k(look.scale))} mark={markFor(data)} />
        </span>
        <span className="op-label relative truncate">{data.title?.trim() || button}</span>
      </a>
    )
  }

  if (layout === "featured") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={tap}
        data-onepage-app={provider.id}
        data-app-layout="featured"
        className="relative block w-full overflow-hidden"
        style={{ borderRadius: parts.radius, aspectRatio: "16 / 10", background: provider.color === "instagram" ? INSTAGRAM_FILL : provider.color }}
      >
        {data.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={data.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center" style={{ color: isMulticolorMark(provider.mark) ? "#1a1a2e" : markOn(provider.color) }}>
            {provider.shape === "reviews" && rating ? (
              <span className="flex flex-col items-center gap-1">
                <span className="font-bold tabular-nums" style={{ fontSize: px(44, look.scale), lineHeight: 1 }}>{rating.toFixed(1)}</span>
                <Stars value={rating} count={data.reviews_count} color="currentColor" scale={look.scale} />
              </span>
            ) : (
              <AppTileMark provider={provider} size={Math.round(64 * k(look.scale))} mark={markFor(data)} />
            )}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.55))] text-left text-white" style={{ padding: px(14, look.scale), paddingTop: px(36, look.scale) }}>
          <span className="min-w-0">
            <span className="block truncate font-semibold" style={{ fontSize: px(16, look.scale) }} data-block-title="">{title}</span>
            {line ? <span className="block truncate opacity-85" style={{ fontSize: px(12.5, look.scale) }}>{line}</span> : null}
          </span>
          <ChevronRight aria-hidden className="shrink-0" style={{ width: px(18, look.scale), height: px(18, look.scale) }} />
        </span>
      </a>
    )
  }

  if (layout === "profile") {
    return (
      <div data-onepage-app={provider.id} data-app-layout="profile" className="flex w-full flex-col items-center text-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: `${px(20, look.scale)} ${px(16, look.scale)} ${px(16, look.scale)}`, gap: px(10, look.scale) }}>
        {data.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={data.image_url} alt="" loading="lazy" className="rounded-full object-cover" style={{ width: px(64, look.scale), height: px(64, look.scale) }} />
        ) : (
          <AppTileMark provider={provider} size={Math.round(56 * k(look.scale))} mark={markFor(data)} />
        )}
        <span className="min-w-0 max-w-full">
          <span className="block truncate font-semibold" style={{ fontSize: px(16, look.scale) }} data-block-title="">{title}</span>
          {line ? <span className="block truncate opacity-75" style={{ fontSize: px(13, look.scale) }}>{line}</span> : null}
        </span>
        <CardButton label={button} look={look} href={href} onClick={tap} wide />
      </div>
    )
  }

  return fallbackCard
}

type CardBits = { provider: AppProvider; data: AppBlockData; look: AppBlockLook; title: string; line: string | null; button: string; href: string; tap: (e: React.MouseEvent) => void; parts: ReturnType<typeof useParts> }

/** The card: the mark on its round tile, a name, a line and the button, in the page's button colours. */
function LinkCard({ provider, data, look, title, line, button, href, tap, parts }: CardBits) {
  const rating = provider.shape === "reviews" ? appRating(data.rating) : null
  return (
    <div data-onepage-app={provider.id} data-app-layout="card" className="flex w-full items-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(12, look.scale), gap: px(12, look.scale) }}>
      {data.image_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={data.image_url} alt="" loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: px(44, look.scale), height: px(44, look.scale) }} />
      ) : (
        <AppTileMark provider={provider} size={Math.round(44 * k(look.scale))} mark={markFor(data)} />
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{title}</span>
        {rating ? <Stars value={rating} count={data.reviews_count} color="currentColor" scale={look.scale} /> : line ? <span className="block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{line}</span> : null}
      </span>
      <CardButton label={button} look={look} href={href} onClick={tap} />
    </div>
  )
}

function Stars({ value, count, color, scale }: { value: number; count?: number | null; color: string; scale: Scale }) {
  return (
    <span className="mt-0.5 flex items-center" style={{ gap: px(3, scale), color, fontSize: px(12.5, scale) }} data-app-rating={value}>
      <span className="font-semibold tabular-nums">{value.toFixed(1)}</span>
      <span className="flex" aria-label={tt("{value} out of 5", { value: value.toFixed(1) })}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} aria-hidden fill={i <= Math.round(value) ? "#FBBC04" : "none"} stroke={i <= Math.round(value) ? "#FBBC04" : "currentColor"} style={{ width: px(13, scale), height: px(13, scale), opacity: i <= Math.round(value) ? 1 : 0.4 }} />
        ))}
      </span>
      {typeof count === "number" && count > 0 ? <span className="opacity-70 tabular-nums">({count})</span> : null}
    </span>
  )
}

/* ─── Lists: products, books, a shop's picks ─────────────────────────── */

function ItemsView({ block, data, provider, look }: ViewProps) {
  const sheet = useBlockSheet()
  const track = useTrack(look)
  const parts = useParts(look)
  const items = appItems(data)
  const layout = appLayoutOf(data)
  const mode = appOpenModeOf(data)
  const button = data.button_text?.trim() || appDefaultButton(provider)

  const tap = (item: AppItem, href: string | null) => (e: React.MouseEvent) => {
    if (href) track(socialLinkId(block.id, item.id), href)
    if (mode === "sheet" && sheet.available) {
      e.preventDefault()
      sheet.open({
        blockId: block.id,
        title: item.title || appProviderName(provider.id),
        body: (
          <div className="flex flex-col items-center gap-3 py-4 text-center text-[#111113]">
            {item.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.image_url} alt="" className="max-h-[50vh] w-auto max-w-full rounded-2xl object-contain" />
            ) : null}
            <p className="text-[18px] font-semibold">{item.title}</p>
            {item.note ? <p className="text-[14px] text-[#6b7280]">{item.note}</p> : null}
          </div>
        ),
        cta: href ? { label: button, href } : null,
        shareUrl: href,
      })
    }
  }

  /* Round AR3: Cover, Fit or Full (the picture's own shape) for the list's pictures. */
  const fit = data.image_fit === "contain" || data.image_fit === "full" ? data.image_fit : "cover"
  const picture = (item: AppItem, cls: string) =>
    item.image_url ? (
      fit === "full" && /aspect-/.test(cls) ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={item.image_url} alt="" loading="lazy" data-picture-fit="full" className={cn("block h-auto", cls.replace(/aspect-\S+/g, ""))} />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={item.image_url} alt="" loading="lazy" data-picture-fit={fit} className={cn("block", fit === "cover" ? "object-cover" : "object-contain", cls)} style={fit === "contain" ? { background: MIX[10] } : undefined} />
      )
    ) : (
      <span className={cn("grid place-items-center", cls)} style={{ background: MIX[10] }}>
        <AppTileMark provider={provider} size={Math.round(36 * k(look.scale))} />
      </span>
    )

  const heading = data.title?.trim() ? (
    <p className="mb-2 text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
      {data.title}
    </p>
  ) : null

  if (layout === "classic") {
    return (
      <div data-onepage-app={provider.id} data-app-layout="classic" className="flex w-full flex-col" style={{ gap: px(10, look.scale) }}>
        {heading}
        {items.map((item) => {
          const href = itemHref(item)
          return (
            <a key={item.id} href={href ?? undefined} target="_blank" rel="noopener noreferrer" onClick={tap(item, href)} data-hover={parts.press["data-hover"]} data-shadow={parts.press["data-shadow"]} className={cn(parts.press.className, "relative flex w-full items-center justify-center font-medium")} style={{ ...parts.press.style, padding: `${px(14 * parts.pad, look.scale)} ${px(52, look.scale)}`, fontSize: px(15, look.scale) }}>
              {item.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.image_url} alt="" loading="lazy" className="absolute rounded-md object-cover" style={{ left: px(8, look.scale), width: px(36, look.scale), height: px(36, look.scale) }} />
              ) : null}
              <span className="op-label relative truncate">{item.title}</span>
            </a>
          )
        })}
      </div>
    )
  }

  if (layout === "card") {
    return (
      <div data-onepage-app={provider.id} data-app-layout="card" className="flex w-full flex-col" style={{ gap: px(10, look.scale) }}>
        {heading}
        {items.map((item) => {
          const href = itemHref(item)
          return (
            <div key={item.id} className="flex items-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(10, look.scale), gap: px(12, look.scale) }}>
              {picture(item, "shrink-0 rounded-lg " + (look.scale === "small" ? "h-12 w-12" : "h-16 w-16"))}
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }}>{item.title}</span>
                {item.note ? <span className="block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{item.note}</span> : null}
              </span>
              {href ? <CardButton label={button} look={look} href={href} onClick={tap(item, href)} /> : null}
            </div>
          )
        })}
      </div>
    )
  }

  /* Grid (two across) and carousel (sliding, a little of the next showing). */
  const carousel = layout === "carousel"
  return (
    <div data-onepage-app={provider.id} data-app-layout={layout} className="w-full">
      {heading}
      <div className={carousel ? "-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "grid grid-cols-2"} style={{ gap: px(10, look.scale) }}>
        {items.map((item) => {
          const href = itemHref(item)
          return (
            <a key={item.id} href={href ?? undefined} target="_blank" rel="noopener noreferrer" onClick={tap(item, href)} className={cn("block overflow-hidden text-left", carousel && "w-[44%] shrink-0 snap-start")} style={{ ...parts.surface, borderRadius: parts.radius }} data-app-item={item.id}>
              {picture(item, provider.id === "books" ? "aspect-[2/3] w-full" : "aspect-square w-full")}
              <span className="block" style={{ padding: `${px(8, look.scale)} ${px(10, look.scale)} ${px(10, look.scale)}` }}>
                <span className="line-clamp-2 block font-semibold leading-snug" style={{ fontSize: px(13.5, look.scale) }}>{item.title}</span>
                {item.note ? <span className="mt-0.5 block truncate opacity-75" style={{ fontSize: px(12, look.scale) }}>{item.note}</span> : null}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Events and tours ────────────────────────────────────────────────── */

const noLocale = () => () => {}
const readLocale = () => (typeof navigator === "undefined" ? "en" : navigator.language || "en")
const serverLocale = () => "en"

function EventsView({ block, data, provider, look }: Omit<ViewProps, "provider"> & { provider: AppProvider }) {
  const track = useTrack(look)
  const parts = useParts(look)
  const locale = React.useSyncExternalStore(noLocale, readLocale, serverLocale)
  const events = upcomingEvents(appItems(data))
  const layout = appLayoutOf(data)
  const button = data.button_text?.trim() || appDefaultButton(provider)
  if (!events.length) return null
  const carousel = layout === "carousel"
  const card = layout === "card" || carousel
  return (
    <div data-onepage-app="events" data-app-layout={layout} className="w-full">
      {data.title?.trim() ? <p className="mb-2 text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">{data.title}</p> : null}
      <div className={carousel ? "-mx-1 flex snap-x snap-mandatory overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex flex-col"} style={{ gap: px(10, look.scale) }}>
        {events.map((ev) => {
          const day = eventDay(ev.date, locale)
          const href = ev.sold_out ? null : itemHref(ev)
          return (
            <div
              key={ev.id}
              data-app-event={ev.id}
              className={cn("flex items-center", carousel && "w-[80%] shrink-0 snap-start")}
              style={card ? { ...parts.surface, borderRadius: parts.radius, padding: px(12, look.scale), gap: px(12, look.scale) } : { ...parts.press.style, borderRadius: parts.radius, padding: `${px(10, look.scale)} ${px(12, look.scale)}`, gap: px(12, look.scale) }}
            >
              <span className="flex shrink-0 flex-col items-center justify-center rounded-xl text-center" style={{ width: px(46, look.scale), height: px(50, look.scale), background: MIX[12] }}>
                {day ? (
                  <>
                    <span className="font-semibold tracking-[0.04em] opacity-80" style={{ fontSize: px(10.5, look.scale) }}>{day.month}</span>
                    <span className="font-bold tabular-nums leading-none" style={{ fontSize: px(19, look.scale) }}>{day.day}</span>
                  </>
                ) : (
                  <Ticket aria-hidden style={{ width: px(18, look.scale), height: px(18, look.scale) }} />
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }}>{ev.title}</span>
                {ev.venue || ev.time ? (
                  <span className="flex items-center gap-1 truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>
                    {ev.venue ? <MapPin aria-hidden className="shrink-0" style={{ width: px(12, look.scale), height: px(12, look.scale) }} /> : null}
                    {/* Round AR: the time it starts, beside the place. */}
                    <span className="truncate">{[ev.time && /^\d{1,2}:\d{2}$/.test(ev.time) ? ev.time : null, ev.venue].filter(Boolean).join(" · ")}</span>
                  </span>
                ) : null}
              </span>
              {ev.sold_out ? (
                <span className="shrink-0 font-medium opacity-70" style={{ fontSize: px(12.5, look.scale) }}>{tt("Sold out")}</span>
              ) : href ? (
                <CardButton label={button} look={look} href={href} onClick={() => track(socialLinkId(block.id, ev.id), href)} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Round AR: Stats and the poll are drawn by ./data-blocks (DataStatsView, DataPollView). */

/* ─── Contact details ─────────────────────────────────────────────────── */

function saveVCard(name: string, text: string) {
  const blob = new Blob([text], { type: "text/vcard;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${(name || "contact").replace(/[^\w .-]+/g, "").trim() || "contact"}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ContactView({ block, data, provider, look }: ViewProps) {
  const sheet = useBlockSheet()
  const track = useTrack(look)
  const parts = useParts(look)
  const c = data.contact || {}
  const layout = appLayoutOf(data)
  const mode = appOpenModeOf(data)
  const email = appEmail(c.email)
  const site = parseAppUrl(c.website)
  const phone = (c.phone || "").replace(/[^\d+]/g, "")
  if (!c.name?.trim() || !(phone || email || site)) return null
  const button = data.button_text?.trim() || appDefaultButton(provider)
  const save = () => {
    track(block.id, "#vcard")
    saveVCard(c.name || "", contactVCard(c))
  }
  const rows = (
    <div className="flex w-full flex-col gap-2 text-left text-[15px] text-[#111113]" data-app-contact-rows="">
      {phone ? <a className="flex items-center gap-3 rounded-xl bg-[#f4f4f6] px-4 py-3" href={`tel:${phone}`}><Phone aria-hidden className="h-4 w-4 text-[#6b7280]" />{c.phone}</a> : null}
      {email ? <a className="flex items-center gap-3 rounded-xl bg-[#f4f4f6] px-4 py-3" href={`mailto:${email}`}><Mail aria-hidden className="h-4 w-4 text-[#6b7280]" />{email}</a> : null}
      {site ? <a className="flex items-center gap-3 rounded-xl bg-[#f4f4f6] px-4 py-3" href={site.toString()} target="_blank" rel="noopener noreferrer"><Globe aria-hidden className="h-4 w-4 text-[#6b7280]" />{site.hostname.replace(/^www\./, "")}</a> : null}
      {c.address?.trim() ? <p className="flex items-center gap-3 rounded-xl bg-[#f4f4f6] px-4 py-3"><MapPin aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />{c.address}</p> : null}
    </div>
  )
  const open = (e: React.MouseEvent) => {
    if (mode === "sheet" && sheet.available) {
      e.preventDefault()
      track(block.id, "#contact")
      sheet.open({
        blockId: block.id,
        title: appProviderName("contact"),
        body: (
          <SheetSummary provider={provider} data={{ ...data, title: c.name, subtitle: c.org }}>
            {rows}
          </SheetSummary>
        ),
        cta: { label: button, onClick: save, icon: <Download aria-hidden className="h-4 w-4" /> },
      })
      return
    }
    save()
  }
  if (layout === "classic") {
    return (
      <button type="button" onClick={open} data-onepage-app="contact" data-app-layout="classic" data-hover={parts.press["data-hover"]} data-shadow={parts.press["data-shadow"]} className={cn(parts.press.className, "relative flex w-full items-center justify-center gap-2 font-medium")} style={{ ...parts.press.style, padding: `${px(14 * parts.pad, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale) }}>
        <Download aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
        <span className="op-label relative truncate">{data.title?.trim() || button}</span>
      </button>
    )
  }
  const center = layout === "profile"
  return (
    <div data-onepage-app="contact" data-app-layout={layout} className={cn("flex w-full", center ? "flex-col items-center text-center" : "items-center")} style={{ ...parts.surface, borderRadius: parts.radius, padding: px(center ? 18 : 12, look.scale), gap: px(12, look.scale) }}>
      {data.image_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={data.image_url} alt="" loading="lazy" className="shrink-0 rounded-full object-cover" style={{ width: px(center ? 64 : 44, look.scale), height: px(center ? 64 : 44, look.scale) }} />
      ) : (
        <AppTileMark provider={provider} size={Math.round((center ? 56 : 44) * k(look.scale))} />
      )}
      <span className={cn("min-w-0", !center && "flex-1 text-left")}>
        <span className="block truncate font-semibold" style={{ fontSize: px(15.5, look.scale) }} data-block-title="">{c.name}</span>
        {c.org?.trim() ? <span className="block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{c.org}</span> : null}
      </span>
      <CardButton label={button} look={look} onClick={open} wide={center} />
    </div>
  )
}

/* ─── A mobile app ────────────────────────────────────────────────────── */

function StoreBadge({ store, href, onClick, scale }: { store: "ios" | "android"; href: string; onClick: () => void; scale: Scale }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} data-app-store={store} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" style={{ padding: `${px(8, scale)} ${px(12, scale)}`, minHeight: px(44, scale) }}>
      <AppMark id={store === "ios" ? "appstore" : "googleplay"} size={Math.round(20 * k(scale))} color="#ffffff" />
      <span className="flex flex-col text-left leading-tight">
        <span className="opacity-80" style={{ fontSize: px(9.5, scale) }}>{store === "ios" ? tt("Download on the") : tt("Get it on")}</span>
        <span className="font-semibold" style={{ fontSize: px(14, scale) }}>{STORE_NAME[store]}</span>
      </span>
    </a>
  )
}

function MobileAppView({ block, data, provider, look }: ViewProps) {
  const track = useTrack(look)
  const parts = useParts(look)
  const stores = appStores(data)
  const layout = appLayoutOf(data)
  if (!stores.ios && !stores.android) return null
  const badges = (
    <div className="flex w-full flex-wrap" style={{ gap: px(8, look.scale) }}>
      {stores.ios ? <StoreBadge store="ios" href={stores.ios} onClick={() => track(socialLinkId(block.id, "ios"), stores.ios!)} scale={look.scale} /> : null}
      {stores.android ? <StoreBadge store="android" href={stores.android} onClick={() => track(socialLinkId(block.id, "android"), stores.android!)} scale={look.scale} /> : null}
    </div>
  )
  const icon = data.image_url ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={data.image_url} alt="" loading="lazy" className="shrink-0 rounded-[22%] object-cover" style={{ width: px(56, look.scale), height: px(56, look.scale) }} />
  ) : (
    <AppTileMark provider={provider} size={Math.round(52 * k(look.scale))} />
  )
  if (layout === "classic") return <div data-onepage-app="mobile_app" data-app-layout="classic" className="w-full">{badges}</div>
  return (
    <div data-onepage-app="mobile_app" data-app-layout={layout} className={cn("flex w-full flex-col", layout === "featured" && "items-center text-center")} style={{ ...parts.surface, borderRadius: parts.radius, padding: px(14, look.scale), gap: px(12, look.scale) }}>
      <div className={cn("flex items-center", layout === "featured" ? "flex-col" : "")} style={{ gap: px(12, look.scale) }}>
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold" style={{ fontSize: px(16, look.scale) }} data-block-title="">{data.title?.trim() || appProviderName("mobile_app")}</span>
          {data.subtitle?.trim() ? <span className="block opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{data.subtitle}</span> : null}
        </span>
      </div>
      {badges}
    </div>
  )
}

/* ─── An email address ────────────────────────────────────────────────── */

function EmailView({ block, data, provider, look }: ViewProps) {
  const track = useTrack(look)
  const parts = useParts(look)
  const [copied, setCopied] = React.useState(false)
  const email = appEmail(data.email)
  if (!email) return null
  const button = data.button_text?.trim() || appDefaultButton(provider)
  const mail = `mailto:${email}`
  if (appLayoutOf(data) === "classic") {
    return (
      <a href={mail} onClick={() => track(block.id, mail)} data-onepage-app="email" data-app-layout="classic" data-hover={parts.press["data-hover"]} data-shadow={parts.press["data-shadow"]} className={cn(parts.press.className, "relative flex w-full items-center justify-center gap-2 font-medium")} style={{ ...parts.press.style, padding: `${px(14 * parts.pad, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale) }}>
        <Mail aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
        <span className="op-label relative truncate">{data.title?.trim() || button}</span>
      </a>
    )
  }
  return (
    <div data-onepage-app="email" data-app-layout="card" className="flex w-full items-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(12, look.scale), gap: px(12, look.scale) }}>
      <AppTileMark provider={provider} size={Math.round(44 * k(look.scale))} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold" style={{ fontSize: px(15, look.scale) }} data-block-title="">{data.title?.trim() || email}</span>
        {data.title?.trim() ? <span className="block truncate opacity-75" style={{ fontSize: px(12.5, look.scale) }}>{email}</span> : null}
      </span>
      <button
        type="button"
        aria-label={copied ? tt("Copied") : tt("Copy")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(email)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          } catch {
            /* No clipboard here: the Email button still works. */
          }
        }}
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: px(36, look.scale), height: px(36, look.scale), background: MIX[14] }}
      >
        {copied ? <Check aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} /> : <Copy aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />}
      </button>
      <CardButton label={button} look={look} href={mail} onClick={() => track(block.id, mail)} />
    </div>
  )
}

/* ─── Text and a button ───────────────────────────────────────────────── */

function NoteView({ block, data, look }: Omit<ViewProps, "provider">) {
  const track = useTrack(look)
  const parts = useParts(look)
  const href = parseAppUrl(data.url)?.toString() ?? null
  const label = data.button_text?.trim()
  if (!data.title?.trim() && !data.text?.trim()) return null
  const classic = appLayoutOf(data) === "classic"
  const words = (
    <>
      {data.title?.trim() ? <p className="font-semibold" style={{ fontSize: px(16, look.scale) }} data-block-title="">{data.title}</p> : null}
      {data.text?.trim() ? <p className="whitespace-pre-line opacity-85" style={{ fontSize: px(14, look.scale), lineHeight: 1.5 }}>{data.text}</p> : null}
    </>
  )
  const button =
    href && label ? (
      classic ? (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => track(block.id, href)} data-hover={parts.press["data-hover"]} data-shadow={parts.press["data-shadow"]} className={cn(parts.press.className, "flex w-full items-center justify-center font-medium")} style={{ ...parts.press.style, padding: `${px(14 * parts.pad, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale) }}>
          <span className="op-label relative truncate">{label}</span>
        </a>
      ) : (
        <CardButton label={label} look={look} href={href} onClick={() => track(block.id, href)} wide />
      )
    ) : null
  if (classic) {
    return (
      <div data-onepage-app="note" data-app-layout="classic" className="flex w-full flex-col text-center" style={{ color: look.theme.text_color, gap: px(10, look.scale) }}>
        {words}
        {button}
      </div>
    )
  }
  return (
    <div data-onepage-app="note" data-app-layout="card" className="flex w-full flex-col text-center" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(16, look.scale), gap: px(10, look.scale) }}>
      {words}
      {button}
    </div>
  )
}

/* ─── The block's row in the editor's list ────────────────────────────── */

/* One component per mark, made once, so a row's icon is the same component from render to render. */
const rowMarks = new Map<string, React.ComponentType<{ className?: string }>>()
function rowMark(key: string): React.ComponentType<{ className?: string }> {
  let G = rowMarks.get(key)
  if (!G) {
    const glyph = APP_GLYPHS[key]
    const M = ({ className }: { className?: string }) => (glyph ? React.createElement(glyph, { className }) : <AppMark id={key} size={19} color="#1a1a2e" tone="brand" className={className} />)
    M.displayName = `AppRowMark(${key})`
    G = M
    rowMarks.set(key, G)
  }
  return G
}

/** The title, the line under it and the icon an app block's row shows in the editor's list. */
export function appBlockRow(block: OnePageBlock): { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> } {
  const data = (block.data ?? {}) as AppBlockData
  const provider = providerOf(data)
  const name = appProviderName(provider.id)
  const target = appTarget(data)
  const icon = rowMark(markFor(data) || provider.mark)
  switch (provider.shape) {
    case "items":
    case "events":
    case "stats": {
      const n = appItems(data).length
      return { title: data.title?.trim() || name, subtitle: n ? tt("{count, plural, one {# item} other {# items}}", { count: n }) : tt("Add the first one"), icon }
    }
    case "poll":
      return { title: data.poll_question?.trim() || name, subtitle: name, icon }
    case "contact":
      return { title: data.contact?.name?.trim() || name, subtitle: name, icon }
    case "app":
      return { title: data.title?.trim() || name, subtitle: appStores(data).ios || appStores(data).android ? name : tt("Add a store address"), icon }
    case "email":
      return { title: data.title?.trim() || name, subtitle: appEmail(data.email) || tt("Add an email address"), icon }
    case "note":
      return { title: data.title?.trim() || data.text?.trim().slice(0, 40) || name, subtitle: name, icon }
    /* Round AR */
    case "event":
      return { title: data.title?.trim() || name, subtitle: data.event_start ? name : tt("Add the date"), icon }
    case "paid":
      return { title: data.title?.trim() || name, subtitle: data.paid_product_id ? name : tt("Choose the product that opens it"), icon }
    case "review_wall":
      return { title: data.title?.trim() || name, subtitle: name, icon }
    default:
      if (provider.id === "tips" && tipModeOf(data) === "storelib") return { title: data.title?.trim() || name, subtitle: tt("Through Storelib checkout"), icon }
      return { title: data.title?.trim() || target?.handle || name, subtitle: target ? name : tt("Add your {name} address", { name }), icon }
  }
}
