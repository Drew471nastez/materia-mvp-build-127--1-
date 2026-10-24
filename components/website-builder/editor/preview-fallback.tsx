"use client"

/**
 * A CARD WHOSE SECTION CANNOT BE PICTURED, DESIGNED RATHER THAN BLANK.
 *
 * Round BC, the owner: cards that showed "only grey placeholder text with
 * the section's name". Most of those now draw (section-library.tsx and
 * compat-section-preview.tsx try a section's own blocks when its preset is
 * empty), and what is left is a section that truly has nothing to show here:
 * one that needs a product, or one its theme cannot draw. Both kinds of
 * library (Storelib's and an imported theme's) show the same quiet card: a
 * faint sketch of a section, its name, and one line saying why.
 */
import { LayoutTemplate } from "lucide-react"
import { tt } from "@/lib/i18n/text"

export function PreviewFallback({ title, reason = "empty" }: { title: string; reason?: "empty" | "unavailable" }) {
  return (
    <div data-preview-empty="" data-preview-fallback={reason} className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden bg-[#f6f7f9] px-4 text-center">
      {/* A sketch of a section behind the words: a heading bar and three tiles, in the card's own greys. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 flex -translate-y-1/2 flex-col items-center gap-[6%] opacity-50" style={{ height: "70%" }}>
        <span className="h-[10%] w-[38%] rounded-full bg-[#eceef2]" />
        <span className="flex w-full flex-1 gap-[4%]">
          <span className="flex-1 rounded-lg bg-[#eceef2]" />
          <span className="flex-1 rounded-lg bg-[#eceef2]" />
          <span className="flex-1 rounded-lg bg-[#eceef2]" />
        </span>
      </span>
      <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#9ca3af] shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="relative max-w-full truncate text-[13px] font-medium text-[#4b5563]">{title}</span>
      <span className="relative text-[11px] text-[#9ca3af]">{reason === "unavailable" ? tt("No preview for this section") : tt("Shows once it has content")}</span>
    </div>
  )
}
