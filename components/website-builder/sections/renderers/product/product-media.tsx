"use client"

/**
 * ===========================================================================
 *  A PRODUCT'S PICTURES: STACKED, GRID, SLIDESHOW OR CAROUSEL
 * ===========================================================================
 * The media column of the main product section. ONE LIST OF PICTURES, each
 * drawn once, laid out by the section's settings:
 *
 *   Stacked                  every picture down the column
 *   Grid                     two to a row
 *   Slideshow with thumbnails one at a time, a strip of thumbnails under it
 *   Carousel                 a row that scrolls, the next one peeking in
 *
 * and on a phone (the section's own width, a container query, so the
 * builder's phone preview is the phone) either a row you swipe with dots
 * under it, or the same pictures one under the other.
 *
 * The slideshow and the phone's swipe are the same thing: a scroll-snapping
 * row whose items are each the full width. The thumbnails and the dots only
 * scroll it; the picture you see is always the one the row is resting on.
 * That is why nothing here is ever drawn twice, and why a swipe, a dot, a
 * thumbnail and a variant all move the same picture.
 *
 * Choosing a variant shows its picture: in a stacked or grid layout it moves
 * to the top (Shopify does the same), in a sliding one the row scrolls to it.
 *
 * Clicking a picture opens it larger, with the arrow keys, Escape and a
 * click to zoom when the section asks for zoom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Package, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { isVideoUrl, videoPosterUrl } from "@/lib/media/video"
import { siteImageProps } from "@/lib/website-builder/site-image"

export type MediaLayout = "stacked" | "stacked_2col" | "slideshow" | "carousel"

const RATIO: Record<string, string | undefined> = { square: "1 / 1", portrait: "4 / 5", landscape: "4 / 3" }

/**
 * The track's classes, mobile first. The phone is either a swipe row or a
 * column; from 768px of section width the desktop layout takes over. Written
 * out whole so the stylesheet has every one of them.
 */
const TRACK: Record<MediaLayout, string> = {
  stacked: "@[768px]:grid @[768px]:grid-cols-1 @[768px]:gap-3 @[768px]:overflow-visible @[768px]:snap-none",
  stacked_2col: "@[768px]:grid @[768px]:grid-cols-2 @[768px]:gap-3 @[768px]:overflow-visible @[768px]:snap-none",
  slideshow: "@[768px]:flex @[768px]:gap-0 @[768px]:overflow-x-auto @[768px]:snap-x @[768px]:snap-mandatory",
  carousel: "@[768px]:flex @[768px]:gap-3 @[768px]:overflow-x-auto @[768px]:snap-x @[768px]:snap-mandatory",
}
const ITEM: Record<MediaLayout, string> = {
  stacked: "@[768px]:w-auto",
  stacked_2col: "@[768px]:w-auto",
  slideshow: "@[768px]:w-full @[768px]:shrink-0 @[768px]:snap-start",
  carousel: "@[768px]:w-[78%] @[768px]:shrink-0 @[768px]:snap-start",
}

export function ProductMedia({
  images,
  title,
  layout,
  mobile,
  ratio,
  clickAction,
  hoverZoom,
  featured,
  surface,
  border,
  accent,
  radius,
  interactive,
}: {
  images: string[]
  title: string
  layout: MediaLayout
  /** "slider" or "stacked". */
  mobile: string
  ratio: string
  clickAction: string
  hoverZoom: boolean
  /** The picture to show: the chosen variant's, or -1 for none in particular. */
  featured: number
  surface: string
  border: string
  accent: string
  radius: string
  /** False while the inspector is on: a click selects, it does not open. */
  interactive: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)

  /* In a stacked or grid layout the chosen variant's picture moves to the
     top; the list is still each picture once. */
  const reorders = layout === "stacked" || layout === "stacked_2col"
  const ordered = useMemo(() => {
    if (!reorders || featured <= 0 || featured >= images.length) return images.map((src, i) => ({ src, i }))
    return [{ src: images[featured], i: featured }, ...images.map((src, i) => ({ src, i })).filter((x) => x.i !== featured)]
  }, [images, featured, reorders])

  const scrollTo = useCallback((index: number, smooth = true) => {
    const track = trackRef.current
    if (!track) return
    const item = track.children[index] as HTMLElement | undefined
    if (!item) return
    /* Only when the track actually scrolls sideways; a stacked column is left where it is. */
    if (track.scrollWidth <= track.clientWidth + 1) return
    const left = track.scrollLeft + item.getBoundingClientRect().left - track.getBoundingClientRect().left
    track.scrollTo({ left, behavior: smooth ? "smooth" : "auto" })
  }, [])

  /* A variant chosen: its picture, wherever it is. */
  useEffect(() => {
    if (featured < 0) return
    const at = reorders ? 0 : featured
    setActive(at)
    scrollTo(at)
  }, [featured, reorders, scrollTo])

  /* Which picture the row is resting on, for the dots and the thumbnails. */
  const onScroll = useCallback(() => {
    const track = trackRef.current
    if (!track || track.scrollWidth <= track.clientWidth + 1) return
    const items = Array.from(track.children) as HTMLElement[]
    const edge = track.getBoundingClientRect().left
    let best = 0
    let dist = Infinity
    items.forEach((el, i) => {
      const d = Math.abs(el.getBoundingClientRect().left - edge)
      if (d < dist) { dist = d; best = i }
    })
    setActive(best)
  }, [])

  const open = interactive && clickAction !== "none"

  if (images.length === 0) {
    return (
      <div
        className="flex aspect-[4/5] w-full items-center justify-center"
        style={{ background: surface, border: `1px solid ${border}`, borderRadius: radius }}
        data-product-media=""
      >
        <Package className="h-12 w-12 opacity-30" aria-hidden />
      </div>
    )
  }

  const sliderOnPhone = mobile !== "stacked"
  const aspect = RATIO[ratio]

  /*
    NATURAL SHAPE, SIDE BY SIDE (r63). With the picture's own shape (the default) a row of pictures, the phone's
    swipe row, the slideshow, the carousel and the grid's pairs, is as tall as its tallest picture, and every
    other one was drawn whole inside a frame stretched to that height: a wide picture beside a tall one was a
    strip with half its frame blank (the owner's live product page). Now the row takes its height from one
    picture only, drawn at its own shape (the first; in the grid, the left of each pair), and the others cover
    a frame of that height, laid out absolutely so they never make the row taller. Nothing is measured, so
    nothing moves after the first paint. A single column keeps every picture at its own shape, as before.
  */
  const COVER = "absolute inset-0 h-full w-full object-cover"
  const NATURAL_PHONE = sliderOnPhone ? COVER : "static h-auto object-contain"
  const NATURAL_DESK: Record<MediaLayout, [string, string]> = {
    /* [the picture that sets the row's height, every other one], written out whole so the stylesheet has them. */
    stacked: ["@[768px]:static @[768px]:h-auto @[768px]:object-contain", "@[768px]:static @[768px]:h-auto @[768px]:object-contain"],
    stacked_2col: ["@[768px]:static @[768px]:h-auto @[768px]:object-contain", "@[768px]:absolute @[768px]:inset-0 @[768px]:h-full @[768px]:object-cover"],
    slideshow: ["@[768px]:static @[768px]:h-auto @[768px]:object-contain", "@[768px]:absolute @[768px]:inset-0 @[768px]:h-full @[768px]:object-cover"],
    carousel: ["@[768px]:static @[768px]:h-auto @[768px]:object-contain", "@[768px]:absolute @[768px]:inset-0 @[768px]:h-full @[768px]:object-cover"],
  }
  /** The classes a natural-shape picture is drawn with at `pos`: the first sets the height, the rest cover it. */
  const naturalFit = (pos: number) => {
    const setsHeight = layout === "stacked_2col" ? pos % 2 === 0 : pos === 0
    return cn(pos === 0 ? "static h-auto object-contain" : NATURAL_PHONE, NATURAL_DESK[layout][setsHeight ? 0 : 1])
  }

  return (
    <div data-product-media="" data-media-layout={layout}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className={cn(
          "w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          sliderOnPhone ? "flex snap-x snap-mandatory overflow-x-auto" : "grid grid-cols-1 gap-3",
          TRACK[layout],
        )}
        aria-roledescription={layout === "slideshow" || sliderOnPhone ? "carousel" : undefined}
      >
        {ordered.map(({ src, i }, pos) => (
          <div
            key={src}
            data-media-item={i}
            className={cn(
              "relative overflow-hidden",
              sliderOnPhone ? "w-full shrink-0 snap-start" : "w-full",
              ITEM[layout],
              hoverZoom && "group/media",
            )}
            style={{ background: surface, borderRadius: radius, ...(aspect ? { aspectRatio: aspect } : {}) }}
            aria-label={`${pos + 1} of ${images.length}`}
          >
            {isVideoUrl(src) ? (
              /* A video uploaded to the product, in its place among the photos: its first frame until it is played (lib/media/video.ts). */
              <video
                src={src}
                poster={videoPosterUrl(src) ?? undefined}
                controls
                playsInline
                preload="metadata"
                className={cn("block w-full bg-black", aspect ? "h-full object-cover" : "h-auto object-contain")}
                data-media-video=""
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={src}
              {...siteImageProps(src, "(min-width: 768px) 50vw, 100vw")}
              alt={pos === 0 ? title : `${title}, picture ${pos + 1}`}
              className={cn(
                "block w-full transition-transform duration-500",
                aspect ? "h-full object-cover" : naturalFit(pos),
                hoverZoom && "@[768px]:group-hover/media:scale-[1.06]",
                open && "cursor-zoom-in",
              )}
              loading={pos === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              onClick={open ? (e) => { e.stopPropagation(); setLightbox(i) } : undefined}
            />
            )}
          </div>
        ))}
      </div>

      {/* The phone's dots, under a swipe row of more than one picture. */}
      {sliderOnPhone && images.length > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5 @[768px]:hidden" data-media-dots="">
          {ordered.map(({ src }, pos) => (
            <button
              key={src}
              type="button"
              aria-label={`Show picture ${pos + 1}`}
              aria-current={active === pos}
              onClick={(e) => { e.stopPropagation(); setActive(pos); scrollTo(pos) }}
              className="h-2 rounded-full transition-[width,opacity] duration-200"
              style={{ width: active === pos ? 18 : 8, background: accent, opacity: active === pos ? 1 : 0.28 }}
            />
          ))}
        </div>
      ) : null}

      {/* The slideshow's thumbnails: they scroll the row above, on a computer. */}
      {layout === "slideshow" && images.length > 1 ? (
        <div className="mt-3 hidden gap-2 overflow-x-auto pb-1 @[768px]:flex" data-media-thumbs="">
          {ordered.map(({ src }, pos) => (
            <button
              key={src}
              type="button"
              className={cn("h-16 w-16 shrink-0 overflow-hidden border-2 transition-opacity", active === pos ? "opacity-100" : "opacity-60 hover:opacity-90")}
              style={{ borderColor: active === pos ? accent : "transparent", borderRadius: radius }}
              onClick={(e) => { e.stopPropagation(); setActive(pos); scrollTo(pos) }}
              aria-label={`Show picture ${pos + 1}`}
              aria-current={active === pos}
            >
              {/* The button's only content, so its name: the product and which picture. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {isVideoUrl(src) ? (
                <span className="relative block h-full w-full">
                  {videoPosterUrl(src) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={videoPosterUrl(src) as string} alt={`${title} video ${pos + 1}`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <video src={`${src}#t=0.1`} muted playsInline preload="metadata" aria-label={`${title} video ${pos + 1}`} className="h-full w-full object-cover" />
                  )}
                  <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                </span>
              ) : (
                <img src={src} {...siteImageProps(src, "96px")} alt={`${title} thumbnail ${pos + 1}`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
              )}
            </button>
          ))}
        </div>
      ) : null}

      {/* A carousel's arrows on a computer, where there is no swipe. */}
      {layout === "carousel" && images.length > 1 ? (
        <div className="mt-3 hidden justify-end gap-2 @[768px]:flex">
          {[-1, 1].map((step) => (
            <button
              key={step}
              type="button"
              aria-label={step < 0 ? "Previous picture" : "Next picture"}
              disabled={step < 0 ? active <= 0 : active >= images.length - 1}
              onClick={(e) => { e.stopPropagation(); const to = Math.max(0, Math.min(images.length - 1, active + step)); setActive(to); scrollTo(to) }}
              className="grid h-9 w-9 place-items-center rounded-full border disabled:opacity-30"
              style={{ borderColor: border }}
            >
              {step < 0 ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ))}
        </div>
      ) : null}

      {/* On the page's own body, so no section's stacking or transform can hold it inside the section. */}
      {lightbox !== null && images[lightbox] && typeof document !== "undefined"
        ? createPortal(<Lightbox images={images} start={lightbox} title={title} zoom={clickAction === "zoom"} onClose={() => setLightbox(null)} />, document.body)
        : null}
    </div>
  )
}

/** The picture, larger: arrows to move, Escape or a click outside to close, a click on it to zoom. */
function Lightbox({ images, start, title, zoom, onClose }: { images: string[]; start: number; title: string; zoom: boolean; onClose: () => void }) {
  const [at, setAt] = useState(start)
  const [zoomed, setZoomed] = useState(false)
  const [origin, setOrigin] = useState("50% 50%")
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") { setZoomed(false); setAt((i) => (i + 1) % images.length) }
      else if (e.key === "ArrowLeft") { setZoomed(false); setAt((i) => (i - 1 + images.length) % images.length) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [images.length, onClose])

  const move = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!zoomed) return
    const r = e.currentTarget.getBoundingClientRect()
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 sm:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClose() }}
      data-product-lightbox=""
    >
      <button ref={closeRef} type="button" aria-label="Close" className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onClose() }}>
        <X className="h-5 w-5" />
      </button>
      {images.length > 1 ? (
        <>
          <button type="button" aria-label="Previous picture" className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setZoomed(false); setAt((i) => (i - 1 + images.length) % images.length) }}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Next picture" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setZoomed(false); setAt((i) => (i + 1) % images.length) }}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}
      <div className="max-h-full max-w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[at]}
          alt={`${title}, picture ${at + 1}`}
          className={cn("max-h-[calc(var(--sl-vh,1vh)*85)] w-auto object-contain transition-transform duration-300", zoom && (zoomed ? "cursor-zoom-out" : "cursor-zoom-in"))}
          style={zoomed ? { transform: "scale(2)", transformOrigin: origin } : undefined}
          onClick={(e) => {
            e.stopPropagation()
            if (!zoom) return
            const r = e.currentTarget.getBoundingClientRect()
            setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`)
            setZoomed((z) => !z)
          }}
          onMouseMove={move}
        />
      </div>
      {images.length > 1 ? <p className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-0 right-0 text-center text-[13px] text-white/70">{at + 1} / {images.length}</p> : null}
    </div>
  )
}
