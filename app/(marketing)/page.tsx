"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Check, Sparkles, Zap, Shield, BarChart3, Globe, CreditCard, Download, Star, Users, Play } from "lucide-react"
import { Hero } from "@/components/marketing/hero"

const STATS = [
  { value: "50K+", label: "Creators" },
  { value: "500K+", label: "Products Sold" },
  { value: "$10M+", label: "Creator Earnings" },
  { value: "4.9/5", label: "Rating" },
]

const FEATURES = [
  {
    icon: Sparkles,
    title: "Beautiful Storefronts",
    description: "Create stunning, customizable storefronts that reflect your brand.",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Accept payments globally with Stripe. Credit cards, Apple Pay, and more.",
  },
  {
    icon: Download,
    title: "Instant Delivery",
    description: "Automatic file delivery after purchase. Customers get instant access.",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track sales, views, and revenue in real-time.",
  },
  {
    icon: Shield,
    title: "File Protection",
    description: "Secure file hosting with download limits and link protection.",
  },
  {
    icon: Globe,
    title: "Global Reach",
    description: "Sell to customers worldwide with multi-currency support.",
  },
]

const TESTIMONIALS = [
  {
    quote: "Storelib changed how I think about selling online. I went from zero to $10k in my first month.",
    author: "Marcus Johnson",
    role: "Course Creator",
    revenue: "$127,450",
  },
  {
    quote: "The checkout conversion is insane. My sales went up 40% just from switching to Storelib.",
    author: "Sarah Chen",
    role: "Template Designer",
    revenue: "$89,200",
  },
  {
    quote: "Finally a platform that just works. No complicated setup, no hidden fees. Just results.",
    author: "Alex Rivera",
    role: "Developer",
    revenue: "$64,800",
  },
]

export default function StorelibLanding() {
  return (
    <div className="bg-white overflow-x-hidden">
      {/* HERO SECTION */}
      <Hero />

      {/* PRODUCT SHOWCASE - Cards only, no headline */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Feature cards grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Card 1 - Sell Anything */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-3xl p-8 relative overflow-hidden"
            >
              <div className="absolute top-8 right-8 w-48">
                <div className="bg-white rounded-2xl shadow-xl p-4 border border-neutral-100">
                  <div className="text-xs text-neutral-400 mb-1">My Product</div>
                  <div className="text-sm font-semibold text-neutral-900">Design System Kit</div>
                  <div className="flex gap-2 mt-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-200 to-purple-300"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-200 to-violet-300 flex items-center justify-center">
                      <Play className="w-3 h-3 text-purple-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-xl p-3 border border-neutral-100 mt-2 ml-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-900">Add to cart</span>
                    <span className="bg-violet-600 text-white text-xs px-2.5 py-1 rounded-lg font-semibold">$49</span>
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 mb-3">Sell anything</h3>
              <p className="text-neutral-600 max-w-[260px] leading-relaxed">
                Video courses. Monthly memberships. One-time downloads. Whatever you want to sell, Storelib handles it.
              </p>
            </motion.div>

            {/* Card 2 - Track Everything */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-neutral-900 rounded-3xl p-8 relative overflow-hidden"
            >
              <div className="absolute top-8 right-8 w-52">
                <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/20">
                  <div className="flex items-baseline gap-6 mb-3">
                    <div>
                      <div className="text-xl font-bold text-white">847</div>
                      <div className="text-xs text-white/60">Sales</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">$42,350</div>
                      <div className="text-xs text-white/60">Revenue</div>
                    </div>
                  </div>
                  <div className="h-10 flex items-end gap-[3px]">
                    {[35, 50, 40, 65, 55, 80, 60, 75, 70, 90, 65, 85].map((h, i) => (
                      <div key={i} className="flex-1 bg-gradient-to-t from-violet-500 to-purple-400 rounded-t" style={{ height: `${h}%` }}></div>
                    ))}
                  </div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Track everything</h3>
              <p className="text-white/70 max-w-[260px] leading-relaxed">
                See your sales, revenue, and growth in real time. Know exactly what's working.
              </p>
            </motion.div>

            {/* Card 3 - Sell to Anyone */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-3xl p-8 border border-neutral-200"
            >
              <h3 className="text-2xl font-bold text-neutral-900 mb-6">Sell to anyone</h3>
              <div className="space-y-4">
                {[
                  "Accept payments in any currency",
                  "One-time, subscriptions, or payment plans",
                  "Automatic tax calculation worldwide",
                  "Instant payouts to your bank"
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-neutral-600">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Card 4 - Sell Anywhere */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-gray-50 to-neutral-100 rounded-3xl p-8 relative overflow-hidden"
            >
              <div className="absolute top-8 right-8 flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white text-sm font-bold">S</div>
                  <div className="bg-white rounded-xl shadow-lg border border-neutral-100 px-3 py-2">
                    <div className="text-[10px] text-neutral-400">Your store</div>
                    <div className="text-xs font-semibold text-neutral-900">storelib.com/you</div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center text-white text-lg">#</div>
                  <div className="w-9 h-9 rounded-xl bg-purple-500 flex items-center justify-center text-white">&#10022;</div>
                  <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-white font-bold text-sm">W</div>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 mb-3">Sell anywhere</h3>
              <p className="text-neutral-600 max-w-[260px] leading-relaxed">
                Your own storefront, or embed products on your existing site. Connect to your favorite tools.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="py-24 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 mb-4">
              Everything you need
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              No extra tools. No complicated setup. Just powerful features that work.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-white rounded-2xl p-6 border border-neutral-200 hover:border-violet-200 hover:shadow-lg transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-violet-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feature.title}</h3>
                  <p className="text-neutral-600 text-sm leading-relaxed">{feature.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* STATS SECTION */}
      <section className="py-16 border-y border-neutral-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-2">{stat.value}</div>
                <div className="text-sm text-neutral-500">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS SECTION */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 mb-4">
              Creators are winning
            </h2>
            <p className="text-lg text-neutral-600">Real results from real people</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((testimonial, index) => (
              <motion.div
                key={testimonial.author}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-3xl p-6 border border-neutral-200"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-200 to-purple-300"></div>
                  <div>
                    <div className="font-semibold text-neutral-900">{testimonial.author}</div>
                    <div className="text-sm text-neutral-500">{testimonial.role}</div>
                  </div>
                </div>
                <div className="bg-violet-50 rounded-xl p-4 mb-4">
                  <div className="text-xs text-violet-600 font-medium mb-1">Total Revenue</div>
                  <div className="text-2xl font-bold text-neutral-900">{testimonial.revenue}</div>
                </div>
                <p className="text-neutral-600 text-sm leading-relaxed">"{testimonial.quote}"</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section className="py-24 bg-neutral-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 mb-4">
              Simple pricing
            </h2>
            <p className="text-lg text-neutral-600">Start free. Upgrade when you're ready.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-3xl p-8 border border-neutral-200"
            >
              <div className="text-sm font-medium text-neutral-600 mb-2">Free</div>
              <div className="text-5xl font-bold text-neutral-900 mb-1">$0</div>
              <div className="text-sm text-neutral-500 mb-8">forever</div>
              <div className="space-y-4 mb-8">
                {["3 products", "Storelib branding", "Basic analytics", "5% transaction fee"].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 text-neutral-600">
                    <Check className="w-5 h-5 text-violet-600" />
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/signup" className="block w-full py-3.5 text-center bg-neutral-100 text-neutral-900 rounded-xl font-semibold hover:bg-neutral-200 transition-colors">
                Get started
              </Link>
            </motion.div>

            {/* Pro Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-neutral-900 rounded-3xl p-8 relative"
            >
              <div className="absolute top-4 right-4 bg-violet-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Popular</div>
              <div className="text-sm font-medium text-white/60 mb-2">Pro</div>
              <div className="text-5xl font-bold text-white mb-1">$29</div>
              <div className="text-sm text-white/50 mb-8">per month</div>
              <div className="space-y-4 mb-8">
                {["Unlimited products", "Custom domain", "No branding", "Advanced analytics", "3% transaction fee", "Priority support"].map((f, i) => (
                  <div key={i} className="flex items-center gap-3 text-white/80">
                    <Check className="w-5 h-5 text-violet-400" />
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/signup" className="block w-full py-3.5 text-center bg-white text-neutral-900 rounded-xl font-semibold hover:bg-neutral-100 transition-colors">
                Start free trial
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-24 bg-neutral-900 relative overflow-hidden">
        {/* Decorative gradients */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              Ready to start selling?
            </h2>
            <p className="text-lg text-white/60 mb-10 max-w-xl mx-auto">
              Join thousands of creators who use Storelib to sell their digital products.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-neutral-900 rounded-full font-semibold hover:bg-neutral-100 transition-colors">
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/explore" className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/20 text-white rounded-full font-semibold hover:bg-white/5 transition-colors">
                Explore products
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/50">
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" />No credit card</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" />Free forever plan</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-violet-400" />Cancel anytime</span>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
