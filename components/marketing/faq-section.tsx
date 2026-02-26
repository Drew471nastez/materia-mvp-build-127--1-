"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { AnimateOnScroll } from "./bento-grid"

const FAQS = [
  {
    q: "Why not just use Gumroad or a marketplace?",
    a: "Marketplaces take massive cuts — often 10-30% — and own your customer relationship. With Storelib, you get a real storefront, keep more revenue, and build a brand customers remember.",
  },
  {
    q: "What's the difference between Storelib and a link-in-bio tool?",
    a: "Link-in-bio tools just list your links. Storelib is a complete e-commerce platform. Real product pages, checkout, analytics, email capture. OnePage combines link-in-bio with actual selling power.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes. Growth and Professional plans let you connect any custom domain. Your store lives at yourname.com.",
  },
  {
    q: "How fast do I get paid?",
    a: "Payments go directly through Stripe to your bank account. Typically 2 business days. No waiting weeks.",
  },
  {
    q: "What if I already sell on another platform?",
    a: "Start selling on Storelib alongside your current platform. Upload products, set up your store, redirect links when ready.",
  },
  {
    q: "Is there a contract?",
    a: "No. All plans are month-to-month. Upgrade, downgrade, or cancel whenever. No penalties, no lock-in.",
  },
]

function FaqItem({ faq, isOpen, onToggle }: { faq: typeof FAQS[number]; isOpen: boolean; onToggle: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  const measure = useCallback(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight)
    }
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  return (
    <div className="border-b border-neutral-200/80">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 sm:py-6 text-left group"
      >
        <span className="text-[15px] sm:text-base font-medium text-neutral-900 pr-4 group-hover:text-violet-600 transition-colors duration-200">
          {faq.q}
        </span>
        <span className="shrink-0 w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center transition-all duration-300 group-hover:border-violet-300 group-hover:bg-violet-50">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
          >
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ maxHeight: isOpen ? `${height}px` : "0px", opacity: isOpen ? 1 : 0 }}
      >
        <div ref={contentRef}>
          <p className="pb-5 sm:pb-6 text-sm sm:text-[15px] text-neutral-500 leading-relaxed pr-10">
            {faq.a}
          </p>
        </div>
      </div>
    </div>
  )
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="py-20 sm:py-28 bg-white" id="faq">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="flex flex-col md:flex-row md:gap-16 lg:gap-24">
            {/* Left — title */}
            <div className="md:w-[280px] lg:w-[320px] shrink-0 mb-10 md:mb-0 md:sticky md:top-32 md:self-start">
              <h2 className="text-[clamp(30px,4vw,42px)] font-bold tracking-tight leading-[1.15] mb-3">
                Frequently asked questions
              </h2>
              <p className="text-base text-neutral-500 leading-relaxed">
                Everything you need to know about Storelib.
              </p>
            </div>

            {/* Right — accordion */}
            <div className="flex-1 min-w-0">
              {FAQS.map((faq, i) => (
                <FaqItem
                  key={i}
                  faq={faq}
                  isOpen={openIndex === i}
                  onToggle={() => setOpenIndex(openIndex === i ? null : i)}
                />
              ))}
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
