"use client"

import { StoryHeading } from "./story-heading"

import { useState, useRef, useEffect, useCallback } from "react"
import { AnimateOnScroll } from "./animate-on-scroll"

const FAQS = [
  {
    q: "What is Storelib?",
    a: "Storelib is an all-in-one e-commerce platform for creators & entrepreneurs. It allows you to sell digital products, build your link-in-bio page, set up an online store, create product pages, get featured on the marketplace for increased exposure to other buyers and creators &  grow an audience and boost your brand, without having to worry about technical stuff or using 6 different tools.",
  },
  {
    q: "What can I sell on Storelib?",
    a: "You can sell digital products (e-books, courses, templates, presets, music, software), offer services, showcase your portfolio, set up your link-in-bio, and more. If you create it, you can sell it on Storelib.",
  },
  {
    q: "What's the difference between Storelib and a link-in-bio tool?",
    a: "Link-in-bio tools just list your links. Storelib is a complete e-commerce platform. Real product pages, checkout, analytics, email capture. OnePage combines link-in-bio with actual selling power.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes, on the Pro plan ($29 a month). Your store lives at yourname.com.",
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
    q: "Do I need any coding skills to set up my store?",
    a: "No coding skills needed at all. Storelib uses drag-and-drop builders that make it super easy to set up your store, product pages, and OnePage. It's designed to be beginner-friendly — just pick a layout, add your content, and you're live in minutes.",
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
    <div className="mb-3">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 text-left rounded-2xl transition-all duration-300 group ${
          isOpen
            ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-neutral-200/60"
            : "bg-white/70 border border-neutral-100 hover:bg-white hover:shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:border-neutral-200/60"
        }`}
      >
        <span className={`text-[15px] sm:text-base font-medium pr-4 transition-colors duration-200 ${isOpen ? "text-neutral-900" : "text-neutral-900 group-hover:text-neutral-900"}`}>
          {faq.q}
        </span>
        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? "bg-violet-100 border-violet-200" : "border border-neutral-200 group-hover:border-violet-200 group-hover:bg-violet-50"}`}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform duration-300 ${isOpen ? "rotate-45 text-violet-600" : ""}`}
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
          <p className="px-5 sm:px-6 pt-4 pb-3 text-sm sm:text-[15px] text-neutral-500 leading-relaxed pr-10">
            {faq.a}
          </p>
        </div>
      </div>
    </div>
  )
}

export function FaqSection({ editorial = false }: { editorial?: boolean } = {}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section data-story-section={editorial ? "faq" : undefined} className="py-20 sm:py-28 bg-[#fafafa]" id="faq">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="slide-right">
          <div className="flex flex-col md:flex-row md:gap-16 lg:gap-24">
            {/* Left — title */}
            <div className="md:w-[280px] lg:w-[320px] shrink-0 mb-10 md:mb-0 md:sticky md:top-32 md:self-start">
              {editorial ? <StoryHeading text="Good questions. Clear answers." accent={["answers"]} className="mb-6" /> : (<h2 className="text-[clamp(30px,4vw,42px)] font-bold tracking-tight leading-[1.15] mb-3">
                Faq
              </h2>)}
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
