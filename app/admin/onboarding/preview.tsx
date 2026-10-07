"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { cn } from "@/lib/utils"

const DESTINATIONS = [
  { label: "Community invite", next: "/community/demo-club?join=1" },
  { label: "Explore", next: "/explore" },
  { label: "Product page", next: "/demo/preset-pack" },
] as const

/**
 * Live join onboarding plus a landing preview when the flow completes in
 * preview mode (same component members see; nothing is saved). The landing
 * is painted underneath the whole time, so finishing crossfades into it
 * instead of a blank page.
 */
export function OnboardingPreview() {
  const dest = DESTINATIONS[0].next
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [run, setRun] = useState(0)
  const [landed, setLanded] = useState<string | null>(null)

  useEffect(() => {
    router.prefetch(dest)
    router.prefetch("/explore")
  }, [router, dest])

  return (
    <div className="relative min-h-svh bg-[#f8f9fa]">
      <div
        aria-hidden={landed ? undefined : true}
        className={cn(
          "min-h-svh transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          landed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <header className="border-b border-[#eceef1] bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <StorelibLogo size={32} />
            <span className="text-[13px] font-medium text-[#6b7280]">Simulator · after onboarding</span>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-[15px] text-[#6b7280]">The join flow would land here:</p>
          <p className="mt-2 break-all text-[17px] font-semibold text-[#1a1a2e]">{landed ?? dest}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={landed ?? dest}
              className="inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-5 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(17,24,39,0.12)]"
            >
              Open destination
            </Link>
            <button
              type="button"
              onClick={() => {
                setLanded(null)
                setRun((n) => n + 1)
                setOpen(true)
              }}
              className="inline-flex h-11 items-center rounded-xl border border-[#e5e7eb] bg-white px-5 text-[14px] font-medium text-[#374151]"
            >
              Run onboarding again
            </button>
          </div>
        </main>
      </div>
      <CreatorOnboardingModal
        key={run}
        open={open}
        preview
        onClose={() => setOpen(false)}
        onPreviewComplete={(href) => {
          setLanded(href)
          setOpen(false)
        }}
        start={{ next: dest, name: "Alex Rivera", username: null, bio: "" }}
      />
    </div>
  )
}
