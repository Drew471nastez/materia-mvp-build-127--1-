"use client"

import { AnimateOnScroll } from "./bento-grid"

const FEATURES = [
  {
    icon: "🔗",
    title: "Link-in-bio store",
    instead: "Linktree Pro — $9/mo",
    price: "$9",
  },
  {
    icon: "🛍",
    title: "Digital product storefront",
    instead: "Shopify — $39/mo",
    price: "$39",
  },
  {
    icon: "💳",
    title: "Checkout & payments",
    instead: "Lemon Squeezy fees",
    price: "Fees",
  },
  {
    icon: "📦",
    title: "File hosting & delivery",
    instead: "Google Drive / Dropbox — $12/mo",
    price: "$12",
  },
  {
    icon: "📧",
    title: "Email collection",
    instead: "ConvertKit — $19/mo",
    price: "$19",
  },
  {
    icon: "📊",
    title: "Sales analytics",
    instead: "separate analytics tools — $10/mo",
    price: "$10",
  },
  {
    icon: "🌍",
    title: "Built-in marketplace exposure",
    instead: "paying for ads to get traffic",
    price: "$25",
  },
]

export function ToolStackSection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-[1200px] mx-auto px-0 sm:px-6">
        <AnimateOnScroll>
          {/* Outer rounded card wrapper — light gray bg, full width on mobile */}
          <div className="bg-neutral-50 border-y sm:border border-neutral-200/70 rounded-none sm:rounded-[32px] px-5 sm:px-10 md:pl-20 md:pr-16 py-12 sm:py-16">
            {/* Headline */}
            <div className="text-center max-w-[640px] mx-auto mb-10 sm:mb-14">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-5">
                <svg fill="#a270ff" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" stroke="#a270ff" strokeWidth="0.192"><path d="M1,8A1,1,0,0,1,2,7H9.586L7.293,4.707A1,1,0,1,1,8.707,3.293l4,4a1,1,0,0,1,0,1.414l-4,4a1,1,0,1,1-1.414-1.414L9.586,9H2A1,1,0,0,1,1,8Zm21,7H14.414l2.293-2.293a1,1,0,0,0-1.414-1.414l-4,4a1,1,0,0,0,0,1.414l4,4a1,1,0,0,0,1.414-1.414L14.414,17H22a1,1,0,0,0,0-2Z"></path></svg>
                Compare
              </span>
              <h2 className="text-[clamp(28px,4vw,44px)] font-bold leading-[1.15] tracking-tight mb-3.5">
                Replace your entire tool stack
              </h2>
              <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                Stop paying for 6 different tools. Storelib brings it all in one.
              </p>
            </div>

            {/* Inner white card with feature list */}
            <div className="max-w-[578px] mx-auto bg-white rounded-[20px] shadow-[0_2px_24px_rgba(0,0,0,0.06)] p-5 sm:p-7">
              {/* Feature list */}
              <div className="flex flex-col">
                {FEATURES.map((f, i) => (
                  <div key={f.title}>
                    <div className="flex items-center gap-3 sm:gap-4 py-4 sm:py-[18px]">
                      {/* Icon */}
                      <span className="text-[20px] sm:text-[22px] shrink-0 w-8 text-center">{f.icon}</span>

                      {/* Title + "Instead of" */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] sm:text-base font-semibold text-neutral-900 leading-snug">
                          {f.title}
                        </p>
                        <p className="text-[12px] sm:text-[13px] text-neutral-400 leading-snug mt-0.5">
                          Instead of: {f.instead}
                        </p>
                      </div>

                      {/* Price */}
                      <span className="text-[15px] sm:text-base font-bold text-neutral-800 shrink-0 tabular-nums">
                        {f.price}
                      </span>
                    </div>

                    {/* Row divider (except after last) */}
                    {i < FEATURES.length - 1 && (
                      <div className="h-px bg-neutral-100 ml-11 sm:ml-12" />
                    )}
                  </div>
                ))}
              </div>

              {/* Full divider before totals */}
              <div className="h-px bg-neutral-200 mt-2 mb-4" />

              {/* "What you'd pay otherwise" row */}
              <div className="flex items-center gap-3 sm:gap-4 py-3">
                <span className="w-8 flex items-center justify-center shrink-0">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <circle cx="11" cy="11" r="11" fill="#FEE2E2" />
                    <path d="M7.5 7.5L14.5 14.5M14.5 7.5L7.5 14.5" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <p className="flex-1 text-[15px] sm:text-base font-semibold text-neutral-900">
                  What you&apos;d pay otherwise
                </p>
                <span className="text-[17px] sm:text-lg font-bold text-red-500 shrink-0">$85+/mo</span>
              </div>

              {/* Storelib row */}
              <div className="flex items-center gap-3 sm:gap-4 py-3">
                <span className="w-8 flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
                    alt="Storelib"
                    width={22}
                    height={22}
                    className="w-[22px] h-[22px]"
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] sm:text-base font-semibold text-neutral-900">
                    Storelib
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[17px] sm:text-lg font-bold text-neutral-900">Free to start</span>
                  <p className="text-[12px] text-neutral-400 mt-0.5">or $29/mo</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center mt-10 sm:mt-12">
              <a
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-base font-semibold rounded-lg h-[52px] sm:h-[56px] px-10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/20"
              >
                Start for free <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
