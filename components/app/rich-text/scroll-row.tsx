"use client"

/**
 * ===========================================================================
 *  A TOOLBAR ROW THAT SCROLLS SIDEWAYS, AND SAYS SO
 * ===========================================================================
 * "Add an arrow plus a smooth, clean edge fade at the horizontal scroll of
 * the toolbar buttons." Every formatting toolbar in the app is one row that
 * scrolls inside itself when it is wider than the space it has: the
 * description field (../rich-text-editor.tsx), the email composer's bar
 * (components/email/compose/format-bar.tsx) and the website builder's field
 * (components/website-builder/rich-text-field.tsx). This is that row, once.
 *
 * WHAT IT SHOWS. Whichever end has controls past it fades out, and a small
 * round arrow sits in the fade. A press on the arrow moves the row by what
 * is on screen, smoothly, less one fade so the control that was half hidden
 * ends up whole. At an end the fade and the arrow go; a row that fits has
 * neither. On a phone the arrow is drawn a little smaller and its target is
 * the height of the controls (44px), so a thumb lands on it.
 *
 * THE FADE MOVES, IT DOES NOT SWITCH. A gradient cannot be animated, its
 * position can. The mask is two layers, one per end, each a fade followed
 * by solid, one fade wider than the row. Parked one fade past the edge a
 * layer is solid across the whole row (no fade); slid in, its fade covers
 * the edge. The two are intersected, so both ends can fade at once, and
 * mask-position is what the transition moves. Nothing is laid out again.
 * A row that fits has no mask at all, so it is not a layer of its own.
 *
 * WHAT IT COSTS. A scroll or a resize only asks for a frame; the frame reads
 * the row once and writes two attributes and the mask position, and only
 * when an end changes, so scrolling renders nothing in React. The row
 * never shows a scrollbar, and the arrows sit over it, so no control moves
 * when they come and go.
 *
 * THE CARET STAYS. An arrow takes its press on mousedown with the default
 * prevented, like every control on these toolbars: the text keeps its
 * selection and a phone keeps its keyboard up. The arrows are not in the
 * Tab order and are hidden from a screen reader, which moves along the
 * row with its own keys; a control focused that way is scrolled clear of
 * the fade (scroll-padding).
 */

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ScrollRowProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>
  /** The box around the row and its arrows. */
  wrapClassName?: string
  /**
   * The arrow's target: its width, matched to the controls' size at each
   * breakpoint (w-11 on a phone, w-8 on a computer, say). Its height is
   * the row's.
   */
  arrowClassName?: string
  /** A data attribute on each end's fade state, for probes: data-fade on the row. */
  [data: `data-${string}`]: string | undefined
}

const FADE = "var(--row-fade,40px)"

/*
  THE TWO LAYERS. Each is one fade wider than the row. The first fades in
  from its left edge, the second out towards its right edge. `park` puts a
  layer's fade outside the row; `show` brings it over the row's edge.
*/
const MASK_IMAGE = `linear-gradient(to right, transparent 0, transparent calc(${FADE} * 0.25), #000 ${FADE}), linear-gradient(to left, transparent 0, transparent calc(${FADE} * 0.25), #000 ${FADE})`
const MASK_SIZE = `calc(100% + ${FADE}) 100%`
const OFF = `calc(-1 * ${FADE})`
const position = (start: boolean, end: boolean) => `${start ? "0px" : OFF} 0px, ${end ? OFF : "0px"} 0px`

/* No mask at all until an end has more: a row that fits is not a mask layer. */
const MASK_STYLE: React.CSSProperties = {
  WebkitMaskImage: "none",
  maskImage: "none",
  WebkitMaskSize: MASK_SIZE,
  maskSize: MASK_SIZE,
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: position(false, false),
  maskPosition: position(false, false),
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
  scrollPaddingInline: FADE,
}

function Arrow({ side, onPress, className }: { side: "start" | "end"; onPress: () => void; className?: string }) {
  const Icon = side === "start" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-scroll-arrow={side}
      /* mousedown, not click, keeps the text's selection and the keyboard. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(
        "group/arrow absolute inset-y-0 z-[1] flex w-8 cursor-pointer select-none items-center [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
        side === "start" ? "left-0 justify-start pl-1" : "right-0 justify-end pr-1",
        /* Gone, it is not there to press either. */
        "pointer-events-none opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
        side === "start"
          ? "group-data-[start=true]/scrollrow:pointer-events-auto group-data-[start=true]/scrollrow:opacity-100"
          : "group-data-[end=true]/scrollrow:pointer-events-auto group-data-[end=true]/scrollrow:opacity-100",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_3px_rgba(17,24,39,0.10)] transition-[background-color,color,scale] duration-100",
          "[@media(pointer:coarse)]:h-[22px] [@media(pointer:coarse)]:w-[22px]",
          "[@media(hover:hover)_and_(pointer:fine)]:group-hover/arrow:bg-[#f3f4f6] [@media(hover:hover)_and_(pointer:fine)]:group-hover/arrow:text-[#1a1a2e] group-active/arrow:scale-90",
        )}
      >
        <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    </button>
  )
}

export function ScrollRow({ ref, wrapClassName, arrowClassName, className, style, children, ...rest }: ScrollRowProps) {
  const rowRef = React.useRef<HTMLDivElement | null>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)

  const setRow = React.useCallback(
    (el: HTMLDivElement | null) => {
      rowRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el
    },
    [ref],
  )

  React.useEffect(() => {
    const row = rowRef.current
    const wrap = wrapRef.current
    if (!row || !wrap) return
    let frame = 0
    const read = () => {
      frame = 0
      const max = row.scrollWidth - row.clientWidth
      const x = Math.abs(row.scrollLeft)
      const start = max > 2 && x > 2
      const end = max > 2 && x < max - 2
      const fade = start && end ? "both" : start ? "start" : end ? "end" : "none"
      if (row.dataset.fade === fade) return
      row.dataset.fade = fade
      wrap.dataset.start = String(start)
      wrap.dataset.end = String(end)
      const image = fade === "none" ? "none" : MASK_IMAGE
      row.style.setProperty("-webkit-mask-image", image)
      row.style.setProperty("mask-image", image)
      const at = position(start, end)
      row.style.setProperty("-webkit-mask-position", at)
      row.style.setProperty("mask-position", at)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    row.addEventListener("scroll", schedule, { passive: true })
    /* The row's own size, and its controls' (a label that appears, a font that loads). */
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null
    const watch = () => {
      if (!ro) return
      ro.disconnect()
      ro.observe(row)
      for (const child of row.children) ro.observe(child)
    }
    watch()
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => { watch(); schedule() }) : null
    mo?.observe(row, { childList: true })
    return () => {
      cancelAnimationFrame(frame)
      row.removeEventListener("scroll", schedule)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [])

  const page = (dir: -1 | 1) => {
    const row = rowRef.current
    if (!row) return
    /* What is on screen, less the fade at each end, so nothing is skipped. */
    const fade = parseFloat(getComputedStyle(row).scrollPaddingLeft) || 40
    const by = Math.max(row.clientWidth * 0.5, row.clientWidth - fade * 2)
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    row.scrollBy({ left: dir * by, behavior: still ? "auto" : "smooth" })
  }

  return (
    <div ref={wrapRef} data-scroll-row="" data-start="false" data-end="false" className={cn("group/scrollrow relative flex min-w-0 flex-1", wrapClassName)}>
      <div
        ref={setRow}
        data-fade="none"
        {...rest}
        className={cn(
          "flex min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "transition-[mask-position,-webkit-mask-position] duration-200 ease-out motion-reduce:transition-none",
          className,
        )}
        style={{ ...MASK_STYLE, ...style }}
      >
        {children}
      </div>
      <Arrow side="start" onPress={() => page(-1)} className={arrowClassName} />
      <Arrow side="end" onPress={() => page(1)} className={arrowClassName} />
    </div>
  )
}
