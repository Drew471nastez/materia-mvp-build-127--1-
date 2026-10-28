"use client"

/**
 * ===========================================================================
 *  THE ARROW AT THE END OF A SIDEWAYS ROW OF FIGURES
 * ===========================================================================
 * The home chart's arrow (components/app/dashboard-client: a 28px grey
 * square held at the row's right edge), here saying "there is more this
 * way" (the owner: "add an arrow button pointing right ... so people
 * understand there is more"). A tap scrolls the row so the first figure
 * that is cut off starts at its left edge, smoothly, by the browser's own
 * scroll, so a finger landing on the row stops it. At the end it turns
 * round and takes the row back to its start. A row that fits draws nothing.
 *
 * Drawn INSIDE the row, as its last child, sticky to its right edge, with a
 * white fade in front of it so a figure passes under it rather than being
 * cut by a hard line. Not a tab: the row's sliding line and the strip's
 * own follow (components/app/use-tab-strip) look for `[role=tab]` only.
 * It finds the row as its own parent: a ref handed down from the row is
 * still empty when a child's layout effect runs on the first commit (the
 * same reason as components/app/metric-tab MetricTabLine).
 */
import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { tt } from "@/lib/i18n/text"

type Way = "next" | "back" | null

export function StripArrow({ className }: { className?: string }) {
  const [way, setWay] = React.useState<Way>(null)
  const self = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const el = self.current?.parentElement
    if (!el) return
    let frame = 0
    const read = () => {
      frame = 0
      const max = el.scrollWidth - el.clientWidth
      setWay(max <= 1 ? null : el.scrollLeft >= max - 2 ? "back" : "next")
    }
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    el.addEventListener("scroll", queue, { passive: true })
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(queue) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", queue)
      ro?.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  const go = () => {
    const el = self.current?.parentElement
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    let target = 0
    if (way === "next") {
      /* What the arrow covers is not "in view": the first tab whose right edge is past what is clear of it. */
      const clear = el.scrollLeft + el.clientWidth - (self.current?.offsetWidth ?? 0)
      const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'))
      const next = tabs.find((t) => t.offsetLeft + t.offsetWidth > clear + 1)
      target = next ? next.offsetLeft : max
      /* Never a step of nothing: a tab already at the left edge means the end. */
      if (target <= el.scrollLeft + 1) target = max
    }
    target = Math.max(0, Math.min(target, max))
    hapticTap("soft")
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: target, behavior: calm ? "auto" : "smooth" })
  }

  return (
    <div
      ref={self}
      data-strip-arrow={way ?? "none"}
      className={cn(
        "sticky right-0 z-[2] flex shrink-0 items-center !border-l-0 bg-[linear-gradient(to_right,rgba(255,255,255,0),#fff_14px)] pl-4 pr-2",
        !way && "hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={go}
        aria-label={way === "back" ? tt("Back to the first figures") : tt("More figures")}
        title={way === "back" ? tt("Back to the first figures") : tt("More figures")}
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f3f4f6] outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:bg-[#e5e7eb] pointer-fine:hover:bg-[#e5e7eb] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
      >
        <ChevronRight className={cn("h-4 w-4 text-[#6b7280] transition-transform duration-200 motion-reduce:transition-none", way === "back" && "rotate-180")} aria-hidden />
      </button>
    </div>
  )
}
