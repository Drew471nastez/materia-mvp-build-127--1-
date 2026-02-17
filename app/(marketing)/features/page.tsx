"use client"

import Link from "next/link"
import {
  Sparkles,
  CreditCard,
  Download,
  BarChart3,
  Palette,
  Bot,
  ArrowRight,
} from "lucide-react"

const FEATURES = [
  {
    icon: Sparkles,
    title: "Beautiful Storefronts",
    description: "Create stunning, customizable storefronts that reflect your brand. No coding required.",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Accept payments globally with Stripe integration. Support for credit cards, Apple Pay, and more.",
  },
  {
    icon: Download,
    title: "Instant Delivery",
    description: "Automatic file delivery after purchase. Customers get instant access to their digital products.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track sales, views, and revenue in real-time. Make data-driven decisions to grow your business.",
  },
  {
    icon: Palette,
    title: "Custom Branding",
    description: "Add your logo, colors, and custom domain. Create a professional brand experience.",
  },
  {
    icon: Bot,
    title: "AI-Powered Tools",
    description: "Generate product descriptions, optimize pricing, and get smart recommendations.",
  },
]

export default function FeaturesPage() {
  return (
    <div className="bg-white">
      {/* Section 1 - Hero + Feature Grid */}
      <section className="py-20 bg-[#f9fafb]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Content */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight mb-6">
              Powerful Features for Modern Creators
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600">
              Everything you need to sell digital products online. From beautiful storefronts to
              secure payments and instant delivery, we've got you covered.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="group p-6 rounded-2xl bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-lg transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-neutral-600 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Section 2 - CTA Section */}
      <section className="py-20 bg-neutral-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to start selling?
          </h2>
          <p className="text-lg sm:text-xl text-neutral-300 mb-8 max-w-2xl mx-auto">
            Join thousands of creators and start selling your digital products today.
            It's completely free to get started.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-semibold bg-white text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              Start Selling Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-semibold text-white border border-white/20 hover:bg-white/10 transition-colors"
            >
              Explore Products
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
