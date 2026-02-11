"use client"

import Link from "next/link"
import Image from "next/image"
import { Check, Sparkles, ShieldCheck, Zap, ArrowRight } from "lucide-react"

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    subtitle: "Best for first-time creators",
    description: "Launch your page, sell your first products, and start collecting leads.",
    features: [
      "6% + $0.25 per transaction",
      "Unlimited links and products",
      "Basic OnePage customization",
      "Up to 500 email captures / month",
      "Community support",
    ],
    cta: "Start free",
    href: "/signup",
    highlight: false,
    badge: "For starters",
  },
  {
    name: "Growth",
    price: "$29",
    period: "/mo",
    subtitle: "Most popular for active creators",
    description: "Lower fees, better conversion tools, and stronger branding controls.",
    features: [
      "3% + $0.25 per transaction",
      "Custom domain + verified badge",
      "Advanced OnePage design controls",
      "Lead capture automations",
      "Up to 5,000 email captures / month",
      "Priority chat support",
    ],
    cta: "Choose Growth",
    href: "/signup",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Professional",
    price: "$99",
    period: "/mo",
    subtitle: "For teams and high-volume stores",
    description: "The full Storelib stack with the lowest fees and highest support priority.",
    features: [
      "1.5% + $0.25 per transaction",
      "Everything in Growth",
      "Team access + advanced controls",
      "Premium analytics and exports",
      "Unlimited email captures",
      "Dedicated priority support",
    ],
    cta: "Go Professional",
    href: "/signup",
    highlight: false,
    badge: "Scale fast",
  },
]

const comparisonRows = [
  ["Transaction fee", "6%", "3%", "1.5%"],
  ["Custom domain", "—", "Included", "Included"],
  ["Verified badge", "—", "Included", "Included"],
  ["Email captures / month", "500", "5,000", "Unlimited"],
  ["Support", "Community", "Priority", "Dedicated priority"],
]

const showcaseLogos = [
  { src: "/images/blog/digital-products-2026.svg", alt: "Creator showcase 1" },
  { src: "/images/blog/transaction-fees.svg", alt: "Creator showcase 2" },
  { src: "/images/blog/digital-products-2026.svg", alt: "Creator showcase 3" },
  { src: "/images/blog/transaction-fees.svg", alt: "Creator showcase 4" },
]

const growthCards = [
  {
    title: "Enhanced customization",
    text: "From colors and fonts to layout details, make your page feel fully on-brand.",
    bg: "bg-[#e8c6ef]",
  },
  {
    title: "Extended analytics",
    text: "Track clicks, conversions and growth patterns so you can optimize with confidence.",
    bg: "bg-[#d7ef2c]",
  },
  {
    title: "Email & SMS integrations",
    text: "Collect leads and keep your audience warm with high-intent lifecycle messaging.",
    bg: "bg-[#9e0024] text-white",
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#faf5ff_0%,_#ffffff_45%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="text-center space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700">
            <Sparkles className="h-4 w-4" />
            Clear pricing. No hidden surprises.
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[#141b34] sm:text-5xl">
            Pricing built for creators at every stage
          </h1>
          <p className="mx-auto max-w-2xl text-base text-slate-600 sm:text-lg">
            Start free, then upgrade only when your growth demands it. Every plan includes the core Storelib experience.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <article
              key={plan.name}
              className={`relative rounded-3xl border bg-white p-6 shadow-sm transition-all duration-200 ${
                plan.highlight
                  ? "border-violet-300 shadow-[0_16px_50px_-22px_rgba(109,40,217,0.45)] ring-1 ring-violet-200/60"
                  : "border-slate-200"
              }`}
            >
              <div className="mb-5 flex items-center justify-between">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${plan.highlight ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {plan.badge}
                </span>
                {plan.highlight && <Zap className="h-4 w-4 text-violet-600" />}
              </div>

              <h2 className="text-2xl font-bold text-[#141b34]">{plan.name}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">{plan.subtitle}</p>

              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-bold text-[#141b34]">{plan.price}</span>
                <span className="mb-1 text-sm text-slate-500">{plan.period}</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-600">{plan.description}</p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ${plan.highlight ? "bg-violet-600" : "bg-violet-100"}`}>
                      <Check className={`h-3.5 w-3.5 ${plan.highlight ? "text-white" : "text-violet-700"}`} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-violet-600 text-white hover:bg-violet-700"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2 text-[#141b34]">
            <ShieldCheck className="h-5 w-5 text-violet-600" />
            <h3 className="text-xl font-semibold">Plan comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-medium">Feature</th>
                  <th className="px-3 py-3 font-medium">Free</th>
                  <th className="px-3 py-3 font-medium">Growth</th>
                  <th className="px-3 py-3 font-medium">Professional</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row[0]} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-medium text-[#141b34]">{row[0]}</td>
                    <td className="px-3 py-3 text-slate-600">{row[1]}</td>
                    <td className="px-3 py-3 text-slate-600">{row[2]}</td>
                    <td className="px-3 py-3 text-slate-600">{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-violet-200 bg-violet-50/60 p-6 text-center sm:p-8">
          <h3 className="text-2xl font-bold text-[#141b34]">Need a custom plan for your team?</h3>
          <p className="mx-auto mt-2 max-w-2xl text-slate-600">
            If you run an agency or enterprise brand, we can build a custom setup for your products, automations, and support needs.
          </p>
          <Link href="/contact" className="mt-5 inline-flex rounded-xl bg-[#141b34] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0f1325]">
            Talk to sales
          </Link>
        </section>

        <section className="space-y-8 py-4">
          <div className="text-center space-y-3">
            <h3 className="text-4xl font-bold text-[#141b34]">The only link in bio trusted by millions</h3>
            <p className="mx-auto max-w-3xl text-slate-600">Use one Storelib page to share everything you create across Instagram, TikTok, X, YouTube and more.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {showcaseLogos.map((logo, i) => (
              <div key={i} className="relative h-36 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Image src={logo.src} alt={logo.alt} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-[#deb8e8] px-4 py-10 sm:px-8">
          <div className="mx-auto max-w-5xl text-center">
            <h3 className="text-4xl font-bold text-[#4a2275]">Your growth starts here.</h3>
            <p className="mx-auto mt-3 max-w-2xl text-[#4a2275]/85">Manage social posts, grow your list, and get conversion insights in one place.</p>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {growthCards.map((card) => (
              <article key={card.title} className={`rounded-3xl p-6 ${card.bg}`}>
                <h4 className="text-2xl font-bold">{card.title}</h4>
                <p className="mt-3 text-sm leading-relaxed opacity-90">{card.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
