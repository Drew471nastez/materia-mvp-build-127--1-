"use client"

import { useState } from "react"
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

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="py-20 sm:py-24 bg-neutral-50/80" id="faq">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              ❓ FAQ
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight">
              Questions? Answers.
            </h2>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="max-w-[680px] mx-auto">
            {FAQS.map((faq, i) => (
              <div key={i} className="border-b border-neutral-200">
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="w-full flex items-center justify-between py-5 text-left text-base font-medium transition-colors duration-300 hover:text-violet-600"
                >
                  {faq.q}
                  <span className="text-xl text-neutral-400 shrink-0 ml-4 transition-transform duration-300" style={{ transform: openIndex === i ? "rotate(45deg)" : "none" }}>
                    +
                  </span>
                </button>
                <div
                  className="overflow-hidden transition-all duration-350 ease-out"
                  style={{ maxHeight: openIndex === i ? "300px" : "0px" }}
                >
                  <p className="pb-5 text-sm text-neutral-500 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
