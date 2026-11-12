"use client"

/**
 * ===========================================================================
 *  THE PRODUCT SHEET'S PICTURES AND VIDEOS, FULL SCREEN (round 53)
 * ===========================================================================
 * The owner: "a fullscreen or lightbox view on tap". A tap on a picture or a
 * video in the product sheet (components/onepage/product-sheet) opens this,
 * on the one tapped, over everything.
 *
 *   STRIP     the same scroll snap strip as the sheet's gallery, a slide the
 *             size of the screen: swiped on a phone, the arrows and the arrow
 *             keys on a computer. Pictures are drawn whole (contain).
 *   VIDEO     the one shown plays in Storelib's own player (components/media/
 *             video-player: play, scrub, sound, fullscreen), with sound,
 *             from where it is; the others wait on their first frame. The
 *             player is fetched with the first video opened, not before.
 *   DIALOG    the app's dialog (components/ui/dialog), so it stacks over the
 *             sheet on a computer and over the phone sheet alike: Escape
 *             closes this and not the sheet under it, focus stays inside.
 *             It sits one layer over the dialogs (z-index), since the
 *             sheet's own window shares their layer and was drawn over this
 *             one's ground. Its panel is the whole screen and not transformed at rest, so
 *             the controls sit at the corners of the screen. It opens with
 *             the product page's viewer motion (media-viewer-*, globals.css).
 *
 * Closing hands back the slide it was on, so the sheet stands on it.
 */
import { FramedPicture, shownRatio, useLetterbox } from "@/components/ui/framed-picture"
import * as React from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { MediaEntry } from "@/lib/media/video"
import { firstFrameSrc } from "@/lib/onepage/poster-video"

const VideoPlayer = React.lazy(() => import("@/components/media/video-player").then((m) => ({ default: m.VideoPlayer })))

/** The player's file, asked for ahead when a gallery holds a video, so the first one opened has it. */
export function preloadLightboxPlayer(): void {
  void import("@/components/media/video-player").catch(() => undefined)
}

/* The product's own file, public: an address that does not run out. The player renews it with itself. */
const LONG_MS = 6 * 60 * 60 * 1000

export function ProductLightbox({
  media,
  title,
  index,
  onClose,
  ratios,
}: {
  media: MediaEntry[]
  title: string
  /** The slide to open on, or null for closed. */
  index: number | null
  /** With the slide it was on when it closed. */
  onClose: (index: number) => void
  /** Each video's own width over height, as the gallery measured it, for the player's box. */
  ratios?: Record<number, number>
}) {
  const open = index !== null
  const count = media.length
  const strip = React.useRef<HTMLDivElement | null>(null)
  const [at, setAt] = React.useState(index ?? 0)
  const atRef = React.useRef(at)
  const [prevIndex, setPrevIndex] = React.useState(index)
  if (index !== prevIndex) {
    setPrevIndex(index)
    if (index !== null) {
      setAt(index)
      atRef.current = index
    }
  }

  /* On the slide tapped from the first frame: the strip is put there as it is attached, before it is painted. */
  const attach = React.useCallback((el: HTMLDivElement | null) => {
    strip.current = el
    if (el) el.scrollLeft = atRef.current * el.clientWidth
  }, [])

  const go = (i: number) => {
    const el = strip.current
    const n = Math.max(0, Math.min(count - 1, i))
    if (!el) return
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" })
    atRef.current = n
    setAt(n)
  }

  const close = () => onClose(atRef.current)

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent
        showCloseButton={false}
        disableDefaultAnimations
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus?.()
        }}
        onKeyDown={(e) => {
          /* Inside the player the arrows seek; elsewhere they step. */
          if ((e.target as HTMLElement | null)?.closest?.("[data-video-player]")) return
          if (e.key === "ArrowRight") {
            e.preventDefault()
            go(atRef.current + 1)
          } else if (e.key === "ArrowLeft") {
            e.preventDefault()
            go(atRef.current - 1)
          }
        }}
        overlayClassName="media-viewer-overlay z-[2147483640] bg-black/95"
        className="media-viewer-panel z-[2147483641] inset-0 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none outline-none focus:outline-none focus-visible:outline-none sm:max-w-none"
        data-product-sheet-lightbox=""
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div
          ref={attach}
          onScroll={(e) => {
            const el = e.currentTarget
            const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
            if (n !== atRef.current) {
              atRef.current = n
              setAt(n)
            }
          }}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-lightbox-strip=""
        >
          {media.map((m, i) => (
            <div key={i} className="relative grid h-full w-full shrink-0 snap-center snap-always place-items-center px-0 sm:px-16" style={{ paddingTop: "calc(var(--op-safe-top, 0px) + 56px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}>
              {m.type === "image" ? (
                <LightboxPicture src={m.url} alt={i === 0 ? title : ""} eager={Math.abs(i - at) <= 1} />
              ) : i === at && open ? (
                <div className="w-full" style={{ maxWidth: `min(100%, calc((var(--vv-h, 100dvh) - 140px - var(--op-safe-top, 0px) - env(safe-area-inset-bottom, 0px)) * ${ratios?.[i] || 16 / 9}))` }}>
                  <React.Suspense fallback={<LightboxPoster entry={m} />}>
                    <VideoPlayer
                      source={{ url: m.url, expiresAt: Date.now() + LONG_MS, mime: m.mime, captions: null }}
                      renew={async () => ({ url: m.url, expiresAt: Date.now() + LONG_MS, mime: m.mime, captions: null })}
                      poster={m.poster}
                      autoPlay
                      title={title}
                      ratio={ratios?.[i] || 16 / 9}
                      rounded={false}
                    />
                  </React.Suspense>
                </div>
              ) : (
                <LightboxPoster entry={m} />
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute z-20 grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white outline-none transition-[background-color] duration-150 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/80"
          style={{ top: "calc(var(--op-safe-top, 0px) + 0.75rem)", right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)" }}
          data-lightbox-close=""
        >
          <X aria-hidden className="h-5 w-5" strokeWidth={2.25} />
        </button>
        {count > 1 ? (
          <>
            <span aria-live="polite" className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/12 px-3 py-1 text-[13px] font-medium tabular-nums text-white" style={{ top: "calc(var(--op-safe-top, 0px) + 1.1rem)" }} data-lightbox-count="">
              {at + 1} / {count}
            </span>
            <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center justify-between px-4" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}>
              <button type="button" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous" className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-white/12 text-white outline-none transition-[background-color,opacity] duration-150 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-30" data-lightbox-prev="">
                <ChevronLeft aria-hidden className="h-6 w-6" />
              </button>
              <button type="button" onClick={() => go(at + 1)} disabled={at === count - 1} aria-label="Next" className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-white/12 text-white outline-none transition-[background-color,opacity] duration-150 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-30" data-lightbox-next="">
                <ChevronRight aria-hidden className="h-6 w-6" />
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** A video that is not the one shown: its first frame, whole. */
function LightboxPoster({ entry }: { entry: Extract<MediaEntry, { type: "video" }> }) {
  return entry.poster ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.poster} alt="" className="h-full w-full select-none object-contain" draggable={false} decoding="async" />
  ) : (
    <video src={firstFrameSrc(entry.url)} muted playsInline preload="metadata" className="h-full w-full object-contain" aria-hidden />
  )
}

/**
 * One picture full screen (round AK): whole, at its own shape. A picture carrying the product editor's grey padding
 * is drawn without it (lib/images/letterbox): a box of the picture's own shape, as large as the space allows (a size
 * container, so the box's width can follow the space's height), with the padding outside the box.
 */
function LightboxPicture({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  const shape = useLetterbox(src, eager)
  const own = shape?.box ? shownRatio(shape) : null
  if (!own) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="h-full w-full select-none object-contain" draggable={false} decoding="async" loading={eager ? "eager" : "lazy"} />
  }
  return (
    <span className="grid h-full w-full select-none place-items-center [container-type:size]" data-lightbox-trimmed="">
      <FramedPicture src={src} alt={alt} frame={own} shape={shape} style={{ width: `min(100cqw, calc(100cqh * ${own}))`, aspectRatio: String(own) }} imgProps={{ decoding: "async" }} />
    </span>
  )
}
