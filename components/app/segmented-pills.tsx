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
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"

export interface PillOption<T extends string> {
  value: T
  label: React.ReactNode
}

export function SegmentedPills<T extends string>({ options, value, onChange, onIntent, label, className, size = "md" }: { options: PillOption<T>[]; value: T; onChange: (value: T) => void; onIntent?: (value: T) => void; label: string; className?: string; size?: "sm" | "md" }) {
  const track = React.useRef<HTMLDivElement>(null)
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [box, setBox] = React.useState<{ x: number; w: number } | null>(null)
  const index = Math.max(0, options.findIndex((o) => o.value === value))

  React.useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[index]
      if (!el) return
      setBox((b) => (b && b.x === el.offsetLeft && b.w === el.offsetWidth ? b : { x: el.offsetLeft, w: el.offsetWidth }))
    }
    measure()
    const strip = track.current
    const el = refs.current[index]
    if (strip && el && strip.scrollWidth > strip.clientWidth) {
      if (el.offsetLeft < strip.scrollLeft) strip.scrollLeft = el.offsetLeft - 8
      else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth + 8
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    if (ro && track.current) ro.observe(track.current)
    return () => ro?.disconnect()
  }, [index, options.length])

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
      className={cn("orders-strip relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-[#eceef1] p-1", className)}
      data-segmented-pills=""
    >
      {box ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-0 top-1 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_1px_4px_rgba(16,24,40,0.06)] transition-[translate,width] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
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
            className={cn(
              "relative z-[1] shrink-0 whitespace-nowrap rounded-full font-semibold outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
              size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[14px]",
              on ? "text-[#1a1a2e]" : "text-[#6b7280]",
              on && !box && "bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
