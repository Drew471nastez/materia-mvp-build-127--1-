"use client"

/**
 * ===========================================================================
 *  A SAVE THAT DID NOT LAND, ON SCREEN UNTIL ONE DOES
 * ===========================================================================
 * One quiet row at the top of the canvas: a red dot, what happened, what to
 * do, and the one button that does it. It stays until a save lands or it is
 * closed, because the toast it replaces was gone in four seconds and said
 * "Invalid body". The words are lib/website-builder/save-problem.ts.
 */
import { X } from "lucide-react"
import { FIX_LABEL, type SaveFix, type SaveProblem } from "@/lib/website-builder/save-problem"

export function SaveProblemBanner({ problem, onFix, onClose }: { problem: SaveProblem | null; onFix: (fix: SaveFix) => void; onClose: () => void }) {
  if (!problem) return null
  return (
    <div
      role="alert"
      data-save-problem={problem.fix}
      className="pointer-events-auto mx-auto flex w-full max-w-[640px] items-start gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
    >
      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ef4444]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-5 text-[#1a1a2e]">{problem.title}</p>
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{problem.detail}</p>
      </div>
      <button
        type="button"
        onClick={() => onFix(problem.fix)}
        className="h-8 shrink-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[12.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa] active:bg-[#f3f4f6]"
      >
        {FIX_LABEL[problem.fix]}
      </button>
      <button type="button" aria-label="Close" onClick={onClose} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e]">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
