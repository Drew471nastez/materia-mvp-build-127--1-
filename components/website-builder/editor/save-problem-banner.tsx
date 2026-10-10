"use client"

/**
 * The one line that says a save did not go through: what happened, what to
 * do, and the button that does it. Quiet on purpose: white, a hairline, a
 * small red dot, at the top of the canvas, until the next save goes through
 * or it is closed (lib/website-builder/save-problem.ts writes the words).
 */
import { X } from "lucide-react"
import type { SaveAction, SaveProblem } from "@/lib/website-builder/save-problem"

const LABEL: Record<SaveAction, string> = { retry: "Try again", reload: "Reload", signin: "Sign in", undo: "Undo", back: "Websites" }

export function SaveProblemBanner({ problem, onAction, onClose }: { problem: SaveProblem | null; onAction: (a: SaveAction) => void; onClose: () => void }) {
  if (!problem) return null
  return (
    <div
      role="alert"
      data-save-problem=""
      className="pointer-events-auto mx-auto flex w-[min(560px,calc(100%-24px))] items-center gap-3 rounded-xl border border-[#eceef1] bg-white/95 py-2 pl-3.5 pr-1.5 shadow-[0_8px_24px_-12px_rgba(16,24,40,0.25)] backdrop-blur animate-in fade-in-0 slide-in-from-top-1 duration-200"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#ef4444]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#1a1a2e]">{problem.title}</span>
        <span className="block truncate text-[12px] text-[#6b7280]">{problem.fix}</span>
      </span>
      <button
        type="button"
        onClick={() => onAction(problem.action)}
        className="shrink-0 cursor-pointer rounded-lg bg-[#1a1a2e] px-3 py-1.5 text-[12px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30"
      >
        {LABEL[problem.action]}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#9ca3af] outline-none transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
