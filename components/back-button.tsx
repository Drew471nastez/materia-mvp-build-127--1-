"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { backThen } from "@/lib/navigation/go-back"

/**
 * Back, on the pages that are read rather than used: Terms and Privacy.
 *
 * IT NEEDS THE WATCH, BECAUSE MOST VISITS HERE HAVE NOTHING BEHIND THEM.
 * These two are linked from the app stores, from receipts and from the footer
 * of an email, so the common visit opens them as the tab's first page.
 * `router.back()` then did nothing at all and reported nothing either, so the
 * control read as broken. A back that does not show itself within
 * BACK_WATCH_MS goes to the home page instead (lib/navigation/go-back).
 */
export function BackButton({ fallbackHref = "/" }: { fallbackHref?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => backThen(() => router.push(fallbackHref))}
      className="inline-flex items-center gap-2 text-[14px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors mb-6 cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  )
}
