"use client"

/**
 * ===========================================================================
 *  THE PAGE'S TWO ACTIONS, BESIDE ITS HEADING
 * ===========================================================================
 * Round 49, the owner: "move the export button to the right side of the page
 * header, on the same line as the Analytics heading ... icon only, with an
 * aria-label plus a tooltip". Send to and Export left the filter row (which is
 * now filters only) for the heading's line: a 36px white circle each, the
 * filter chips' hairline ring and shadow, the same at every width. The name
 * is said to a screen reader and, on a computer, in a tooltip; a phone has no
 * hover, so its name is the label alone.
 */
import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const HEAD_ICON_BUTTON =
  "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-[#4b5563] shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.05)] outline-none transition-[background-color,color,scale] duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-[#f8f9fa] hover:text-[#1a1a2e] focus-visible:shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_0_0_3px_rgba(139,92,246,0.35)] active:scale-95 active:bg-[#f1f2f4] data-[state=open]:bg-[#f1f2f4] motion-reduce:transition-none"

export function HeadIconButton({ label, className, children, ...rest }: React.ComponentProps<"button"> & { label: string }) {
  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className={cn(HEAD_ICON_BUTTON, className)} {...rest}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="hidden sm:block">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
