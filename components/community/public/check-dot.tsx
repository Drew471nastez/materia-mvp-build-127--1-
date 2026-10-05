/**
 * THE CHECK BESIDE WHAT MEMBERS GET (round 11, ask 22): the tick sits in a
 * small filled circle with Storelib's light depth, a hairline and a 1px soft
 * shadow, rather than a bare glyph on the page. Drawn by hand at the size it
 * is shown (a 20px circle, a 10px tick on a 1.75 stroke), so it never reads
 * as a stock icon scaled down. No hooks: the server page and the client
 * pricing card both draw it.
 */
import { cn } from "@/lib/utils"

export function CheckDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      data-check-dot=""
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f4f5f7] text-[#1a1a2e] shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_1px_1px_rgba(16,24,40,0.06)]",
        className,
      )}
    >
      <svg viewBox="0 0 10 10" width="10" height="10" fill="none">
        <path d="M2.1 5.3 4.1 7.2 7.9 2.9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
