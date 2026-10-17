"use client"

/**
 * THE INFO CARD'S SHORT DESCRIPTION (round 26, the owner's section 6: "in the right info card with graceful truncation
 * and expansion"). Three lines at most, cut by the browser with an ellipsis (line-clamp), and More under it only when
 * something was cut; More shows the rest in place and becomes Less. Whether it was cut is measured once drawn and again
 * when the card's width changes; before that, a long text is taken to be cut, so the More line is already there in the
 * server's HTML and nothing moves when the page wakes up. Plain text only (about-facts.ts cardSummary made it).
 */
import * as React from "react"
import { cn } from "@/lib/utils"

/** Longer than this, three lines of the card are taken to be full before they are measured. */
const LIKELY_CUT = 118

export function CardSummary({ text, className, block }: { text: string; className?: string; /** The Page editor's marker (data-page-block), when the page is drawn in its preview. */ block?: string }) {
  const ref = React.useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = React.useState(false)
  const [cut, setCut] = React.useState(() => text.length > LIKELY_CUT)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const measure = () => setCut(el.scrollHeight - el.clientHeight > 1)
    measure()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [text, open])
  const id = React.useId()
  return (
    <div className={className} data-card-summary="" data-clamped={!open && cut ? "true" : "false"} data-page-block={block}>
      <p id={id} ref={ref} className={cn("whitespace-pre-line break-words text-[14px] leading-[1.55] text-[#4b5563] [overflow-wrap:anywhere]", !open && "line-clamp-3")} data-card-summary-text="">
        {text}
      </p>
      {cut || open ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="-mx-1 mt-0.5 inline-flex min-h-8 items-center rounded-md px-1 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"
          data-card-summary-more=""
        >
          {open ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  )
}
