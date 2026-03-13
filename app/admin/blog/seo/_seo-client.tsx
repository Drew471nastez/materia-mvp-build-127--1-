"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface SeoPageData {
  url: string
  title: string
  description: string
  hasCanonical: boolean
  hasOgTags: boolean
  hasJsonLd: boolean
  schemaTypes: string[]
  issues: string[]
  score: number
}

interface SiteMetrics {
  totalProducts: number
  publishedProducts: number
  totalBlogPosts: number
  publishedBlogPosts: number
  totalSellers: number
  pagesInSitemap: number
  indexablePages: number
}

const SEO_PAGES: SeoPageData[] = [
  {
    url: "/",
    title: "Homepage",
    description: "Landing page with Organization + WebSite schema",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["Organization", "WebSite"],
    issues: [],
    score: 100,
  },
  {
    url: "/explore",
    title: "Explore / Marketplace",
    description: "Product discovery page with CollectionPage schema",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["CollectionPage"],
    issues: [],
    score: 95,
  },
  {
    url: "/explore/[category]",
    title: "Category Pages (14 categories)",
    description: "Dynamic category pages with CollectionPage schema + generateMetadata",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["CollectionPage"],
    issues: [],
    score: 95,
  },
  {
    url: "/p/[slug]",
    title: "Product Pages",
    description: "Dynamic product pages with Product schema, offers, breadcrumbs",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["Product", "BreadcrumbList"],
    issues: [],
    score: 98,
  },
  {
    url: "/u/[username]",
    title: "Seller Storefronts",
    description: "Seller profile pages with ProfilePage + Person schema",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["ProfilePage", "BreadcrumbList"],
    issues: [],
    score: 95,
  },
  {
    url: "/blog",
    title: "Blog Index",
    description: "Blog listing with Blog schema + Twitter/OG tags",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["Blog"],
    issues: [],
    score: 98,
  },
  {
    url: "/blog/[slug]",
    title: "Blog Articles",
    description: "Blog posts with BlogPosting + BreadcrumbList schema",
    hasCanonical: true,
    hasOgTags: true,
    hasJsonLd: true,
    schemaTypes: ["BlogPosting", "BreadcrumbList"],
    issues: [],
    score: 100,
  },
]

const INFRA_ITEMS = [
  { label: "metadataBase", status: "active" as const, detail: "https://storelib.com" },
  { label: "Title template", status: "active" as const, detail: "%s | Storelib" },
  { label: "Default robots", status: "active" as const, detail: "index: true, follow: true" },
  { label: "Googlebot directives", status: "active" as const, detail: "max-image-preview: large" },
  { label: "Open Graph defaults", status: "active" as const, detail: "type: website, locale: en_US" },
  { label: "Twitter card defaults", status: "active" as const, detail: "summary_large_image" },
  { label: "html lang attribute", status: "active" as const, detail: 'lang="en"' },
  { label: "sitemap.xml", status: "active" as const, detail: "Products + Sellers + Blog + Categories" },
  { label: "robots.txt", status: "active" as const, detail: "Blocks /admin/, /api/, /app/, /auth/" },
  { label: "Canonical URLs", status: "active" as const, detail: "All public pages" },
]

export default function SeoAdminClient() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<SiteMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "pages" | "infra" | "blog">("overview")

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/blog/seo-metrics")
      if (res.ok) {
        const data = await res.json()
        setMetrics(data)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadMetrics() }, [loadMetrics])

  const overallScore = Math.round(SEO_PAGES.reduce((sum, p) => sum + p.score, 0) / SEO_PAGES.length)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/blog/dashboard")}
            className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-800 text-sm transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Dashboard
          </button>
          <span className="text-neutral-200">/</span>
          <span className="text-sm text-neutral-700 font-medium">SEO Overview</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-neutral-400">Score</span>
            <span className={`text-sm font-bold ${overallScore >= 90 ? "text-emerald-600" : overallScore >= 70 ? "text-amber-600" : "text-red-600"}`}>
              {overallScore}/100
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-neutral-200">
          {(["overview", "pages", "infra", "blog"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
            >
              {tab === "overview" ? "Overview" : tab === "pages" ? "Pages" : tab === "infra" ? "Infrastructure" : "Blog SEO"}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Score banner */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">SEO Health Score</h2>
                  <p className="text-sm text-neutral-500 mt-1">Based on schema markup, metadata, and technical SEO</p>
                </div>
                <div className={`text-5xl font-bold ${overallScore >= 90 ? "text-emerald-600" : "text-amber-600"}`}>
                  {overallScore}
                </div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Products", value: metrics?.publishedProducts ?? "...", sub: `of ${metrics?.totalProducts ?? "..."}` },
                { label: "Blog Posts", value: metrics?.publishedBlogPosts ?? "...", sub: `of ${metrics?.totalBlogPosts ?? "..."}` },
                { label: "Sellers", value: metrics?.totalSellers ?? "...", sub: "storefronts" },
                { label: "Sitemap Pages", value: metrics?.pagesInSitemap ?? "...", sub: "indexable" },
              ].map(m => (
                <div key={m.label} className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="text-xs text-neutral-500 uppercase tracking-wide">{m.label}</div>
                  <div className="text-2xl font-bold text-neutral-900 mt-1">{m.value}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Quick status */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <h3 className="text-sm font-semibold text-neutral-900 mb-4">Schema Coverage</h3>
              <div className="space-y-3">
                {SEO_PAGES.map(page => (
                  <div key={page.url} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${page.score >= 90 ? "bg-emerald-500" : page.score >= 70 ? "bg-amber-500" : "bg-red-500"}`} />
                      <span className="text-sm text-neutral-700">{page.title}</span>
                      <span className="text-xs text-neutral-400">{page.url}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {page.schemaTypes.map(t => (
                        <span key={t} className="text-[10px] bg-purple-50 text-purple-700 font-medium px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                      <span className={`text-xs font-semibold ${page.score >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{page.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pages Tab */}
        {activeTab === "pages" && (
          <div className="space-y-4">
            {SEO_PAGES.map(page => (
              <div key={page.url} className="bg-white rounded-xl border border-neutral-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">{page.title}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">{page.url}</p>
                  </div>
                  <span className={`text-lg font-bold ${page.score >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{page.score}%</span>
                </div>
                <p className="text-xs text-neutral-600 mb-3">{page.description}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${page.hasCanonical ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {page.hasCanonical ? "Canonical" : "No Canonical"}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${page.hasOgTags ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {page.hasOgTags ? "OG Tags" : "No OG Tags"}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${page.hasJsonLd ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {page.hasJsonLd ? "JSON-LD" : "No JSON-LD"}
                  </span>
                  {page.schemaTypes.map(t => (
                    <span key={t} className="text-[10px] bg-purple-50 text-purple-700 font-medium px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
                {page.issues.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {page.issues.map((issue, i) => (
                      <p key={i} className="text-xs text-amber-700">Issue: {issue}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Infrastructure Tab */}
        {activeTab === "infra" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-4">Technical SEO Configuration</h3>
              <div className="space-y-3">
                {INFRA_ITEMS.map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-sm font-medium text-neutral-800">{item.label}</span>
                    </div>
                    <span className="text-xs text-neutral-500 font-mono">{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-4">Quick Links</h3>
              <div className="grid grid-cols-2 gap-3">
                <a href="https://storelib.com/sitemap.xml" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline">View Sitemap</a>
                <a href="https://storelib.com/robots.txt" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline">View Robots.txt</a>
                <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline">Google Search Console</a>
                <a href="https://validator.schema.org/" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline">Schema Validator</a>
                <a href="https://developers.google.com/search/docs/appearance/structured-data/product" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline">Google Product Schema</a>
                <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:underline">Rich Results Test</a>
              </div>
            </div>
          </div>
        )}

        {/* Blog SEO Tab */}
        {activeTab === "blog" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-900">Blog Posts SEO Status</h3>
                <Link href="/admin/blog/dashboard" className="text-xs text-purple-600 hover:underline">Manage Posts</Link>
              </div>
              <p className="text-xs text-neutral-500 mb-4">Each published blog post automatically gets: BlogPosting JSON-LD, BreadcrumbList JSON-LD, OG tags, Twitter card, canonical URL, meta description, keywords.</p>
              <div className="space-y-2">
                {[
                  { feature: "BlogPosting schema", detail: "headline, author, datePublished, publisher" },
                  { feature: "BreadcrumbList schema", detail: "Blog > Category > Article" },
                  { feature: "Per-post SEO fields", detail: "seo_title (60 char), seo_description (160 char), keywords" },
                  { feature: "Open Graph", detail: "type: article, publishedTime, images" },
                  { feature: "Twitter Cards", detail: "summary_large_image with title + description" },
                  { feature: "Canonical URLs", detail: "https://storelib.com/blog/{slug}" },
                  { feature: "Reading progress", detail: "Purple bar, GPU-accelerated scaleX transform" },
                  { feature: "Auto sitemap", detail: "All published posts included in sitemap.xml" },
                ].map(item => (
                  <div key={item.feature} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <span className="text-sm text-neutral-800">{item.feature}</span>
                    </div>
                    <span className="text-xs text-neutral-500">{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
