"use client"

import { useState, useRef, useEffect, useCallback } from "react"

const FAQ_CATEGORIES = [
  {
    title: "Getting Started",
    faqs: [
      {
        q: "What is Storelib?",
        a: "Storelib is an all-in-one e-commerce platform for creators & entrepreneurs. It allows you to sell digital products, build your link-in-bio page, set up an online store, create product pages, get featured on the marketplace for increased exposure to other buyers and creators & grow an audience and boost your brand, without having to worry about technical stuff or using 6 different tools.",
      },
      {
        q: "How do I create an account?",
        a: "Simply click \"Start Selling\" or \"Sign Up\" on our website. You can sign up with your email or Google account. The process takes less than a minute, and you can start setting up your store right away.",
      },
      {
        q: "Do I need any coding skills to set up my store?",
        a: "No coding skills needed at all. Storelib uses drag-and-drop builders that make it super easy to set up your store, product pages, and OnePage. It's designed to be beginner-friendly — just pick a layout, add your content, and you're live in minutes.",
      },
      {
        q: "How long does it take to launch my store?",
        a: "You can have your store up and running in minutes. Create an account, add your first product, customize your OnePage, and you're ready to start selling. No lengthy setup processes or technical configuration required.",
      },
    ],
  },
  {
    title: "Selling & Products",
    faqs: [
      {
        q: "What can I sell on Storelib?",
        a: "You can sell digital products (e-books, courses, templates, presets, music, software), offer services, showcase your portfolio, set up your link-in-bio, and more. If you create it, you can sell it on Storelib.",
      },
      {
        q: "How do I upload and list a product?",
        a: "Go to your Dashboard, click \"Create Product\", fill in the details like title, description, and price, upload your digital files, add a thumbnail, and publish. Your product will be live on your store and discoverable on the marketplace.",
      },
      {
        q: "Is there a limit on how many products I can sell?",
        a: "No, there's no limit on the number of products you can list. Sell as many digital products as you want across all categories.",
      },
      {
        q: "Can I offer free products?",
        a: "Yes! You can list products at $0 to offer freebies. This is a great way to build your audience, collect emails, and give potential customers a taste of your work.",
      },
      {
        q: "What if I already sell on another platform?",
        a: "Start selling on Storelib alongside your current platform. Upload products, set up your store, redirect links when ready. You can run both simultaneously until you're ready to fully switch.",
      },
    ],
  },
  {
    title: "Payments & Payouts",
    faqs: [
      {
        q: "How fast do I get paid?",
        a: "Payments go directly through Stripe to your bank account. Typically 2 business days. No waiting weeks.",
      },
      {
        q: "What payment methods do buyers have?",
        a: "Buyers can pay with credit/debit cards, Apple Pay, Google Pay, and other methods supported by Stripe. We support all major currencies and handle the conversion automatically.",
      },
      {
        q: "Does Storelib take a commission on my sales?",
        a: "Yes, a fee on each sale that depends on your plan: 5% + $0.25 on Free and 3% + $0.25 on Pro. The $0.25 is added to orders of $4.00 or more. Stripe's standard processing fees apply on top.",
      },
      {
        q: "How do I set up payouts?",
        a: "In your Dashboard, go to Settings and connect your Stripe account. Follow the simple onboarding flow to link your bank account. Once connected, payouts happen automatically after each sale.",
      },
    ],
  },
  {
    title: "Pricing & Plans",
    faqs: [
      {
        q: "Is Storelib free to use?",
        a: "Yes! Storelib has a free plan that lets you start selling right away. You can create products, set up your store, and start making sales without paying anything upfront. Upgrade when you need more features.",
      },
      {
        q: "What's included in Pro?",
        a: "Pro is $29 a month. It lowers the fee on each sale from 5% to 3%, lets you connect your own domain, removes Storelib branding, adds the verified badge, and gives you 25 GB of file storage instead of 1 GB. The Pricing page has the full list.",
      },
      {
        q: "Can I cancel my subscription anytime?",
        a: "Absolutely. There are no long-term contracts or cancellation fees. You can cancel, upgrade, or downgrade your plan at any time from your Dashboard settings.",
      },
      {
        q: "Is there a free trial for paid plans?",
        a: "There is no trial, because the Free plan has no time limit. Sell on Free for as long as you like, and upgrade to Pro when the lower fee or your own domain is worth $29 a month.",
      },
    ],
  },
  {
    title: "Customization & Branding",
    faqs: [
      {
        q: "Can I use my own domain?",
        a: "Yes, on the Pro plan ($29 a month). Your store lives at yourname.com.",
      },
      {
        q: "What's the difference between Storelib and a link-in-bio tool?",
        a: "Link-in-bio tools just list your links. Storelib is a complete e-commerce platform. Real product pages, checkout, analytics, email capture. OnePage combines link-in-bio with actual selling power.",
      },
      {
        q: "Can I customize the look of my store?",
        a: "Yes. You can customize colors, layouts, fonts, add your logo, banner images, and more using our drag-and-drop store builder. Make your store match your brand identity without touching any code.",
      },
      {
        q: "What is OnePage?",
        a: "OnePage is your all-in-one link-in-bio page powered by Storelib. It combines your links, products, and content into a single beautiful page. Perfect for sharing on social media, in your bio, or anywhere you want to drive traffic.",
      },
    ],
  },
  {
    title: "Marketplace & Discovery",
    faqs: [
      {
        q: "How does the Storelib marketplace work?",
        a: "When you publish a product on Storelib, it automatically appears on our marketplace where thousands of buyers can discover it. This gives you free organic traffic and exposure without spending on ads.",
      },
      {
        q: "How can I increase my product visibility?",
        a: "Optimize your product titles and descriptions with relevant keywords, add high-quality thumbnails, collect positive reviews, and stay active. Products with better engagement tend to rank higher in search results and recommendations.",
      },
      {
        q: "Can buyers leave reviews on my products?",
        a: "Yes. After purchasing, buyers can leave star ratings and written reviews on your products. Positive reviews boost your credibility and help other buyers make decisions.",
      },
    ],
  },
  {
    title: "Support & Account",
    faqs: [
      {
        q: "How do I contact support?",
        a: "You can reach our support team through the help section in your Dashboard, or by emailing us directly. We aim to respond to all inquiries within 24 hours.",
      },
      {
        q: "Can I have multiple stores?",
        a: "Currently, each account supports one store. However, you can sell unlimited products across all categories from your single store, and customize it to showcase different product lines.",
      },
      {
        q: "Is my data secure?",
        a: "Absolutely. We use industry-standard encryption, Stripe for secure payment processing, and follow best practices for data protection. Your data and your customers' data are always safe with Storelib.",
      },
    ],
  },
]

type FaqItemType = { q: string; a: string }

function FaqItem({ faq, isOpen, onToggle }: { faq: FaqItemType; isOpen: boolean; onToggle: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  const measure = useCallback(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight)
    }
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 text-left rounded-2xl transition-all duration-300 group cursor-pointer ${
          isOpen
            ? "bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-neutral-200/60"
            : "bg-gray-50 border border-neutral-200 hover:bg-gray-100 hover:shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:border-neutral-300"
        }`}
      >
        <span className={`text-[15px] sm:text-base font-medium pr-4 transition-colors duration-200 ${isOpen ? "text-neutral-900" : "text-neutral-900 group-hover:text-neutral-900"}`}>
          {faq.q}
        </span>
        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${isOpen ? "bg-violet-100 border-violet-200" : "border border-neutral-200 group-hover:border-violet-200 group-hover:bg-violet-50"}`}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform duration-300 ${isOpen ? "rotate-45 text-violet-600" : ""}`}
          >
            <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <div
        className="overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ maxHeight: isOpen ? `${height}px` : "0px", opacity: isOpen ? 1 : 0 }}
      >
        <div ref={contentRef}>
          <p className="px-5 sm:px-6 pt-4 pb-3 text-sm sm:text-[15px] text-neutral-500 leading-relaxed pr-10">
            {faq.a}
          </p>
        </div>
      </div>
    </div>
  )
}

export function FaqPageClient() {
  const [openItems, setOpenItems] = useState<Record<string, number | null>>({})

  const toggleItem = (categoryIndex: number, faqIndex: number) => {
    setOpenItems((prev) => ({
      ...prev,
      [categoryIndex]: prev[categoryIndex] === faqIndex ? null : faqIndex,
    }))
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section */}
      <section className="bg-gray-50 pt-20 pb-16 sm:pt-28 sm:pb-20">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h1 className="text-[clamp(36px,5vw,56px)] font-bold tracking-tight leading-[1.1] mb-4 text-neutral-900">
            Faq
          </h1>
          <p className="text-lg sm:text-xl text-neutral-500 max-w-[560px] mx-auto leading-relaxed">
            Everything you need to know about Storelib. Can't find what you're looking for? Reach out to our support team.
          </p>
        </div>
      </section>

      {/* FAQ Categories */}
      <section className="py-16 sm:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="space-y-16 sm:space-y-24">
            {FAQ_CATEGORIES.map((category, categoryIndex) => (
              <div key={category.title} className="flex flex-col md:flex-row md:gap-16 lg:gap-24">
                {/* Left — category title */}
                <div className="md:w-[280px] lg:w-[320px] shrink-0 mb-8 md:mb-0 md:sticky md:top-32 md:self-start">
                  <h2 className="text-[clamp(24px,3.5vw,32px)] font-bold tracking-tight leading-[1.15] mb-2">
                    {category.title}
                  </h2>
                  <div className="w-10 h-1 bg-violet-500 rounded-full" />
                </div>

                {/* Right — accordion */}
                <div className="flex-1 min-w-0">
                  {category.faqs.map((faq, faqIndex) => (
                    <FaqItem
                      key={faqIndex}
                      faq={faq}
                      isOpen={openItems[categoryIndex] === faqIndex}
                      onToggle={() => toggleItem(categoryIndex, faqIndex)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-20 sm:pb-28">
        <div className="max-w-[640px] mx-auto px-6 text-center">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Still have questions?
          </h3>
          <p className="text-base text-neutral-500 mb-8">
            Can't find the answer you're looking for? Our team is happy to help.
          </p>
          <a
            href="/signup"
            className="inline-flex items-center justify-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-base font-semibold rounded-lg h-[52px] px-10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/20"
          >
            Get started for free <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>
    </div>
  )
}
