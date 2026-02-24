"use client"

import { AnimateOnScroll } from "./bento-grid"

const STATS = [
  { value: "10K+", label: "Creators signed up" },
  { value: "$2M+", label: "Processed in sales" },
  { value: "50K+", label: "Products sold" },
  { value: "180+", label: "Countries reached" },
]

export function StatsBar() {
  return (
    <section className="py-14 sm:py-16 border-t border-b border-neutral-100">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <h3 className="text-[40px] font-bold tracking-tighter mb-1">{s.value}</h3>
                <p className="text-sm text-neutral-500">{s.label}</p>
              </div>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
