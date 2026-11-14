"use client"

/**
 * ===========================================================================
 *  THE ONEPAGE'S NEWER BLOCKS, DRAWN ONCE FOR THE EDITOR AND THE LIVE PAGE
 * ===========================================================================
 * The OnePage editor's phone preview (phone-preview.tsx) and the live page
 * (public-onepage.tsx) each carry their own copy of every block, and the
 * copies have drifted: a size here, a colour there, a block that shows in
 * one and not the other. The blocks in this file are drawn by ONE function,
 * `ExtraBlock`, which both of them call, so what the creator sees while
 * editing is what a visitor sees. Only the scale differs: the small phone
 * drawn beside the editor is 0.8 of a real phone, as the rest of that
 * preview is.
 *
 * What is here, after the features people use most on Linktree:
 *
 *   HEADING     a line of bold text between links, three sizes, to split a
 *               page into parts ("Shop", "Watch", "Work with me").
 *   FAQ         questions that open one at a time, by their own height.
 *   COUNTDOWN   days, hours, minutes and seconds to a date, then a line of
 *               your own once it has passed.
 *   MAP         a place on a map, with a button that opens it in the
 *               visitor's maps app.
 *   VIDEO       a YouTube, Vimeo or TikTok video that plays on the page. The
 *               player loads on the first press, so a page with a video on
 *               it opens as fast as one without.
 *
 * And two things any block can have (the editor's BlockExtras below):
 *
 *   SCHEDULE    a start and an end. Outside them the block is not on the
 *               page, and the editor says so on the block's row.
 *   SENSITIVE   on a link: a visitor is asked before it opens, as Linktree
 *               does for content some people would rather not see.
 *
 * Everything takes its colours and shape from the page's own theme (the
 * button colour, text colour, corner radius and style), so a new block looks
 * like it belongs to the page it is on.
 */

import { themeButtonStyle as pageButtonStyle } from "@/lib/onepage/button-style"
import { boxRadius, buttonPadScale, pressableProps } from "@/lib/onepage/block-look"
import { fontStack } from "@/lib/onepage/fonts"
import * as React from "react"
import { useSyncExternalStore } from "react"
import { ChevronDown, EyeOff, MapPin, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { scheduleLabel, videoAutoplays, videoEmbedUrl, videoSource } from "@/lib/onepage/extra-blocks"
import { mapEmbedSrc, mapPlaceOf } from "@/lib/onepage/map-place"
import { CreatorBlock } from "@/components/onepage/creator-blocks"
import { AppBlock } from "@/components/onepage/app-block"
import { FileVideoPlayer, MediaCard } from "@/components/onepage/media-blocks"
import { mediaLayoutOf } from "@/lib/onepage/media-layout"
import { GlyphContact, GlyphIntegration } from "@/components/onepage/block-icons"
import { EMBED_PROVIDER_NAME, MUSIC_PROVIDER_NAME, embedSource, musicSource, tiktokPlayerUrl, type EmbedKind } from "@/lib/onepage/creator-blocks"
import { SocialIcon } from "@/components/onepage/brand-icons"
import type { ContactFormBlockData, EmbedBlockData, MusicBlockData, CountdownBlockData, FaqBlockData, HeadingBlockData, MapBlockData, OnePageBlock, OnePageBlockData, OnePageTheme, VideoBlockData } from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"
import { blockInteraction, offersInteraction } from "@/lib/onepage/block-sheet"
import { BlockSheetButton } from "@/components/onepage/block-sheet-trigger"
import { FRAME_FADE_MS, frameFade, useFrameShown } from "@/components/onepage/embed-shell"

export { EXTRA_BLOCK_TYPES, extraBlockHasContent, isExtraBlock, isScheduledNow, scheduleLabel, videoSource, type ExtraBlockType } from "@/lib/onepage/extra-blocks"

/* ─── The page's look, shared by every block here ─────────────────────── */

type Scale = "small" | "normal" | "live"

export interface ExtraBlockLook {
  theme: OnePageTheme
  scale: Scale
  /** The editor's preview, where the page changes as the creator types. */
  preview?: boolean
  /** The page's creator (creators.id): where the contact block's messages go. */
  sellerId?: string | null
  /** The page (onepages.id): where a lead magnet's signups are kept (./storelib-blocks). */
  onepageId?: string | null
  /** Round 41: inside a group or a carousel, where a button keeps still as a link does there. */
  still?: boolean
}

/** The page's button, as the link blocks draw it (filled, outline or glass, its radius, border and shadow). */
export function themeButtonStyle(theme: OnePageTheme): React.CSSProperties {
  /* Round 41: the page's own rule (lib/onepage/button-style), not a second copy of it that could drift. */
  return pageButtonStyle(theme)
}

const k = (scale: Scale) => (scale === "small" ? 0.8 : 1)
const px = (n: number, scale: Scale) => `${Math.round(n * k(scale) * 10) / 10}px`

/* ─── Heading ──────────────────────────────────────────────────────────── */

const HEADING_SIZE: Record<HeadingBlockData["size"], number> = { small: 15, medium: 18, large: 22 }

function HeadingView({ data, look }: { data: HeadingBlockData; look: ExtraBlockLook }) {
  const text = (data.text ?? "").trim()
  if (!text) return null
  const t = look.theme as OnePageTheme & { title_color?: string | null; title_font?: string | null }
  return (
    <h2
      data-onepage-heading=""
      className="w-full font-bold leading-tight tracking-[-0.01em]"
      style={{
        fontSize: px(HEADING_SIZE[data.size] ?? 18, look.scale),
        color: t.title_color || look.theme.text_color,
        /* Round 41: Typography's title font, as the profile name has it. */
        fontFamily: t.title_font ? fontStack(t.title_font) : undefined,
        textAlign: data.alignment || "center",
        paddingTop: px(6, look.scale),
      }}
    >
      {text}
    </h2>
  )
}

/* ─── FAQ ──────────────────────────────────────────────────────────────── */

function FaqView({ data, look }: { data: FaqBlockData; look: ExtraBlockLook }) {
  const items = (data.items || []).filter((i) => (i.question || "").trim())
  const [open, setOpen] = React.useState<string | null>(null)
  if (items.length === 0) return null
  /* A box of several lines: the page's corners, short of an oval on a Pill page (lib/onepage/block-look boxRadius). */
  const button = { ...themeButtonStyle(look.theme), borderRadius: `${boxRadius(look.theme)}px` }
  return (
    <div data-onepage-faq="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      {items.map((item) => {
        const on = open === item.id
        return (
          <div key={item.id} className="op-card w-full overflow-hidden" style={button}>
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? null : item.id)}
              className="flex w-full cursor-pointer items-center gap-3 text-left font-medium outline-none"
              style={{ padding: `${px(14, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale), color: "inherit" }}
            >
              <span className="min-w-0 flex-1">{item.question}</span>
              <ChevronDown
                aria-hidden
                className={cn("shrink-0 transition-[rotate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", on && "rotate-180")}
                style={{ width: px(16, look.scale), height: px(16, look.scale) }}
              />
            </button>
            <div className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ease-[cubic-bezier(0.32,0.72,0,1)]", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden">
                <p
                  className={cn("whitespace-pre-line leading-relaxed transition-opacity duration-300 motion-reduce:transition-none", on ? "opacity-85" : "opacity-0")}
                  style={{ padding: `0 ${px(16, look.scale)} ${px(14, look.scale)}`, fontSize: px(14, look.scale) }}
                >
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Countdown ────────────────────────────────────────────────────────── */

/**
 * Ticks once a second, and only after the page is in the browser: the
 * server and the browser would read the clock a second apart, and the
 * numbers drawn first would not match. Until then the boxes hold dashes.
 */
function useNow(active: boolean) {
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

function CountdownView({ data, look }: { data: CountdownBlockData; look: ExtraBlockLook }) {
  const target = data.target_at ? Date.parse(data.target_at) : NaN
  const now = useNow(!Number.isNaN(target))
  if (Number.isNaN(target)) return null
  const left = now === null ? null : Math.max(0, target - now)
  const ended = left !== null && left <= 0
  const button = { ...themeButtonStyle(look.theme), borderRadius: `${boxRadius(look.theme)}px` }
  const parts = left === null
    ? [["--", "days"], ["--", "hrs"], ["--", "min"], ["--", "sec"]]
    : [
        [Math.floor(left / 86_400_000), "days"],
        [Math.floor((left % 86_400_000) / 3_600_000), "hrs"],
        [Math.floor((left % 3_600_000) / 60_000), "min"],
        [Math.floor((left % 60_000) / 1000), "sec"],
      ].map(([n, l]) => [String(n).padStart(2, "0"), l])
  return (
    <div data-onepage-countdown="" className="w-full text-center">
      {data.title?.trim() ? (
        <p className="mb-2 font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      {ended ? (
        <p className="font-medium" style={{ ...button, padding: `${px(14, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale) }}>
          {data.ended_text?.trim() || tt("It's here")}
        </p>
      ) : (
        <div className="grid grid-cols-4" style={{ gap: px(8, look.scale) }}>
          {parts.map(([n, l]) => (
            <div key={l} className="flex flex-col items-center" style={{ ...button, padding: `${px(10, look.scale)} 0` }}>
              <span className="font-bold tabular-nums leading-none" style={{ fontSize: px(22, look.scale) }}>{n}</span>
              <span className="mt-1 uppercase tracking-[0.06em] opacity-80" style={{ fontSize: px(10.5, look.scale) }}>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Map ──────────────────────────────────────────────────────────────── */

/** The value, once it has stopped changing for `ms`. The editor's map waits for the typing to stop. */
function useSettled<T>(value: T, ms: number, active: boolean): T {
  const [settled, setSettled] = React.useState(value)
  React.useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms, active])
  return active ? settled : value
}

/* Round AR3: the map block's own settings, how close and how tall (Google's z levels, CSS pixels). */
const MAP_HEIGHT: Record<string, number> = { short: 150, medium: 190, tall: 300 }

function MapView({ data, look }: { data: MapBlockData; look: ExtraBlockLook }) {
  const typed = (data.address || "").trim()
  /* In the editor the map follows the address once the typing stops, not on every letter: each change reloads the map. */
  const address = useSettled(typed, 700, !!look.preview)
  if (!typed) return null
  /* A typed address or a Google Maps link, short ones read once in the editor (lib/onepage/map-place). */
  const place = mapPlaceOf({ address: address || typed, place: data.place })
  const src = place ? mapEmbedSrc(place, data.zoom || "area") : null
  const openHref = place?.href ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(typed)}`
  /* Round 41: Open in Maps is the page's button, hover and size included (lib/onepage/block-look); the frame stops short of an oval. */
  const press = pressableProps(look.theme, look.still)
  const pad = buttonPadScale(look.theme)
  const radius = `${boxRadius(look.theme)}px`
  return (
    <div data-onepage-map="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      <div className="relative w-full overflow-hidden bg-black/5" data-map-height={data.map_height || "medium"} style={{ borderRadius: radius, height: px(MAP_HEIGHT[data.map_height || "medium"] ?? 190, look.scale) }}>
        {address && src ? (
          <iframe
            key={`${src}`}
            title={tt("Map of {address}", { address: place?.label || address })}
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full border-0"
          />
        ) : null}
      </div>
      {data.show_button !== false ? (
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          data-hover={press["data-hover"]}
          data-shadow={press["data-shadow"]}
          className={cn(press.className, "flex w-full items-center justify-center gap-2 font-medium")}
          style={{ ...press.style, padding: `${px(14 * pad, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale) }}
        >
          <MapPin aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
          <span className="op-label relative">{tt("Open in Maps")}</span>
        </a>
      ) : null}
    </div>
  )
}

/** A map in the sheet (round AS): the sheet's quiet fill until the map has loaded, then the map faded in over it. */
function MapSheetFrame({ title, src }: { title: string; src: string }) {
  const [shown, onLoad] = useFrameShown(src)
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-[16px]" data-map-sheet="" data-embed-shown={shown ? "" : undefined} style={{ background: "var(--sheet-field, rgba(127,127,127,0.12))" }}>
      <iframe title={title} src={src} onLoad={onLoad} referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 block h-full w-full border-0" style={frameFade(shown)} />
    </div>
  )
}

/* ─── Video ────────────────────────────────────────────────────────────── */

function VideoView({ data, look, autoplay = false }: { data: VideoBlockData; look: ExtraBlockLook; /** In the sheet: the tap that opened it was the press. */ autoplay?: boolean }) {
  const source = videoSource(data.url)
  const [playing, setPlaying] = React.useState(autoplay)
  /* Round AS (./embed-shell): the video's own picture under the player until the player has loaded. */
  const [shown, onLoad] = useFrameShown(playing && source && source.kind !== "file" ? data.url : null)
  /*
    PLAYS BY ITSELF, MUTED (VideoBlockData autoplay, on for a new block). A
    browser only lets a video start without a press when it is muted, so
    the player is loaded muted once half of it is on screen, and never for
    someone who asked for less motion or inside a carousel. The sheet's own
    player (autoplay, above) was pressed for, so it keeps its sound.
  */
  const [muted, setMuted] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  const startsAlone = !autoplay && !!data.autoplay && !look.still && !!source && source.kind !== "file" && videoAutoplays(source)
  React.useEffect(() => {
    const el = box.current
    if (!startsAlone || playing || !el || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        setMuted(true)
        setPlaying(true)
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [startsAlone, playing])
  if (!source) return null
  const radius = `${boxRadius(look.theme)}px`
  /* Round AR3: a video Storelib holds plays in Storelib's own light player (./media-blocks). */
  if (source.kind === "file") {
    return (
      <div data-onepage-video="file" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
        {data.title?.trim() ? (
          <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
            {data.title}
          </p>
        ) : null}
        <FileVideoPlayer src={source.id} poster={data.poster_url} title={data.title?.trim() || tt("Video")} radius={boxRadius(look.theme)} autoplay={!!data.autoplay && !autoplay} loop={!!data.loop} startPlaying={autoplay} />
      </div>
    )
  }
  const tall = source.kind === "tiktok"
  const src = videoEmbedUrl(source, { muted }) ?? tiktokPlayerUrl(source.id)
  const poster = source.kind === "youtube" ? `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg` : null
  return (
    <div data-onepage-video="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }} data-block-title="">
          {data.title}
        </p>
      ) : null}
      <div
        ref={box}
        className={cn("relative mx-auto w-full overflow-hidden bg-black", tall ? "aspect-[9/16] max-w-[320px]" : "aspect-video")}
        style={{ borderRadius: radius }}
        data-embed-shown={playing && shown ? "" : undefined}
        data-video-autoplay={startsAlone ? (playing ? "playing" : "waiting") : undefined}
      >
        {playing ? (
          <>
            {poster ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover motion-safe:transition-opacity" style={{ opacity: shown ? 0 : 1, transitionDuration: `${FRAME_FADE_MS}ms` }} />
            ) : null}
            <iframe
              title={data.title || tt("Video")}
              src={src}
              onLoad={onLoad}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
              style={frameFade(shown)}
            />
          </>
        ) : (
          /*
            THE PLAYER LOADS ON THE FIRST PRESS. A YouTube player is close to a
            megabyte of script; the picture and a play button are what one
            shows before it is pressed anyway, so the page draws those and
            loads the player when somebody wants it.
          */
          <button
            type="button"
            aria-label={tt("Play {value}", { value: data.title ?? "video" })}
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex h-full w-full cursor-pointer items-center justify-center"
          >
            {poster ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-b from-[#26262b] to-[#111113]" />
            )}
            <span
              className="relative grid place-items-center rounded-full bg-black/60 text-white transition-[scale] duration-150 group-active:scale-95"
              style={{ width: px(56, look.scale), height: px(56, look.scale) }}
            >
              <Play aria-hidden fill="currentColor" style={{ width: px(22, look.scale), height: px(22, look.scale), marginLeft: px(3, look.scale) }} />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * INSIDE THE EDITOR'S PREVIEW. The preview is the live page's own component
 * in a frame (components/onepage/preview-document.tsx), which draws these
 * blocks with the live page's look; the frame says it is the editor's with
 * this, so the map still waits for the typing to stop there.
 */
export const ExtraBlockPreviewContext = React.createContext(false)

/** Draws one of the blocks in this file, in the editor's preview or on the live page. */
export function ExtraBlock({ block, look: given }: { block: OnePageBlock; look: ExtraBlockLook }) {
  const inPreview = React.useContext(ExtraBlockPreviewContext)
  const look = inPreview && !given.preview ? { ...given, preview: true } : given
  /* Round AL: a button that opens the block in the sheet, or goes to the service (lib/onepage/block-sheet). */
  /*
    Round AR3 (lib/onepage/media-layout): a music or video block is drawn by its
    layout, the player, the card or the button; the Interaction says what a tap
    on the card or the button does.
  */
  if (block.type === "music" || block.type === "video") {
    const layout = mediaLayoutOf(block.data as never)
    const mode = (block.data as { open_mode?: unknown }).open_mode === "direct" ? "direct" : "sheet"
    if (layout === "button") return <SheetBlock block={block} look={look} mode={mode} />
    if (layout === "card") return <MediaCardBlock block={block} look={look} mode={mode} />
  } else {
    const how = blockInteraction(block)
    if (how !== "inline" && offersInteraction(block.type)) return <SheetBlock block={block} look={look} mode={how} />
  }
  switch (block.type) {
    case "heading":
      return <HeadingView data={block.data as HeadingBlockData} look={look} />
    case "faq":
      return <FaqView data={block.data as FaqBlockData} look={look} />
    case "countdown":
      return <CountdownView data={block.data as CountdownBlockData} look={look} />
    case "map":
      return <MapView data={block.data as MapBlockData} look={look} />
    case "video":
      return <VideoView data={block.data as VideoBlockData} look={look} />
    case "app":
      /* Round AL: every service with no block of its own (./app-block). */
      return <AppBlock block={block} look={{ theme: look.theme, scale: look.scale, preview: look.preview, onepageId: look.onepageId, sellerId: look.sellerId, still: look.still }} />
    default:
      /* Course, music, testimonials and the contact form (./creator-blocks). */
      return <CreatorBlock block={block} look={{ theme: look.theme, scale: look.scale, preview: look.preview, sellerId: look.sellerId, onepageId: look.onepageId, still: look.still, button: themeButtonStyle(look.theme) }} />
  }
}

/**
 * AN EMBEDDING BLOCK AS A BUTTON (round AL). Its Interaction is "In a sheet"
 * or "Go to the link": the page shows the page's own button with the
 * service's mark, and a tap raises the block itself in the sheet (drawn as
 * it would be inline, its title in the sheet's head instead, a video
 * already playing) or goes to the service's page.
 */
function SheetBlock({ block, look, mode }: { block: OnePageBlock; look: ExtraBlockLook; mode: "sheet" | "direct" }) {
  const plan = sheetPlan(block, look)
  if (!plan) return null
  return (
    <BlockSheetButton
      blockId={block.id}
      onepageId={look.onepageId}
      theme={look.theme}
      mode={mode}
      title={plan.title}
      subtitle={plan.subtitle}
      icon={plan.icon}
      href={plan.href}
      still={look.still}
      small={look.scale === "small"}
      sheet={() => ({ title: plan.title, body: plan.body(), cta: plan.cta, shareUrl: plan.href, fill: plan.fill })}
      prewarm={block.type !== "video" && block.type !== "contact_form"}
    />
  )
}

/** The card layout of a music or video block (components/onepage/media-blocks MediaCard). */
function MediaCardBlock({ block, look, mode }: { block: OnePageBlock; look: ExtraBlockLook; mode: "sheet" | "direct" }) {
  const plan = sheetPlan(block, look)
  if (!plan) return null
  const isVideo = block.type === "video"
  const d = block.data as VideoBlockData & MusicBlockData
  const v = isVideo ? videoSource(d.url) : null
  const m = isVideo ? null : musicSource(d.url)
  const image = isVideo ? (d.poster_url || (v?.kind === "youtube" ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : null)) : d.artwork_url || null
  const service = isVideo ? (v?.kind === "file" ? tt("Video") : v ? VIDEO_NAME[v.kind] : "") : m ? MUSIC_PROVIDER_NAME[m.kind] : ""
  return (
    <MediaCard
      block={block}
      theme={look.theme}
      scale={look.scale}
      onepageId={look.onepageId}
      still={look.still}
      kind={isVideo ? "video" : "music"}
      mode={mode}
      title={plan.title}
      service={service}
      image={image}
      icon={plan.icon}
      href={plan.href}
      sheet={() => ({ title: plan.title, body: plan.body(), cta: plan.cta, shareUrl: plan.href, fill: plan.fill })}
    />
  )
}

type SheetPlan = {
  title: string
  subtitle?: string
  icon: React.ReactNode
  href: string | null
  body: () => React.ReactNode
  cta?: { label: string; href: string; icon?: React.ReactNode } | null
  fill?: boolean
}

/* i18n-ignore-start: services' names, not words. */
const VIDEO_NAME = { youtube: "YouTube", vimeo: "Vimeo", tiktok: "TikTok" } as const
/* i18n-ignore-end */

/** What the button and the sheet show for each block. Null when the block has nothing to show yet. */
function sheetPlan(block: OnePageBlock, look: ExtraBlockLook): SheetPlan | null {
  const inner: ExtraBlockLook = { ...look, scale: "live", still: false }
  const creatorLook = { theme: inner.theme, scale: "live" as const, preview: inner.preview, sellerId: inner.sellerId, onepageId: inner.onepageId, button: themeButtonStyle(inner.theme) }
  /* Drawn in the sheet as it would be inline: its title is the sheet's own head. */
  const inline = { ...block, data: { ...(block.data as object), title: "", open_mode: "inline" } as OnePageBlockData }
  const mark = (platform: string) => <SocialIcon platform={platform} size={22} color="currentColor" />
  switch (block.type) {
    case "video": {
      const d = block.data as VideoBlockData
      const s = videoSource(d.url)
      if (!s) return null
      const href = d.url.trim()
      /* An uploaded video plays in the sheet; there is no service to go on to. */
      if (s.kind === "file") {
        return {
          title: d.title?.trim() || tt("Video"),
          icon: <Play aria-hidden fill="currentColor" className="h-[18px] w-[18px]" />,
          href,
          body: () => <VideoView data={{ ...d, title: "" }} look={inner} autoplay />,
          cta: null,
        }
      }
      const name = VIDEO_NAME[s.kind]
      return {
        title: d.title?.trim() || name,
        icon: mark(s.kind),
        href,
        body: () => <VideoView data={{ ...d, title: "" }} look={inner} autoplay />,
        cta: { label: tt("Watch on {value}", { value: name }), href, icon: mark(s.kind) },
      }
    }
    case "music": {
      const d = block.data as MusicBlockData
      const s = musicSource(d.url)
      if (!s) return null
      const name = MUSIC_PROVIDER_NAME[s.kind]
      const href = d.url.trim()
      return {
        title: d.title?.trim() || name,
        icon: mark(MUSIC_MARK[s.kind]),
        href,
        body: () => <CreatorBlock block={inline} look={creatorLook} />,
        cta: { label: tt("Open in {value}", { value: name }), href, icon: mark(MUSIC_MARK[s.kind]) },
      }
    }
    case "embed": {
      const d = block.data as EmbedBlockData
      const s = embedSource(d.url)
      if (!s) return null
      const name = EMBED_PROVIDER_NAME[s.kind]
      const m = EMBED_MARK[s.kind]
      const href = d.url.trim()
      return {
        title: d.title?.trim() || name,
        icon: m ? mark(m) : <GlyphIntegration className="h-[22px] w-[22px]" />,
        href,
        body: () => <CreatorBlock block={inline} look={creatorLook} />,
        cta: { label: tt("Open in {value}", { value: name }), href, icon: m ? mark(m) : null },
      }
    }
    case "map": {
      const d = block.data as MapBlockData
      const typed = (d.address || "").trim()
      if (!typed) return null
      const place = mapPlaceOf(d)
      const address = place?.label || typed
      const href = place?.href ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(typed)}`
      const src = place ? mapEmbedSrc(place, d.zoom || "area") : null
      return {
        title: d.title?.trim() || address,
        subtitle: d.title?.trim() ? address : undefined,
        icon: <MapPin aria-hidden className="h-[22px] w-[22px]" />,
        href,
        fill: true,
        /* A short link not read yet has no place to draw: the sheet keeps its Open in Maps. */
        body: () => (!src ? null : <MapSheetFrame title={tt("Map of {address}", { address })} src={src} />),
        cta: { label: tt("Open in Maps"), href, icon: <MapPin aria-hidden /> },
      }
    }
    case "contact_form": {
      const d = block.data as ContactFormBlockData
      return {
        title: d.title?.trim() || tt("Contact"),
        subtitle: d.description?.trim() || undefined,
        icon: <GlyphContact className="h-[22px] w-[22px]" />,
        href: null,
        body: () => <CreatorBlock block={inline} look={creatorLook} />,
      }
    }
    default:
      return null
  }
}

/**
 * A NEW LINK IN THE EDITOR'S PREVIEW, before it has an address: the page's own
 * button, faded, with a dashed edge and "Add an address to show it", where
 * the link will be. Never on the live page (lib/onepage/extra-blocks
 * isIncompleteLink).
 */
export function IncompleteLinkPlaceholder({ label, theme }: { label?: string | null; theme: OnePageTheme }) {
  const button = themeButtonStyle(theme)
  return (
    <div
      data-incomplete-link=""
      className="flex w-full flex-col items-center justify-center gap-0.5 px-4 py-3 text-center opacity-50"
      style={{ ...button, borderStyle: "dashed", borderWidth: "1.5px", borderColor: theme.button_style === "outline" ? button.borderColor : theme.text_color, boxShadow: "none" }}
    >
      <span className="text-[15px] font-medium leading-5">{(label || "").trim() || tt("My Link")}</span>
      <span className="text-[12px] leading-4 opacity-80">{tt("Add an address to show it")}</span>
    </div>
  )
}

/* ─── A sensitive link asks first ─────────────────────────────────────── */

/**
 * HOW THE QUESTION GETS IN THE WAY. The live page marks the box around a
 * block whose link is sensitive with `data-sensitive-label`. The question
 * listens for presses on the whole page before anything else hears them; a
 * press on a link or a button inside a marked box is held, the question
 * opens, and Continue presses the same thing again, this time let through.
 * So the link's own code (the click count, the new tab, a player that opens)
 * runs exactly as it would have, just after the visitor has said yes.
 */
/*
 * AND A PLAYER INSIDE ONE ASKS TOO (round 40, "Sensitive content works"). A
 * link to a YouTube video in the Pro layout plays inside the page, in a
 * frame, and a press inside a frame never reaches this page: the video
 * played with no question at all. So a frame inside a marked box takes no
 * press (SENSITIVE_FRAME_RULE) until the visitor has said yes for that box;
 * the press lands on the box, the question opens, and Continue lets that
 * box's frames take presses from then on (`data-sensitive-ok`), so the next
 * press plays it.
 */
const SENSITIVE_FRAME_RULE = "[data-sensitive-label]:not([data-sensitive-ok]) iframe{pointer-events:none}"

type Ask = { label: string; target: HTMLElement | null; box: HTMLElement } | null
let asking: Ask = null
let letThrough: HTMLElement | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const close = () => {
  asking = null
  emit()
}

/** Rendered once by the live page: the question, over the page, when a sensitive link is pressed. */
export function SensitiveLinkQuestion() {
  const ask = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => asking,
    () => null,
  )
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null
      const box = el?.closest<HTMLElement>("[data-sensitive-label]")
      if (!box) return
      const target = el?.closest<HTMLElement>("a[href], button")
      if (!target || !box.contains(target)) {
        /* A press on a player's frame (it takes none until allowed, so it lands on the box around it). */
        if (box.hasAttribute("data-sensitive-ok")) return
        const onFrame = Array.from(box.querySelectorAll("iframe")).some((f) => {
          const r = f.getBoundingClientRect()
          return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        })
        if (!onFrame) return
        e.preventDefault()
        e.stopPropagation()
        asking = { label: box.dataset.sensitiveLabel || "", target: null, box }
        emit()
        return
      }
      if (letThrough === target) {
        letThrough = null
        return
      }
      e.preventDefault()
      e.stopPropagation()
      asking = { label: box.dataset.sensitiveLabel || "", target, box }
      emit()
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])
  React.useEffect(() => {
    if (!ask) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ask])
  const rule = <style dangerouslySetInnerHTML={{ __html: SENSITIVE_FRAME_RULE }} />
  if (!ask) return rule
  return (
    <>
    {rule}
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 p-4 animate-in fade-in-0 duration-200 sm:items-center" onClick={close} role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="onepage-sensitive-title"
        aria-describedby="onepage-sensitive-body"
        data-onepage-sensitive=""
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-2xl bg-white p-5 text-center shadow-[0_24px_60px_-18px_rgba(17,24,39,0.35)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
      >
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#f1f2f4] text-[#1a1a2e]">
          <EyeOff aria-hidden className="h-5 w-5" />
        </span>
        <h2 id="onepage-sensitive-title" className="mt-3 text-[17px] font-semibold text-[#1a1a2e]">
          {tt("Sensitive content")}
        </h2>
        <p id="onepage-sensitive-body" className="mt-1.5 text-[14px] leading-[1.5] text-[#6b7280]">
          {ask.label ? <>{tt("“{label}” may", { label: ask.label })}</> : tt("This link may")} {tt("contain content that is not suitable for everyone. Do you want to continue?")}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={close} className="h-11 cursor-pointer rounded-xl border border-[#d9dbe0] bg-white text-[15px] font-medium text-[#1a1a2e] active:bg-[#f1f2f4]">
            {tt("Go back")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              const { target, box } = ask
              close()
              /* Said yes for this box: its player takes presses now, and a link or button is pressed again, let through. */
              box.setAttribute("data-sensitive-ok", "")
              if (!target) return
              letThrough = target
              target.click()
              letThrough = null
            }}
            className="h-11 cursor-pointer rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white active:bg-black"
          >
            {tt("Continue")}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

/* ─── The editor ───────────────────────────────────────────────────────── */

/** The entries the Add block sheet lists for these blocks, in the category each belongs to. */

/* The brand marks a block's row and its sheet both draw (./extra-blocks-editor reads them too). */
export const EMBED_MARK: Partial<Record<EmbedKind, string>> = { instagram: "instagram", x: "twitter", typeform: "typeform", googleforms: "google-forms", substack: "substack", podcasts: "apple-podcasts", twitch: "twitch", loom: "loom", mixcloud: "mixcloud", bandcamp: "bandcamp", gcal: "google-calendar", canva: "canva" }
export const MUSIC_MARK: Record<string, string> = { spotify: "spotify", soundcloud: "soundcloud", apple: "applemusic" }
