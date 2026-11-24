"use client"

/**
 * ===========================================================================
 *  BACK, FLOATING (r24)
 * ===========================================================================
 * The owner: "instead of a full-width sticky top bar, a floating round Back
 * that appears smoothly as I scroll down, and returns to /app/integrations".
 *
 * An app's page starts with its own Back to integrations. Once that link
 * has scrolled out of the top, this comes in at the page's top left, over
 * the content: a round white control with depth, an arrow and the word
 * Back. It goes again the moment the link is back. Which of the two is
 * shown is one flag (integration-detail's usePageBar, one
 * IntersectionObserver on the page's scroller), so scrolling renders
 * nothing between the two moments.
 *
 * It sits in a sticky box with no height, so it takes no room and nothing
 * under it moves. The box sticks from scroll 0 at --pin-lift and the
 * control is lifted by the same number, so it is drawn at one place under
 * the top in every frame; only its opacity, a 6px drop and a 4% scale
 * change, on the compositor. The scroller already starts below the app's
 * header and the iOS safe area, so the inset is never counted twice.
 */
import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function FloatingBack({ shown, onBack }: { shown: boolean; onBack: () => void }) {
  return (
    <div className="pointer-events-none sticky top-[var(--pin-lift)] z-20 h-0 [--pin-lift:40px]" data-integration-float-box="">
      <div
        className={cn(
          "absolute left-0 top-[calc(var(--pin-lift)*-1)] pt-2 transition-[opacity,translate,scale] duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none sm:pt-3",
          shown ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "-translate-y-1.5 scale-[0.96] opacity-0",
        )}
        inert={!shown}
        aria-hidden={!shown}
        data-integration-float-back={shown ? "shown" : "hidden"}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={tt("Back to integrations")}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white pl-3 pr-[18px] text-[14px] font-semibold text-[#1a1a2e] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_1px_2px_rgba(16,24,40,0.06),0_10px_24px_-8px_rgba(16,24,40,0.28)] outline-none transition-[background-color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] pointer-fine:hover:bg-[#f7f7f8] active:scale-[0.97] active:bg-[#f1f2f4] focus-visible:shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_0_0_4px_rgba(26,26,46,0.14),0_10px_24px_-8px_rgba(16,24,40,0.28)] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
          data-integration-float-back-button=""
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          {tt("Back")}
        </button>
      </div>
    </div>
  )
}
