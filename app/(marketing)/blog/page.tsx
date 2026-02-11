"use client"

import Link from "next/link"
import { Calendar, Clock, ArrowRight } from "lucide-react"

const BLOG_POSTS = [
  {
    id: 1,
    title: "How to Start Selling Digital Products in 2026",
    excerpt:
      "Ready to turn your digital creations into a thriving business? Whether you're a designer, developer, educator, or content creator, selling digital products has never been more accessible. In this guide, we'll walk you through the essential steps to launch your digital product business with Storelib—from choosing the right products to sell, to setting up your storefront, and reaching your first customers. Learn how to leverage our platform's powerful features to create a professional store in minutes, without any technical expertise.",
    category: "Getting Started",
    date: "January 15, 2026",
    readTime: "5 min read",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    id: 2,
    title: "Why Low Transaction Fees Matter for Digital Creators",
    excerpt:
      "Every percentage point counts when you're building a sustainable creator business. While many platforms charge 10-15% or more in transaction fees, Storelib keeps it simple with just a 5% fee—meaning you keep 95% of every sale. In this article, we break down how transaction fees impact your bottom line, compare platform costs across the industry, and show real examples of how our low fees help creators reinvest in their growth. Whether you're making your first sale or scaling to six figures, keeping more of your earnings means more resources to create, market, and expand your digital product empire.",
    category: "Creator Tips",
    date: "February 3, 2026",
    readTime: "4 min read",
    gradient: "from-pink-500 to-rose-500",
  },
]

export default function BlogPage() {
  return (
    <div className="bg-neutral-50 min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-16 pb-12 overflow-hidden bg-white border-b border-neutral-100">
        {/* Decorative elements */}
        <div className="absolute top-10 left-10 w-64 h-64 bg-violet-100/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-10 w-72 h-72 bg-pink-100/30 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-violet-100 text-violet-700 mb-6">
              Insights & Updates
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight mb-4">
              Storelib Blog
            </h1>

            <p className="text-lg sm:text-xl text-neutral-600 max-w-2xl mx-auto">
              Tips, guides, and insights to help you succeed as a digital product creator
            </p>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            {BLOG_POSTS.map((post) => (
              <article
                key={post.id}
                className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-xl hover:border-neutral-300 transition-all duration-300"
              >
                {/* Image placeholder with gradient */}
                <div className={`h-48 bg-gradient-to-br ${post.gradient}`} />

                {/* Content */}
                <div className="p-6">
                  {/* Category badge */}
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700 mb-3">
                    {post.category}
                  </span>

                  {/* Title */}
                  <h2 className="text-xl font-bold text-neutral-900 mb-3 group-hover:text-violet-600 transition-colors">
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  <p className="text-neutral-600 text-sm leading-relaxed mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>

                  {/* Meta info */}
                  <div className="flex items-center gap-4 text-sm text-neutral-500 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>

                  {/* Read more link */}
                  <Link
                    href="#"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    Read more
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-800 p-8 sm:p-12 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl" />

            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Ready to start your creator journey?
              </h2>
              <p className="text-lg text-white/70 mb-6 max-w-xl mx-auto">
                Join thousands of creators selling digital products on Storelib. No monthly fees, just 5% per transaction.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full text-base font-semibold bg-white text-neutral-900 hover:bg-neutral-100 transition-colors"
              >
                Start Selling Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
