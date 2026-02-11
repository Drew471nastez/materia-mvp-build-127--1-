"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Calendar, Clock, ArrowLeft, ArrowRight } from "lucide-react"

const BLOG_POSTS: Record<string, {
  title: string
  excerpt: string
  category: string
  date: string
  readTime: string
  gradient: string
  content: string[]
  image: string
}> = {
  "how-to-start-selling-digital-products-2026": {
    title: "How to Start Selling Digital Products in 2026",
    excerpt:
      "Ready to turn your digital creations into a thriving business? Whether you're a designer, developer, educator, or content creator, selling digital products has never been more accessible.",
    category: "Getting Started",
    date: "January 15, 2026",
    readTime: "5 min read",
    gradient: "from-violet-500 to-purple-500",
    image: "/images/blog/digital-products-2026.svg",
    content: [
      "The digital product economy is booming. In 2026, more creators than ever are turning their skills into passive income streams by selling digital products online. Whether you create templates, courses, ebooks, presets, software tools, or design assets — there's never been a better time to get started.",
      "## Why Digital Products?",
      "Unlike physical goods, digital products have near-zero marginal cost. Once you create a product, you can sell it an unlimited number of times without worrying about inventory, shipping, or manufacturing. This means higher profit margins and a business that can scale without proportional increases in effort.",
      "Digital products also give you the freedom to work on your own schedule. You can create once and earn repeatedly, building a library of products that generates revenue 24/7.",
      "## Choosing the Right Product to Sell",
      "The best digital product is one that solves a specific problem for a specific audience. Here are some popular categories that perform well on Storelib:",
      "**Templates & Themes** — Notion templates, website themes, social media templates, and resume designs are consistently among the top sellers. People love saving time with ready-made solutions.",
      "**Educational Content** — Online courses, tutorials, ebooks, and guides are in high demand. If you have expertise in any area, you can package your knowledge into a sellable product.",
      "**Creative Assets** — Fonts, icons, illustrations, stock photos, Lightroom presets, and LUTs are perfect for fellow creatives who want to enhance their work.",
      "**Software & Tools** — Chrome extensions, scripts, plugins, and SaaS micro-tools can command premium prices when they solve real problems.",
      "## Setting Up Your Store on Storelib",
      "Getting started on Storelib takes just a few minutes. Here's how:",
      "**1. Create your account** — Sign up for free and complete the quick onboarding process. You'll set up your store name, upload a logo, and customize your storefront.",
      "**2. Add your first product** — Upload your digital files, write a compelling description, set your price, and add preview images. Storelib supports virtually any file format.",
      "**3. Customize your OnePage** — Your OnePage is your public-facing storefront. It's a beautiful, mobile-optimized page where customers can browse and purchase your products. Add your bio, social links, and brand colors.",
      "**4. Share and promote** — Share your store link on social media, embed it in your website, or use your custom subdomain (yourname.storelib.com) to start driving traffic.",
      "## Tips for Your First Sale",
      "Getting your first sale is a milestone worth celebrating. Here are some strategies to make it happen faster:",
      "**Start with your existing audience.** If you have followers on social media, an email list, or a blog — let them know about your new products. Your existing audience already trusts you.",
      "**Price strategically.** For your first product, consider a lower entry price to reduce friction. You can always raise prices as you build social proof with reviews and sales numbers.",
      "**Create a compelling product page.** High-quality preview images, a clear description of what's included, and a strong value proposition make a huge difference in conversion rates.",
      "**Leverage Storelib's built-in features.** Use the email marketing tools to reach customers, set up your OnePage for maximum impact, and take advantage of the discovery marketplace to get found by new customers.",
      "## Ready to Get Started?",
      "The best time to start selling digital products was yesterday. The second best time is today. With Storelib's free plan, you can launch your store with zero upfront costs and only pay a small transaction fee when you make a sale. There's literally no risk in trying.",
    ],
  },
  "why-low-transaction-fees-matter": {
    title: "Why Low Transaction Fees Matter for Digital Creators",
    excerpt:
      "Every percentage point counts when you're building a sustainable creator business. Learn how transaction fees impact your bottom line and how Storelib helps you keep more of your earnings.",
    category: "Creator Tips",
    date: "February 3, 2026",
    readTime: "4 min read",
    gradient: "from-pink-500 to-rose-500",
    image: "/images/blog/transaction-fees.svg",
    content: [
      "When you're evaluating platforms to sell your digital products, one number matters more than almost anything else: the transaction fee. It might seem like a small detail, but over time, those percentages add up to a massive difference in your earnings.",
      "## The Math Behind Transaction Fees",
      "Let's say you sell a digital product for $50. Here's what you'd keep on different platforms:",
      "**Platform charging 15%:** You keep $42.50 per sale\n**Platform charging 10%:** You keep $45.00 per sale\n**Storelib (6% on Free, 3% on Growth):** You keep $47.00–$48.50 per sale",
      "Now multiply that by hundreds or thousands of sales. On a modest 500 sales per year at $50 each ($25,000 in revenue):",
      "**At 15% fees:** You lose $3,750 — keeping $21,250\n**At 10% fees:** You lose $2,500 — keeping $22,500\n**At Storelib's 3% (Growth):** You lose just $750 — keeping $24,250",
      "That's a difference of **$3,000 per year** compared to the highest-fee platform. Money that stays in your pocket to reinvest in your business, create more products, or simply enjoy the fruits of your labor.",
      "## Why Most Platforms Charge So Much",
      "Many platforms justify high fees by bundling in features you may not need, charging for built-in audiences, or simply because creators don't comparison-shop. Some marketplaces charge 30-50% because they drive traffic to your products — but that traffic comes at a steep price.",
      "Storelib takes a different approach. We believe creators should keep the vast majority of their earnings. Our platform is designed to be lean and efficient, passing those savings directly to you.",
      "## The Storelib Fee Structure",
      "We keep things simple and transparent:",
      "**Free Plan:** 6% + $0.25 per transaction — no monthly fees, no hidden costs. Perfect for getting started.\n**Growth Plan ($19/mo):** 3% + $0.25 per transaction — plus custom domains, verified badge, and premium features.\n**Pro Plan ($49/mo):** 1.5% + $0.25 per transaction — the lowest fees plus priority support and maximum email sends.",
      "There are no listing fees, no annual contracts, and no surprise charges. What you see is what you get.",
      "## When Does Upgrading Make Sense?",
      "A common question is whether the monthly subscription pays for itself. The math is straightforward:",
      "**Growth Plan break-even:** If your monthly revenue exceeds ~$633, the 3% savings over the Free plan more than covers the $19/mo subscription. That's about 13 sales of a $50 product per month.",
      "**Pro Plan break-even:** If your monthly revenue exceeds ~$1,000, upgrading from Growth to Pro saves you more than the additional $30/mo. That's about 20 sales of a $50 product.",
      "For most active sellers, the Growth plan pays for itself within the first month.",
      "## Beyond Fees: What Else Matters",
      "While fees are crucial, they're not the only factor. Here's what else to consider when choosing a platform:",
      "**Ease of use** — Can you set up your store quickly? Storelib gets you selling in minutes, not days.",
      "**Customization** — Does the platform let you brand your storefront? With Storelib, you get a customizable OnePage, custom domains, and your own subdomain.",
      "**Payment processing** — Storelib integrates with Stripe for fast, reliable payouts in 40+ countries.",
      "**Discovery** — Our marketplace helps new customers find your products, giving you additional exposure beyond your own marketing efforts.",
      "## The Bottom Line",
      "Every dollar you save on fees is a dollar you can reinvest in your business. Over the lifetime of your creator career, choosing a low-fee platform like Storelib can mean tens of thousands of dollars in additional earnings. Don't leave money on the table — your work is worth keeping.",
    ],
  },
}

const POST_SLUGS = Object.keys(BLOG_POSTS)

export default function BlogPostPage() {
  const params = useParams()
  const slug = params.slug as string
  const post = BLOG_POSTS[slug]

  if (!post) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Post not found</h1>
          <p className="text-neutral-600 mb-6">The blog post you're looking for doesn't exist.</p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>
      </div>
    )
  }

  // Find next/prev post
  const currentIndex = POST_SLUGS.indexOf(slug)
  const prevSlug = currentIndex > 0 ? POST_SLUGS[currentIndex - 1] : null
  const nextSlug = currentIndex < POST_SLUGS.length - 1 ? POST_SLUGS[currentIndex + 1] : null

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className={`relative h-44 sm:h-64 md:h-72 bg-gradient-to-br ${post.gradient} overflow-hidden`}>
        <Image src={post.image} alt={post.title} fill className="object-cover opacity-90" sizes="100vw" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
        {/* Back link */}
        <div className="mb-5">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>

        {/* Category badge */}
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700 mb-4">
          {post.category}
        </span>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 tracking-tight mb-4 leading-tight">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-neutral-500 mb-8 pb-8 border-b border-neutral-200">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <span>{post.date}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>{post.readTime}</span>
          </div>
        </div>

        {/* Content */}
        <article className="pb-16">
          <div className="prose prose-lg prose-neutral max-w-none">
            {post.content.map((block, i) => {
              if (block.startsWith("## ")) {
                return (
                  <h2 key={i} className="text-2xl font-bold text-neutral-900 mt-10 mb-4">
                    {block.replace("## ", "")}
                  </h2>
                )
              }
              // Handle bold text and line breaks
              const parts = block.split(/(\*\*[^*]+\*\*)/g)
              const hasLineBreaks = block.includes("\n")

              if (hasLineBreaks) {
                const lines = block.split("\n")
                return (
                  <div key={i} className="my-4 space-y-2">
                    {lines.map((line, j) => {
                      const lineParts = line.split(/(\*\*[^*]+\*\*)/g)
                      return (
                        <p key={j} className="text-neutral-700 leading-relaxed">
                          {lineParts.map((part, k) =>
                            part.startsWith("**") && part.endsWith("**") ? (
                              <strong key={k} className="font-semibold text-neutral-900">
                                {part.slice(2, -2)}
                              </strong>
                            ) : (
                              <span key={k}>{part}</span>
                            )
                          )}
                        </p>
                      )
                    })}
                  </div>
                )
              }

              return (
                <p key={i} className="text-neutral-700 leading-relaxed my-4">
                  {parts.map((part, j) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={j} className="font-semibold text-neutral-900">
                        {part.slice(2, -2)}
                      </strong>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              )
            })}
          </div>

          {/* CTA */}
          <div className="mt-12 p-6 sm:p-8 bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl border border-violet-100">
            <h3 className="text-lg sm:text-xl font-bold text-neutral-900 mb-2">Ready to start selling?</h3>
            <p className="text-sm sm:text-base text-neutral-600 mb-5">
              Create your free Storelib store and start earning from your digital products today.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Prev/Next navigation */}
          <div className="mt-12 pt-8 border-t border-neutral-200 grid grid-cols-2 gap-3 sm:gap-4">
            {prevSlug ? (
              <Link
                href={`/blog/${prevSlug}`}
                className="group flex flex-col p-4 rounded-xl border border-neutral-200 hover:border-violet-200 hover:bg-violet-50/50 transition-colors"
              >
                <span className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" />
                  Previous
                </span>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-violet-700 transition-colors line-clamp-2">
                  {BLOG_POSTS[prevSlug].title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {nextSlug ? (
              <Link
                href={`/blog/${nextSlug}`}
                className="group flex flex-col items-end text-right p-4 rounded-xl border border-neutral-200 hover:border-violet-200 hover:bg-violet-50/50 transition-colors"
              >
                <span className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                  Next
                  <ArrowRight className="w-3 h-3" />
                </span>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-violet-700 transition-colors line-clamp-2">
                  {BLOG_POSTS[nextSlug].title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </article>
      </div>
    </div>
  )
}
