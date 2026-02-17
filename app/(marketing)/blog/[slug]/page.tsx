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
    gradient: "from-neutral-800 to-neutral-900",
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
    gradient: "from-neutral-700 to-neutral-800",
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
  "building-an-audience-before-you-launch": {
    title: "Building an Audience Before You Launch",
    excerpt:
      "The biggest mistake digital product creators make is building in silence. Learn how to cultivate a ready-to-buy audience before your product even exists.",
    category: "Growth",
    date: "February 10, 2026",
    readTime: "6 min read",
    gradient: "from-neutral-800 to-neutral-700",
    image: "/images/blog/digital-products-2026.svg",
    content: [
      "Most creators spend months perfecting their digital product, then launch it to crickets. No traffic, no sales, no momentum. The problem is not the product — it is the approach. If you wait until launch day to start marketing, you have already lost your biggest advantage: time. Building an audience before you launch is not optional. It is the single highest-leverage activity you can invest in as a digital product creator.",
      "## Start Before You Are Ready",
      "You do not need a finished product to start building an audience. In fact, the earlier you start, the better. Begin sharing your journey the moment you decide to create something. Talk about the problem you are solving, the research you are doing, and the decisions you are making along the way. People are drawn to transparency and progress. A simple post like \"I am building a Notion template pack for freelancers — here is what I have learned so far\" can attract exactly the people who will eventually buy from you. Do not wait for perfection. Momentum beats polish every time.",
      "## Build an Email List From Day One",
      "Social media followers are rented. An email list is owned. Start collecting email addresses as early as possible, even if you only have a landing page with a description of what you are building. Offer something small in exchange for an email — a free resource, a checklist, a mini version of your product, or simply early access. Tools like Storelib make it easy to set up email collection and send updates to your subscribers. By the time you launch, you will have a list of people who already care about what you are building and are waiting to hear from you.",
      "## Use Social Media to Tease and Build Anticipation",
      "Social media is your free megaphone, but only if you use it consistently. Pick one or two platforms where your target audience hangs out and start posting regularly. Share behind-the-scenes content: screenshots of your work in progress, design iterations, problems you solved, and milestones you hit. Create countdown posts as your launch date approaches. Ask questions to involve your audience in decisions — \"Should I include X or Y in the template pack?\" This kind of engagement makes people feel invested in your product before it even exists. When launch day arrives, they are not just aware of your product — they feel like they helped build it.",
      "## Recruit Beta Users Early",
      "Beta users are your secret weapon. Before you launch publicly, get your product into the hands of 10 to 20 real users. Offer free or heavily discounted access in exchange for honest feedback and a testimonial. Beta users serve three critical purposes: they help you catch bugs and usability issues you missed, they provide social proof in the form of reviews and quotes you can use on your product page, and they become your first advocates who will spread the word organically. Reach out to people in your network, in relevant online communities, or among your early email subscribers. The feedback you get will make your product significantly better, and the testimonials will make your launch page significantly more convincing.",
      "## Leverage Content Marketing",
      "Content marketing is the long game, but it pays off enormously. Start a blog, a YouTube channel, a newsletter, or a Twitter thread series around the topic your product addresses. If you are selling a course on email marketing, write blog posts about email marketing best practices. If you are selling design templates, share design tips and tutorials. This positions you as an expert in your space and builds trust with your audience long before you ask them to buy anything. Every piece of content you publish is a potential entry point for a future customer. Over time, your content library becomes a compounding asset that drives traffic and sales on autopilot.",
      "## Engage in Communities Where Your Customers Hang Out",
      "Do not just broadcast — participate. Join Reddit communities, Discord servers, Facebook groups, and forums where your target audience is active. Answer questions, share insights, and be genuinely helpful without constantly promoting your product. When people see you consistently providing value, they naturally become curious about what you are building. Community engagement also gives you invaluable market research. You will learn the exact language your customers use to describe their problems, which you can then mirror in your product descriptions and marketing copy. This is not something you can get from guessing — it comes from listening.",
      "## Create a Launch Runway",
      "A launch is not a single day — it is a sequence. Plan a two to four week runway leading up to your launch date. Week one: announce what you are building and why. Week two: share previews and behind-the-scenes content. Week three: open early access or a waitlist. Launch day: go live with a limited-time offer or bonus for early buyers. This runway builds anticipation and ensures that when you finally hit publish, there is already a crowd waiting. Each touchpoint in the sequence warms up your audience a little more, so by launch day, the sale feels like a natural next step rather than a cold pitch.",
      "## Collaborate With Other Creators",
      "You do not have to build your audience alone. Find creators in adjacent niches and collaborate. This could be a joint webinar, a guest post swap, a co-created free resource, or simply shouting each other out on social media. Collaboration exposes you to an entirely new audience that already trusts the person recommending you. Look for creators whose audience overlaps with yours but who are not direct competitors. A designer selling icon packs could collaborate with a developer selling website templates — their audiences overlap without competing. These partnerships can accelerate your audience growth faster than almost any solo effort.",
      "## Consistency Beats Intensity",
      "The biggest trap in pre-launch audience building is going hard for a week and then disappearing for a month. Consistency matters far more than intensity. Commit to a sustainable pace — three posts per week, one newsletter per week, one community interaction per day — and stick to it. Your audience grows through repeated exposure. People need to see you multiple times before they remember you, trust you, and ultimately buy from you. Set a schedule, batch your content when possible, and treat audience building as a non-negotiable part of your product development process, not something you will get to later.",
    ],
  },
  "pricing-strategies-for-digital-products": {
    title: "Pricing Strategies That Actually Work for Digital Products",
    excerpt:
      "Pricing is one of the hardest decisions a creator faces. Too high and you scare people off. Too low and you leave money on the table. Here is how to find the sweet spot.",
    category: "Strategy",
    date: "February 14, 2026",
    readTime: "7 min read",
    gradient: "from-neutral-700 to-neutral-900",
    image: "/images/blog/transaction-fees.svg",
    content: [
      "Pricing is where most digital product creators get stuck. You have spent weeks or months building something valuable, and now you have to put a number on it. Price too low and you undervalue your work, attract the wrong customers, and burn out trying to make volume work. Price too high without justification and potential buyers bounce without a second thought. The good news is that pricing is not a guessing game. There are proven strategies that work specifically for digital products, and once you understand them, you can price with confidence.",
      "## Use Anchoring to Make Your Price Feel Right",
      "Anchoring is one of the most powerful pricing principles in psychology. The first number a customer sees sets their frame of reference for everything that follows. If you show a $500 course first and then present your $97 product, the $97 feels like a bargain. If the customer sees your $97 product in isolation, they evaluate it differently. You can use anchoring on your product page by referencing the value your product delivers. For example: \"This template saves you 20+ hours of work. At a freelancer rate of $75/hour, that is $1,500 in value — yours for $49.\" The customer is now comparing $49 to $1,500, not evaluating $49 in a vacuum. Anchoring works because humans are terrible at judging absolute value but excellent at comparing relative value.",
      "## Build Tiered Pricing to Capture Every Segment",
      "One of the biggest mistakes creators make is offering a single price point. Different customers have different budgets, different needs, and different willingness to pay. Tiered pricing lets you capture value across the entire spectrum. A common structure is three tiers: a basic version with core content, a standard version with additional resources or bonuses, and a premium version with everything plus personal support or exclusive extras. For example, an ebook could be $19 for the PDF, $39 for the PDF plus worksheets and templates, and $79 for the full bundle plus a private Q&A session. The middle tier typically generates the most revenue because it feels like the best value relative to the other options. Tiered pricing is not about tricking people — it is about meeting customers where they are.",
      "## Launch Discounts: How to Use Them Without Devaluing Your Product",
      "Launch discounts are a proven way to generate momentum, but they need to be handled carefully. A discount without a clear reason and deadline trains customers to wait for the next sale. The key is to frame your launch discount as a reward for early supporters, not a sign that your product is worth less than the listed price. Use language like \"Launch price: $29 (regular $49) — available for the first 100 buyers only\" or \"Early bird pricing ends Friday.\" This creates urgency and a legitimate reason for the lower price. After the launch window closes, raise the price to the full amount and do not apologize for it. Your product is worth the full price — the discount was a thank-you to the people who took a chance on you early.",
      "## Value-Based Pricing: Charge for the Outcome, Not the Format",
      "The biggest pricing mistake creators make is pricing based on the format of the product rather than the outcome it delivers. An ebook is not worth $15 because it is an ebook — it is worth whatever the reader gains from the information inside. If your ebook teaches someone how to land freelance clients and they close a $5,000 project because of it, your ebook was worth far more than $15. Value-based pricing means asking yourself: what is the tangible result my customer gets from this product? How much is that result worth to them? A Notion template that saves a project manager five hours per week is worth hundreds of dollars over a year, even though it took you a weekend to build. Price based on the value delivered, not the time invested or the file format.",
      "## The Psychology of Price Points",
      "Specific numbers matter more than you think. There is a reason so many products are priced at $29, $49, and $97 rather than $30, $50, and $100. Prices ending in 7 or 9 consistently outperform round numbers in conversion tests. The difference between $49 and $50 is negligible in real terms, but $49 feels meaningfully cheaper because the customer mentally categorizes it as \"in the forties\" rather than \"fifty dollars.\" For premium products, however, round numbers can actually work better. A $500 course signals confidence and quality in a way that $497 does not. The rule of thumb: use charm pricing (ending in 7 or 9) for products under $100, and consider round numbers for products above $200 where you want to signal premium positioning.",
      "## When and How to Raise Your Prices",
      "Most creators keep their prices static for far too long. If your product is selling consistently and you are getting positive feedback, it is time to raise your prices. The fear is always the same — \"what if people stop buying?\" In practice, moderate price increases rarely cause a significant drop in sales volume. A 20% price increase with only a 10% drop in volume still means more revenue. The best time to raise prices is when you add new content or features to your product. This gives you a natural reason to announce the increase and lets existing customers feel like they got a deal by buying at the old price. You can also grandfather in existing customers at the old price while new customers pay the updated rate. Raise your prices at least once a year. If you never raise prices, you are almost certainly leaving money on the table.",
      "## Competitor Research Without Competitor Copying",
      "Knowing what others charge in your niche is useful context, but it should not dictate your pricing. If every competitor prices their Figma template kit at $39, that does not mean $39 is the right price for you. Your product might include more templates, better documentation, ongoing updates, or a stronger brand. All of those factors justify a higher price. Use competitor pricing as a data point, not a ceiling. Look at the range of prices in your market, identify where your product fits based on quality and scope, and price accordingly. If your product is genuinely better, charge more and communicate why. Customers who buy on quality rather than price are better customers in every way — they leave fewer refund requests, appreciate your work more, and are more likely to buy from you again.",
      "## Free Trials, Freemium, and Free Samples",
      "Giving away part of your product for free is a legitimate pricing strategy when done intentionally. A free sample — like the first chapter of an ebook, a single template from a bundle, or a limited version of a tool — lets potential customers experience your quality before committing money. This reduces perceived risk and increases conversions on the paid version. The key is to make the free sample genuinely useful but incomplete. It should solve a small problem while making the customer aware of the bigger problem your paid product solves. Storelib makes it easy to offer both free and paid products in your store, so you can use free products as a funnel to drive sales of your premium offerings.",
      "## Test, Iterate, and Do Not Overthink It",
      "Here is the truth most pricing guides will not tell you: your first price does not have to be perfect. It just has to be reasonable enough to start generating sales and data. Once you have real customers, you can learn from their behavior. Are people buying without hesitation? You might be priced too low. Are people visiting your product page but not converting? Price could be a factor. Are customers consistently saying your product is worth way more than they paid? Raise your prices. Pricing is an ongoing process, not a one-time decision. Set a price, launch, observe, and adjust. The creators who earn the most are not the ones who found the perfect price on day one — they are the ones who kept iterating until the numbers worked.",
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
            className="inline-flex items-center gap-2 text-neutral-900 hover:text-neutral-700 font-medium"
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
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 mb-4">
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
          <div className="mt-12 p-6 sm:p-8 bg-gradient-to-r from-neutral-50 to-neutral-100 rounded-2xl border border-neutral-200">
            <h3 className="text-lg sm:text-xl font-bold text-neutral-900 mb-2">Ready to start selling?</h3>
            <p className="text-sm sm:text-base text-neutral-600 mb-5">
              Create your free Storelib store and start earning from your digital products today.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
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
                className="group flex flex-col p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
              >
                <span className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" />
                  Previous
                </span>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2">
                  {BLOG_POSTS[prevSlug].title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {nextSlug ? (
              <Link
                href={`/blog/${nextSlug}`}
                className="group flex flex-col items-end text-right p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
              >
                <span className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                  Next
                  <ArrowRight className="w-3 h-3" />
                </span>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2">
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
