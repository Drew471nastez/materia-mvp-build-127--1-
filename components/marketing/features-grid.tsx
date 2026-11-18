"use client"

import { AnimateOnScroll } from "./animate-on-scroll"

function MockStoreBuilder() {
  return (
    <div className="bg-white rounded-[10px] shadow-sm border border-neutral-100 overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-neutral-100 bg-neutral-50/80">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
      </div>
      <div className="p-2.5">
        <div className="grid grid-cols-[60px_1fr] gap-2">
          <div className="flex flex-col gap-1.5">
            <div className="w-full h-2 bg-violet-50 rounded" />
            <div className="w-full h-2 bg-neutral-100 rounded" />
            <div className="w-full h-2 bg-neutral-100 rounded" />
            <div className="w-full h-2 bg-neutral-100 rounded" />
          </div>
          <div className="bg-neutral-50 rounded-md p-2 flex flex-col gap-1.5">
            <div className="h-[30px] bg-violet-50 border border-violet-400 rounded" />
            <div className="h-5 bg-white border border-dashed border-neutral-200 rounded" />
            <div className="h-4 bg-white border border-dashed border-neutral-200 rounded" />
            <div className="h-5 bg-white border border-dashed border-neutral-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MockAnalytics() {
  return (
    <div className="bg-white rounded-[10px] shadow-sm border border-neutral-100 overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-neutral-100 bg-neutral-50/80">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
      </div>
      <div className="p-2.5 flex flex-col gap-2">
        <div className="flex gap-1.5">
          <div className="flex-1 bg-neutral-50 rounded-md p-2">
            <div className="text-[8px] text-neutral-400">Total Sales</div>
            <div className="text-sm font-bold">$28,502</div>
            <div className="text-[8px] text-green-500">↑ 6.5%</div>
          </div>
          <div className="flex-1 bg-neutral-50 rounded-md p-2">
            <div className="text-[8px] text-neutral-400">Orders</div>
            <div className="text-sm font-bold">701</div>
            <div className="text-[8px] text-green-500">↑ 100%</div>
          </div>
        </div>
        <div className="h-[50px] bg-gradient-to-b from-violet-50 to-transparent rounded-md relative">
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
        </div>
      </div>
    </div>
  )
}

function MockCheckout() {
  return (
    <div className="bg-white rounded-[10px] shadow-sm border border-neutral-100 overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-neutral-100 bg-neutral-50/80">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
      </div>
      <div className="p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {["VISA", "aPay", "GPay", "JCB"].map((p) => (
            <div key={p} className="h-5 px-2 bg-neutral-50 rounded text-[9px] font-bold flex items-center text-neutral-400">{p}</div>
          ))}
        </div>
        <div className="w-full h-6 bg-neutral-50 rounded border border-neutral-100" />
        <div className="w-full h-6 bg-neutral-50 rounded border border-neutral-100" />
        <div className="flex gap-1.5">
          <div className="flex-1 h-6 bg-neutral-50 rounded border border-neutral-100" />
          <div className="flex-1 h-6 bg-neutral-50 rounded border border-neutral-100" />
        </div>
        <div className="w-full h-7 bg-violet-600 rounded-md" />
      </div>
    </div>
  )
}

function MockEmailCapture() {
  return (
    <div className="bg-white rounded-[10px] shadow-sm border border-neutral-100 overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-neutral-100 bg-neutral-50/80">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
      </div>
      <div className="p-2.5 flex flex-col gap-2 items-center">
        <div className="text-2xl">📧</div>
        <div className="text-[10px] font-bold text-center">Get the free guide</div>
        <div className="flex gap-1 w-full">
          <div className="flex-1 h-6 bg-neutral-50 rounded border border-neutral-100" />
          <div className="h-6 px-2.5 bg-neutral-900 rounded text-[8px] text-white font-semibold flex items-center">Subscribe</div>
        </div>
        <div className="w-full h-1.5 bg-neutral-100 rounded-full">
          <div className="w-[72%] h-full bg-violet-600 rounded-full" />
        </div>
        <div className="text-[8px] text-neutral-400 self-start">1,847 subscribers</div>
      </div>
    </div>
  )
}

function MockOnePage() {
  return (
    <div className="bg-white rounded-[10px] shadow-sm border border-neutral-100 overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-neutral-100 bg-neutral-50/80">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
      </div>
      <div className="p-2.5 flex flex-col items-center gap-1.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-400" />
        <div className="text-[10px] font-bold">@sarahdesigns</div>
        <div className="w-full flex flex-col gap-1">
          <div className="w-full h-[22px] bg-neutral-50 rounded-md flex items-center px-2 text-[8px] font-medium gap-1">
            <div className="w-3.5 h-3.5 rounded bg-violet-50 shrink-0" /> UI Masterclass — $49
          </div>
          <div className="w-full h-[22px] bg-neutral-50 rounded-md flex items-center px-2 text-[8px] font-medium gap-1">
            <div className="w-3.5 h-3.5 rounded bg-green-50 shrink-0" /> Free Checklist
          </div>
          <div className="w-full h-[22px] bg-neutral-900 text-white rounded-md flex items-center justify-center text-[8px] font-bold">
            Visit Store
          </div>
        </div>
      </div>
    </div>
  )
}

function MockDomain() {
  return (
    <div className="bg-white rounded-[10px] shadow-sm border border-neutral-100 overflow-hidden w-full max-w-[260px]">
      <div className="flex items-center gap-1 px-2.5 py-2 border-b border-neutral-100 bg-neutral-50/80">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-200" />
      </div>
      <div className="p-2.5 flex flex-col gap-2">
        <div className="bg-neutral-50 rounded-md px-2.5 py-2 text-[11px] font-semibold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> yourstore.com
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-green-500 font-semibold">
          <span className="w-2 h-2 rounded-full bg-green-500" /> SSL active · Domain connected
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 h-6 bg-neutral-50 rounded border border-neutral-100" />
          <div className="h-6 px-3 bg-neutral-900 rounded text-[9px] text-white font-semibold flex items-center">Save</div>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: "🏪", title: "Store Builder", desc: "Drag-and-drop editor with beautiful themes. Your brand, your design. No code needed.", mock: MockStoreBuilder },
  { icon: "📊", title: "Drive More Sales", desc: "Track visits, conversions, and revenue. Know exactly what's working and double down.", mock: MockAnalytics },
  { icon: "💳", title: "Trust Badges", desc: "Display payment icons and trust badges at checkout. Boost buyer confidence.", mock: MockCheckout },
  { icon: "📧", title: "Email Capture", desc: "Build your list with lead magnets. Deliver products automatically via email.", mock: MockEmailCapture },
  { icon: "🔗", title: "OnePage Link-in-Bio", desc: "A link-in-bio that actually sells. Products, links, and email capture — all in one link.", mock: MockOnePage },
  { icon: "🌐", title: "Custom Domain", desc: "Connect your own domain. Build a real brand at yourname.com.", mock: MockDomain },
]

export function FeaturesGrid() {
  return (
    <section className="py-20 sm:py-24 bg-neutral-50/80" id="features">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="blur-in">
          <div className="text-center max-w-[640px] mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 px-4 py-1.5 rounded-full mb-4">
              ✦ Features
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-semibold leading-[1.15] tracking-tight mb-3.5">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="text-base text-neutral-500 leading-relaxed">
              Built specifically for creators who sell digital products. Every feature built to convert.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll variant="fade-up-scale" delay={120}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Mock = f.mock
              return (
                <div
                  key={f.title}
                  className="bg-white border border-neutral-100 rounded-2xl overflow-hidden transition-all duration-300 hover:border-violet-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="h-[180px] bg-stone-100 flex items-center justify-center p-4">
                    <Mock />
                  </div>
                  <div className="px-6 py-5">
                    <div className="flex items-center gap-2 text-base font-semibold mb-1.5">
                      <span className="text-lg">{f.icon}</span> {f.title}
                    </div>
                    <p className="text-[13px] text-neutral-500 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
