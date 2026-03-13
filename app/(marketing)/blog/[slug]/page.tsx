import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Calendar, Clock, ArrowLeft, ArrowRight } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import BlogPostTracker from "./_tracker"

// ─── Hardcoded fallback content ────────────────────────────────────────────
const BLOG_POSTS: Record<string, {
  title: string; excerpt: string; category: string; published_at: string
  read_time: string; gradient: string; content: string[]
  seo_title?: string; seo_description?: string; seo_keywords?: string
}> = {
  "how-to-start-selling-digital-products-2026": {
    title: "How to Start Selling Digital Products in 2026",
    excerpt: "Ready to turn your digital creations into a thriving business? Whether you're a designer, developer, educator, or content creator, selling digital products has never been more accessible.",
    category: "Getting Started", published_at: "2026-01-15T00:00:00Z", read_time: "5 min read",
    gradient: "from-neutral-800 to-neutral-900",
    seo_title: "How to Start Selling Digital Products in 2026 | Storelib",
    seo_description: "Turn your skills into income. A complete guide to launching your first digital product store — from choosing what to sell to getting your first sale.",
    seo_keywords: "sell digital products, digital downloads, creator economy, passive income 2026, online store",
    content: ["The digital product economy is booming. In 2026, more creators than ever are turning their skills into passive income streams by selling digital products online. Whether you create templates, courses, ebooks, presets, software tools, or design assets — there's never been a better time to get started.","## Why Digital Products?","Unlike physical goods, digital products have near-zero marginal cost. Once you create a product, you can sell it an unlimited number of times without worrying about inventory, shipping, or manufacturing. This means higher profit margins and a business that can scale without proportional increases in effort.","Digital products also give you the freedom to work on your own schedule. You can create once and earn repeatedly, building a library of products that generates revenue 24/7.","## Choosing the Right Product to Sell","The best digital product is one that solves a specific problem for a specific audience. Here are some popular categories that perform well on Storelib:","**Templates & Themes** — Notion templates, website themes, social media templates, and resume designs are consistently among the top sellers. People love saving time with ready-made solutions.","**Educational Content** — Online courses, tutorials, ebooks, and guides are in high demand. If you have expertise in any area, you can package your knowledge into a sellable product.","**Creative Assets** — Fonts, icons, illustrations, stock photos, Lightroom presets, and LUTs are perfect for fellow creatives who want to enhance their work.","**Software & Tools** — Chrome extensions, scripts, plugins, and SaaS micro-tools can command premium prices when they solve real problems.","## Setting Up Your Store on Storelib","Getting started on Storelib takes just a few minutes. Here's how:","**1. Create your account** — Sign up for free and complete the quick onboarding process. You'll set up your store name, upload a logo, and customize your storefront.","**2. Add your first product** — Upload your digital files, write a compelling description, set your price, and add preview images. Storelib supports virtually any file format.","**3. Customize your OnePage** — Your OnePage is your public-facing storefront. It's a beautiful, mobile-optimized page where customers can browse and purchase your products.","**4. Share and promote** — Share your store link on social media, embed it in your website, or use your custom subdomain to start driving traffic.","## Tips for Your First Sale","**Start with your existing audience.** If you have followers on social media, an email list, or a blog — let them know about your new products.","**Price strategically.** For your first product, consider a lower entry price to reduce friction. You can always raise prices as you build social proof.","**Create a compelling product page.** High-quality preview images, a clear description of what's included, and a strong value proposition make a huge difference in conversion rates.","## Ready to Get Started?","The best time to start selling digital products was yesterday. The second best time is today. With Storelib's free plan, you can launch your store with zero upfront costs."],
  },
  "why-low-transaction-fees-matter": {
    title: "Why Low Transaction Fees Matter for Digital Creators",
    excerpt: "Every percentage point counts when you're building a sustainable creator business. Learn how transaction fees impact your bottom line.",
    category: "Creator Tips", published_at: "2026-02-03T00:00:00Z", read_time: "4 min read",
    gradient: "from-neutral-700 to-neutral-800",
    seo_title: "Why Low Transaction Fees Matter for Digital Creators | Storelib",
    seo_description: "The difference between 3% and 15% fees adds up fast. We break down the real numbers and show how much more you keep with lower fees on Storelib.",
    seo_keywords: "transaction fees digital products, creator platform fees, Storelib pricing, low fee marketplace",
    content: ["When you're evaluating platforms to sell your digital products, one number matters more than almost anything else: the transaction fee. It might seem like a small detail, but over time, those percentages add up to a massive difference in your earnings.","## The Math Behind Transaction Fees","Let's say you sell a digital product for $50. Here's what you'd keep on different platforms:","**Platform charging 15%:** You keep $42.50 per sale\n**Platform charging 10%:** You keep $45.00 per sale\n**Storelib (6% on Free, 3% on Growth):** You keep $47.00–$48.50 per sale","Now multiply that by hundreds or thousands of sales. On a modest 500 sales per year at $50 each ($25,000 in revenue):","**At 15% fees:** You lose $3,750 — keeping $21,250\n**At 10% fees:** You lose $2,500 — keeping $22,500\n**At Storelib's 3% (Growth):** You lose just $750 — keeping $24,250","That's a difference of **$3,000 per year** compared to the highest-fee platform.","## Why Most Platforms Charge So Much","Many platforms justify high fees by bundling in features you may not need, charging for built-in audiences, or simply because creators don't comparison-shop. Storelib takes a different approach — we believe creators should keep the vast majority of their earnings.","## The Storelib Fee Structure","**Free Plan:** 6% + $0.25 per transaction — no monthly fees, no hidden costs.\n**Growth Plan ($19/mo):** 3% + $0.25 per transaction — plus custom domains, verified badge, and premium features.\n**Pro Plan ($49/mo):** 1.5% + $0.25 per transaction — the lowest fees plus priority support.","## When Does Upgrading Make Sense?","**Growth Plan break-even:** If your monthly revenue exceeds ~$633, the savings over the Free plan more than cover the $19/mo subscription.\n**Pro Plan break-even:** If your monthly revenue exceeds ~$1,000, upgrading from Growth to Pro saves you more than the $30/mo difference.","## The Bottom Line","Every dollar you save on fees is a dollar you can reinvest in your business. Over the lifetime of your creator career, choosing a low-fee platform like Storelib can mean tens of thousands of dollars in additional earnings."],
  },
  "building-an-audience-before-you-launch": {
    title: "Building an Audience Before You Launch",
    excerpt: "The biggest mistake digital product creators make is building in silence. Learn how to cultivate a ready-to-buy audience before your product even exists.",
    category: "Growth", published_at: "2026-02-10T00:00:00Z", read_time: "6 min read",
    gradient: "from-neutral-800 to-neutral-700",
    seo_title: "Building an Audience Before You Launch | Storelib Blog",
    seo_description: "Most creators launch to crickets. Here's how to build a ready-to-buy audience before your digital product is even finished — from email lists to social media.",
    seo_keywords: "build audience before launch, pre-launch marketing, email list building, creator strategy",
    content: ["Most creators spend months perfecting their digital product, then launch it to crickets. The problem is not the product — it is the approach. If you wait until launch day to start marketing, you have already lost your biggest advantage: time.","## Start Before You Are Ready","You do not need a finished product to start building an audience. In fact, the earlier you start, the better. Begin sharing your journey the moment you decide to create something. Talk about the problem you are solving, the research you are doing, and the decisions you are making along the way.","## Build an Email List From Day One","Social media followers are rented. An email list is owned. Start collecting email addresses as early as possible, even if you only have a landing page with a description of what you are building. Tools like Storelib make it easy to set up email collection and send updates to your subscribers.","## Use Social Media to Tease and Build Anticipation","Pick one or two platforms where your target audience hangs out and start posting regularly. Share behind-the-scenes content: screenshots of your work in progress, design iterations, problems you solved, and milestones you hit.","## Recruit Beta Users Early","Before you launch publicly, get your product into the hands of 10 to 20 real users. Offer free or heavily discounted access in exchange for honest feedback and a testimonial. Beta users help you catch issues, provide social proof, and become your first advocates.","## Leverage Content Marketing","Start a blog, a YouTube channel, a newsletter, or a Twitter thread series around the topic your product addresses. Every piece of content you publish is a potential entry point for a future customer.","## Engage in Communities","Join Reddit communities, Discord servers, Facebook groups, and forums where your target audience is active. Answer questions, share insights, and be genuinely helpful without constantly promoting your product.","## Create a Launch Runway","A launch is not a single day — it is a sequence. Plan a two to four week runway: announce what you're building, share previews, open a waitlist, then go live with a limited-time offer for early buyers.","## Consistency Beats Intensity","Commit to a sustainable pace — three posts per week, one newsletter per week — and stick to it. Your audience grows through repeated exposure. People need to see you multiple times before they trust you and buy from you."],
  },
  "pricing-strategies-for-digital-products": {
    title: "Pricing Strategies That Actually Work for Digital Products",
    excerpt: "Pricing is one of the hardest decisions a creator faces. Too high and you scare people off. Too low and you leave money on the table.",
    category: "Strategy", published_at: "2026-02-14T00:00:00Z", read_time: "7 min read",
    gradient: "from-neutral-700 to-neutral-900",
    seo_title: "Pricing Strategies That Actually Work for Digital Products | Storelib",
    seo_description: "Most creators underprice their work. Learn proven pricing frameworks — anchoring, tiered pricing, value-based pricing — to earn what your digital products are worth.",
    seo_keywords: "digital product pricing, value-based pricing, how to price digital products, creator pricing strategy",
    content: ["Pricing is where most digital product creators get stuck. Price too low and you undervalue your work, attract the wrong customers, and burn out trying to make volume work. Price too high without justification and potential buyers bounce without a second thought.","## Use Anchoring to Make Your Price Feel Right","Anchoring is one of the most powerful pricing principles in psychology. The first number a customer sees sets their frame of reference for everything that follows. You can use anchoring on your product page by referencing the value your product delivers. For example: \"This template saves you 20+ hours of work. At a freelancer rate of $75/hour, that is $1,500 in value — yours for $49.\"","## Build Tiered Pricing to Capture Every Segment","One of the biggest mistakes creators make is offering a single price point. Different customers have different budgets and different willingness to pay. Tiered pricing lets you capture value across the entire spectrum — a basic tier, a standard tier (most popular), and a premium tier with extras.","## Value-Based Pricing: Charge for the Outcome","The biggest pricing mistake creators make is pricing based on the format of the product rather than the outcome it delivers. An ebook is not worth $15 because it is an ebook — it is worth whatever the reader gains from the information inside.","## The Psychology of Price Points","Prices ending in 7 or 9 consistently outperform round numbers in conversion tests. The difference between $49 and $50 is negligible in real terms, but $49 feels meaningfully cheaper. For premium products above $200, however, round numbers can signal confidence and quality.","## Launch Discounts: How to Use Them Without Devaluing Your Product","Launch discounts are a proven way to generate momentum, but frame them as a reward for early supporters, not a sign that your product is worth less. Use language like \"Launch price: $29 (regular $49) — available for the first 100 buyers only.\"","## When and How to Raise Your Prices","Most creators keep their prices static for far too long. If your product is selling consistently and getting positive feedback, it is time to raise your prices. A 20% price increase with only a 10% drop in volume still means more revenue.","## Test, Iterate, and Do Not Overthink It","Your first price does not have to be perfect. It just has to be reasonable enough to start generating sales and data. Set a price, launch, observe, and adjust. The creators who earn the most are not the ones who found the perfect price on day one."],
  },
}

const POST_SLUGS = Object.keys(BLOG_POSTS)

// ─── Block Renderer ─────────────────────────────────────────────────────────
interface Block {
  type: string
  html?: string
  text?: string
  url?: string
  alt?: string
  caption?: string
  videoId?: string
  headers?: string[]
  rows?: string[][]
  items?: string[]
  lang?: string
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold text-neutral-900">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function renderBlock(block: Block, i: number): React.ReactNode {
  switch (block.type) {
    case "h2":
      return <h2 key={i} className="text-2xl font-bold text-neutral-900 mt-10 mb-4" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "h3":
      return <h3 key={i} className="text-xl font-semibold text-neutral-900 mt-8 mb-3" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "p":
      return <p key={i} className="text-neutral-700 leading-relaxed my-4" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "quote":
      return <blockquote key={i} className="border-l-4 border-neutral-300 pl-5 py-1 my-6 text-neutral-600 italic leading-relaxed" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "hr":
      return <hr key={i} className="my-8 border-neutral-200" />
    case "img":
      return (
        <figure key={i} className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt || ""} className="w-full rounded-xl object-cover" />
          {block.caption && <figcaption className="text-center text-sm text-neutral-500 mt-2">{block.caption}</figcaption>}
        </figure>
      )
    case "youtube":
      return (
        <div key={i} className="my-8 aspect-video rounded-xl overflow-hidden bg-neutral-100">
          <iframe src={`https://www.youtube.com/embed/${block.videoId}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Video" />
        </div>
      )
    case "table":
      return (
        <div key={i} className="my-6 overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>{(block.headers || []).map((h, ci) => <th key={ci} className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wide border-b border-neutral-200">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(block.rows || []).map((row, ri) => (
                <tr key={ri} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  {row.map((cell, ci) => <td key={ci} className="px-4 py-3 text-neutral-700">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "ul":
      return <ul key={i} className="my-4 ml-4 space-y-1.5 list-disc list-outside text-neutral-700">{(block.items || []).map((item, idx) => <li key={idx} className="leading-relaxed pl-1">{item}</li>)}</ul>
    case "ol":
      return <ol key={i} className="my-4 ml-4 space-y-1.5 list-decimal list-outside text-neutral-700">{(block.items || []).map((item, idx) => <li key={idx} className="leading-relaxed pl-1">{item}</li>)}</ol>
    case "code":
      return (
        <div key={i} className="my-6 rounded-xl overflow-hidden">
          <div className="bg-neutral-900 px-4 py-2 flex items-center justify-between border-b border-neutral-800">
            <span className="text-xs text-neutral-400 font-mono">{block.lang || "code"}</span>
          </div>
          <pre className="bg-neutral-950 p-4 overflow-x-auto"><code className="text-emerald-400 font-mono text-sm leading-relaxed">{block.text || ""}</code></pre>
        </div>
      )
    default:
      return null
  }
}

// Render old string-array format (legacy)
function renderLegacyContent(content: string[]): React.ReactNode {
  return content.map((block, i) => {
    if (block.startsWith("## ")) {
      return <h2 key={i} className="text-2xl font-bold text-neutral-900 mt-10 mb-4">{block.replace("## ", "")}</h2>
    }
    const hasLineBreaks = block.includes("\n")
    if (hasLineBreaks) {
      const lines = block.split("\n")
      return (
        <div key={i} className="my-4 space-y-2">
          {lines.map((line, j) => <p key={j} className="text-neutral-700 leading-relaxed">{renderInlineMarkdown(line)}</p>)}
        </div>
      )
    }
    return <p key={i} className="text-neutral-700 leading-relaxed my-4">{renderInlineMarkdown(block)}</p>
  })
}

// ─── Data fetching ─────────────────────────────────────────────────────────
async function fetchPost(slug: string) {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .single()
    return data
  } catch {
    return null
  }
}

async function fetchAdjacentPosts(slug: string) {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, title")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
    return data || []
  } catch {
    return []
  }
}

// ─── Metadata ─────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params

  const dbPost = await fetchPost(slug)
  const staticPost = BLOG_POSTS[slug]
  const source = dbPost || staticPost

  if (!source) return { title: "Post Not Found" }

  const title = (dbPost?.seo_title || staticPost?.seo_title || source.title) + " | Storelib"
  const description = dbPost?.seo_description || staticPost?.seo_description || source.excerpt || ""
  const keywords = dbPost?.seo_keywords || staticPost?.seo_keywords || ""
  const cover = dbPost?.cover_image_url

  return {
    title,
    description,
    keywords: keywords ? keywords.split(",").map((k: string) => k.trim()) : undefined,
    openGraph: {
      title,
      description,
      url: `https://storelib.com/blog/${slug}`,
      type: "article",
      publishedTime: source.published_at || undefined,
      authors: [dbPost?.author || "Storelib Team"],
      images: cover ? [{ url: cover, width: 1200, height: 630 }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `https://storelib.com/blog/${slug}` },
  }
}

export async function generateStaticParams() {
  const slugs = new Set(POST_SLUGS)
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from("blog_posts").select("slug").eq("is_published", true)
    ;(data || []).forEach((p: { slug: string }) => slugs.add(p.slug))
  } catch {}
  return [...slugs].map(slug => ({ slug }))
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const dbPost = await fetchPost(slug)
  const staticData = BLOG_POSTS[slug]

  if (!dbPost && !staticData) notFound()

  const post = {
    id: dbPost?.id,
    title: dbPost?.title || staticData?.title,
    excerpt: dbPost?.excerpt || staticData?.excerpt,
    category: dbPost?.category || staticData?.category,
    published_at: dbPost?.published_at || staticData?.published_at,
    read_time: dbPost?.read_time || staticData?.read_time,
    cover_image_url: dbPost?.cover_image_url,
    author: dbPost?.author || "Storelib Team",
    gradient: staticData?.gradient || "from-neutral-800 to-neutral-900",
    content: dbPost?.content,
    legacyContent: !dbPost ? staticData?.content : null,
  }

  // Adjacent posts (for prev/next navigation)
  const dbAdjacent = await fetchAdjacentPosts(slug)
  const allSlugs = [
    ...dbAdjacent.map((p: { slug: string }) => p.slug),
    ...POST_SLUGS.filter(s => !dbAdjacent.find((p: { slug: string }) => p.slug === s)),
  ]
  const currentIdx = allSlugs.indexOf(slug)
  const prevSlug = currentIdx > 0 ? allSlugs[currentIdx - 1] : null
  const nextSlug = currentIdx < allSlugs.length - 1 ? allSlugs[currentIdx + 1] : null

  const prevTitle = prevSlug
    ? (dbAdjacent.find((p: { slug: string }) => p.slug === prevSlug)?.title || BLOG_POSTS[prevSlug]?.title)
    : null
  const nextTitle = nextSlug
    ? (dbAdjacent.find((p: { slug: string }) => p.slug === nextSlug)?.title || BLOG_POSTS[nextSlug]?.title)
    : null

  // JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "Storelib", url: "https://storelib.com" },
    url: `https://storelib.com/blog/${slug}`,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
  }

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Track view for DB posts */}
      {post.id && <BlogPostTracker postId={post.id} />}

      {/* Hero */}
      <div className={`relative h-44 sm:h-64 md:h-72 bg-gradient-to-br ${post.gradient} overflow-hidden`}>
        {post.cover_image_url && (
          <Image src={post.cover_image_url} alt={post.title || ""} fill className="object-cover opacity-90" sizes="100vw" priority />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
        <div className="mb-5">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 mb-4">{post.category}</span>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 tracking-tight mb-4 leading-tight">{post.title}</h1>

        <div className="flex items-center gap-4 text-sm text-neutral-500 mb-8 pb-8 border-b border-neutral-200">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <span>{post.published_at ? new Date(post.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>{post.read_time}</span>
          </div>
          {post.author && post.author !== "Storelib Team" && (
            <div className="flex items-center gap-1.5">
              <span>By {post.author}</span>
            </div>
          )}
        </div>

        <article className="pb-16">
          <div className="prose prose-lg prose-neutral max-w-none">
            {post.content && Array.isArray(post.content)
              ? post.content.map((block: Block, i: number) => renderBlock(block, i))
              : post.legacyContent
                ? renderLegacyContent(post.legacyContent)
                : null
            }
          </div>

          {/* CTA */}
          <div className="mt-12 p-6 sm:p-8 bg-gradient-to-r from-neutral-50 to-neutral-100 rounded-2xl border border-neutral-200">
            <h3 className="text-lg sm:text-xl font-bold text-neutral-900 mb-2">Ready to start selling?</h3>
            <p className="text-sm sm:text-base text-neutral-600 mb-5">Create your free Storelib store and start earning from your digital products today.</p>
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Prev/Next */}
          <div className="mt-12 pt-8 border-t border-neutral-200 grid grid-cols-2 gap-3 sm:gap-4">
            {prevSlug && prevTitle ? (
              <Link href={`/blog/${prevSlug}`} className="group flex flex-col p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors">
                <span className="text-xs text-neutral-500 mb-1 flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Previous</span>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2">{prevTitle}</span>
              </Link>
            ) : <div />}
            {nextSlug && nextTitle ? (
              <Link href={`/blog/${nextSlug}`} className="group flex flex-col items-end text-right p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors">
                <span className="text-xs text-neutral-500 mb-1 flex items-center gap-1">Next<ArrowRight className="w-3 h-3" /></span>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2">{nextTitle}</span>
              </Link>
            ) : <div />}
          </div>
        </article>
      </div>
    </div>
  )
}
