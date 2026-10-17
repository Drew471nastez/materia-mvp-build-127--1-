"use client"

/**
 * ===========================================================================
 *  BACK, AT THE TOP OF A PANEL THAT OPENED FROM A LIST
 * ===========================================================================
 * A section's settings, the theme's settings, the header's tabs: each opens
 * from a list and has a way back to it. It was a bare 16px arrow with no box,
 * so the press area was the arrow's own sixteen pixels and a thumb that
 * landed on the section's name did nothing.
 *
 *   THE WHOLE LEFT OF THE ROW GOES BACK. The button's press area is the row
 *   (an invisible ::after, positioned against the row), so the name beside
 *   the arrow is part of it. The row is 52px on a phone and 44 from md.
 *
 *   A VERY SUBTLE BUTTON. The arrow sits on a small tile with a hairline and
 *   a 1px foot, the /app depth at its quietest, and goes flat and a step
 *   darker while pressed, with a 6% dip on `scale`, which moves nothing
 *   around it. 36px on a phone with a 20px arrow, 32 and 16 from md.
 *
 * The press styling is on a span inside the button, not on the button: the
 * phone sheets clear a button's hover background on touch (globals.css,
 * `[data-mobile-bottom-sheet] button:hover`), and a span is left alone.
 */
import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function PanelBack({
  onBack,
  children,
  className,
  action,
}: {
  onBack: () => void
  /** The panel's name, and anything under it. Part of the press area. */
  children: React.ReactNode
  className?: string
  /**
   * At the right end of the row, raised over the press area: a section's
   * menu. Its right edge sits on the row's own padding.
   */
  action?: React.ReactNode
}) {
  return (
    <div data-panel-back="" className={cn("relative flex min-h-[52px] shrink-0 items-center gap-1.5 border-b border-border px-2 md:min-h-[40px] md:gap-1 md:px-2.5", className)}>
      <button
        type="button"
        onClick={onBack}
        aria-label={tt("Back")}
        className={cn(
          "group/back flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl outline-none md:h-9 md:w-9",
          /* The press area: the whole row, the name included. */
          "after:absolute after:inset-0 after:content-['']",
          "focus-visible:ring-2 focus-visible:ring-neutral-900/15 [-webkit-tap-highlight-color:transparent]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#f7f7f8] text-[#4b5563]",
            "shadow-[inset_0_-1px_0_rgba(0,0,0,0.05),0_1px_0_rgba(0,0,0,0.03)] transition-[background-color,box-shadow,scale,color] duration-100",
            "group-hover/back:bg-[#f0f1f4] group-hover/back:text-[#1a1a2e]",
            "group-active/back:scale-[0.94] group-active/back:bg-[#eceef1] group-active/back:shadow-[inset_0_1px_1px_rgba(0,0,0,0.08)]",
            "motion-reduce:transition-none md:h-8 md:w-8 md:rounded-lg",
          )}
        >
          <ArrowLeft className="h-5 w-5 md:h-4 md:w-4" strokeWidth={2} />
        </span>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="relative z-[1] flex shrink-0 items-center">{action}</div> : null}
    </div>
  )
}
