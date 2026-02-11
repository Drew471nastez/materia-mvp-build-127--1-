"use client"

import Link from "next/link"
import { Check, Sparkles, ShieldCheck, ArrowRight, Star, Globe, BarChart3, CreditCard, Palette, Bot, Download } from "lucide-react"

const pricingPlans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "",
    periodLabel: "Free forever",
    subtitle: "Best for first-time creators",
    description: "Launch your page, sell your first products, and start collecting leads.",
    features: [
      "6% + $0.25 per transaction",
      "Unlimited digital products",
      "Basic OnePage features",
      "500 emails / month",
      "Community support",
    ],
    cta: "Start Free",
    href: "/signup",
    highlight: false,
    badge: null,
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29",
    period: "/mo",
    periodLabel: null,
    subtitle: "Most popular for active creators",
    description: "Lower fees, better conversion tools, and stronger branding controls.",
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
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: "pro",
    name: "Professional",
    price: "$99",
    period: "/mo",
    periodLabel: null,
    subtitle: "For teams and high-volume stores",
    description: "The full Storelib stack with the lowest fees and highest support priority.",
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
    highlight: false,
    badge: "Recommended",
  },
]

const comparisonRows = [
  { feature: "Transaction fee", free: "6% + $0.25", growth: "3% + $0.25", pro: "1.5% + $0.25" },
  { feature: "Digital products", free: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
  { feature: "Custom domain", free: false, growth: true, pro: true },
  { feature: "Verified badge", free: false, growth: true, pro: true },
  { feature: "Email captures / month", free: "500", growth: "2,000", pro: "5,000" },
  { feature: "OnePage features", free: "Basic", growth: "Premium", pro: "Premium" },
  { feature: "Analytics", free: "Basic", growth: "Advanced", pro: "Premium + exports" },
  { feature: "Support", free: "Community", growth: "Priority chat", pro: "Dedicated priority" },
]

const platformFeatures = [
  { icon: CreditCard, title: "Secure Payments", description: "Accept payments globally with Stripe. Credit cards, Apple Pay, Google Pay." },
  { icon: Download, title: "Instant Delivery", description: "Automatic file delivery after purchase. Customers get instant access." },
  { icon: Palette, title: "Beautiful Storefronts", description: "Customizable OnePage storefronts that reflect your brand. No coding." },
  { icon: BarChart3, title: "Analytics Dashboard", description: "Track sales, views, and revenue in real-time. Data-driven decisions." },
  { icon: Globe, title: "Custom Domains", description: "Connect your own domain for a fully branded experience." },
  { icon: Bot, title: "AI-Powered Tools", description: "Smart product descriptions, pricing optimization, and recommendations." },
]

const faqs = [
  { q: "Can I switch plans anytime?", a: "Yes. Upgrade, downgrade, or cancel at any time. Changes take effect at the next billing cycle." },
  { q: "What payment methods do you support?", a: "We use Stripe to process payments. Your customers can pay with credit cards, Apple Pay, Google Pay, and more." },
  { q: "Is there a contract or commitment?", a: "No contracts. All plans are month-to-month. Cancel anytime with no penalties." },
  { q: "What happens to my products if I downgrade?", a: "Your products stay live. You just lose access to premium features until you upgrade again." },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative pt-16 sm:pt-20 pb-12 overflow-hidden">
        <div className="absolute top-10 left-10 w-72 h-72 bg-violet-100/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-10 w-64 h-64 bg-pink-100/20 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700 mb-6">
              <Sparkles className="h-4 w-4" />
              Clear pricing. No hidden surprises.
            </div>
            <h1 className="text-[32px] sm:text-[42px] lg:text-[48px] font-bold text-[#1a1a2e] tracking-tight mb-4">
              Pricing built for creators at every stage
            </h1>
            <p className="text-[15px] sm:text-[17px] text-[#6b7280] max-w-2xl mx-auto">
              Start free, then upgrade only when your growth demands it. Every plan includes the core Storelib experience.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards - matching /upgrade page style */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {pricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 sm:p-7 flex flex-col transition-all duration-200 ${
                  plan.highlight
                    ? "bg-white border border-[#7c3aed]/25 shadow-[0_0_24px_-6px_rgba(124,58,237,0.12)] hover:shadow-[0_0_32px_-6px_rgba(124,58,237,0.18)] ring-1 ring-[#7c3aed]/5 scale-[1.02]"
                    : "bg-white border-2 border-[#e5e7eb] hover:border-[#d1d5db] shadow-sm hover:shadow-md"
                }`}
              >
                {plan.badge === "Most Popular" && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3.5 py-1 bg-[#7c3aed] rounded-full text-[11px] font-bold text-white shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}
                {plan.badge === "Recommended" && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3.5 py-1 bg-[#1a1a2e] rounded-full text-[11px] font-bold text-white shadow-lg">
                      <Star className="h-3 w-3 fill-white" />
                      Recommended
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="text-[20px] font-bold mb-1.5 text-[#1a1a2e]">
                    {plan.name}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-[#6b7280]">
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[40px] font-bold leading-none text-[#1a1a2e]">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-[15px] text-[#9ca3af]">{plan.period}</span>
                    )}
                  </div>
                  {plan.periodLabel && (
                    <p className="text-[13px] mt-1.5 text-[#9ca3af]">{plan.periodLabel}</p>
                  )}
                </div>

                <Link
                  href={plan.href}
                  className={`w-full h-12 text-[14px] font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mb-6 ${
                    plan.highlight
                      ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                      : "bg-[#1a1a2e] hover:bg-[#0f1325] text-white"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${plan.highlight ? "bg-[#7c3aed]" : "bg-[#ede9fe]"}`}>
                        <Check className={`h-3 w-3 ${plan.highlight ? "text-white" : "text-[#7c3aed]"}`} strokeWidth={3} />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plan Comparison Table */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-8">
            <div className="mb-6 flex items-center gap-2 text-[#1a1a2e]">
              <ShieldCheck className="h-5 w-5 text-[#7c3aed]" />
              <h3 className="text-xl font-semibold">Plan comparison</h3>
            </div>
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e5e7eb]">
                    <th className="px-3 py-3 font-medium text-[#6b7280]">Feature</th>
                    <th className="px-3 py-3 font-medium text-[#6b7280]">Free</th>
                    <th className="px-3 py-3 font-medium text-[#7c3aed]">Growth</th>
                    <th className="px-3 py-3 font-medium text-[#6b7280]">Professional</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.feature} className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-3 py-3 font-medium text-[#1a1a2e] text-[13px]">{row.feature}</td>
                      {(["free", "growth", "pro"] as const).map((planKey) => {
                        const val = row[planKey]
                        return (
                          <td key={planKey} className="px-3 py-3 text-[13px] text-[#374151]">
                            {val === true ? (
                              <div className="w-5 h-5 rounded-full bg-[#ede9fe] flex items-center justify-center">
                                <Check className="h-3 w-3 text-[#7c3aed]" strokeWidth={3} />
                              </div>
                            ) : val === false ? (
                              <span className="text-[#d1d5db]">&mdash;</span>
                            ) : (
                              val
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features Grid */}
      <section className="pb-16 sm:pb-20 bg-[#faf5ff]/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20">
          <div className="text-center mb-10">
            <h2 className="text-[26px] sm:text-[32px] font-bold text-[#1a1a2e] mb-3">
              Everything you need to sell digital products
            </h2>
            <p className="text-[15px] text-[#6b7280] max-w-2xl mx-auto">
              Every plan includes the core Storelib platform. Powerful tools to create, sell, and grow.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {platformFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="p-5 rounded-2xl bg-white border border-[#e5e7eb] hover:border-[#d1d5db] hover:shadow-md transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">{feature.title}</h3>
                  <p className="text-[13px] text-[#6b7280] leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-[26px] sm:text-[32px] font-bold text-[#1a1a2e] mb-3">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-[#e5e7eb] p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-2">{faq.q}</h3>
                <p className="text-[13px] text-[#6b7280] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-8 sm:p-12 text-center">
            <h3 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e] mb-3">
              Ready to start selling?
            </h3>
            <p className="text-[15px] text-[#6b7280] max-w-xl mx-auto mb-6">
              Join thousands of creators selling digital products on Storelib. Start free, upgrade when you're ready.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-[#7c3aed] text-white text-[15px] font-semibold hover:bg-[#6d28d9] transition-colors"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Custom plan */}
      <section className="pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[13px] text-[#9ca3af] mb-3">
            Need a custom plan for your agency or enterprise team?
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
          >
            Talk to sales
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
