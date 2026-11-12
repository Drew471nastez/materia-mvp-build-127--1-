"use client"

import { AnimateOnScroll } from "./animate-on-scroll"

const ROWS = [
  { feature: "Digital products", storelib: "Instant checkout, no extra tools", other: "Requires separate storefront" },
  { feature: "Store builder", storelib: "Full drag-and-drop editor", other: "Basic product page only" },
  { feature: "Link-in-bio", storelib: "Built-in OnePage with checkout", other: "Separate tool needed" },
  { feature: "Transaction fees", storelib: "As low as 1.5%", other: "10–30% on most platforms" },
  { feature: "Email capture", storelib: "Built in, no extra cost", other: "Monthly fees, complex setup" },
  { feature: "Setup time", storelib: "Minutes", other: "Hours or days" },
]

export function ComparisonSection() {
  return (
    <section className="py-20 sm:py-24 bg-neutral-50/80">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="blur-in">
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              ↔ Compare
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Get more for less. Way less.
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              Storelib gives you everything without the complicated setup or insane fees.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up-scale" delay={150}>
          <div className="max-w-[860px] mx-auto rounded-3xl overflow-hidden bg-white border border-neutral-200">
            {/* Header */}
            <div className="grid grid-cols-[130px_1fr_1fr] sm:grid-cols-[200px_1fr_1fr]">
              <div className="p-5 sm:px-6" />
              <div className="p-5 sm:px-6 text-base font-bold bg-[#D4F542] rounded-t-xl text-center">Storelib</div>
              <div className="p-5 sm:px-6 text-base font-bold text-neutral-500 text-center">Other Platforms</div>
            </div>
            {/* Rows */}
            {ROWS.map((row, i) => (
              <div key={row.feature} className={`grid grid-cols-[130px_1fr_1fr] sm:grid-cols-[200px_1fr_1fr] border-t border-neutral-100 ${i % 2 === 0 ? "bg-neutral-50/50" : ""}`}>
                <div className="px-4 sm:px-6 py-4 text-sm font-semibold flex items-center">{row.feature}</div>
                <div className="px-4 sm:px-6 py-4 text-xs sm:text-sm flex items-center gap-2.5 bg-[#D4F542]/[0.08]">
                  <span className="text-green-500 text-lg shrink-0">✓</span> {row.storelib}
                </div>
                <div className="px-4 sm:px-6 py-4 text-xs sm:text-sm flex items-center gap-2.5">
                  <span className="text-red-500 text-lg shrink-0">✗</span> {row.other}
                </div>
              </div>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
