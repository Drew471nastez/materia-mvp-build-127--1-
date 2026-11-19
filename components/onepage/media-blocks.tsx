"use client"

/**
 * ===========================================================================
 *  MUSIC AND VIDEO: THE CARD, STORELIB'S OWN PLAYER, AND THE LAYOUT PICKER
 * ===========================================================================
 * Round AR3 (lib/onepage/media-layout). A music or video block is drawn as
 * the service's player, as a card, or as the page's button. This file holds
 * the two pieces the page did not have:
 *
 *   MediaCard        the card: the cover (a song) or the video's frame, the
 *                    title, the service's name and a play button, in the
 *                    page's button colours. A tap plays it in the sheet, or
 *                    goes to the service (the block's Interaction).
 *   FileVideoPlayer  a video Storelib holds (an upload, or one from Files),
 *                    in a light player of our own: the poster first, the
 *                    file asked for only near the screen, one round play
 *                    button, and a thin bar (play, time, sound, full
 *                    screen) that fades out while it plays. Muted autoplay
 *                    on screen when the creator asks for it, never under
 *                    reduced motion.
 *
 * and, for the editor's Layout tab, MediaLayoutPicker: the three layouts
 * drawn small in the page's colours, as every block's layouts are.
 */
import * as React from "react"
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { boxRadius, pressableProps } from "@/lib/onepage/block-look"
import { themeButtonStyle } from "@/lib/onepage/button-style"
import { mediaLayoutOf, mediaLayoutPatch, type MediaLayout } from "@/lib/onepage/media-layout"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import type { OnePageBlock, OnePageTheme } from "@/lib/onepage/types"
import { useBlockSheet, type BlockSheetRequest } from "./block-sheet"
import { trackBlockTap, useSheetWarm } from "./block-sheet-trigger"
import { ChoiceMark } from "./choice-marks"

type Scale = "small" | "normal" | "live"
const k = (scale: Scale) => (scale === "small" ? 0.8 : 1)
const px = (n: number, scale: Scale) => `${Math.round(n * k(scale) * 10) / 10}px`

/* ─── The card ─────────────────────────────────────────────────────────── */

export function MediaCard({
  block,
  theme,
  scale,
  onepageId,
  kind,
  mode,
  title,
  service,
  image,
  icon,
  href,
  sheet,
}: {
  block: OnePageBlock
  theme: OnePageTheme
  scale: Scale
  onepageId?: string | null
  still?: boolean
  kind: "music" | "video"
  mode: "sheet" | "direct"
  title: string
  /** The service's name ("Spotify", "YouTube"), the line under the title. */
  service: string
  image: string | null
  icon: React.ReactNode
  href: string | null
  sheet: () => Omit<BlockSheetRequest, "blockId">
}) {
  const api = useBlockSheet()
  const press = pressableProps(theme)
  const surface = themeButtonStyle(theme)
  const ink = (surface.color as string) || theme.button_text_color || "#ffffff"
  const paper = (surface.backgroundColor as string) || theme.button_color || "#1a1a2e"
  const radius = boxRadius(theme)
  const inSheet = mode === "sheet" && api.available
  /* Round AS: a song's player starts on the press; a video, which plays on its own, only has its connections warmed. */
  const warm = useSheetWarm(href, inSheet, kind === "music", block.id, sheet)
  const onClick = (e: React.MouseEvent) => {
    trackBlockTap(onepageId, block.id, href)
    if (inSheet) {
      e.preventDefault()
      api.open({ blockId: block.id, ...sheet() })
      return
    }
    if (isOnePagePreview()) {
      e.preventDefault()
      showPreviewNotice("link")
    }
  }
  const playDot = (size: number, onPicture: boolean) => (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full transition-[scale] duration-150 group-active:scale-95"
      style={{ width: px(size, scale), height: px(size, scale), background: onPicture ? "rgba(255,255,255,0.94)" : ink, color: onPicture ? "#111113" : paper, boxShadow: onPicture ? "0 6px 20px -6px rgba(0,0,0,0.45)" : undefined }}
    >
      <Play fill="currentColor" style={{ width: px(size * 0.38, scale), height: px(size * 0.38, scale), marginLeft: px(size * 0.05, scale) }} />
    </span>
  )
  const body =
    kind === "video" ? (
      <>
        <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "16 / 9", borderRadius: `${Math.max(0, radius - 4)}px`, background: "#111113" }}>
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-white/80 [&_svg]:h-9 [&_svg]:w-9">{icon}</span>
          )}
          <span className="absolute inset-0 grid place-items-center">{playDot(54, true)}</span>
        </span>
        <span className="flex min-w-0 flex-col text-left" style={{ padding: `${px(10, scale)} ${px(6, scale)} ${px(4, scale)}`, gap: px(2, scale) }}>
          <span data-block-title="" className="block truncate font-semibold" style={{ fontSize: px(15, scale) }}>{title}</span>
          <span className="flex items-center gap-1.5 truncate opacity-70 [&_svg]:h-3.5 [&_svg]:w-3.5" style={{ fontSize: px(12.5, scale) }}>
            {icon}
            {service}
          </span>
        </span>
      </>
    ) : (
      <span className="flex w-full items-center text-left" style={{ gap: px(12, scale) }}>
        <span className="relative grid shrink-0 place-items-center overflow-hidden [&_svg]:h-7 [&_svg]:w-7" style={{ width: px(64, scale), height: px(64, scale), borderRadius: `${Math.max(6, radius - 6)}px`, background: `color-mix(in srgb, ${ink} 14%, ${paper})` }}>
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            icon
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col" style={{ gap: px(2, scale) }}>
          <span data-block-title="" className="block truncate font-semibold" style={{ fontSize: px(15, scale) }}>{title}</span>
          <span className="flex items-center gap-1.5 truncate opacity-70 [&_svg]:h-3.5 [&_svg]:w-3.5" style={{ fontSize: px(12.5, scale) }}>
            {image ? icon : null}
            {service}
          </span>
        </span>
        {playDot(40, false)}
      </span>
    )
  const common = {
    "data-hover": press["data-hover"],
    "data-shadow": press["data-shadow"],
    "data-media-card": kind,
    "data-block-sheet-trigger": mode,
    className: cn(press.className, "group flex w-full flex-col font-medium [-webkit-tap-highlight-color:transparent]"),
    style: { ...press.style, padding: kind === "video" ? px(6, scale) : px(10, scale), textAlign: "left" as const },
    onClick,
    ...warm,
  }
  if (inSheet || !href) {
    return (
      <button type="button" aria-haspopup={inSheet ? "dialog" : undefined} aria-label={tt("Play {value}", { value: title })} {...common}>
        {body}
      </button>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...common}>
      {body}
    </a>
  )
}

/* ─── Storelib's own player, for a video Storelib holds ───────────────── */

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export function FileVideoPlayer({ src, poster, title, radius, autoplay = false, loop = false, startPlaying = false }: { src: string; poster?: string | null; title: string; radius: number; autoplay?: boolean; loop?: boolean; startPlaying?: boolean }) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  /* The file is asked for only once the player is near the screen (or pressed). */
  const [near, setNear] = React.useState(startPlaying)
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(autoplay)
  const [time, setTime] = React.useState(0)
  const [length, setLength] = React.useState(0)
  const [bar, setBar] = React.useState(true)
  const hideRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const box = boxRef.current
    if (!box || near || typeof IntersectionObserver === "undefined") {
      if (!near && typeof IntersectionObserver === "undefined") setNear(true)
      return
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "300px" })
    io.observe(box)
    return () => io.disconnect()
  }, [near])

  /* Muted autoplay: plays while at least half of it is on screen, pauses when it leaves. */
  React.useEffect(() => {
    const box = boxRef.current
    const v = videoRef.current
    if (!autoplay || !near || !box || !v || reducedMotion() || typeof IntersectionObserver === "undefined") return
    v.muted = true
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.5) void v.play().catch(() => {})
          else v.pause()
        }
      },
      { threshold: [0, 0.5, 1] },
    )
    io.observe(box)
    return () => io.disconnect()
  }, [autoplay, near])

  React.useEffect(() => {
    if (startPlaying && near) void videoRef.current?.play().catch(() => {})
  }, [startPlaying, near])

  const wake = React.useCallback(() => {
    setBar(true)
    if (hideRef.current) window.clearTimeout(hideRef.current)
    hideRef.current = window.setTimeout(() => setBar(false), 2200)
  }, [])
  React.useEffect(() => () => { if (hideRef.current) window.clearTimeout(hideRef.current) }, [])

  const toggle = () => {
    const v = videoRef.current
    if (!near) setNear(true)
    if (!v) return
    if (v.paused) {
      void v.play().catch(() => {})
      wake()
    } else v.pause()
  }
  const showBar = !playing || bar
  return (
    <div
      ref={boxRef}
      data-file-video=""
      data-playing={playing ? "" : undefined}
      className="group/video relative w-full overflow-hidden bg-[#111113]"
      style={{ aspectRatio: "16 / 9", borderRadius: radius }}
      onPointerMove={playing ? wake : undefined}
    >
      <video
        ref={videoRef}
        src={near ? src : undefined}
        poster={poster || undefined}
        preload={near ? "metadata" : "none"}
        playsInline
        muted={muted}
        loop={loop}
        title={title}
        aria-label={title}
        onClick={toggle}
        onPlay={() => { setPlaying(true); wake() }}
        onPause={() => { setPlaying(false); setBar(true) }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
        onDurationChange={(e) => setLength(e.currentTarget.duration)}
        className="absolute inset-0 h-full w-full cursor-pointer object-contain"
      />
      {!playing ? (
        <button type="button" onClick={toggle} aria-label={tt("Play {value}", { value: title })} className="absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,0.35))]">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-[#111113] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition-[scale] duration-150 active:scale-95">
            <Play aria-hidden fill="currentColor" className="ml-0.5 h-5 w-5" />
          </span>
        </button>
      ) : null}
      <div
        data-file-video-bar=""
        className={cn("absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-full bg-white/90 px-2 py-1 text-[#111113] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-opacity duration-200", showBar && near ? "opacity-100" : "pointer-events-none opacity-0")}
      >
        <button type="button" onClick={toggle} aria-label={playing ? tt("Pause") : tt("Play")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5">
          {playing ? <Pause aria-hidden fill="currentColor" className="h-3.5 w-3.5" /> : <Play aria-hidden fill="currentColor" className="ml-px h-3.5 w-3.5" />}
        </button>
        <input
          type="range"
          aria-label={tt("Position")}
          min={0}
          max={length || 0}
          step={0.1}
          value={Math.min(time, length || 0)}
          onChange={(e) => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); wake() }}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-[#111113]"
        />
        <span className="shrink-0 text-[11.5px] font-medium tabular-nums opacity-70">{clock(time)} / {clock(length)}</span>
        <button type="button" onClick={() => { const v = videoRef.current; const next = !muted; setMuted(next); if (v) v.muted = next; wake() }} aria-label={muted ? tt("Sound on") : tt("Sound off")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5">
          {muted ? <VolumeX aria-hidden className="h-4 w-4" /> : <Volume2 aria-hidden className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
            if (!v) return
            if (v.requestFullscreen) void v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.())
            else v.webkitEnterFullscreen?.()
          }}
          aria-label={tt("Full screen")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-black/5"
        >
          <Maximize2 aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ─── The Layout tab: the three layouts, drawn ────────────────────────── */

const LABEL: Record<MediaLayout, () => string> = {
  player: () => tt("Player"),
  card: () => tt("Card"),
  button: () => tt("Button"),
}

function MediaThumb({ id, kind, theme, title, image }: { id: MediaLayout; kind: "music" | "video"; theme?: Partial<OnePageTheme> | null; title: string; image?: string | null }) {
  const btn = theme?.button_color || "#1a1a2e"
  const ink = theme?.button_text_color || "#ffffff"
  const page = theme?.background_color || "#f7f7f8"
  const r = Math.max(3, Math.min(Number(theme?.button_border_radius ?? 8) * 0.45, 10))
  const words = (
    <span className="min-w-0 truncate text-[8.5px] font-semibold leading-none" style={{ color: ink }}>
      {title}
    </span>
  )
  const pic = (cls: string) =>
    image ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={image} alt="" className={cn("block object-cover", cls)} draggable={false} />
    ) : (
      <span className={cn("block", cls)} style={{ background: kind === "video" ? "#26262b" : `color-mix(in srgb, ${ink} 22%, ${btn})` }} />
    )
  let body: React.ReactNode
  if (id === "player") {
    body =
      kind === "video" ? (
        <span className="relative block aspect-video w-[86%] overflow-hidden" style={{ borderRadius: r }}>
          {pic("absolute inset-0 h-full w-full")}
          <span className="absolute inset-0 grid place-items-center"><span className="block h-3 w-3 rounded-full bg-white/90" /></span>
          <span className="absolute inset-x-1 bottom-1 block h-[3px] rounded-full bg-white/80" />
        </span>
      ) : (
        <span className="flex w-full items-center gap-1.5 p-1.5" style={{ background: "#1f6f43", borderRadius: r }}>
          {pic("h-[26px] w-[26px] rounded-[4px]")}
          <span className="flex flex-1 flex-col gap-1">
            <span className="block h-[3px] w-[70%] rounded-full bg-white/90" />
            <span className="block h-[3px] w-full rounded-full bg-white/40" />
          </span>
          <span className="block h-3 w-3 shrink-0 rounded-full bg-white" />
        </span>
      )
  } else if (id === "card") {
    body =
      kind === "video" ? (
        <span className="flex w-[78%] flex-col overflow-hidden p-[3px]" style={{ background: btn, borderRadius: r }}>
          <span className="relative block aspect-video w-full overflow-hidden" style={{ borderRadius: Math.max(2, r - 2) }}>
            {pic("absolute inset-0 h-full w-full")}
            <span className="absolute inset-0 grid place-items-center"><span className="block h-3 w-3 rounded-full bg-white" /></span>
          </span>
          <span className="flex h-[14px] items-center px-1">{words}</span>
        </span>
      ) : (
        <span className="flex w-full items-center gap-1.5 p-1.5" style={{ background: btn, borderRadius: r }}>
          {pic("h-[24px] w-[24px] rounded-[4px]")}
          <span className="flex min-w-0 flex-1 flex-col gap-1">{words}<span className="block h-[3px] w-[40%] rounded-full" style={{ background: ink, opacity: 0.5 }} /></span>
          <span className="block h-[14px] w-[14px] shrink-0 rounded-full" style={{ background: ink }} />
        </span>
      )
  } else {
    body = (
      <span className="relative flex h-[26%] w-full items-center justify-center px-6" style={{ background: btn, borderRadius: r }}>
        <span className="absolute left-1.5 block h-[10px] w-[10px] rounded-full" style={{ background: ink, opacity: 0.85 }} />
        {words}
      </span>
    )
  }
  return (
    <span aria-hidden data-media-layout-thumb={id} className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl px-[10%]" style={{ background: page }}>
      {body}
    </span>
  )
}

/** Player, Card or Button, as pictures; picking one writes the layout and an Interaction that agrees (lib/onepage/media-layout). */
export function MediaLayoutPicker({ block, theme, title, image, updateData }: { block: OnePageBlock; theme?: Partial<OnePageTheme> | null; title: string; image?: string | null; updateData: (patch: Record<string, unknown>) => void }) {
  const kind = block.type === "video" ? "video" : "music"
  const current = mediaLayoutOf(block.data as never)
  const ids: MediaLayout[] = ["player", "card", "button"]
  return (
    <div className="space-y-2.5" data-media-layouts="">
      <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Layout")}</p>
      <div className="grid grid-cols-3 gap-2.5">
        {ids.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-media-layout-choice={id}
              onClick={() => updateData(mediaLayoutPatch(id, block.data as never))}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <MediaThumb id={id} kind={kind} theme={theme} title={title} image={image} />
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{LABEL[id]()}</span>
            </button>
          )
        })}
      </div>
      {current !== "player" ? <p className="text-[12.5px] text-[#6b7280]">{tt("A tap plays it in a sheet over your page, or opens it, as set in Settings.")}</p> : null}
    </div>
  )
}
