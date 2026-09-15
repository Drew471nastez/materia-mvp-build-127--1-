"use client"

/**
 * ===========================================================================
 *  THE PRODUCT'S PICTURES, FULL SCREEN, ON A PHONE
 * ===========================================================================
 * The gallery on a product page draws into a 16:9 box about 200px tall. For a
 * poster, a screenshot of a template, a photograph of a print, that is not
 * enough to decide anything by — and there was no way to see more. Pressing a
 * picture did nothing at all.
 *
 * PHONE ONLY, and that is the ask rather than an omission: on a desktop the
 * gallery is already 600px wide beside the buy card, and a lightbox there
 * would be a second way to look at something already visible.
 *
 * ---------------------------------------------------------------------------
 *  A TRACK, NOT A CROSSFADE
 * ---------------------------------------------------------------------------
 * The gallery below fades between slides, which is right for a small box that
 * changes when you press a thumbnail. Full screen the gesture is a swipe, and
 * a swipe has to move the thing under the finger — so this is one row of
 * slides translated by the index, dragged live, and snapped on release. That
 * is what makes it feel like a photo viewer rather than a slideshow.
 *
 * ---------------------------------------------------------------------------
 *  THE PANEL IS THE VIEWPORT AND IT IS NOT TRANSFORMED
 * ---------------------------------------------------------------------------
 * DialogContent centres itself with a translate, and a transformed element
 * becomes the containing block for every `fixed` descendant — so a close
 * button `fixed` to the corner of the screen lands on the corner of the
 * PANEL. That cost the avatar lightbox a round; see
 * components/storefront/avatar-lightbox. Same shape here: the panel is the
 * whole viewport, untransformed, and the controls are absolute against it.
 */
import * as React from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface ViewerMedia {
  type: "image" | "video"
  url: string
}

/** Past this, a release changes slide rather than springing back. */
const COMMIT_RATIO = 0.22
/** And a flick is a flick however short, if it is fast enough. */
const FLICK_VELOCITY = 0.4

export function ProductMediaViewer({
  media,
  title,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: {
  media: ViewerMedia[]
  title: string
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Kept in step with the gallery underneath, so closing lands where you were. */
  onIndexChange: (index: number) => void
}) {
  const [dragX, setDragX] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const start = React.useRef<{ x: number; y: number; t: number } | null>(null)
  /** Locked on the first move: a vertical swipe must not drag the track. */
  const axis = React.useRef<"undecided" | "x" | "y">("undecided")
  const width = React.useRef(1)
  const frameRef = React.useRef<HTMLDivElement>(null)

  const count = media.length
  const clamp = React.useCallback((i: number) => Math.max(0, Math.min(count - 1, i)), [count])

  const go = React.useCallback(
    (next: number) => {
      onIndexChange(clamp(next))
    },
    [clamp, onIndexChange],
  )

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(index - 1)
      if (e.key === "ArrowRight") go(index + 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, index, go])

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    width.current = frameRef.current?.clientWidth || window.innerWidth || 1
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
    axis.current = "undecided"
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const from = start.current
    if (!from || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - from.x
    const dy = e.touches[0].clientY - from.y

    /*
      ONE DECISION PER GESTURE, made on the first movement past a threshold.
      Without it a mostly-vertical swipe drags the track sideways by a few
      pixels and springs back, which reads as the viewer twitching.
    */
    if (axis.current === "undecided") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
    }
    if (axis.current !== "x") return

    /* Rubber-band at the two ends, so the track feels attached to a finger
       rather than to a clamp. */
    const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === count - 1)
    setDragX(atEnd ? dx / 3 : dx)
  }

  const onTouchEnd = () => {
    const from = start.current
    start.current = null
    setDragging(false)
    if (!from || axis.current !== "x") {
      setDragX(0)
      return
    }
    const elapsed = Math.max(1, performance.now() - from.t)
    const velocity = Math.abs(dragX) / elapsed
    const past = Math.abs(dragX) > width.current * COMMIT_RATIO
    if (past || velocity > FLICK_VELOCITY) go(index + (dragX < 0 ? 1 : -1))
    setDragX(0)
  }

  if (count === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/95"
        className="left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* The corner of the SCREEN, which is what the untransformed panel buys. */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors active:bg-white/20"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </button>

        {count > 1 && (
          <span
            aria-hidden
            className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium tabular-nums text-white backdrop-blur-sm"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.1rem)" }}
          >
            {index + 1} / {count}
          </span>
        )}

        <div
          ref={frameRef}
          className="relative flex-1 overflow-hidden"
          /* touch-none, or the browser's own horizontal pan competes with the
             track and the swipe drops frames. */
          style={{ touchAction: "none" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div
            className={cn("flex h-full w-full", !dragging && "transition-transform duration-300 ease-sheet")}
            style={{ transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)` }}
          >
            {media.map((item, i) => (
              <div key={i} className="relative h-full w-full shrink-0">
                {item.type === "image" ? (
                  <Image
                    src={item.url || "/placeholder.svg"}
                    alt={`${title} — ${i + 1} of ${count}`}
                    fill
                    /*
                      `contain`, not `cover`. The gallery crops to a 16:9 box
                      because it has a layout to keep; the whole point of
                      opening a picture is to see the parts that box cut off.
                    */
                    className="object-contain"
                    sizes="100vw"
                    /* Only what is on screen and its neighbours: a product
                       with twelve pictures should not fetch twelve. */
                    priority={Math.abs(i - index) <= 1}
                    loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                    draggable={false}
                  />
                ) : (
                  <video
                    src={item.url}
                    className="h-full w-full object-contain"
                    controls
                    playsInline
                    preload={Math.abs(i - index) <= 1 ? "metadata" : "none"}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/*
          The arrows are for a thumb that does not want to swipe, and for
          anything driving this with a keyboard or a screen reader. Bottom
          corners rather than the vertical middle: the middle of the screen is
          where the picture is, and a control over the picture is in the way
          of the one thing being looked at.
        */}
        {count > 1 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 flex items-center justify-between px-4"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
          >
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous picture"
              className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-opacity active:bg-white/20 disabled:opacity-25"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === count - 1}
              aria-label="Next picture"
              className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-opacity active:bg-white/20 disabled:opacity-25"
            >
              <ChevronRight className="h-6 w-6" strokeWidth={2} />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
