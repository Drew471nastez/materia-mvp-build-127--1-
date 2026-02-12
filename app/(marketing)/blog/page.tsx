"use client"

import Image from "next/image"
import Link from "next/link"
import { Calendar, Clock, ArrowRight, BookOpen, TrendingUp } from "lucide-react"

const BLOG_POSTS = [
  {
    id: 1,
    slug: "how-to-start-selling-digital-products-2026",
    title: "How to Start Selling Digital Products in 2026",
    excerpt:
      "Ready to turn your digital creations into a thriving business? Whether you're a designer, developer, educator, or content creator, selling digital products has never been more accessible. Learn how to launch your store in minutes.",
    category: "Getting Started",
    categoryIcon: BookOpen,
    date: "January 15, 2026",
    readTime: "5 min read",
    gradient: "from-violet-500 to-purple-500",
    featured: true,
    image: "/images/blog/digital-products-2026.svg",
  },
  {
    id: 2,
    slug: "why-low-transaction-fees-matter",
    title: "Why Low Transaction Fees Matter for Digital Creators",
    excerpt:
      "Every percentage point counts when you're building a sustainable creator business. We break down how transaction fees impact your bottom line and show real examples of how low fees help creators reinvest in their growth.",
    category: "Creator Tips",
    categoryIcon: TrendingUp,
    date: "February 3, 2026",
    readTime: "4 min read",
    gradient: "from-pink-500 to-rose-500",
    featured: false,
    image: "/images/blog/transaction-fees.svg",
  },
]

export default function BlogPage() {
  const featuredPost = BLOG_POSTS.find((p) => p.featured)
  const otherPosts = BLOG_POSTS.filter((p) => !p.featured)

  return (
    <div className="bg-neutral-50 min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-16 pb-12 overflow-hidden bg-white border-b border-neutral-100">
        <div className="absolute top-10 left-10 w-64 h-64 bg-violet-100/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-10 w-72 h-72 bg-pink-100/30 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
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

      {/* Featured Post */}
      {featuredPost && (
        <section className="py-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link href={`/blog/${featuredPost.slug}`} className="group block">
              <article className="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-xl hover:border-neutral-300 transition-all duration-300">
                <div className="grid md:grid-cols-2">
                  {/* Gradient image area */}
                  <div className={`h-60 sm:h-64 md:h-full min-h-[240px] sm:min-h-[280px] bg-gradient-to-br ${featuredPost.gradient} relative overflow-hidden`}>
                    {featuredPost.image && (
                      <Image src={featuredPost.image} alt={featuredPost.title} fill className="object-cover opacity-90 group-hover:scale-105 transition-transform duration-700" sizes="(max-width: 768px) 100vw, 50vw" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                    <div className="absolute top-4 left-4">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">
                        Featured
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 sm:p-6 md:p-8 flex flex-col justify-center animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
                    <div className="flex items-center gap-2 mb-4">
                      <featuredPost.categoryIcon className="w-4 h-4 text-violet-500" />
                      <span className="text-xs font-medium text-violet-600 uppercase tracking-wider">
                        {featuredPost.category}
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-3 group-hover:text-violet-600 transition-colors leading-tight">
                      {featuredPost.title}
                    </h2>

                    <p className="text-neutral-600 text-base leading-relaxed mb-6 line-clamp-3">
                      {featuredPost.excerpt}
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-neutral-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>{featuredPost.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          <span>{featuredPost.readTime}</span>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 group-hover:text-violet-700 transition-colors">
                        Read article
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          </div>
        </section>
      )}

      {/* More Posts */}
      <section className="pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-6">More Articles</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-6">
            {otherPosts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
                <article className="bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-xl hover:border-neutral-300 transition-all duration-300 h-full flex flex-col">
                  {/* Gradient area */}
                  <div className={`h-48 bg-gradient-to-br ${post.gradient} relative`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-white/20 text-7xl font-bold select-none">
                        {String(post.id).padStart(2, "0")}
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <post.categoryIcon className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-xs font-medium text-violet-600 uppercase tracking-wider">
                        {post.category}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-violet-600 transition-colors leading-snug">
                      {post.title}
                    </h3>

                    <p className="text-neutral-600 text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
                      {post.excerpt}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{post.date}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{post.readTime}</span>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 group-hover:text-violet-700">
                        Read
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter / CTA Section */}
      <section className="pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-800 p-8 sm:p-12 text-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/20 rounded-full blur-3xl" />

            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Ready to start your creator journey?
              </h2>
              <p className="text-lg text-white/70 mb-6 max-w-xl mx-auto">
                Join thousands of creators selling digital products on Storelib. No monthly fees, just a small transaction fee per sale.
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
