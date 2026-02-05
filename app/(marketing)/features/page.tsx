"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Zap,
  Shield,
  CreditCard,
  Globe,
  Palette,
  BarChart3,
  Users,
  Download,
  MessageSquare,
  Lock,
  Smartphone,
  Star,
  Check,
  Sparkles,
  Bot,
  FileText,
  Share2,
} from "lucide-react"

const FEATURES = [
  {
    icon: Sparkles,
    title: "Beautiful Storefronts",
    description: "Create stunning, customizable storefronts that reflect your brand. No coding required.",
    color: "from-pink-500 to-violet-500",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Accept payments globally with Stripe integration. Support for credit cards, Apple Pay, and more.",
    color: "from-blue-500 to-cyan-500",
  },
  {
    icon: Download,
    title: "Instant Delivery",
    description: "Automatic file delivery after purchase. Customers get instant access to their digital products.",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track sales, views, and revenue in real-time. Make data-driven decisions to grow your business.",
    color: "from-orange-500 to-red-500",
  },
  {
    icon: Shield,
    title: "File Protection",
    description: "Secure file hosting with download limits and link protection. Keep your products safe.",
    color: "from-violet-500 to-purple-500",
  },
  {
    icon: Globe,
    title: "Global Reach",
    description: "Sell to customers worldwide with multi-currency support and localized checkout experiences.",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: Palette,
    title: "Custom Branding",
    description: "Add your logo, colors, and custom domain. Create a professional brand experience.",
    color: "from-pink-500 to-rose-500",
  },
  {
    icon: MessageSquare,
    title: "Customer Reviews",
    description: "Build trust with verified customer reviews and ratings on your products.",
    color: "from-sky-500 to-blue-500",
  },
  {
    icon: Bot,
    title: "AI-Powered Tools",
    description: "Generate product descriptions, optimize pricing, and get smart recommendations.",
    color: "from-indigo-500 to-violet-500",
  },
]

const PRODUCT_TYPES = [
  { icon: FileText, label: "Templates", description: "Notion, Figma, Canva, and more" },
  { icon: Sparkles, label: "Design Assets", description: "Graphics, fonts, icons, mockups" },
  { icon: Bot, label: "AI Products", description: "Prompts, automation tools, GPT templates" },
  { icon: Share2, label: "Social Media", description: "Content packs, templates, guides" },
  { icon: Download, label: "Digital Downloads", description: "eBooks, courses, printables" },
  { icon: Zap, label: "Software & Tools", description: "Scripts, plugins, web apps" },
]

const STATS = [
  { value: "10K+", label: "Creators" },
  { value: "100K+", label: "Products Sold" },
  { value: "$2M+", label: "Creator Earnings" },
  { value: "4.9/5", label: "Average Rating" },
]

export default function FeaturesPage() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="relative pt-16 pb-20 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-violet-50 to-white" />

        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-violet-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-pink-200/20 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-violet-100 text-violet-700 mb-6">
              <Sparkles className="w-4 h-4" />
              Everything you need to sell digital products
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight mb-6">
              Powerful features for{" "}
              <span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
                modern creators
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-neutral-600 mb-8 max-w-2xl mx-auto">
              Storelib gives you all the tools you need to create, sell, and grow your digital product business.
              No technical skills required.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
              >
                Start Selling Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                Explore Products
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-neutral-100 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-1">{stat.value}</div>
                <div className="text-sm text-neutral-500">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Features Grid */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
              Everything you need to succeed
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              From creating your store to getting paid, we've got you covered with powerful features.
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
                  className="group relative p-6 rounded-2xl bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-lg transition-all duration-300"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${feature.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feature.title}</h3>
                  <p className="text-neutral-600 text-sm leading-relaxed">{feature.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Product Types Section */}
      <section className="py-20 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
              Sell any type of digital product
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              From templates to courses, Storelib supports all types of digital products.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
            {PRODUCT_TYPES.map((type, index) => {
              const Icon = type.icon
              return (
                <motion.div
                  key={type.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex items-start gap-4 p-5 rounded-xl bg-white border border-neutral-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-neutral-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 mb-1">{type.label}</h3>
                    <p className="text-sm text-neutral-500">{type.description}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing Highlight */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-neutral-900 to-neutral-800 p-8 sm:p-12 lg:p-16"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl" />

            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-white/10 text-white/80 mb-6">
                <Star className="w-4 h-4" />
                Simple, transparent pricing
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Free to start, scale as you grow
              </h2>

              <p className="text-lg text-white/70 mb-8">
                No monthly fees. Just a small transaction fee on each sale. Keep most of your earnings.
              </p>

              <div className="flex flex-wrap gap-6 mb-8">
                <div className="flex items-center gap-2 text-white/80">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <span>No monthly fees</span>
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <span>5% transaction fee</span>
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <span>Unlimited products</span>
                </div>
              </div>

              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-semibold bg-white text-neutral-900 hover:bg-neutral-100 transition-colors"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
              Trusted by creators worldwide
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Join thousands of creators who trust Storelib to power their digital product businesses.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: "Secure & Reliable",
                description: "Bank-level security with 99.9% uptime. Your products and payments are always safe.",
              },
              {
                icon: Smartphone,
                title: "Mobile Optimized",
                description: "Beautiful checkout experience on any device. Your customers can buy from anywhere.",
              },
              {
                icon: Lock,
                title: "Privacy First",
                description: "GDPR and CPRA compliant. We respect your data and your customers' privacy.",
              },
            ].map((item, index) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-neutral-700" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{item.title}</h3>
                  <p className="text-neutral-600">{item.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
              Ready to start selling?
            </h2>
            <p className="text-lg text-neutral-600 mb-8 max-w-xl mx-auto">
              Create your free account and start selling digital products in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
              >
                Create Your Store
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-semibold text-neutral-700 hover:bg-white transition-colors"
              >
                Explore Products
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
