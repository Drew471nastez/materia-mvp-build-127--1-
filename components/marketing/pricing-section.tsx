"use client"

import Link from "next/link"
import { AnimateOnScroll } from "./bento-grid"

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    desc: "Perfect for getting started",
    fee: "6% + $0.25 per sale",
    features: [
      "Unlimited digital products",
      "Basic OnePage",
      "500 email captures/month",
      "Store analytics",
      "Community support",
    ],
    cta: "Get started free",
    href: "/signup",
    popular: false,
    btnClass: "bg-white text-neutral-900 border-[1.5px] border-neutral-200 hover:border-neutral-400",
  },
  {
    name: "Growth",
    price: "$29",
    period: "/month",
    desc: "For creators ready to scale",
    fee: "3% + $0.25 per sale",
    features: [
      "Everything in Free",
      "Premium OnePage features",
      "Custom domain",
      "Verified badge ✦",
      "2,000 email captures/month",
      "Priority chat support",
    ],
    cta: "Choose Growth →",
    href: "/signup",
    popular: true,
    btnClass: "bg-violet-600 text-white hover:bg-violet-700",
  },
  {
    name: "Professional",
    price: "$99",
    period: "/month",
    desc: "Lowest fees, max control",
    fee: "1.5% + $0.25 per sale",
    features: [
      "Everything in Growth",
      "5,000 email captures/month",
      "Advanced analytics + exports",
      "Dedicated priority support",
      "Early access to features",
    ],
    cta: "Go Professional",
    href: "/signup",
    popular: false,
    btnClass: "bg-white text-neutral-900 border-[1.5px] border-neutral-200 hover:border-neutral-400",
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
              No surprise fees. No contracts. Cancel anytime.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[960px] mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`bg-white rounded-3xl p-9 relative transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                  plan.popular
                    ? "border-[1.5px] border-violet-600 shadow-[0_0_0_1px_#7c3aed] shadow-md"
                    : "border-[1.5px] border-neutral-200"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-semibold px-3.5 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <div className="text-lg font-semibold mb-1.5">{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[42px] font-bold tracking-tight">{plan.price}</span>
                  {plan.period && <span className="text-sm text-neutral-400">{plan.period}</span>}
                </div>
                <p className="text-[13px] text-neutral-400 mb-5">{plan.desc}</p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 rounded-full text-[13px] font-medium mb-6">
                  📊 {plan.fee}
                </div>
                <ul className="flex flex-col gap-3 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-neutral-500">
                      <span className="text-green-500 font-bold text-base shrink-0">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`w-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold py-3.5 px-8 rounded-full transition-all duration-300 hover:-translate-y-0.5 ${plan.btnClass}`}
                >
                  {plan.cta}
                </Link>
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
