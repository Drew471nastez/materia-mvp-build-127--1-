/**
 * Where a membership stands, in the buyer's library and the creator's
 * members list alike: a small dot in the state's colour, one or two words,
 * and (optionally) the line that says what happens next. The colours are
 * the ones /app already uses for good, waiting, failed and finished.
 */
import { cn } from "@/lib/utils"
import type { StatusView, Tone } from "@/lib/memberships/state"

export const TONE_DOT: Record<Tone, string> = {
  good: "bg-[#16a34a]",
  warn: "bg-[#d97706]",
  bad: "bg-[#dc2626]",
  quiet: "bg-[#a1a1aa]",
}

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-[#15803d]",
  warn: "text-[#b45309]",
  bad: "text-[#b91c1c]",
  quiet: "text-[#6b7280]",
}

export function StatusLabel({ view, className }: { view: StatusView; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", TONE_TEXT[view.tone], className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[view.tone])} />
      {view.label}
    </span>
  )
}
