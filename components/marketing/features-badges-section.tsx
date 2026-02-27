"use client"

import { AnimateOnScroll } from "./bento-grid"

const BADGES = [
  { icon: "⚡", label: "Launch in minutes" },
  { icon: "✕", label: "Cancel anytime" },
  { icon: "🔧", label: "No coding" },
  { icon: "💸", label: "Get paid directly" },
]

export function FeaturesBadgesSection() {
  return (
    <section className="py-14 sm:py-20 bg-white">
      <div className="max-w-[960px] mx-auto px-6">
        <AnimateOnScroll variant="fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
            {BADGES.map((badge) => (
              <div
                key={badge.label}
                className="flex flex-col items-center justify-center text-center gap-2.5 py-6 sm:py-8 px-4 rounded-2xl bg-neutral-50 border border-neutral-100"
              >
                <span className="text-2xl sm:text-3xl">{badge.icon}</span>
                <span className="text-[13px] sm:text-[15px] font-semibold text-neutral-800 leading-tight">
                  {badge.label}
                </span>
              </div>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
