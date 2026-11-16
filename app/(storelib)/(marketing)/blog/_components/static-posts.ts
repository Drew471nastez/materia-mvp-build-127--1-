/**
 * THE FOUR POSTS WRITTEN IN CODE, before /admin/blog existed. Their list
 * entries (title, excerpt, date, cover) are in lib/blog/listing
 * STATIC_BLOG_POSTS; this is what each one says. The text is the original
 * lines ("## " a heading, "**bold**"), turned into the shared block format
 * by lib/blog/article legacyBlocks, so the article draws them with the same
 * renderer, contents list and read time as a post from the database. A
 * database row with the same slug wins.
 */
export interface StaticPostBody {
  title: string
  excerpt: string
  category: string
  published_at: string
  seo_title?: string
  seo_description?: string
  seo_keywords?: string
  content: string[]
}

export const STATIC_POST_BODIES: Record<string, StaticPostBody> = {
  "how-to-start-selling-digital-products-2026": {
    "title": "How to Start Selling Digital Products in 2026",
    "excerpt": "Ready to turn your digital creations into a thriving business? Whether you're a designer, developer, educator, or content creator, selling digital products has never been more accessible.",
    "category": "Getting Started",
    "published_at": "2026-01-15T00:00:00Z",
    "seo_title": "How to Start Selling Digital Products in 2026 | Storelib",
    "seo_description": "Turn your skills into income. A complete guide to launching your first digital product store, from choosing what to sell to getting your first sale.",
    "seo_keywords": "sell digital products, digital downloads, creator economy, online store",
    "content": [
      "The digital product economy is booming. In 2026, more creators than ever are turning their skills into income by selling digital products online. Whether you create templates, courses, ebooks, presets, software tools, or design assets, there's never been a better time to get started.",
      "## Why Digital Products?",
      "Unlike physical goods, digital products have near-zero marginal cost. Once you create a product, you can sell it an unlimited number of times without worrying about inventory, shipping, or manufacturing. This means higher profit margins and a business that can scale without proportional increases in effort.",
      "## Choosing the Right Product to Sell",
      "The best digital product is one that solves a specific problem for a specific audience. Here are popular categories that perform well on Storelib:",
      "**Templates & Themes**: Notion templates, website themes, social media templates, and resume designs are consistently among the top sellers. People love saving time with ready-made solutions.",
      "**Educational Content**: Online courses, tutorials, ebooks, and guides are in high demand. If you have expertise in any area, you can package your knowledge into a sellable product.",
      "**Creative Assets**: Fonts, icons, illustrations, stock photos, Lightroom presets, and LUTs are perfect for fellow creatives who want to enhance their work.",
      "**Software & Tools**: Chrome extensions, scripts, plugins, and SaaS micro-tools can command premium prices when they solve real problems.",
      "## Setting Up Your Store on Storelib",
      "Getting started on Storelib takes just a few minutes. Create your account, add your first product, customize your OnePage, and start sharing your link.",
      "## Tips for Your First Sale",
      "**Start with your existing audience.** If you have followers on social media, an email list, or a blog, let them know about your new products. Your existing audience already trusts you.",
      "**Price strategically.** For your first product, consider a lower entry price to reduce friction. You can always raise prices as you build social proof with reviews and sales numbers.",
      "**Create a compelling product page.** High-quality preview images, a clear description of what's included, and a strong value proposition make a huge difference in conversion rates.",
      "## Ready to Get Started?",
      "The best time to start selling digital products was yesterday. The second best time is today. With Storelib's free plan, you can launch your store with zero upfront costs."
    ]
  },
  "why-low-transaction-fees-matter": {
    "title": "Why Low Transaction Fees Matter for Digital Creators",
    "excerpt": "Every percentage point counts when you're building a sustainable creator business.",
    "category": "Creator Tips",
    "published_at": "2026-02-03T00:00:00Z",
    "seo_title": "Why Low Transaction Fees Matter for Digital Creators | Storelib",
    "seo_description": "The difference between 3% and 15% fees adds up fast. We break down the real numbers and show how much more you keep with lower fees on Storelib.",
    "seo_keywords": "transaction fees digital products, creator platform fees, Storelib pricing, low fee marketplace",
    "content": [
      "When you're evaluating platforms to sell your digital products, one number matters more than almost anything else: the transaction fee. It might seem like a small detail, but over time, those percentages add up to a massive difference in your earnings.",
      "## The Math Behind Transaction Fees",
      "Let's say you sell a digital product for $50. Here's what you'd keep on different platforms:",
      "**Platform charging 15%:** You keep $42.50 per sale\n**Platform charging 10%:** You keep $45.00 per sale\n**Storelib (5% + $0.25 on Free, 3% + $0.25 on Grow):** You keep $47.25 to $48.25 per sale",
      "Now multiply that by hundreds or thousands of sales. On a modest 500 sales per year at $50 each ($25,000 in revenue), the difference is **about $2,400 to $2,900 a year** compared to the highest-fee platform.",
      "## Why Most Platforms Charge So Much",
      "Many platforms justify high fees by bundling in features you may not need, or simply because creators don't comparison-shop. Storelib takes a different approach: we believe creators should keep the vast majority of their earnings.",
      "## The Storelib Fee Structure",
      "**Free Plan:** 5% + $0.25 per transaction, with no monthly fee.\n**Grow Plan ($29/month):** 3% + $0.25 per transaction, plus your own domain, the verified badge and no Storelib branding.\nThe $0.25 applies to orders of $4.00 or more.",
      "## The Bottom Line",
      "Every dollar you save on fees is a dollar you can reinvest in your business. Over the lifetime of your creator career, choosing a low-fee platform like Storelib can mean tens of thousands of dollars in additional earnings."
    ]
  },
  "building-an-audience-before-you-launch": {
    "title": "Building an Audience Before You Launch",
    "excerpt": "The biggest mistake digital product creators make is building in silence. Learn how to cultivate a ready-to-buy audience before your product even exists.",
    "category": "Growth",
    "published_at": "2026-02-10T00:00:00Z",
    "seo_title": "Building an Audience Before You Launch | Storelib Blog",
    "seo_description": "Most creators launch to crickets. Here's how to build a ready-to-buy audience before your digital product is even finished.",
    "seo_keywords": "build audience before launch, pre-launch marketing, email list building, creator strategy",
    "content": [
      "Most creators spend months perfecting their digital product, then launch it to crickets. The problem is not the product, it is the approach. If you wait until launch day to start marketing, you have already lost your biggest advantage: time.",
      "## Start Before You Are Ready",
      "You do not need a finished product to start building an audience. Begin sharing your journey the moment you decide to create something. Talk about the problem you are solving, the research you are doing, and the decisions you are making along the way.",
      "## Build an Email List From Day One",
      "Social media followers are rented. An email list is owned. Start collecting email addresses as early as possible, even if you only have a landing page with a description of what you are building. Offer something small in exchange for an email, a free resource, early access, or a mini version of your product.",
      "## Use Social Media to Tease and Build Anticipation",
      "Pick one or two platforms where your target audience hangs out and start posting regularly. Share behind-the-scenes content: screenshots of your work in progress, design iterations, problems you solved, and milestones you hit.",
      "## Recruit Beta Users Early",
      "Before you launch publicly, get your product into the hands of 10 to 20 real users. Offer free or heavily discounted access in exchange for honest feedback and a testimonial. Beta users help you catch issues, provide social proof, and become your first advocates.",
      "## Consistency Beats Intensity",
      "Commit to a sustainable pace, three posts per week, one newsletter per week, and stick to it. Consistency matters far more than intensity. Your audience grows through repeated exposure."
    ]
  },
  "pricing-strategies-for-digital-products": {
    "title": "Pricing Strategies That Actually Work for Digital Products",
    "excerpt": "Pricing is one of the hardest decisions a creator faces. Too high and you scare people off. Too low and you leave money on the table.",
    "category": "Strategy",
    "published_at": "2026-02-14T00:00:00Z",
    "seo_title": "Pricing Strategies That Actually Work for Digital Products | Storelib",
    "seo_description": "Most creators underprice their work. Learn proven pricing frameworks, anchoring, tiered pricing, value-based pricing, to earn what your digital products are worth.",
    "seo_keywords": "digital product pricing, value-based pricing, how to price digital products, creator pricing strategy",
    "content": [
      "Pricing is where most digital product creators get stuck. Price too low and you undervalue your work. Price too high without justification and potential buyers bounce. The good news: pricing is not a guessing game.",
      "## Use Anchoring to Make Your Price Feel Right",
      "The first number a customer sees sets their frame of reference for everything that follows. Use anchoring on your product page by referencing the value your product delivers: \"This template saves you 20+ hours of work. At a freelancer rate of $75/hour, that is $1,500 in value, yours for $49.\"",
      "## Build Tiered Pricing to Capture Every Segment",
      "Offer three tiers: a basic version with core content, a standard version with additional resources, and a premium version with everything plus personal support. The middle tier typically generates the most revenue because it feels like the best value.",
      "## Value-Based Pricing: Charge for the Outcome",
      "Price based on the value delivered, not the time invested or the file format. An ebook that helps someone land a $5,000 client is worth far more than $15. If your product is genuinely better, charge more and communicate why.",
      "## The Psychology of Price Points",
      "Prices ending in 7 or 9 consistently outperform round numbers in conversion tests. The difference between $49 and $50 is negligible in real terms, but $49 feels meaningfully cheaper because the customer mentally categorizes it as \"in the forties.\"",
      "## When and How to Raise Your Prices",
      "Most creators keep their prices static for far too long. If your product is selling consistently and getting positive feedback, it is time to raise your prices. A 20% price increase with only a 10% volume drop still means more revenue.",
      "## Test, Iterate, and Do Not Overthink It",
      "Your first price does not have to be perfect. Launch, observe, and adjust. The creators who earn the most are not the ones who found the perfect price on day one, they are the ones who kept iterating until the numbers worked."
    ]
  }
}
