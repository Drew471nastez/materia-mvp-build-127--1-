"use client"

/**
 * ONE WHITE PILL THAT SLIDES, ON A GREY TRACK (round 24): Analytics' All /
 * Digital / Physical / Communities and Emails' views. The chosen option's
 * pill moves to the next one by `translate` and takes its width, 220ms on
 * the /app curve, so nothing else is laid out again; until it has been
 * measured (the server's markup) the chosen option draws its own pill where
 * the sliding one will be. A press is felt (a soft tick). Arrow keys move
 * between options, as a tablist's should. With reduced motion it is simply
 * there. A track wider than the screen scrolls sideways, and the chosen
 * option is kept in view without moving the page. `onIntent` hears a
 * pointer resting on an option, or a finger landing on it, so what it opens
 * can be read ahead (Emails).
 *
 * `variant="chips"` is the same control without the track (Analytics' All /
 * Digital / Physical / Communities, the owner: "the last item gets cut
 * off"): separate quiet chips on the page, the chosen one a dark pill that
 * slides between them. Narrower than the track (no 4px inset, tighter
 * padding under 360px), so four in English fit a 320px phone whole; a row
 * that still does not fit (a longer language) scrolls and fades where it is
 * cut (components/app/use-edge-fade) instead of slicing a label.
 *
 * `variant="filter"` is the control drawn as one of Analytics' filter chips
 * (the owner: "must look like the filter chips"): the same 36px white pill
 * with the same hairline ring as Last 7 days, All pages and All products
 * (app/globals.css [data-analytics-controls]), its options inside it and the
 * chosen one a dark pill that slides between them. It never scrolls by
 * itself: it sits in the filters' own row, which does.
 *
 * `motion="fade"` (Customer emails' All / Digital / Physical / Communities,
 * round 43, the owner: "smooth exactly like the Settings tab's pills") is
 * Settings' own pill row (components/app/settings-form-new.tsx, data-
 * settings-tabs): nothing travels between options; the chosen one eases
 * its own background in place, 150ms on Settings' curve, and the one left
 * eases out of it, so no layer is stacked over the words and nothing is
 * laid out again. The row glides the pressed option to its middle, as
 * Settings' does. (Round 42's `slide={false}` was the same without the
 * ease: the colour jumped.)
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { useEdgeFade } from "@/components/app/use-edge-fade"

export interface PillOption<T extends string> {
  value: T
  label: React.ReactNode
}

/* Settings' pill row's own fade (components/app/settings-form-new.tsx TAB_FADE_MS, TAB_EASE). */
export const PILL_FADE_MS = 150
export const PILL_FADE_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

export function SegmentedPills<T extends string>({ options, value, onChange, onIntent, label, className, size = "md", variant = "track", motion = "slide" }: { options: PillOption<T>[]; value: T; onChange: (value: T) => void; onIntent?: (value: T) => void; label: string; className?: string; size?: "sm" | "md"; variant?: "track" | "chips" | "filter"; motion?: "slide" | "fade" }) {
  const slide = motion === "slide"
  const track = useEdgeFade<HTMLDivElement>()
  const filter = variant === "filter"
  const chips = variant === "chips" || filter
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [measured, setBox] = React.useState<{ x: number; w: number } | null>(null)
  /* Without the slide there is no moving pill: each chosen option draws (and fades) its own. */
  const box = slide ? measured : null
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const placed = React.useRef(false)

  React.useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[index]
      if (!el) return
      setBox((b) => (b && b.x === el.offsetLeft && b.w === el.offsetWidth ? b : { x: el.offsetLeft, w: el.offsetWidth }))
    }
    measure()
    const strip = track.current
    const el = refs.current[index]
    if (!slide) {
      /* Settings' row: the pressed option glides to the middle; one chosen by the address is simply there. */
      if (strip && el && strip.scrollWidth > strip.clientWidth) {
        const left = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2))
        const still = !placed.current || (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        if (typeof strip.scrollTo === "function") strip.scrollTo({ left, behavior: still ? ("instant" as ScrollBehavior) : "smooth" })
        else strip.scrollLeft = left
      }
      placed.current = true
    } else if (strip && el && strip.scrollWidth > strip.clientWidth) {
      if (el.offsetLeft < strip.scrollLeft) strip.scrollLeft = el.offsetLeft - 8
      else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth + 8
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    if (ro && track.current) ro.observe(track.current)
    return () => ro?.disconnect()
  }, [index, options.length, slide])

  const pick = (i: number) => {
    const o = options[i]
    if (!o || o.value === value) return
    hapticTap("soft")
    onChange(o.value)
  }

  return (
    <div
      ref={track}
      role="tablist"
      aria-label={label}
      className={cn(
        filter
          ? "relative inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-white p-[3px] shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.05)]"
          : "orders-strip relative inline-flex max-w-full items-center overflow-x-auto",
        filter ? null : chips ? "edge-fade gap-1 py-0.5 min-[360px]:gap-1.5" : "gap-0.5 rounded-full bg-[#eceef1] p-1",
        className,
      )}
      style={chips && !filter ? { overflowY: "hidden", touchAction: "pan-x pan-y", overscrollBehaviorX: "contain" } : undefined}
      data-segmented-pills={filter ? "filter" : chips ? "chips" : ""}
      data-scroll-x={chips && !filter ? "" : undefined}
    >
      {box ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-0 rounded-full transition-[translate,width] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            filter ? "bottom-[3px] top-[3px] bg-[#1a1a2e]" : chips ? "bottom-0.5 top-0.5 bg-[#1a1a2e]" : "bottom-1 top-1 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_1px_4px_rgba(16,24,40,0.06)]",
          )}
          style={{ translate: `${box.x}px 0`, width: box.w }}
        />
      ) : null}
      {options.map((o, i) => {
        const on = i === index
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-tab={o.value}
            onClick={() => pick(i)}
            onPointerEnter={onIntent ? () => onIntent(o.value) : undefined}
            onTouchStart={onIntent ? () => onIntent(o.value) : undefined}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
              e.preventDefault()
              const next = (i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length
              refs.current[next]?.focus()
              pick(next)
            }}
            style={slide ? undefined : { transitionDuration: `${PILL_FADE_MS}ms`, transitionTimingFunction: PILL_FADE_EASE }}
            data-pill-fade={slide ? undefined : ""}
            className={cn(
              "relative z-[1] shrink-0 whitespace-nowrap rounded-full font-semibold outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
              slide ? "transition-colors duration-150" : "transition-[color,background-color,box-shadow] motion-reduce:transition-none",
              filter
                ? cn("h-[30px] px-3 text-[14px]", on ? "text-white" : "text-[#6b7280] pointer-fine:hover:text-[#1a1a2e]", on && !box && "bg-[#1a1a2e]")
                : chips
                ? cn("h-8 px-2.5 text-[13px] min-[360px]:px-3.5", on ? "text-white" : "text-[#4b5563] pointer-fine:hover:bg-[#1a1a2e]/[0.05] pointer-fine:hover:text-[#1a1a2e]", on && !box && "bg-[#1a1a2e]", !on && !slide && "bg-[#1a1a2e]/0")
                : cn(size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[14px]", on ? "text-[#1a1a2e]" : "text-[#6b7280]", on && !box && "bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]"),
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
