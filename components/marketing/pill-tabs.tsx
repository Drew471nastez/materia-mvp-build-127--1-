"use client"

import { useState } from "react"
import { AnimateOnScroll } from "./animate-on-scroll"

const TABS = [
  {
    id: "sell",
    label: "Sell",
    title: "Sell anything digital, instantly",
    desc: "Upload any file — PDFs, courses, templates, presets, music, code — and start selling in minutes.",
    features: ["Unlimited digital products", "Instant file delivery after purchase", "Variant pricing and bundles", "Gift purchases and tipping"],
    visual: "store",
  },
  {
    id: "grow",
    label: "Marketplace",
    title: "Get discovered on the Marketplace",
    desc: "List your products on the Storelib Marketplace where thousands of buyers browse daily. Build your profile and let customers find you.",
    features: ["Get listed in front of active buyers", "Build a public creator profile", "Curated collections and categories", "Ratings and reviews from customers"],
    visual: "marketplace",
  },
  {
    id: "manage",
    label: "Manage",
    title: "Your dashboard, your command center",
    desc: "Track every sale, every visitor, every conversion. Real-time analytics that show you what's working.",
    features: ["Real-time sales dashboard", "Visitor and conversion tracking", "Customer management", "Export data anytime"],
    visual: "analytics",
  },
  {
    id: "customize",
    label: "Customize",
    title: "Make it yours, completely",
    desc: "Drag-and-drop store builder, custom themes, your own domain. Designer-level storefront in minutes.",
    features: ["Visual drag-and-drop editor", "Custom themes and branding", "Connect your own domain", "Mobile-responsive automatically"],
    visual: "customize",
  },
  {
    id: "get-paid",
    label: "Get Paid",
    title: "Get paid instantly, no waiting",
    desc: "Payments go directly to your Stripe account. Accept cards, Apple Pay, Google Pay.",
    features: ["Powered by Stripe", "Cards, Apple Pay, Google Pay", "Transaction fees as low as 1.5%", "Instant payouts to your bank"],
    visual: "payments",
  },
]

function StoreVisual() {
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400" />
        <div>
          <h4 className="text-base font-bold">Creator Store</h4>
          <span className="text-xs text-neutral-400">storelib.com/creator</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { title: "UI Kit Pro", price: "$29", bg: "bg-gradient-to-br from-indigo-100 to-violet-100" },
          { title: "Photo Presets", price: "$19", bg: "bg-gradient-to-br from-amber-50 to-amber-200" },
          { title: "Course Bundle", price: "$79", bg: "bg-gradient-to-br from-green-50 to-green-200" },
        ].map((p) => (
          <div key={p.title} className="bg-white rounded-[10px] overflow-hidden border border-neutral-100">
            <div className={`h-20 ${p.bg}`} />
            <div className="px-2.5 py-2">
              <div className="text-[11px] font-semibold">{p.title}</div>
              <div className="text-[10px] text-neutral-400">{p.price}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MarketplaceVisual() {
  const items = [
    { title: "UI Kit Pro", by: "Satori Studio", rating: "4.9", price: "$29", bg: "bg-gradient-to-br from-indigo-100 to-violet-100" },
    { title: "Photo Presets Pack", by: "Maya Kim", rating: "4.8", price: "$35", bg: "bg-gradient-to-br from-amber-50 to-amber-200" },
    { title: "Beat Kit Vol. 3", by: "Andrew M.", rating: "5.0", price: "$49", bg: "bg-gradient-to-br from-green-50 to-green-200" },
  ]
  return (
    <div className="w-full">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-2xl">🏪</span>
        <span className="font-bold text-base">Discover Marketplace</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.title} className="flex items-center gap-3 p-3 bg-white border border-neutral-100 rounded-[10px]">
            <div className={`w-10 h-10 rounded-[10px] shrink-0 ${item.bg}`} />
            <div>
              <div className="text-xs font-semibold">{item.title}</div>
              <div className="text-[10px] text-neutral-400">by {item.by} · ★ {item.rating}</div>
            </div>
            <div className="ml-auto text-xs font-bold">{item.price}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AnalyticsVisual() {
  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex gap-3 w-full">
        <div className="flex-1 bg-white rounded-[10px] p-3.5 border border-neutral-100">
          <div className="text-[11px] text-neutral-400">Revenue</div>
          <div className="text-[22px] font-bold">$12,489</div>
          <div className="text-[11px] text-green-500">↑ 23%</div>
        </div>
        <div className="flex-1 bg-white rounded-[10px] p-3.5 border border-neutral-100">
          <div className="text-[11px] text-neutral-400">Conversion</div>
          <div className="text-[22px] font-bold">4.8%</div>
          <div className="text-[11px] text-green-500">↑ 0.6%</div>
        </div>
      </div>
      <div className="w-full h-20 bg-gradient-to-b from-violet-50 to-transparent rounded-[10px]" />
    </div>
  )
}

function CustomizeVisual() {
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex gap-3 items-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-400" />
        <div>
          <div className="font-bold text-sm">Your Brand Store</div>
          <div className="text-xs text-neutral-400">yourstore.com</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 w-full">
        <div className="h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-lg" />
        <div className="h-20 bg-gradient-to-br from-amber-50 to-amber-200 rounded-lg" />
        <div className="h-20 bg-gradient-to-br from-green-50 to-green-200 rounded-lg" />
      </div>
    </div>
  )
}

function PaymentsVisual() {
  return (
    <div className="w-full flex flex-col gap-2 text-center items-center">
      <div className="flex justify-center gap-2.5 flex-wrap mb-4">
        {["VISA", "Mastercard", "Apple Pay", "GPay"].map((p) => (
          <div key={p} className="px-5 py-2.5 bg-white border border-neutral-200 rounded-lg text-[13px] font-bold">{p}</div>
        ))}
      </div>
      <div className="text-[42px] font-bold tracking-tighter">$4,280.00</div>
      <div className="text-[13px] text-neutral-400">deposited to your bank this week</div>
    </div>
  )
}

const VISUALS: Record<string, () => JSX.Element> = {
  store: StoreVisual,
  marketplace: MarketplaceVisual,
  analytics: AnalyticsVisual,
  customize: CustomizeVisual,
  payments: PaymentsVisual,
}

export function PillTabs() {
  const [activeTab, setActiveTab] = useState("sell")
  const tab = TABS.find((t) => t.id === activeTab)!
  const Visual = VISUALS[tab.visual]

  return (
    <section className="py-20 sm:py-24 bg-white">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="blur-in">
          <div className="text-center mb-10">
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              One platform. Every tool you need.
            </h2>
            <p className="text-base text-neutral-500 max-w-[500px] mx-auto">
              Stop paying for five different subscriptions. Storelib handles it all.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up-scale" delay={100}>
          <div className="flex items-center justify-center gap-1.5 mb-12 bg-neutral-50 border border-neutral-200 rounded-full p-1.5 w-fit mx-auto flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-5 py-2.5 rounded-full text-[13px] font-semibold uppercase tracking-wide transition-all duration-300 ${
                  activeTab === t.id ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="slide-left" delay={200}>
          <div key={activeTab} className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center animate-in fade-in-0 slide-in-from-bottom-2 duration-400">
            <div>
              <h3 className="text-[26px] font-semibold tracking-tight mb-3.5">{tab.title}</h3>
              <p className="text-[15px] text-neutral-500 leading-relaxed mb-6">{tab.desc}</p>
              <div className="flex flex-col gap-3">
                {tab.features.map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-sm font-medium">
                    <span className="w-[22px] h-[22px] rounded-full bg-green-50 text-green-500 flex items-center justify-center text-xs shrink-0">✓</span>
                    {f}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-3xl p-8 min-h-[320px] flex items-center justify-center">
              <Visual />
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
