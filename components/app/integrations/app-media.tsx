"use client"

/**
 * ===========================================================================
 *  AN APP'S GALLERY (round 58, round 60)
 * ===========================================================================
 * The right column's top on an app's listing: one large frame and two tiles
 * beside it from 1024px, a row that scrolls sideways with a snap on a phone.
 *
 *   VIDEO     exactly one (r24, the owner): the provider's demo, checked
 *             against its own YouTube channel (lib/integrations/videos.ts).
 *             A lite embed: its own YouTube thumbnail, from i.ytimg.com,
 *             lazy, sized and in a box that has its shape before it comes,
 *             with a play button. Pressing it (large, or its tile) puts a
 *             youtube-nocookie frame in the poster's exact box. Nothing is
 *             asked of youtube.com before a press, and only the layout that
 *             was pressed loads the frame (the other is hidden, and a hidden
 *             frame would still load and play).
 *   PICTURES  Storelib's own pictures of the app connected to a store
 *             (lib/integrations/shots.ts): WebP at three widths with a
 *             srcset, lazy, 16:9, their size written on the tag.
 *   SCENES    otherwise (and to fill the frames when there are fewer than
 *             three videos), Storelib's own UI drawn small: what the
 *             integration does here, in the page's own type and colours.
 *
 * Every frame has its box before anything is in it (aspect-ratio), so the
 * page never shifts.
 */
import * as React from "react"
import { Check, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Mark } from "@/components/app/settings/integration-mark"
import { youtubeEmbedUrl, youtubeThumbUrl, type AppMedia, type SceneKind } from "@/lib/integrations/listing"
import type { Integration } from "@/lib/integrations/catalog"

type Tone = "green" | "amber" | "gray"
interface Frame {
  title: string
  rows: { label: string; value: string; tone?: Tone }[]
}

/* The scenes, in the store's words. {name} is the integration's. Sample values only, never a figure about anyone's business. */
function scenes(kind: SceneKind, name: string): Frame[] {
  const n = (s: string) => s.replace(/\{name\}/g, name)
  switch (kind) {
    case "orders":
      return [
        { title: tt("Order #1042"), rows: [{ label: tt("Status"), value: tt("Paid"), tone: "green" }, { label: tt("Items"), value: tt("Harbour print, A3") }, { label: tt("Fulfilment"), value: n(tt("Sent to {name}")), tone: "green" }] },
        { title: tt("Product"), rows: [{ label: tt("Sold as"), value: tt("Print on demand") }, { label: tt("Location"), value: name }] },
        { title: tt("Shipping email"), rows: [{ label: tt("Tracking"), value: tt("Added to the order"), tone: "green" }, { label: tt("Buyer"), value: tt("Told it is on its way") }] },
      ]
    case "labels":
      return [
        { title: tt("Buy a label"), rows: [{ label: tt("Package"), value: tt("Small box, 0.4 kg") }, { label: tt("Rates"), value: n(tt("Live from {name}")) }, { label: tt("Address"), value: tt("Checked"), tone: "green" }] },
        { title: tt("Label"), rows: [{ label: tt("PDF"), value: tt("Ready to print"), tone: "green" }] },
        { title: tt("Order #1042"), rows: [{ label: tt("Items"), value: tt("Shipped"), tone: "green" }] },
      ]
    case "shipments":
      return [
        { title: tt("Order #1042"), rows: [{ label: tt("Status"), value: tt("Paid"), tone: "green" }, { label: n(tt("In {name}")), value: tt("Waiting for a label"), tone: "amber" }, { label: tt("Tracking"), value: tt("Comes back when shipped") }] },
        { title: n(tt("{name}")), rows: [{ label: tt("Store"), value: "Storelib" }] },
        { title: tt("Order #1042"), rows: [{ label: tt("Items"), value: tt("Shipped"), tone: "green" }] },
      ]
    case "subscribers":
      return [
        { title: tt("New subscriber"), rows: [{ label: tt("From"), value: tt("Checkout news box") }, { label: tt("Consent"), value: tt("Said yes"), tone: "green" }, { label: name, value: tt("Added to your list"), tone: "green" }] },
        { title: tt("Order #1042"), rows: [{ label: name, value: tt("Placed Order sent"), tone: "green" }] },
        { title: tt("Unsubscribed"), rows: [{ label: tt("Both ways"), value: tt("Kept in step") }] },
      ]
    case "pixel":
      return [
        { title: tt("Your website"), rows: [{ label: name, value: tt("Loads on every page"), tone: "green" }, { label: tt("Page view"), value: tt("Counted") }, { label: tt("Purchase"), value: tt("Sent with its value"), tone: "green" }] },
        { title: tt("Settings"), rows: [{ label: tt("ID"), value: tt("Saved"), tone: "green" }] },
        { title: tt("Checkout"), rows: [{ label: tt("Order page"), value: tt("Purchase sent") }] },
      ]
    case "reviews":
      return [
        { title: tt("Review request"), rows: [{ label: tt("Sent"), value: tt("7 days after delivery") }, { label: tt("Reply"), value: tt("5 stars, with a photo"), tone: "green" }, { label: tt("Status"), value: tt("Published"), tone: "green" }] },
        { title: tt("Product page"), rows: [{ label: tt("Stars"), value: tt("Shown"), tone: "green" }] },
        { title: tt("Waiting"), rows: [{ label: tt("Pending"), value: tt("To approve"), tone: "amber" }] },
      ]
    case "bookings":
      return [
        { title: tt("New booking"), rows: [{ label: tt("From"), value: name }, { label: tt("When"), value: tt("Tuesday, 10:00") }, { label: tt("In Bookings"), value: tt("Added"), tone: "green" }] },
        { title: tt("Webhook"), rows: [{ label: tt("Added by Storelib"), value: tt("On"), tone: "green" }] },
        { title: tt("Contacts"), rows: [{ label: tt("Guest"), value: tt("Saved") }] },
      ]
    case "community":
      return [
        { title: tt("Sale"), rows: [{ label: tt("Product"), value: tt("Members' circle") }, { label: n(tt("{name} access")), value: tt("Given"), tone: "green" }, { label: tt("Refund"), value: tt("Access taken back") }] },
        { title: name, rows: [{ label: tt("Bot"), value: tt("Connected"), tone: "green" }] },
        { title: tt("Members"), rows: [{ label: tt("Each buyer"), value: tt("Listed") }] },
      ]
    case "signups":
      return [
        { title: tt("OnePage signup"), rows: [{ label: tt("Email"), value: tt("ana@example.com") }, { label: tt("Updates"), value: tt("Ticked"), tone: "green" }, { label: name, value: tt("Sent as it happens"), tone: "green" }] },
        { title: tt("Lead magnet"), rows: [{ label: name, value: tt("Sent"), tone: "green" }] },
        { title: tt("Contact form"), rows: [{ label: name, value: tt("Sent"), tone: "green" }] },
      ]
    case "parcels":
      return [
        { title: tt("Parcel"), rows: [{ label: tt("Carrier"), value: tt("Found from the number") }, { label: tt("Status"), value: tt("In transit"), tone: "amber" }, { label: tt("Buyer"), value: tt("Emailed on each step") }] },
        { title: tt("Order #1042"), rows: [{ label: tt("Tracking"), value: tt("Followed"), tone: "green" }] },
        { title: tt("Delivered"), rows: [{ label: tt("Status"), value: tt("Delivered"), tone: "green" }] },
      ]
    case "analytics":
      return [
        { title: tt("Send to"), rows: [{ label: tt("Visits"), value: tt("Sent"), tone: "green" }, { label: tt("Sales"), value: tt("Sent"), tone: "green" }, { label: tt("Your tools"), value: tt("Read them") }] },
        { title: tt("Analytics"), rows: [{ label: tt("In Storelib"), value: tt("Kept too") }] },
        { title: tt("Destinations"), rows: [{ label: tt("Connected"), value: tt("Listed"), tone: "green" }] },
      ]
    case "soon":
      return [
        { title: name, rows: [{ label: tt("Status"), value: tt("Coming soon"), tone: "amber" }, { label: tt("Ask for it"), value: tt("You'll be counted") }, { label: tt("Built first"), value: tt("The most asked for") }] },
        { title: tt("Your request"), rows: [{ label: tt("Counted"), value: tt("Once per store") }] },
        { title: tt("When it's ready"), rows: [{ label: tt("Its page"), value: tt("Says what it sends") }] },
      ]
  }
}

const DOT: Record<Tone, string> = { green: "bg-[#12b76a]", amber: "bg-[#f79009]", gray: "bg-[#9ca3af]" }

/** One drawn frame: a white Storelib card on the page's grey, the mark in its head. */
function SceneFrame({ item, frame, large }: { item: Pick<Integration, "id" | "name" | "logo">; frame: Frame; large: boolean }) {
  const rows = large ? frame.rows : frame.rows.slice(0, 1)
  return (
    <div className={cn("flex h-full w-full items-center justify-center bg-[#f3f4f6]", large ? "p-[7%]" : "p-3")} data-app-scene="">
      <div className={cn("w-full rounded-xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05),0_10px_24px_-16px_rgba(16,24,40,0.2)]", large ? "max-w-[420px] p-4 sm:p-5" : "p-2.5")}>
        <div className="flex items-center gap-2.5">
          <Mark item={item} size={large ? 28 : 20} />
          <p className={cn("min-w-0 truncate font-semibold text-[#1a1a2e]", large ? "text-[14px] sm:text-[15px]" : "text-[12px]")}>{frame.title}</p>
        </div>
        <dl className={cn("divide-y divide-[#f1f2f4]", large ? "mt-3" : "mt-1.5")}>
          {rows.map((r) => (
            <div key={r.label} className={cn("flex items-center justify-between gap-3", large ? "py-2 text-[13px] sm:text-[13.5px]" : "py-1 text-[11px]")}>
              {/* A small frame has room for the value alone. */}
              <dt className={cn("min-w-0 truncate text-[#6b7280]", large ? null : "sr-only")}>{r.label}</dt>
              <dd className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium text-[#1a1a2e]">
                {r.tone ? <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[r.tone])} /> : null}
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

type Slide = { kind: "video"; id: string; title: string; channel: string } | { kind: "image"; src: string; alt: string; srcSet?: string; width?: number; height?: number } | { kind: "scene"; frame: Frame }

/** The slides in order: the one video, the pictures, then Storelib's drawn scenes to fill the frames (all of them when there is neither). */
export function slidesOf(item: Pick<Integration, "name">, media: AppMedia): Slide[] {
  const videos = media.video ? [{ kind: "video" as const, id: media.video.youtubeId, title: media.video.title, channel: media.video.channel }] : []
  const pictures = media.screenshots.map((s) => ({ kind: "image" as const, src: s.src, alt: s.alt, srcSet: s.srcSet, width: s.width, height: s.height }))
  const drawn = scenes(media.scene, item.name).map((frame) => ({ kind: "scene" as const, frame }))
  const own = [...videos, ...pictures]
  return own.length >= 3 ? own : [...own, ...drawn].slice(0, 3)
}

/* The tint behind a thumbnail that did not come, so a frame is never an empty hole. */
const tint = (color: string) => ({ backgroundImage: `linear-gradient(160deg, color-mix(in srgb, ${color} 26%, #f6f7f9), #eef0f3 70%)` })

/**
 * A VIDEO'S THUMBNAIL, from YouTube's image host. Lazy, with its own size
 * (1280x720) and in a box that already has its shape, so nothing moves when
 * it arrives; it fades in over the tint on opacity alone. If it does not
 * come, the tint and the mark stay.
 */
function Thumb({ item, id, title, color, small }: { item: Pick<Integration, "id" | "name" | "logo">; id: string; title: string; color: string; small?: boolean }) {
  const src = youtubeThumbUrl(id)
  const [state, setState] = React.useState<"loading" | "ready" | "failed">("loading")
  const ref = React.useRef<HTMLImageElement>(null)
  /* Already in the cache (a second visit): ready before the first paint, so it does not fade in again. */
  React.useLayoutEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth > 0) setState("ready")
  }, [])
  return (
    <div className="absolute inset-0" style={tint(color)}>
      {state === "failed" || !src ? (
        <div className="flex h-full w-full items-center justify-center">
          <Mark item={item} size={small ? 28 : 44} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={src}
          alt={title}
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", state === "ready" ? "opacity-100" : "opacity-0")}
          data-app-photo=""
        />
      )}
    </div>
  )
}

const PLAY = "flex items-center justify-center rounded-full bg-[#1a1a2e]/90 text-white shadow-[0_8px_24px_-8px_rgba(16,24,40,0.5)]"

/**
 * A VIDEO IN A LARGE FRAME: its thumbnail and a play button. Pressed, a
 * youtube-nocookie frame takes the poster's exact box and plays; nothing is
 * asked of youtube.com before that press.
 */
function VideoSlide({ item, id, title, color, playing, onPlay }: { item: Pick<Integration, "id" | "name" | "logo">; id: string; title: string; color: string; playing: boolean; onPlay: () => void }) {
  const src = youtubeEmbedUrl(id)
  if (!src) return null
  return (
    <div className="absolute inset-0" data-app-video={playing ? "playing" : "poster"}>
      {playing ? (
        <iframe src={src} title={title} className="absolute inset-0 h-full w-full border-0 bg-black" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button
          type="button"
          onClick={onPlay}
          className="group absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a1a2e]/30 [-webkit-tap-highlight-color:transparent]"
          aria-label={tt("Play {title}", { title })}
          data-app-video-poster=""
        >
          <Thumb item={item} id={id} title={title} color={color} />
          <span className={cn(PLAY, "absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none")}>
            <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden />
          </span>
        </button>
      )}
    </div>
  )
}

/** One of Storelib's pictures: lazy, its widths offered, its size on the tag so the box never waits for it. */
function Shot({ s, sizes, tile = false }: { s: Extract<Slide, { kind: "image" }>; sizes: string; tile?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.src} srcSet={s.srcSet} sizes={s.srcSet ? sizes : undefined} width={s.width} height={s.height} alt={s.alt} className={cn("h-full w-full object-cover", tile && "object-left-top")} loading="lazy" decoding="async" data-app-photo="" data-app-shot="" />
  )
}

export function AppMediaGallery({ item, media, color }: { item: Pick<Integration, "id" | "name" | "logo">; media: AppMedia; color: string }) {
  const slides = slidesOf(item, media)
  const [at, setAt] = React.useState(0)
  /* The one video playing, by its slide: only ever one, and it stops when another slide is shown. */
  const [playing, setPlaying] = React.useState<number | null>(null)
  /* Which layout was pressed: the computer's frame or the phone's row. Only that one loads the player. */
  const [where, setWhere] = React.useState<"grid" | "row">("grid")
  const label = (s: Slide) => (s.kind === "scene" ? s.frame.title : s.kind === "video" ? tt("Play {title}", { title: s.title }) : s.alt)
  /* A video's frame is 16:9, as its thumbnail and Storelib's pictures are; the drawn scenes keep the 16:10 they were drawn for. */
  const shape = slides[0]?.kind === "scene" ? "aspect-[16/10]" : "aspect-video"
  const large = (s: Slide, i: number) =>
    s.kind === "video" ? (
      <VideoSlide item={item} id={s.id} title={s.title} color={color} playing={playing === i && where === "row"} onPlay={() => { setWhere("row"); setPlaying(i) }} />
    ) : s.kind === "image" ? (
      <Shot s={s} sizes="(min-width: 640px) 520px, 86vw" />
    ) : (
      <SceneFrame item={item} frame={s.frame} large />
    )
  const small = (s: Slide) =>
    s.kind === "video" ? (
      <>
        <Thumb item={item} id={s.id} title={s.title} color={color} small />
        <span className={cn(PLAY, "absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2")} aria-hidden>
          <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
        </span>
      </>
    ) : s.kind === "image" ? (
      /* A tile is squarer than the picture: it keeps the app's name and the page's title, at its top left. */
      <Shot s={s} sizes="280px" tile />
    ) : (
      <SceneFrame item={item} frame={s.frame} large={false} />
    )
  const FRAME = "relative overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#f3f4f6]"
  /* The two tiles beside the large frame: the first two not in it. Any past those are counted on the second ("+ 2 more"), as an app store does. */
  const tiles = slides.map((s, i) => ({ s, i })).filter(({ i }) => i !== at).slice(0, 2)
  const hidden = Math.max(0, slides.length - 3)
  const choose = (i: number) => {
    setAt(i)
    /* A video's tile plays it: pressing a picture of a video means watch it. */
    setWhere("grid")
    setPlaying(slides[i]?.kind === "video" ? i : null)
  }
  return (
    <div data-app-gallery="" data-app-gallery-count={slides.length}>
      {/* From 1024px: the large frame and the two tiles beside it, all on one height. */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.36fr)]">
        <div className={cn(FRAME, shape)} data-app-gallery-main={slides[at]?.kind}>
          {slides.map((s, i) => (
            <div key={i} className={cn("absolute inset-0 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", i === at ? "opacity-100" : "pointer-events-none opacity-0")} inert={i !== at} aria-hidden={i !== at}>
              {/* Only the shown one can be playing: another slide stops it. */}
              {s.kind === "video" ? (
                <VideoSlide item={item} id={s.id} title={s.title} color={color} playing={playing === i && at === i && where === "grid"} onPlay={() => { setWhere("grid"); setPlaying(i) }} />
              ) : s.kind === "image" ? (
                <Shot s={s} sizes="(min-width: 1440px) 720px, 56vw" />
              ) : (
                large(s, i)
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-rows-2 gap-3">
          {tiles.map(({ s, i }, n) => (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              aria-label={n === 1 && hidden > 0 ? tt("{label}, and {n} more", { label: label(s), n: hidden }) : label(s)}
              className={cn(FRAME, "group min-h-0 outline-none transition-shadow duration-150 hover:ring-1 hover:ring-[#d1d5db] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]")}
              data-app-gallery-thumb={i}
            >
              {small(s)}
              {n === 1 && hidden > 0 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/25" data-app-gallery-more={hidden}>
                  <span className="rounded-full bg-white px-3.5 py-1.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_3px_rgba(16,24,40,0.12)]">{tt("+ {n} more", { n: hidden })}</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      {/* Under 1024px: one row, each frame most of the width, snapping, the next one peeking. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" data-app-gallery-row="">
        {slides.map((s, i) => (
          <div key={i} className={cn(FRAME, shape, "w-[86%] max-w-[520px] shrink-0 snap-start")}>
            {large(s, i)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** A tick list (In Storelib, Requirements). */
export function TickList({ rows }: { rows: string[] }) {
  return (
    <ul className="space-y-2.5 text-[14px] leading-[22px] text-[#6b7280] sm:text-[15px] sm:leading-6">
      {rows.map((r) => (
        <li key={r} className="flex gap-2.5">
          <Check className="mt-[3px] h-4 w-4 shrink-0 text-[#4b5563] sm:mt-1" aria-hidden />
          <span className="min-w-0">{r}</span>
        </li>
      ))}
    </ul>
  )
}
