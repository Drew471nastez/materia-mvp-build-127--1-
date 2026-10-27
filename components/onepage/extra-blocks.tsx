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

import { buttonBackground } from "@/lib/onepage/button-style"
import * as React from "react"
import { useSyncExternalStore } from "react"
import { CalendarClock, ChevronDown, ChevronRight, Clock, EyeOff, MapPin, Play, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { scheduleLabel, videoSource } from "@/lib/onepage/extra-blocks"
import { viewerZone, zoneLabel } from "@/lib/onepage/schedule"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { DateTimeField } from "@/components/onepage/date-time-field"
import { CreatorBlock, CreatorBlockEditor } from "@/components/onepage/creator-blocks"
import { GlyphBooking, GlyphContact, GlyphCountdown, GlyphCourse, GlyphFaq, GlyphHeading, GlyphIntegration, GlyphMap, GlyphMusic, GlyphTestimonials, GlyphVideo } from "@/components/onepage/block-icons"
import { EMBED_PROVIDER_NAME, MUSIC_PROVIDER_NAME, cleanTestimonials, embedSource, lessonsLabel, musicSource, type EmbedKind } from "@/lib/onepage/creator-blocks"
import { SocialIcon } from "@/components/onepage/brand-icons"
import type {
  ContactFormBlockData,
  CourseBlockData,
  EmbedBlockData,
  MusicBlockData,
  TestimonialsBlockData,
  CountdownBlockData,
  FaqBlockData,
  HeadingBlockData,
  MapBlockData,
  OnePageBlock,
  OnePageBlockData,
  OnePageBlockSchedule,
  OnePageTheme,
  VideoBlockData,
} from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { hapticTap } from "@/lib/native-bridge"

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
}

function hexToRgba(hex: string, alpha: number) {
  const clean = (hex || "").replace("#", "")
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean
  const r = Number.parseInt(full.slice(0, 2), 16) || 0
  const g = Number.parseInt(full.slice(2, 4), 16) || 0
  const b = Number.parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}

/** The page's button, as the link blocks draw it (filled, outline or glass, its radius, border and shadow). */
export function themeButtonStyle(theme: OnePageTheme): React.CSSProperties {
  const t = theme as OnePageTheme & { button_shadow?: string; button_shadow_color?: string }
  const shadowColor = t.button_shadow_color || "#000000"
  const shadows: Record<string, string> = {
    none: "none",
    subtle: `0 2px 4px ${hexToRgba(shadowColor, 0.15)}`,
    strong: `0 4px 12px ${hexToRgba(shadowColor, 0.3)}`,
    hard: `4px 4px 0px ${hexToRgba(shadowColor, 0.9)}`,
  }
  return {
    backgroundColor: buttonBackground(theme),
    color: theme.button_text_color,
    borderRadius: `${theme.button_border_radius}px`,
    borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : theme.button_border_width || 0}px`,
    borderStyle: "solid",
    borderColor: theme.button_style === "outline" ? theme.button_border_color || theme.button_color : theme.button_border_color,
    backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
    boxShadow: shadows[t.button_shadow || "none"] || "none",
  }
}

const k = (scale: Scale) => (scale === "small" ? 0.8 : 1)
const px = (n: number, scale: Scale) => `${Math.round(n * k(scale) * 10) / 10}px`

/* ─── Heading ──────────────────────────────────────────────────────────── */

const HEADING_SIZE: Record<HeadingBlockData["size"], number> = { small: 15, medium: 18, large: 22 }

function HeadingView({ data, look }: { data: HeadingBlockData; look: ExtraBlockLook }) {
  const text = (data.text || "").trim()
  if (!text) return null
  const t = look.theme as OnePageTheme & { title_color?: string | null; title_font?: string | null }
  return (
    <h2
      data-onepage-heading=""
      className="w-full font-bold leading-tight tracking-[-0.01em]"
      style={{
        fontSize: px(HEADING_SIZE[data.size] ?? 18, look.scale),
        color: t.title_color || look.theme.text_color,
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
  const button = themeButtonStyle(look.theme)
  return (
    <div data-onepage-faq="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
          {data.title}
        </p>
      ) : null}
      {items.map((item) => {
        const on = open === item.id
        return (
          <div key={item.id} className="w-full overflow-hidden" style={button}>
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
                className={cn("shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", on && "rotate-180")}
                style={{ width: px(16, look.scale), height: px(16, look.scale) }}
              />
            </button>
            <div className={cn("grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden">
                <p
                  className={cn("whitespace-pre-line leading-relaxed transition-opacity duration-300", on ? "opacity-85" : "opacity-0")}
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
  const button = themeButtonStyle(look.theme)
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
        <p className="mb-2 font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
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

function MapView({ data, look }: { data: MapBlockData; look: ExtraBlockLook }) {
  const typed = (data.address || "").trim()
  /* In the editor the map follows the address once the typing stops, not on every letter: each change reloads the map. */
  const address = useSettled(typed, 700, !!look.preview)
  if (!typed) return null
  const q = encodeURIComponent(address || typed)
  const button = themeButtonStyle(look.theme)
  const radius = `${look.theme.button_border_radius}px`
  return (
    <div data-onepage-map="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
          {data.title}
        </p>
      ) : null}
      <div className="relative w-full overflow-hidden bg-black/5" style={{ borderRadius: radius, height: px(190, look.scale) }}>
        {address ? (
          <iframe
            key={address}
            title={tt("Map of {address}", { address })}
            src={`https://maps.google.com/maps?q=${q}&z=15&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full border-0"
          />
        ) : null}
      </div>
      {data.show_button !== false ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${q}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 font-medium"
          style={{ ...button, padding: `${px(14, look.scale)} ${px(16, look.scale)}`, fontSize: px(15, look.scale) }}
        >
          <MapPin aria-hidden style={{ width: px(16, look.scale), height: px(16, look.scale) }} />
          {tt("Open in Maps")}
        </a>
      ) : null}
    </div>
  )
}

/* ─── Video ────────────────────────────────────────────────────────────── */

function VideoView({ data, look }: { data: VideoBlockData; look: ExtraBlockLook }) {
  const source = videoSource(data.url)
  const [playing, setPlaying] = React.useState(false)
  if (!source) return null
  const radius = `${look.theme.button_border_radius}px`
  const tall = source.kind === "tiktok"
  const src =
    source.kind === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1&rel=0&playsinline=1`
      : source.kind === "vimeo"
        ? `https://player.vimeo.com/video/${source.id}?autoplay=1`
        : `https://www.tiktok.com/embed/v2/${source.id}`
  const poster = source.kind === "youtube" ? `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg` : null
  return (
    <div data-onepage-video="" className="flex w-full flex-col" style={{ gap: px(8, look.scale) }}>
      {data.title?.trim() ? (
        <p className="text-center font-semibold" style={{ color: look.theme.text_color, fontSize: px(15, look.scale) }}>
          {data.title}
        </p>
      ) : null}
      <div
        className={cn("relative mx-auto w-full overflow-hidden bg-black", tall ? "aspect-[9/16] max-w-[320px]" : "aspect-video")}
        style={{ borderRadius: radius }}
      >
        {playing ? (
          <iframe
            title={data.title || tt("Video")}
            src={src}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          /*
            THE PLAYER LOADS ON THE FIRST PRESS. A YouTube player is close to a
            megabyte of script; the picture and a play button are what one
            shows before it is pressed anyway, so the page draws those and
            loads the player when somebody wants it.
          */
          <button
            type="button"
            aria-label={tt("Play {value}", { value: data.title || "video" })}
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
              className="relative grid place-items-center rounded-full bg-black/60 text-white transition-transform duration-150 group-active:scale-95"
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
    default:
      /* Course, music, testimonials and the contact form (./creator-blocks). */
      return <CreatorBlock block={block} look={{ theme: look.theme, scale: look.scale, preview: look.preview, sellerId: look.sellerId, button: themeButtonStyle(look.theme) }} />
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
type Ask = { label: string; target: HTMLElement } | null
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
      if (!target || !box.contains(target)) return
      if (letThrough === target) {
        letThrough = null
        return
      }
      e.preventDefault()
      e.stopPropagation()
      asking = { label: box.dataset.sensitiveLabel || "", target }
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
  if (!ask) return null
  return (
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
              const target = ask.target
              close()
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
  )
}

/* ─── The editor ───────────────────────────────────────────────────────── */

/** The entries the Add block sheet lists for these blocks, in the category each belongs to. */
export const EXTRA_BLOCK_CATALOG = {
  heading: { type: "heading" as const, get label() { return tt("Heading") }, get description() { return tt("A title between your links") }, icon: GlyphHeading },
  faq: { type: "faq" as const, label: "FAQ", get description() { return tt("Questions and answers that open") }, icon: GlyphFaq },
  countdown: { type: "countdown" as const, get label() { return tt("Countdown") }, get description() { return tt("Count down to a launch or a drop") }, icon: GlyphCountdown },
  map: { type: "map" as const, get label() { return tt("Map") }, get description() { return tt("Show where to find you") }, icon: GlyphMap },
  video: { type: "video" as const, get label() { return tt("Video") }, get description() { return tt("Play a YouTube, Vimeo or TikTok video") }, icon: GlyphVideo },
  course: { type: "course" as const, get label() { return tt("Course") }, get description() { return tt("Show one of your courses") }, icon: GlyphCourse },
  music: { type: "music" as const, get label() { return tt("Music") }, get description() { return tt("Play Spotify, SoundCloud or Apple Music") }, icon: GlyphMusic },
  testimonials: { type: "testimonials" as const, get label() { return tt("Testimonials") }, get description() { return tt("Show what buyers said") }, icon: GlyphTestimonials },
  contact_form: { type: "contact_form" as const, get label() { return tt("Contact form") }, get description() { return tt("Let people send you a message") }, icon: GlyphContact },
  embed: { type: "embed" as const, get label() { return tt("Embed") }, get description() { return tt("A post, form, player or calendar") }, icon: GlyphIntegration },
}

/*
  A ROW FOR A SERVICE WEARS THAT SERVICE'S MARK, in its colour (round 11:
  brand marks in the editor too). One component per mark, made once, so a
  row's icon is the same component from render to render.
*/
const brandGlyphs = new Map<string, React.ComponentType<{ className?: string }>>()
function brandGlyph(platform: string): React.ComponentType<{ className?: string }> {
  let G = brandGlyphs.get(platform)
  if (!G) {
    const B = ({ className }: { className?: string }) => <SocialIcon platform={platform} tone="brand" color="#1a1a2e" className={className} size={19} />
    B.displayName = `BrandGlyph(${platform})`
    G = B
    brandGlyphs.set(platform, G)
  }
  return G
}
/* i18n-ignore-start: marks' names, not words. */
const EMBED_MARK: Partial<Record<EmbedKind, string>> = { instagram: "instagram", x: "twitter", typeform: "typeform", googleforms: "google-forms", substack: "substack", podcasts: "apple-podcasts", twitch: "twitch", loom: "loom", mixcloud: "mixcloud", bandcamp: "bandcamp", gcal: "google-calendar" }
const MUSIC_MARK: Record<string, string> = { spotify: "spotify", soundcloud: "soundcloud", apple: "applemusic" }
/* i18n-ignore-end */

/** The title, the line under it and the icon a block's row shows in the editor's list. */
export function extraBlockRow(block: OnePageBlock): { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> } {
  switch (block.type) {
    case "heading": {
      const d = block.data as HeadingBlockData
      return { title: d.text?.trim() || tt("Heading"), subtitle: tt("Heading"), icon: GlyphHeading }
    }
    case "faq": {
      const d = block.data as FaqBlockData
      const n = (d.items || []).filter((i) => i.question?.trim()).length
      return { title: d.title?.trim() || "FAQ", subtitle: `${n} question${n === 1 ? "" : "s"}`, icon: GlyphFaq }
    }
    case "countdown": {
      const d = block.data as CountdownBlockData
      const t = d.target_at ? Date.parse(d.target_at) : NaN
      return {
        title: d.title?.trim() || tt("Countdown"),
        subtitle: Number.isNaN(t) ? tt("Pick a date") : new Date(t).toLocaleString(appLocale(), zoned({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
        icon: GlyphCountdown,
      }
    }
    case "map": {
      const d = block.data as MapBlockData
      return { title: d.title?.trim() || tt("Map"), subtitle: d.address?.trim() || tt("Add an address"), icon: GlyphMap }
    }
    case "video": {
      const d = block.data as VideoBlockData
      const s = videoSource(d.url)
      return { title: d.title?.trim() || tt("Video"), subtitle: s ? tt("{value} video", { value: s.kind === "youtube" ? "YouTube" : s.kind === "vimeo" ? "Vimeo" : "TikTok" }) : tt("Paste a video link"), icon: s ? brandGlyph(s.kind) : GlyphVideo }
    }
    case "course": {
      const d = block.data as CourseBlockData
      const lessons = lessonsLabel(d.lessons_count)
      return { title: d.course_title?.trim() || tt("Course"), subtitle: !d.product_id ? tt("Pick a course") : lessons ? tt("{count, plural, one {# lesson} other {# lessons}}", lessons) : tt("Course"), icon: GlyphCourse }
    }
    case "music": {
      const d = block.data as MusicBlockData
      const s = musicSource(d.url)
      return { title: d.title?.trim() || tt("Music"), subtitle: s ? MUSIC_PROVIDER_NAME[s.kind] : tt("Paste a music link"), icon: s ? brandGlyph(MUSIC_MARK[s.kind]) : GlyphMusic }
    }
    case "testimonials": {
      const d = block.data as TestimonialsBlockData
      const n = cleanTestimonials(d.items).length
      return { title: d.title?.trim() || tt("Testimonials"), subtitle: n ? tt("{count, plural, one {# review} other {# reviews}}", { count: n }) : tt("Add a review"), icon: GlyphTestimonials }
    }
    case "contact_form": {
      const d = block.data as ContactFormBlockData
      return { title: d.title?.trim() || tt("Contact form"), subtitle: tt("Messages go to Emails"), icon: GlyphContact }
    }
    case "embed": {
      const d = block.data as EmbedBlockData
      const s = embedSource(d.url)
      const mark = s ? EMBED_MARK[s.kind] : undefined
      return { title: d.title?.trim() || (s ? EMBED_PROVIDER_NAME[s.kind] : tt("Embed")), subtitle: s ? EMBED_PROVIDER_NAME[s.kind] : tt("Paste a link"), icon: mark ? brandGlyph(mark) : GlyphIntegration }
    }
    default:
      return { title: block.type, subtitle: "", icon: GlyphBooking }
  }
}

const field = "space-y-1.5"
const label = "text-xs"

/**
 * A size or an alignment, as iOS's segmented control: one white thumb that
 * slides under the chosen word (the `translate` property, 220ms), rather
 * than a white background that jumped from one button to the next.
 */
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const at = Math.max(0, options.findIndex((o) => o.id === value))
  return (
    <div className="relative isolate grid rounded-xl bg-[#f1f2f4] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        data-segment-thumb=""
        className="pointer-events-none absolute bottom-1 left-1 top-1 -z-10 rounded-[9px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.1),0_0_0_1px_rgba(16,24,40,0.04)] transition-[translate] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, translate: `${at * 100}% 0` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-8 cursor-pointer rounded-[9px] text-[13px] font-medium transition-colors duration-150 [-webkit-tap-highlight-color:transparent]",
            value === o.id ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The form for one of the blocks in this file, inside the editor's block panel. */
export function ExtraBlockEditor({ block, updateData }: { block: OnePageBlock; updateData: (updates: Partial<OnePageBlockData>) => void }) {
  switch (block.type) {
    case "heading": {
      const d = block.data as HeadingBlockData
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Heading")}</Label>
            <Input value={d.text} maxLength={80} placeholder={tt("Shop my picks")} onChange={(e) => updateData({ text: e.target.value })} />
          </div>
          <div className={field}>
            <Label className={label}>{tt("Size")}</Label>
            <Segmented value={d.size || "medium"} options={[{ id: "small", label: tt("Small") }, { id: "medium", label: tt("Medium") }, { id: "large", label: tt("Large") }]} onChange={(size) => updateData({ size })} />
          </div>
          <div className={field}>
            <Label className={label}>{tt("Alignment")}</Label>
            <Segmented value={d.alignment || "center"} options={[{ id: "left", label: tt("Left") }, { id: "center", label: tt("Center") }, { id: "right", label: tt("Right") }]} onChange={(alignment) => updateData({ alignment })} />
          </div>
        </div>
      )
    }
    case "faq": {
      const d = block.data as FaqBlockData
      const items = d.items || []
      const set = (next: FaqBlockData["items"]) => updateData({ items: next })
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title || ""} maxLength={80} placeholder={tt("Questions")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
          {items.map((item, i) => (
            <div key={item.id} className="space-y-2 rounded-xl border border-[#e5e7eb] bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#6b7280]">{tt("Question {value}", { value: i + 1 })}</span>
                <button
                  type="button"
                  aria-label={tt("Remove question {value}", { value: i + 1 })}
                  onClick={() => set(items.filter((x) => x.id !== item.id))}
                  className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input value={item.question} maxLength={160} placeholder={tt("What do I get?")} onChange={(e) => set(items.map((x) => (x.id === item.id ? { ...x, question: e.target.value } : x)))} />
              <Textarea value={item.answer} rows={3} maxLength={1000} placeholder={tt("The answer")} onChange={(e) => set(items.map((x) => (x.id === item.id ? { ...x, answer: e.target.value } : x)))} />
            </div>
          ))}
          <button
            type="button"
            onClick={() => set([...items, { id: `q_${Date.now().toString(36)}`, question: "", answer: "" }])}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#d9dbe0] text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]"
          >
            <Plus className="h-4 w-4" />
            {tt("Add a question")}
          </button>
        </div>
      )
    }
    case "countdown": {
      const d = block.data as CountdownBlockData
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title || ""} maxLength={80} placeholder={tt("New drop in")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
          <div className={field}>
            <Label className={label}>{tt("Counts down to")}</Label>
            <div>
              <DateTimeField
                label={tt("Counts down to")}
                value={d.target_at}
                required
                emptyLabel={tt("Choose a date")}
                defaultTime={{ hour: 12, minute: 0 }}
                onChange={(iso) => iso && updateData({ target_at: iso })}
              />
            </div>
          </div>
          <div className={field}>
            <Label className={label}>{tt("Once it has passed, say")}</Label>
            <Input value={d.ended_text || ""} maxLength={80} placeholder={tt("It's here")} onChange={(e) => updateData({ ended_text: e.target.value })} />
          </div>
        </div>
      )
    }
    case "map": {
      const d = block.data as MapBlockData
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title || ""} maxLength={80} placeholder={tt("Visit the studio")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
          <div className={field}>
            <Label className={label}>{tt("Address or place")}</Label>
            <Input value={d.address || ""} maxLength={200} placeholder={tt("Strada Lipscani 12, Bucharest")} onChange={(e) => updateData({ address: e.target.value })} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
            <span className="text-[13px] text-[#1a1a2e]">{tt("Show an Open in Maps button")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={d.show_button !== false}
              aria-label={tt("Show an Open in Maps button")}
              onClick={() => { hapticTap("light"); updateData({ show_button: d.show_button === false }) }}
              className="-my-[11px] -mr-[3px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <span aria-hidden className={switchTrack(d.show_button !== false)}>
                <span className={switchKnob(d.show_button !== false)} />
              </span>
            </button>
          </div>
        </div>
      )
    }
    case "video": {
      const d = block.data as VideoBlockData
      const ok = !d.url?.trim() || videoSource(d.url) !== null
      return (
        <div className="space-y-3">
          <div className={field}>
            <Label className={label}>{tt("Video link")}</Label>
            <Input value={d.url || ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://youtube.com/watch?v=..." onChange={(e) => updateData({ url: e.target.value.trim() })} aria-invalid={!ok || undefined} />
            {!ok ? <p className="text-[12px] text-[#b42318]">{tt("Paste a YouTube, Vimeo or TikTok video link.")}</p> : null}
          </div>
          <div className={field}>
            <Label className={label}>{tt("Title (optional)")}</Label>
            <Input value={d.title || ""} maxLength={80} placeholder={tt("Watch the trailer")} onChange={(e) => updateData({ title: e.target.value })} />
          </div>
        </div>
      )
    }
    default:
      return <CreatorBlockEditor block={block} updateData={updateData} />
  }
}

/**
 * THE SCHEDULE AND THE WARNING, UNDER ANY BLOCK'S OWN SETTINGS, as the rows
 * of Linktree's link settings: a line icon, a name, a grey line saying what
 * is set, and the control. The schedule row opens in place to two fields,
 * "Show from" and "Hide after", each a day and a time
 * (./date-time-field), with the time zone they are in said underneath.
 * Closed until used, so a block's panel is no longer than it was for
 * somebody who never schedules anything; opened by itself once a schedule
 * is set.
 */
export function BlockExtras({
  block,
  scheduling = true,
  updateBlock,
  updateData,
}: {
  block: OnePageBlock
  /** Off inside a group: a group's blocks show with the group. */
  scheduling?: boolean
  updateBlock: (updates: Partial<OnePageBlock>) => void
  updateData: (updates: Partial<OnePageBlockData>) => void
}) {
  const s = block.schedule || null
  const [open, setOpen] = React.useState(!!(s?.start_at || s?.end_at))
  const isLink = block.type === "link_button"
  const sensitive = isLink && !!(block.data as { sensitive?: boolean }).sensitive
  const status = scheduleLabel(block)
  const set = (next: OnePageBlockSchedule) => updateBlock({ schedule: next.start_at || next.end_at ? next : null })
  const invalid = !!(s?.start_at && s?.end_at && Date.parse(s.end_at) <= Date.parse(s.start_at))
  const [zone, setZone] = React.useState<string | null>(null)
  React.useEffect(() => setZone(viewerZone()), [])
  const row = "flex min-h-[60px] w-full items-center gap-3.5 py-2 text-left"
  return (
    <div data-block-extras="" className="mt-4 border-t border-[#eef0f2] pt-1">
      {isLink ? (
        <div className={row}>
          <EyeOff aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.6} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-medium text-[#1a1a2e]">{tt("Sensitive content")}</span>
            <span className="block text-[13px] text-[#6b7280]">{tt("Visitors confirm before it opens")}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sensitive}
            aria-label={tt("Sensitive content")}
            data-sensitive-switch=""
            onClick={() => { hapticTap("light"); updateData({ sensitive: !sensitive }) }}
            className="-mr-[3px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
          >
            <span aria-hidden className={switchTrack(sensitive)}>
              <span className={switchKnob(sensitive)} />
            </span>
          </button>
        </div>
      ) : null}
      {scheduling ? (
        <div className={cn(isLink && "border-t border-[#eef0f2]")}>
          <button type="button" aria-expanded={open} data-schedule-toggle="" onClick={() => setOpen((v) => !v)} className={cn(row, "cursor-pointer rounded-lg outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]")}>
            <CalendarClock aria-hidden className="h-5 w-5 shrink-0 text-[#1a1a2e]" strokeWidth={1.6} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-[#1a1a2e]">{tt("Schedule")}</span>
              <span className={cn("block truncate text-[13px]", status ? (status.live ? "text-[#15803d]" : "text-[#9a5b00]") : "text-[#6b7280]")}>{status ? status.text : tt("Show it only between two times")}</span>
            </span>
            <ChevronRight aria-hidden data-keep-transform="" className={cn("h-5 w-5 shrink-0 text-[#1a1a2e] transition-transform duration-200", open && "rotate-90")} strokeWidth={1.75} />
          </button>
          {open ? (
            <div data-schedule-panel="" className="mb-2 space-y-3 rounded-2xl border border-[#e3e4e8] bg-white p-3.5">
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Show from")}</span>
                <DateTimeField label={tt("Show from")} value={s?.start_at} emptyLabel={tt("Now")} defaultTime={{ hour: 9, minute: 0 }} onChange={(iso) => set({ ...(s || {}), start_at: iso })} />
              </div>
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Hide after")}</span>
                <DateTimeField label={tt("Hide after")} value={s?.end_at} emptyLabel={tt("Never")} defaultTime={{ hour: 23, minute: 59 }} after={s?.start_at} onChange={(iso) => set({ ...(s || {}), end_at: iso })} />
              </div>
              {invalid ? <p className="text-[13px] text-[#b42318]">{tt("It hides before it shows, so it would never be on the page.")}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef0f2] pt-3">
                <span className="text-[12.5px] text-[#6b7280]" data-schedule-zone="">{zone ? tt("Times are in {name}", { name: zoneLabel(zone) }) : "\u00a0"}</span>
                {s?.start_at || s?.end_at ? (
                  <button type="button" data-schedule-clear="" onClick={() => updateBlock({ schedule: null })} className="h-9 cursor-pointer rounded-lg px-1 text-[13px] font-medium text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                    {tt("Clear schedule")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** The small marks on a block's row in the editor: when it is scheduled, and when its link asks first. */
export function BlockBadges({ block }: { block: OnePageBlock }) {
  const status = scheduleLabel(block)
  const sensitive = block.type === "link_button" && !!(block.data as { sensitive?: boolean }).sensitive
  if (!status && !sensitive) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {status ? (
        <span
          data-block-schedule={status.live ? "live" : "off"}
          className={cn(
            "inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[10.5px] font-medium",
            status.live ? "bg-[#e3f5e9] text-[#15803d]" : "bg-[#fff4e0] text-[#9a5b00]",
          )}
        >
          <Clock aria-hidden className="h-2.5 w-2.5" />
          {status.text}
        </span>
      ) : null}
      {sensitive ? (
        <span data-block-sensitive="" className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[#f1f2f4] px-1.5 text-[10.5px] font-medium text-[#4b5563]">
          <EyeOff aria-hidden className="h-2.5 w-2.5" />
          {tt("Sensitive")}
        </span>
      ) : null}
    </span>
  )
}
