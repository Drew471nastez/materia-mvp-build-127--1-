"use client"

/**
 * ===========================================================================
 *  THE SOCIAL ROW, WHEN THERE ARE MORE ICONS THAN FIT
 * ===========================================================================
 * The owner: "when there are many social icons, the row becomes full width
 * and scrolls horizontally with buttery smooth touch and trackpad swipe".
 * It used to wrap onto a second and third line.
 *
 *   fits       the icons sit centred, as before; nothing scrolls
 *   overflows  the row is the column's full width and scrolls on its own
 *              axis: native momentum, a soft snap to each icon (proximity, so
 *              a flick is never cut short), no scrollbar, and the edge that
 *              has more behind it fades out
 *
 * The scroll is the browser's own (no JavaScript moves it), so it is the
 * platform's momentum on iOS, Android and a trackpad. JavaScript only reads
 * where it is, once per frame at most, to say which edges fade
 * (data-fade="start", "end" or both). The fade and the hidden scrollbar are
 * `.op-social-scroll` in app/globals.css.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export function SocialRowScroller({ className, style, trackProps, children }: { className?: string; style?: React.CSSProperties; trackProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const read = () => {
      frame = 0
      const max = el.scrollWidth - el.clientWidth
      const over = max > 1
      const start = over && el.scrollLeft > 1
      const end = over && el.scrollLeft < max - 1
      const fade = start && end ? "both" : start ? "start" : end ? "end" : ""
      if ((el.dataset.fade ?? "") !== fade) {
        if (fade) el.dataset.fade = fade
        else delete el.dataset.fade
      }
      if (over) el.dataset.overflow = ""
      else delete el.dataset.overflow
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    el.addEventListener("scroll", soon, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(soon)
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener("scroll", soon)
      ro?.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div ref={ref} className={cn("op-social-scroll", className)} style={style} data-op-social-row="">
      <div {...trackProps} className={cn("op-social-track", trackProps?.className)}>
        {children}
      </div>
    </div>
  )
}
