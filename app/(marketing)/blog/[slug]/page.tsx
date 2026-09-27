import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { categoryToSlug } from "@/lib/blog-categories"
import BlogPostTracker from "./_tracker"
import ShareButtons from "./_share-buttons"
import ReadingProgress from "./_reading-progress"
import CtaBanner from "./_cta-banner"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibLogoUrl } from "@/lib/brand/logo"

export const dynamic = "force-dynamic"

// ─── Hardcoded fallback posts ──────────────────────────────────────────────
const BLOG_POSTS: Record<string, {
  title: string; excerpt: string; category: string; published_at: string
  read_time: string; cover_image_url?: string
  seo_title?: string; seo_description?: string; seo_keywords?: string
  content: string[]
}> = {
  "how-to-start-selling-digital-products-2026": {
    title: "How to Start Selling Digital Products in 2026",
    excerpt: "Ready to turn your digital creations into a thriving business? Whether you're a designer, developer, educator, or content creator, selling digital products has never been more accessible.",
    category: "Getting Started", published_at: "2026-01-15T00:00:00Z", read_time: "5 min read",
    seo_title: "How to Start Selling Digital Products in 2026 | Storelib",
    seo_description: "Turn your skills into income. A complete guide to launching your first digital product store — from choosing what to sell to getting your first sale.",
    seo_keywords: "sell digital products, digital downloads, creator economy, passive income 2026, online store",
    content: ["The digital product economy is booming. In 2026, more creators than ever are turning their skills into passive income streams by selling digital products online. Whether you create templates, courses, ebooks, presets, software tools, or design assets — there's never been a better time to get started.","## Why Digital Products?","Unlike physical goods, digital products have near-zero marginal cost. Once you create a product, you can sell it an unlimited number of times without worrying about inventory, shipping, or manufacturing. This means higher profit margins and a business that can scale without proportional increases in effort.","## Choosing the Right Product to Sell","The best digital product is one that solves a specific problem for a specific audience. Here are popular categories that perform well on Storelib:","**Templates & Themes** — Notion templates, website themes, social media templates, and resume designs are consistently among the top sellers. People love saving time with ready-made solutions.","**Educational Content** — Online courses, tutorials, ebooks, and guides are in high demand. If you have expertise in any area, you can package your knowledge into a sellable product.","**Creative Assets** — Fonts, icons, illustrations, stock photos, Lightroom presets, and LUTs are perfect for fellow creatives who want to enhance their work.","**Software & Tools** — Chrome extensions, scripts, plugins, and SaaS micro-tools can command premium prices when they solve real problems.","## Setting Up Your Store on Storelib","Getting started on Storelib takes just a few minutes. Create your account, add your first product, customize your OnePage, and start sharing your link.","## Tips for Your First Sale","**Start with your existing audience.** If you have followers on social media, an email list, or a blog — let them know about your new products. Your existing audience already trusts you.","**Price strategically.** For your first product, consider a lower entry price to reduce friction. You can always raise prices as you build social proof with reviews and sales numbers.","**Create a compelling product page.** High-quality preview images, a clear description of what's included, and a strong value proposition make a huge difference in conversion rates.","## Ready to Get Started?","The best time to start selling digital products was yesterday. The second best time is today. With Storelib's free plan, you can launch your store with zero upfront costs."],
  },
  "why-low-transaction-fees-matter": {
    title: "Why Low Transaction Fees Matter for Digital Creators",
    excerpt: "Every percentage point counts when you're building a sustainable creator business.",
    category: "Creator Tips", published_at: "2026-02-03T00:00:00Z", read_time: "4 min read",
    seo_title: "Why Low Transaction Fees Matter for Digital Creators | Storelib",
    seo_description: "The difference between 3% and 15% fees adds up fast. We break down the real numbers and show how much more you keep with lower fees on Storelib.",
    seo_keywords: "transaction fees digital products, creator platform fees, Storelib pricing, low fee marketplace",
    content: ["When you're evaluating platforms to sell your digital products, one number matters more than almost anything else: the transaction fee. It might seem like a small detail, but over time, those percentages add up to a massive difference in your earnings.","## The Math Behind Transaction Fees","Let's say you sell a digital product for $50. Here's what you'd keep on different platforms:","**Platform charging 15%:** You keep $42.50 per sale\n**Platform charging 10%:** You keep $45.00 per sale\n**Storelib (6% on Free, 3% on Pro):** You keep $47.00–$48.50 per sale","Now multiply that by hundreds or thousands of sales. On a modest 500 sales per year at $50 each ($25,000 in revenue), the difference is **over $3,000 per year** compared to the highest-fee platform.","## Why Most Platforms Charge So Much","Many platforms justify high fees by bundling in features you may not need, or simply because creators don't comparison-shop. Storelib takes a different approach: we believe creators should keep the vast majority of their earnings.","## The Storelib Fee Structure","**Free Plan:** 6% + $0.25 per transaction, with no monthly fee.\n**Pro Plan ($29/month):** 3% + $0.25 per transaction, plus your own domain, the verified badge and no Storelib branding.\nThe $0.25 applies to orders of $3.00 or more.","## The Bottom Line","Every dollar you save on fees is a dollar you can reinvest in your business. Over the lifetime of your creator career, choosing a low-fee platform like Storelib can mean tens of thousands of dollars in additional earnings."],
  },
  "building-an-audience-before-you-launch": {
    title: "Building an Audience Before You Launch",
    excerpt: "The biggest mistake digital product creators make is building in silence. Learn how to cultivate a ready-to-buy audience before your product even exists.",
    category: "Growth", published_at: "2026-02-10T00:00:00Z", read_time: "6 min read",
    seo_title: "Building an Audience Before You Launch | Storelib Blog",
    seo_description: "Most creators launch to crickets. Here's how to build a ready-to-buy audience before your digital product is even finished.",
    seo_keywords: "build audience before launch, pre-launch marketing, email list building, creator strategy",
    content: ["Most creators spend months perfecting their digital product, then launch it to crickets. The problem is not the product — it is the approach. If you wait until launch day to start marketing, you have already lost your biggest advantage: time.","## Start Before You Are Ready","You do not need a finished product to start building an audience. Begin sharing your journey the moment you decide to create something. Talk about the problem you are solving, the research you are doing, and the decisions you are making along the way.","## Build an Email List From Day One","Social media followers are rented. An email list is owned. Start collecting email addresses as early as possible, even if you only have a landing page with a description of what you are building. Offer something small in exchange for an email — a free resource, early access, or a mini version of your product.","## Use Social Media to Tease and Build Anticipation","Pick one or two platforms where your target audience hangs out and start posting regularly. Share behind-the-scenes content: screenshots of your work in progress, design iterations, problems you solved, and milestones you hit.","## Recruit Beta Users Early","Before you launch publicly, get your product into the hands of 10 to 20 real users. Offer free or heavily discounted access in exchange for honest feedback and a testimonial. Beta users help you catch issues, provide social proof, and become your first advocates.","## Consistency Beats Intensity","Commit to a sustainable pace — three posts per week, one newsletter per week — and stick to it. Consistency matters far more than intensity. Your audience grows through repeated exposure."],
  },
  "pricing-strategies-for-digital-products": {
    title: "Pricing Strategies That Actually Work for Digital Products",
    excerpt: "Pricing is one of the hardest decisions a creator faces. Too high and you scare people off. Too low and you leave money on the table.",
    category: "Strategy", published_at: "2026-02-14T00:00:00Z", read_time: "7 min read",
    seo_title: "Pricing Strategies That Actually Work for Digital Products | Storelib",
    seo_description: "Most creators underprice their work. Learn proven pricing frameworks — anchoring, tiered pricing, value-based pricing — to earn what your digital products are worth.",
    seo_keywords: "digital product pricing, value-based pricing, how to price digital products, creator pricing strategy",
    content: ["Pricing is where most digital product creators get stuck. Price too low and you undervalue your work. Price too high without justification and potential buyers bounce. The good news: pricing is not a guessing game.","## Use Anchoring to Make Your Price Feel Right","The first number a customer sees sets their frame of reference for everything that follows. Use anchoring on your product page by referencing the value your product delivers: \"This template saves you 20+ hours of work. At a freelancer rate of $75/hour, that is $1,500 in value — yours for $49.\"","## Build Tiered Pricing to Capture Every Segment","Offer three tiers: a basic version with core content, a standard version with additional resources, and a premium version with everything plus personal support. The middle tier typically generates the most revenue because it feels like the best value.","## Value-Based Pricing: Charge for the Outcome","Price based on the value delivered, not the time invested or the file format. An ebook that helps someone land a $5,000 client is worth far more than $15. If your product is genuinely better, charge more and communicate why.","## The Psychology of Price Points","Prices ending in 7 or 9 consistently outperform round numbers in conversion tests. The difference between $49 and $50 is negligible in real terms, but $49 feels meaningfully cheaper because the customer mentally categorizes it as \"in the forties.\"","## When and How to Raise Your Prices","Most creators keep their prices static for far too long. If your product is selling consistently and getting positive feedback, it is time to raise your prices. A 20% price increase with only a 10% volume drop still means more revenue.","## Test, Iterate, and Do Not Overthink It","Your first price does not have to be perfect. Launch, observe, and adjust. The creators who earn the most are not the ones who found the perfect price on day one — they are the ones who kept iterating until the numbers worked."],
  },
}

// ─── Author profiles ───────────────────────────────────────────────────────
const DEFAULT_AUTHOR = {
  name: "Anisia - Head of Marketing",
  bio: "Practical guides for digital product creators.",
  avatar: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/onepage-assets/ee48b026-347c-4372-8589-eea3863b443c/avatars/avatar-1770910695542.jpg",
  twitter: "https://twitter.com/storelib",
  linkedin: "https://linkedin.com/company/storelib",
  website: "https://storelib.com",
}

// ─── Block renderer ────────────────────────────────────────────────────────
interface Block {
  type: string; html?: string; text?: string; url?: string; alt?: string
  caption?: string; videoId?: string; headers?: string[]; rows?: string[][]
  items?: string[]; lang?: string
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
    case "h2": return <h2 key={i} className="text-2xl font-bold text-neutral-900 mt-10 mb-4" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "h3": return <h3 key={i} className="text-xl font-semibold text-neutral-900 mt-8 mb-3" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "p": return <p key={i} className="text-neutral-700 leading-relaxed my-4 text-[17px]" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "quote": return <blockquote key={i} className="border-l-4 border-neutral-300 pl-5 py-1 my-6 text-neutral-600 italic leading-relaxed" dangerouslySetInnerHTML={{ __html: block.html || block.text || "" }} />
    case "hr": return <hr key={i} className="my-8 border-neutral-200" />
    case "img": return (
      <figure key={i} className="my-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.alt || ""} className="w-full rounded-xl object-cover" />
        {block.caption && <figcaption className="text-center text-sm text-neutral-400 mt-2">{block.caption}</figcaption>}
      </figure>
    )
    case "youtube": return (
      <div key={i} className="my-8 aspect-video rounded-xl overflow-hidden bg-neutral-100">
        <iframe src={`https://www.youtube.com/embed/${block.videoId}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Video" />
      </div>
    )
    case "table": return (
      <div key={i} className="my-6 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>{(block.headers || []).map((h, ci) => <th key={ci} className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wide border-b border-neutral-200">{h}</th>)}</tr>
          </thead>
          <tbody>
            {(block.rows || []).map((row, ri) => (
              <tr key={ri} className="border-b border-neutral-100 last:border-0">
                {row.map((cell, ci) => <td key={ci} className="px-4 py-3 text-neutral-700">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    case "ul": return <ul key={i} className="my-4 ml-5 space-y-1.5 list-disc list-outside text-neutral-700 text-[17px]">{(block.items || []).map((item, idx) => <li key={idx} className="leading-relaxed pl-1">{item}</li>)}</ul>
    case "ol": return <ol key={i} className="my-4 ml-5 space-y-1.5 list-decimal list-outside text-neutral-700 text-[17px]">{(block.items || []).map((item, idx) => <li key={idx} className="leading-relaxed pl-1">{item}</li>)}</ol>
    case "code": return (
      <div key={i} className="my-6 rounded-xl overflow-hidden">
        <div className="bg-neutral-900 px-4 py-2 flex items-center border-b border-neutral-800">
          <span className="text-xs text-neutral-400 font-mono">{block.lang || "code"}</span>
        </div>
        <pre className="bg-neutral-950 p-4 overflow-x-auto"><code className="text-emerald-400 font-mono text-sm leading-relaxed">{block.text || ""}</code></pre>
      </div>
    )
    default: return null
  }
}

function renderLegacyContent(content: string[]): React.ReactNode {
  return content.map((block, i) => {
    if (block.startsWith("## ")) {
      return <h2 key={i} className="text-2xl font-bold text-neutral-900 mt-10 mb-4">{block.replace("## ", "")}</h2>
    }
    const hasLineBreaks = block.includes("\n")
    if (hasLineBreaks) {
      return (
        <div key={i} className="my-4 space-y-2">
          {block.split("\n").map((line, j) => (
            <p key={j} className="text-neutral-700 leading-relaxed text-[17px]">{renderInlineMarkdown(line)}</p>
          ))}
        </div>
      )
    }
    return <p key={i} className="text-neutral-700 leading-relaxed my-4 text-[17px]">{renderInlineMarkdown(block)}</p>
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

async function fetchSiblingPosts(slug: string, category: string) {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("slug, title")
      .eq("is_published", true)
      .eq("category", category)
      .neq("slug", slug)
      .order("published_at", { ascending: false })
      .limit(2)
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

  const title = (dbPost?.seo_title || staticPost?.seo_title || source.title)?.replace(/ \| Storelib(?: Blog)?$/i, "") || source.title
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
      siteName: "Storelib",
      publishedTime: source.published_at || undefined,
      section: source.category || undefined,
      tags: keywords ? keywords.split(",").map((k: string) => k.trim()) : undefined,
      images: cover ? [{ url: cover, width: 1200, height: 630 }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, ...(cover ? { images: [cover] } : {}) },
    alternates: { canonical: `https://storelib.com/blog/${slug}` },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  }
}

export async function generateStaticParams() {
  const slugs = new Set(Object.keys(BLOG_POSTS))
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from("blog_posts").select("slug").eq("is_published", true)
    ;(data || []).forEach((p: { slug: string }) => slugs.add(p.slug))
  } catch {}
  return [...slugs].map(slug => ({ slug }))
}

function getRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} days ago`
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m > 1 ? "s" : ""} ago` }
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const dbPost = await fetchPost(slug)
  const staticData = BLOG_POSTS[slug]
  if (!dbPost && !staticData) notFound()

  const post = {
    id: dbPost?.id as string | undefined,
    title: (dbPost?.title || staticData?.title) as string,
    excerpt: (dbPost?.excerpt || staticData?.excerpt) as string,
    category: (dbPost?.category || staticData?.category) as string,
    published_at: (dbPost?.published_at || staticData?.published_at) as string,
    read_time: (dbPost?.read_time || staticData?.read_time) as string,
    cover_image_url: dbPost?.cover_image_url as string | undefined,
    author: (dbPost?.author_name || dbPost?.author || DEFAULT_AUTHOR.name) as string,
    content: dbPost?.content as Block[] | undefined,
    legacyContent: !dbPost ? staticData?.content : undefined,
  }

  const siblings = await fetchSiblingPosts(slug, post.category)

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.published_at,
    dateModified: post.published_at,
    author: { "@type": "Person", name: post.author || DEFAULT_AUTHOR.name },
    publisher: { "@type": "Organization", name: "Storelib", url: "https://storelib.com", logo: { "@type": "ImageObject", url: storelibLogoUrl(), width: 512, height: 512 } },
    url: `https://storelib.com/blog/${slug}`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://storelib.com/blog/${slug}` },
    ...(post.cover_image_url ? { image: { "@type": "ImageObject", url: post.cover_image_url, width: 1200, height: 630 } } : {}),
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: "https://storelib.com/blog" },
      { "@type": "ListItem", position: 2, name: post.category, item: `https://storelib.com/blog/explore/categories/${categoryToSlug(post.category)}` },
      { "@type": "ListItem", position: 3, name: post.title, item: `https://storelib.com/blog/${slug}` },
    ],
  }

  return (
    <div className="min-h-screen bg-white">
      <ReadingProgress />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }} />
      {post.id && <BlogPostTracker postId={post.id} />}

      {/* Article container */}
      <article className="max-w-2xl lg:max-w-[806px] mx-auto px-5 sm:px-6 pt-10 pb-20">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-7">
          <Link
            href={post.category ? `/blog/explore/categories/${categoryToSlug(post.category)}` : "/blog"}
            className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            {post.category || "All Articles"}
          </Link>
        </nav>

        {/* Category pill */}
        <div className="mb-5">
          <Link
            href={`/blog/explore/categories/${categoryToSlug(post.category)}`}
            className="inline-block px-3 py-1 rounded-full border border-neutral-300 text-xs font-medium text-neutral-700 hover:border-neutral-500 transition-colors"
          >
            {post.category}
          </Link>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 tracking-tight leading-tight mb-5">
          {post.title}
        </h1>

        {/* Meta */}
        <p className="text-sm text-neutral-400 mb-7">
          {post.published_at ? getRelativeDate(post.published_at) : ""}
          {post.read_time ? ` · ${post.read_time}` : ""}
        </p>

        {/* Cover image */}
        {post.cover_image_url && (
          <div className="mb-8 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="w-full object-cover"
            />
          </div>
        )}

        {/* Article body */}
        <section className="pb-4">
          {post.content && Array.isArray(post.content)
            ? post.content.map((block: Block, i: number) => renderBlock(block, i))
            : post.legacyContent
              ? renderLegacyContent(post.legacyContent)
              : null}
        </section>

        {/* Share buttons */}
        <ShareButtons slug={slug} title={post.title} />

        {/* Author card */}
        <div className="mt-10 pt-10 border-t border-neutral-100 flex items-start gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0 flex items-center justify-center border border-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DEFAULT_AUTHOR.avatar}
              alt={post.author}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-neutral-900 text-sm">{post.author}</div>
            <p className="text-neutral-500 text-sm mt-0.5 leading-relaxed">{DEFAULT_AUTHOR.bio}</p>
            <div className="flex items-center gap-3 mt-2">
              <a href={DEFAULT_AUTHOR.twitter} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-900 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href={DEFAULT_AUTHOR.linkedin} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-900 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
              <a href={DEFAULT_AUTHOR.website} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-900 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </a>
            </div>
          </div>
        </div>

        {/* More from this category */}
        {siblings.length > 0 && (
          <div className="mt-14">
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
              More in {post.category}
            </h3>
            <div className="space-y-3">
              {siblings.map((s: { slug: string; title: string }) => (
                <Link
                  key={s.slug}
                  href={`/blog/${s.slug}`}
                  className="block group"
                >
                  <span className="text-neutral-900 font-medium group-hover:underline underline-offset-2 text-[15px]">{s.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA Banner */}
        <CtaBanner />

        {/* Back to blog */}
        <div className="mt-12 pt-8 border-t border-neutral-100">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Blog
          </Link>
        </div>
      </article>
    </div>
  )
}
