"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { AnimateOnScroll } from "./bento-grid"

const FAQS = [
  {
    q: "Why not just use Gumroad or a marketplace?",
    label: "Why not Gumroad?",
    a: "Marketplaces take massive cuts — often 10-30% — and own your customer relationship. With Storelib, you get a real storefront, keep more revenue, and build a brand customers remember.",
  },
  {
    q: "What's the difference between Storelib and a link-in-bio tool?",
    label: "vs Link-in-bio",
    a: "Link-in-bio tools just list your links. Storelib is a complete e-commerce platform. Real product pages, checkout, analytics, email capture. OnePage combines link-in-bio with actual selling power.",
  },
  {
    q: "Can I use my own domain?",
    label: "Custom domain",
    a: "Yes. Growth and Professional plans let you connect any custom domain. Your store lives at yourname.com.",
  },
  {
    q: "How fast do I get paid?",
    label: "Payouts",
    a: "Payments go directly through Stripe to your bank account. Typically 2 business days. No waiting weeks.",
  },
  {
    q: "What if I already sell on another platform?",
    label: "Switching over",
    a: "Start selling on Storelib alongside your current platform. Upload products, set up your store, redirect links when ready.",
  },
  {
    q: "Is there a contract?",
    label: "No contracts",
    a: "No. All plans are month-to-month. Upgrade, downgrade, or cancel whenever. No penalties, no lock-in.",
  },
]

export function FaqSection() {
  const [activeIndex, setActiveIndex] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  const measure = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure, activeIndex])

  const activeFaq = FAQS[activeIndex]

  return (
    <section className="py-20 sm:py-28 bg-[#fafafa]" id="faq">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          {/* Header */}
          <div className="text-center max-w-[640px] mx-auto mb-10 sm:mb-14">
            <h2 className="text-[clamp(30px,4vw,42px)] font-bold tracking-tight leading-[1.15] mb-3">
              Frequently asked questions
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              Everything you need to know about Storelib.
            </p>
          </div>

          {/* Tab chips */}
          <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 mb-8 sm:mb-10">
            {FAQS.map((faq, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-full text-[13px] sm:text-sm font-medium transition-all duration-300 border ${
                  i === activeIndex
                    ? "bg-neutral-900 text-white border-neutral-900 shadow-lg shadow-neutral-900/10"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                {faq.label}
              </button>
            ))}
          </div>

          {/* Answer card */}
          <div className="max-w-[720px] mx-auto">
            <div
              className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ minHeight: contentHeight ? `${contentHeight}px` : "auto" }}
            >
              <div ref={contentRef} className="p-6 sm:p-8">
                <h3
                  className="text-[17px] sm:text-lg font-semibold text-neutral-900 mb-3 transition-opacity duration-300"
                  key={`q-${activeIndex}`}
                >
                  {activeFaq.q}
                </h3>
                <p
                  className="text-[15px] sm:text-base text-neutral-500 leading-relaxed transition-opacity duration-300"
                  key={`a-${activeIndex}`}
                >
                  {activeFaq.a}
                </p>
              </div>
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
