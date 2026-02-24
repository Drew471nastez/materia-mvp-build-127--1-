"use client"

import Link from "next/link"
import { Check, ArrowRight } from "lucide-react"
import { AnimateOnScroll } from "./bento-grid"

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    periodLabel: "Free forever",
    desc: "Perfect for getting started.",
    features: [
      "6% + $0.25 per transaction",
      "Unlimited digital products",
      "Basic OnePage features",
      "500 emails / month",
      "Community support",
    ],
    cta: "Start Free",
    href: "/signup",
    popular: false,
    badge: null as string | null,
  },
  {
    name: "Growth",
    price: "$29",
    period: "/mo",
    periodLabel: null as string | null,
    desc: "For creators ready to scale and pay lower fees.",
    features: [
      "3% + $0.25 per transaction",
      "Unlimited digital products",
      "Premium OnePage features",
      "Custom domain",
      "Verified badge",
      "2,000 emails / month",
      "Priority chat support",
    ],
    cta: "Choose Growth",
    href: "/signup",
    popular: true,
    badge: "Most Popular",
  },
  {
    name: "Professional",
    price: "$99",
    period: "/mo",
    periodLabel: null as string | null,
    desc: "For serious creators who want the lowest fees and priority support.",
    features: [
      "1.5% + $0.25 per transaction",
      "Unlimited digital products",
      "Premium OnePage features",
      "Custom domain",
      "Verified badge",
      "5,000 emails / month",
      "Dedicated priority support",
      "Advanced analytics & exports",
    ],
    cta: "Go Professional",
    href: "/signup",
    popular: false,
    badge: "Recommended",
  },
]

export function PricingSection() {
  return (
    <section className="py-20 sm:py-24 bg-white" id="pricing">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll>
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              💰 Pricing
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Start free, upgrade when you&apos;re ready
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              Simple, transparent pricing that grows with you. No hidden fees, no surprises.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[960px] mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-lg p-9 relative flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                  plan.popular
                    ? "border-[1.5px] border-violet-600 shadow-[0_0_0_1px_#7c3aed] shadow-md"
                    : "border-[1.5px] border-neutral-200"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-semibold px-3.5 py-1 rounded-full">
                    {plan.badge}
                  </span>
                )}
                <div className="text-lg font-semibold mb-1.5">{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[42px] font-bold tracking-tight">{plan.price}</span>
                  {plan.period && <span className="text-sm text-neutral-400">{plan.period}</span>}
                </div>
                {plan.periodLabel && (
                  <p className="text-[13px] text-neutral-400 mb-1">{plan.periodLabel}</p>
                )}
                <p className="text-[13px] text-neutral-400 mb-5">{plan.desc}</p>

                {/* CTA button — right under description */}
                <Link
                  href={plan.href}
                  className={`relative w-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold py-3.5 px-8 rounded-full transition-all duration-300 hover:-translate-y-0.5 overflow-hidden mb-7 ${
                    plan.popular
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "bg-white text-neutral-900 border-[1.5px] border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  {plan.popular && (
                    <span className="btn-shine-effect" aria-hidden="true" />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                {/* Features list — below button */}
                <ul className="flex flex-col gap-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-neutral-500">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${plan.popular ? "bg-violet-600" : "bg-violet-50"}`}>
                        <Check className={`h-3 w-3 ${plan.popular ? "text-white" : "text-violet-600"}`} strokeWidth={3} />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll className="text-center mt-8">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-[15px] font-semibold py-3.5 px-8 rounded-full bg-white text-neutral-900 border-[1.5px] border-neutral-200 hover:border-neutral-400 transition-all duration-300 hover:-translate-y-0.5"
          >
            See full pricing details →
          </Link>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
