"use client"

/**
 * ===========================================================================
 *  THE STORY'S PICTURES (round 50)
 * ===========================================================================
 * The About block's photos and videos, above the headline.
 *
 * It was a strip moved by a CSS transform, with a 48px swipe test on
 * pointerup: nothing followed the finger, there was no momentum, a swipe
 * shorter than the threshold did nothing, the arrows and the dots were
 * locked for 400ms after each move, and the dots changed only once a move
 * had finished. On a phone it read as broken.
 *
 * Now it is a native horizontal scroller with scroll snap, one picture per
 * stop. The browser does the finger tracking, the momentum and the snap,
 * which is the one implementation that feels right on iOS and Android. The
 * code here only:
 *   - keeps the active dot in step WHILE the strip moves (on scroll);
 *   - moves to a picture when a dot, an arrow or an arrow key asks;
 *   - lets a mouse drag it on a computer (pointer events, snap paused while
 *     held, then settled on the nearest picture in the direction of travel).
 *
 * NO LAYOUT SHIFT: the frame is 16:9 before any picture loads, the dots row
 * is always the same height, and the caption line keeps its height when
 * one picture has a caption and the next has none.
 */

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { videoEmbedUrl } from "@/lib/social/video"

export interface StoryGalleryItem {
  id: string
  type: string
  url: string
  caption?: string
}

const reduceMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Which picture is in view, from where the strip is scrolled to. */
export function indexAt(scrollLeft: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / width)))
}

/**
 * Where a mouse drag lets go: a drag of a sixth of the frame, or a flick,
 * moves one picture in its direction; less springs back.
 */
export function settleAfterDrag(start: number, dx: number, velocity: number, width: number, count: number): number {
  const moved = Math.abs(dx) > width / 6 || Math.abs(velocity) > 0.4
  if (!moved) return start
  return Math.max(0, Math.min(count - 1, start + (dx < 0 ? 1 : -1)))
}

export function StoryGallery({ items, textColor }: { items: StoryGalleryItem[]; textColor?: string }) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [active, setActive] = React.useState(0)
  const [loading, setLoading] = React.useState<Record<string, boolean>>({})
  const count = items.length
  const many = count > 1
  const anyCaption = items.some((i) => !!i.caption?.trim())

  /* The dot follows the strip as it moves, once per frame at most. */
  const frame = React.useRef(0)
  const onScroll = React.useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = trackRef.current
      if (el) setActive(indexAt(el.scrollLeft, el.clientWidth, count))
    })
  }, [count])
  React.useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /* Fewer pictures after a save: never point past the end. */
  React.useEffect(() => {
    if (active > count - 1) setActive(Math.max(0, count - 1))
  }, [active, count])

  const go = React.useCallback(
    (index: number) => {
      const el = trackRef.current
      if (!el || count === 0) return
      const i = ((index % count) + count) % count
      setActive(i)
      el.scrollTo({ left: i * el.clientWidth, behavior: reduceMotion() ? "auto" : "smooth" })
    },
    [count],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!many) return
    const to =
      e.key === "ArrowRight" ? Math.min(count - 1, active + 1)
      : e.key === "ArrowLeft" ? Math.max(0, active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? count - 1
      : null
    if (to === null) return
    e.preventDefault()
    go(to)
  }

  /*
    A MOUSE DRAGS IT. A touch screen and a trackpad already scroll it
    natively; a mouse has no sideways scroll, so it is moved by hand here.
    Snap is paused while the button is down (data-dragging) so the strip
    follows the pointer, and put back once it has been settled.
  */
  const drag = React.useRef<{ x: number; left: number; start: number; t: number; lastX: number; lastT: number; id: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!many || e.pointerType !== "mouse" || e.button !== 0) return
    const el = trackRef.current
    if (!el) return
    drag.current = { x: e.clientX, left: el.scrollLeft, start: indexAt(el.scrollLeft, el.clientWidth, count), t: e.timeStamp, lastX: e.clientX, lastT: e.timeStamp, id: e.pointerId, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = trackRef.current
    if (!d || !el || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) < 4) return
    if (!d.moved) {
      d.moved = true
      el.setAttribute("data-dragging", "")
      try { el.setPointerCapture(e.pointerId) } catch { /* already released */ }
    }
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    el.scrollLeft = d.left - dx
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = trackRef.current
    drag.current = null
    if (!d || !el || d.id !== e.pointerId || !d.moved) return
    el.removeAttribute("data-dragging")
    const dx = e.clientX - d.x
    const dt = Math.max(1, e.timeStamp - d.lastT)
    const velocity = (e.clientX - d.lastX) / dt
    go(settleAfterDrag(d.start, dx, dt > 80 ? 0 : velocity, el.clientWidth, count))
  }

  if (count === 0) return null
  const dotColor = textColor || "currentColor"
  const caption = items[active]?.caption?.trim()

  return (
    <div className="mb-6" role="region" aria-roledescription="carousel" aria-label="Photos">
      <div className="group/gallery relative">
        <div
          ref={trackRef}
          data-story-track=""
          tabIndex={many ? 0 : -1}
          aria-label={many ? `Picture ${active + 1} of ${count}. Use the arrow keys to move.` : undefined}
          onScroll={many ? onScroll : undefined}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            "relative flex aspect-video w-full overflow-hidden rounded-lg bg-black/5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            many && "snap-x snap-mandatory overflow-x-auto overscroll-x-contain cursor-grab",
          )}
          style={{ ["--tw-ring-color" as string]: textColor ? `${textColor}80` : undefined }}
        >
          {items.map((item, index) => {
            const embed = item.type === "image" ? null : videoEmbedUrl(item.url)
            return (
              <div
                key={item.id}
                className="relative h-full w-full shrink-0 snap-center snap-always"
                role={many ? "group" : undefined}
                aria-roledescription={many ? "slide" : undefined}
                aria-label={many ? `${index + 1} of ${count}` : undefined}
                aria-hidden={many && index !== active ? true : undefined}
              >
                {item.type === "image" ? (
                  <Image
                    src={item.url}
                    alt={item.caption || ""}
                    fill
                    draggable={false}
                    /* The column is at most ~830px wide. */
                    sizes="(max-width: 768px) 100vw, 830px"
                    priority={false}
                    className={cn(
                      "pointer-events-none select-none object-cover transition-opacity duration-300",
                      loading[item.id] === true ? "opacity-0" : "opacity-100",
                    )}
                    onLoadStart={() => setLoading((p) => ({ ...p, [item.id]: true }))}
                    onLoad={() => setLoading((p) => ({ ...p, [item.id]: false }))}
                  />
                ) : embed ? (
                  <iframe
                    src={embed}
                    title={item.caption || "Video"}
                    className="h-full w-full"
                    loading="lazy"
                    tabIndex={many && index !== active ? -1 : undefined}
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Arrows for a mouse, on hover or focus. A touch screen swipes, and the dots are below. */}
        {many && (
          <>
            <GalleryArrow side="left" onClick={() => go(active - 1)} />
            <GalleryArrow side="right" onClick={() => go(active + 1)} />
          </>
        )}
      </div>

      {many && (
        <div className="mt-2 flex h-6 items-center justify-center" role="group" aria-label="Choose a picture">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(index)}
              aria-label={`Picture ${index + 1} of ${count}`}
              aria-current={index === active ? "true" : undefined}
              /* A 24px target around a dot drawn small. */
              className="group/dot grid h-6 w-6 place-items-center rounded-full outline-none focus-visible:ring-2"
              style={{ ["--tw-ring-color" as string]: textColor ? `${textColor}80` : undefined }}
            >
              <span
                aria-hidden
                className={cn(
                  "block h-1.5 rounded-full transition-[width,opacity] duration-300 ease-out",
                  index === active ? "w-4 opacity-100" : "w-1.5 opacity-35 group-hover/dot:opacity-60",
                )}
                style={{ backgroundColor: dotColor }}
              />
            </button>
          ))}
        </div>
      )}

      {anyCaption && (
        <p
          aria-live="polite"
          className="mt-1 min-h-[1.25rem] text-center text-xs leading-5 md:text-sm"
          style={{ color: textColor ? `${textColor}99` : "#6b7280" }}
        >
          {caption || " "}
        </p>
      )}
    </div>
  )
}

function GalleryArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={-1}
      aria-hidden
      className={cn(
        "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-200 hover:bg-black/65 [@media(hover:hover)]:grid group-hover/gallery:opacity-100 group-focus-within/gallery:opacity-100",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={side === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  )
}
