"use client"

import { useState } from "react"
import Link from "next/link"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
import { StorelibLogo } from "@/components/brand/storelib-logo"

const DESTINATIONS = [
  { label: "Community invite", next: "/community/demo-club?join=1" },
  { label: "Explore", next: "/explore" },
  { label: "Product page", next: "/demo/preset-pack" },
] as const

/**
 * Live join onboarding plus a landing preview when the flow completes in
 * preview mode (same component members see; nothing is saved).
 */
export function OnboardingPreview() {
  const [dest, setDest] = useState(DESTINATIONS[0].next)
  const [open, setOpen] = useState(true)
  const [landed, setLanded] = useState<string | null>(null)

  if (landed) {
    return (
      <div className="flex min-h-svh flex-col bg-[#f8f9fa] font-sans text-[#1a1a2e]">
        <header className="border-b border-[#eceef1] bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <StorelibLogo size={32} />
            <span className="text-[13px] font-medium text-[#6b7280]">Simulator · after onboarding</span>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-[15px] text-[#6b7280]">The join flow would land here:</p>
          <p className="mt-2 break-all text-[17px] font-semibold text-[#1a1a2e]">{landed}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={landed}
              className="inline-flex h-11 items-center rounded-xl bg-[#1a1a2e] px-5 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(17,24,39,0.12)]"
            >
              Open destination
            </Link>
            <button
              type="button"
              onClick={() => {
                setLanded(null)
                setOpen(true)
              }}
              className="inline-flex h-11 items-center rounded-xl border border-[#e5e7eb] bg-white px-5 text-[14px] font-medium text-[#374151]"
            >
              Run onboarding again
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="relative min-h-svh bg-[#f8f9fa]">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[300] flex justify-center px-4 pt-3">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-white/95 px-3 py-2 text-[12px] shadow-[0_4px_20px_-8px_rgba(17,24,39,0.2)] backdrop-blur-sm">
          <span className="font-medium text-[#6b7280]">Land at</span>
          {DESTINATIONS.map((d) => (
            <button
              key={d.next}
              type="button"
              onClick={() => setDest(d.next)}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${dest === d.next ? "bg-[#1a1a2e] text-white" : "text-[#4b5563] hover:bg-[#f3f4f6]"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <CreatorOnboardingModal
        open={open}
        preview
        onClose={() => setOpen(false)}
        onPreviewComplete={(href) => {
          setOpen(false)
          setLanded(href)
        }}
        start={{ next: dest, name: "Alex Rivera", username: null, bio: "" }}
      />
    </div>
  )
}
