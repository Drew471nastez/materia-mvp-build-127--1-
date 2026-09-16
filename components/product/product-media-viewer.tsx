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
import { useSwipeTrack } from "@/lib/gestures/use-swipe-track"

export interface ViewerMedia {
  type: "image" | "video" | "youtube"
  url: string
}

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

  /**
   * ONE GESTURE, NOT TWO COPIES OF IT.
   *
   * This file had its own axis lock, its own rubber band and its own release
   * test, written before lib/gestures/use-swipe-track existed — and that hook
   * was lifted OUT of this file, with a header saying the gallery underneath
   * would use the same one "rather than a second implementation that drifts".
   * The second implementation was this one, still here, and it drifted: the
   * gallery's release measures velocity over the end of the gesture and this
   * one averaged it from the first touch, so the same flick committed in one
   * place and sprang back in the other.
   *
   * It also carried the same fault that made the gallery feel laggy: a
   * setState on every touchmove, which is a React render per frame of the
   * drag, of a component holding every full-screen picture.
   */
  const swipe = useSwipeTrack({ index, count, onIndexChange: go })

  if (count === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        ═════════════════════════════════════════════════════════════════════
         IT OPENS LIKE A PICTURE BEING OPENED
        ═════════════════════════════════════════════════════════════════════
        The dialog's default is a 200ms zoom from 95%, which is right for a
        small panel arriving over a page and wrong for a photograph taking the
        whole screen: at that size a 5% jump is the entire viewport lurching,
        and 200ms is too short to read as anything but a cut.

        So it has its own. The ground fades, and the picture comes up from
        96.5% over 300ms on the curve the rest of the product uses. Closing is
        shorter than opening, 220ms, because a thing on its way out should not
        keep anybody waiting for it.

        `inset-0` rather than `w-screen`: 100vw includes the scrollbar and a
        fixed element's right edge does not, which is how the avatar lightbox
        ended up with its close button in the gutter.
      */}
      <DialogContent
        showCloseButton={false}
        disableDefaultAnimations
        overlayClassName="media-viewer-overlay bg-black/95"
        className="media-viewer-panel inset-0 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-none"
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
          ref={swipe.frameRef}
          className="relative flex-1 overflow-hidden"
          /* touch-none, or the browser's own horizontal pan competes with the
             track and the swipe drops frames. Full screen there is nothing
             under this to scroll, so unlike the gallery it does not need to
             leave `pan-y` to the page. */
          style={{ touchAction: "none" }}
          {...swipe.handlers}
        >
          <div
            ref={swipe.trackRef}
            /* The hook writes this node's transform and its transition. See
               the gallery for why neither belongs in a style prop. */
            className="flex h-full w-full"
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
                ) : item.type === "youtube" ? (
                  /*
                    ═══════════════════════════════════════════════════════
                     A YOUTUBE VIDEO OPENS TOO
                    ═══════════════════════════════════════════════════════
                    It used to be filtered out of this list entirely, so a
                    creator who added one had a gallery where that slide was
                    the only thing that would not open — and, worse, removing
                    it shifted every index after it, so opening any picture
                    past the video showed a different picture.

                    MOUNTED ONLY WHEN IT IS THE ONE BEING LOOKED AT. An
                    iframe is a whole document; three of them behind a
                    photograph is three documents loading, and on a phone
                    that is the swipe stuttering.
                  */
                  i === index ? (
                    <iframe
                      src={`${item.url}?autoplay=0&modestbranding=1&rel=0&playsinline=1`}
                      className="absolute inset-0 h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={`${title} — video ${i + 1}`}
                    />
                  ) : (
                    <div className="h-full w-full" />
                  )
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
