"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AppAvatar } from "@/components/app/app-avatar"
import { onePageUrl, onePageUrlDisplay } from "@/lib/onepage/address"
import { FillBar } from "@/components/ui/fill-bar"

interface Creator {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  joined_at: string | null
  country: string | null
  product_count: number
  has_published_products: boolean
  onepage_slug: string | null
  onepage_title: string | null
}

interface BlogPost {
  id: string
  slug: string
  title: string
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
  published_at: string | null
  views: number
}

interface SiteMetrics {
  totalProducts: number
  publishedProducts: number
  totalBlogPosts: number
  publishedBlogPosts: number
  totalSellers: number
  pagesInSitemap: number
  indexablePages: number
  creators: Creator[]
  recentPosts: BlogPost[]
}

interface PageSeoData {
  url: string
  title: string
  description: string
  hasCanonical: boolean
  hasOgTags: boolean
  hasJsonLd: boolean
  schemaTypes: string[]
  score: number
  editableTitle: string
  editableDescription: string
}

const SEO_PAGES: PageSeoData[] = [
  { url: "/", title: "Homepage", description: "Organization + WebSite (SearchAction) JSON-LD, OG tags, Twitter card", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["Organization", "WebSite"], score: 100, editableTitle: "Storelib — Sell Digital Products Online", editableDescription: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience." },
  { url: "/explore", title: "Explore / Marketplace", description: "CollectionPage JSON-LD, absolute canonical, OG tags", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["CollectionPage"], score: 95, editableTitle: "Explore Digital Products | Storelib", editableDescription: "Browse thousands of digital products — templates, tools, courses, music, and more from independent creators." },
  { url: "/explore/[category]", title: "Category Pages (×14)", description: "CollectionPage JSON-LD + generateMetadata per category, canonical per category", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["CollectionPage"], score: 95, editableTitle: "{Category} Digital Products | Storelib", editableDescription: "Browse {category} digital products on Storelib — curated tools, templates, and resources from top creators." },
  { url: "/p/[slug]", title: "Product Pages", description: "Product JSON-LD with offers + BreadcrumbList, canonical, per-product OG image", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["Product", "BreadcrumbList"], score: 98, editableTitle: "{Product Name} by {Seller} | Storelib", editableDescription: "{Product description excerpt} — available on Storelib." },
  { url: "/u/[username]", title: "Seller Storefronts", description: "ProfilePage + Person + BreadcrumbList JSON-LD, canonical per creator", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["ProfilePage", "BreadcrumbList"], score: 95, editableTitle: "{Creator Name} | Storelib", editableDescription: "Shop {Creator Name}'s digital products on Storelib." },
  { url: "/blog", title: "Blog Index", description: "Blog JSON-LD, OG tags, Twitter card, canonical", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["Blog"], score: 98, editableTitle: "Blog — Storelib", editableDescription: "Creator tips, digital product strategies, and platform updates from the Storelib team." },
  { url: "/blog/[slug]", title: "Blog Articles", description: "BlogPosting + BreadcrumbList JSON-LD, per-post seo_title/seo_description fields, canonical", hasCanonical: true, hasOgTags: true, hasJsonLd: true, schemaTypes: ["BlogPosting", "BreadcrumbList"], score: 100, editableTitle: "{SEO Title} | Storelib Blog", editableDescription: "{SEO description from post}" },
  { url: "/pricing", title: "Pricing Page", description: "Title template, OG tags, canonical — no JSON-LD schema (opportunity)", hasCanonical: true, hasOgTags: true, hasJsonLd: false, schemaTypes: [], score: 80, editableTitle: "Pricing — Storelib", editableDescription: "Simple, transparent pricing for creators. Start free, upgrade when you're ready." },
  { url: "/features", title: "Features Page", description: "Title template, OG tags — no JSON-LD schema (opportunity)", hasCanonical: true, hasOgTags: true, hasJsonLd: false, schemaTypes: [], score: 80, editableTitle: "Features — Storelib", editableDescription: "Everything you need to sell digital products online. Store builder, payments, analytics, and more." },
]

const INFRA_ITEMS = [
  { label: "metadataBase", detail: "https://storelib.com", file: "app/layout.tsx" },
  { label: "Title template", detail: '"%s | Storelib"', file: "app/layout.tsx" },
  { label: "html lang attribute", detail: 'lang="en"', file: "app/layout.tsx" },
  { label: "Default robots", detail: "index: true, follow: true", file: "app/layout.tsx" },
  { label: "Googlebot max-image-preview", detail: "large", file: "app/layout.tsx" },
  { label: "OG type default", detail: "website, locale: en_US", file: "app/layout.tsx" },
  { label: "Twitter card default", detail: "summary_large_image", file: "app/layout.tsx" },
  { label: "sitemap.xml", detail: "Products + Sellers + Blog + 14 categories + static pages", file: "lib/seo/sitemaps.ts" },
  { label: "robots.txt", detail: "Blocks /admin/ /api/ /app/ /auth/ + filter/sort params", file: "app/robots.ts" },
  { label: "Canonical URLs", detail: "All public dynamic pages — absolute URLs", file: "multiple" },
  { label: "Subdomain rewrite", detail: "username.storelib.com/ → /u/username (no redirect)", file: "middleware.ts" },
  { label: "Organization JSON-LD", detail: "Homepage", file: "app/(marketing)/page.tsx" },
  { label: "WebSite + SearchAction", detail: "Homepage — enables Google Sitelinks searchbox", file: "app/(marketing)/page.tsx" },
  { label: "Product JSON-LD", detail: "name, price, availability, seller, BreadcrumbList", file: "app/(marketing)/p/[slug]/page.tsx" },
  { label: "ProfilePage JSON-LD", detail: "Seller storefronts + BreadcrumbList", file: "app/(marketing)/u/[username]/page.tsx" },
  { label: "CollectionPage JSON-LD", detail: "Explore + all 14 category pages", file: "app/(marketing)/explore/**" },
  { label: "BlogPosting JSON-LD", detail: "All published blog articles + BreadcrumbList", file: "app/(marketing)/blog/[slug]/**" },
]

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length
  const cls = len > max ? "text-red-600" : len > max * 0.9 ? "text-amber-500" : "text-neutral-400"
  return <span className={`text-[10px] font-mono tabular-nums ${cls}`}>{len}/{max}</span>
}

function ScorePill({ score }: { score: number }) {
  const cls = score >= 95 ? "bg-emerald-50 text-emerald-700" : score >= 80 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
  const dot = score >= 95 ? "bg-emerald-500" : score >= 80 ? "bg-amber-400" : "bg-red-500"
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {score}%
    </span>
  )
}

export default function SeoAdminClient() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<SiteMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "creators" | "pages" | "infra" | "blog">("overview")

  const [creatorSearch, setCreatorSearch] = useState("")
  const [creatorSort, setCreatorSort] = useState<"newest" | "oldest" | "products" | "az">("newest")
  const [editingCreator, setEditingCreator] = useState<string | null>(null)
  const [creatorEdits, setCreatorEdits] = useState<Record<string, { seo_title: string; seo_description: string }>>({})
  const [savingCreator, setSavingCreator] = useState<string | null>(null)
  const [savedCreators, setSavedCreators] = useState<Set<string>>(new Set())

  const [editingPage, setEditingPage] = useState<string | null>(null)
  const [pageEdits, setPageEdits] = useState<Record<string, { title: string; description: string }>>({})
  const [savingPage, setSavingPage] = useState<string | null>(null)
  const [savedPages, setSavedPages] = useState<Set<string>>(new Set())

  const [editingPost, setEditingPost] = useState<string | null>(null)
  const [postEdits, setPostEdits] = useState<Record<string, { seo_title: string; seo_description: string }>>({})
  const [savingPost, setSavingPost] = useState<string | null>(null)
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set())
  const [postSearch, setPostSearch] = useState("")

  // Creator products state
  const [expandedCreator, setExpandedCreator] = useState<string | null>(null)

  /**
   * Bulk moderation.
   *
   * `selected` holds creator ids rather than usernames: a username can be
   * changed, and a moderation action that resolves by name would act on
   * whoever holds it at the moment the request lands rather than on whoever
   * was reviewed.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moderating, setModerating] = useState(false)
  const [moderationNote, setModerationNote] = useState<string | null>(null)
  /** A window, for clearing a wave in one decision rather than four hundred. */
  const [rangeFrom, setRangeFrom] = useState("")
  const [rangeTo, setRangeTo] = useState("")
  const [creatorProducts, setCreatorProducts] = useState<Record<string, any[]>>({})
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null)
  const [deletingProduct, setDeletingProduct] = useState<string | null>(null)

  /**
   * A dry run, then a question, then the action.
   *
   * The count comes back from the server and is echoed to it, so a set that
   * moved between reading and confirming is refused rather than acted on.
   */
  const moderate = useCallback(
    async (action: "ban" | "unban" | "delete", useRange = false) => {
      const ids = [...selected]
      if (!useRange && ids.length === 0) return
      if (useRange && !rangeFrom && !rangeTo) {
        setModerationNote("Set a date to act on.")
        return
      }

      setModerating(true)
      setModerationNote(null)
      try {
        /**
         * The window is sent, not the ids it resolved to. The server resolves
         * it again when acting, so a range that gained a member since the
         * preview produces a different count and the echo refuses it — which
         * is the point of the echo.
         */
        const query = useRange
          ? `from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
          : `ids=${ids.join(",")}`
        const preview = await fetch(`/api/admin/creators/moderate?${query}`)
        const plan = await preview.json()
        if (!preview.ok) {
          setModerationNote(plan.error || "Could not read what this would affect.")
          return
        }

        const names = (plan.targets || [])
          .slice(0, 6)
          .map((t: { username: string | null }) => "@" + (t.username || "unknown"))
          .join(", ")
        const more = plan.count > 6 ? ` and ${plan.count - 6} more` : ""
        const orders = plan.withOrders > 0 ? `\n\n${plan.withOrders} of them have orders.` : ""

        const verb =
          action === "delete"
            ? "PERMANENTLY DELETE"
            : action === "ban"
              ? "Ban"
              : "Unban"
        const consequence =
          action === "delete"
            ? "\n\nThis removes their account, products, files and buyers' records. It cannot be undone."
            : action === "ban"
              ? "\n\nTheir storefront closes and their published products are unpublished. This can be reversed."
              : ""

        if (!window.confirm(`${verb} ${plan.count} creator${plan.count === 1 ? "" : "s"}?\n\n${names}${more}${orders}${consequence}`)) {
          return
        }

        const reason =
          action === "unban" ? null : window.prompt("Reason (kept in the moderation log):", "") ?? null

        const response = await fetch("/api/admin/creators/moderate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useRange
              ? { action, from: rangeFrom || undefined, to: rangeTo || undefined, confirm: plan.count, reason }
              : { action, creatorIds: ids, confirm: plan.count, reason },
          ),
        })
        const result = await response.json()

        if (!response.ok) {
          setModerationNote(result.error || "That did not go through.")
          return
        }

        setModerationNote(
          `${action === "delete" ? "Deleted" : action === "ban" ? "Banned" : "Unbanned"} ${result.done}` +
            (result.failed?.length ? ` — ${result.failed.length} failed.` : "."),
        )
        setSelected(new Set())
        // Declared below; referenced from inside the callback, which runs long
        // after. It is deliberately not a dependency — adding it would put a
        // later `const` in an array evaluated during this render.
        void loadMetrics()
      } catch {
        setModerationNote("That did not go through.")
      } finally {
        setModerating(false)
      }
    },
    [selected, rangeFrom, rangeTo],
  )

  const loadCreatorProducts = useCallback(async (creatorId: string) => {
    if (creatorProducts[creatorId]) {
      setExpandedCreator(expandedCreator === creatorId ? null : creatorId)
      return
    }
    setLoadingProducts(creatorId)
    setExpandedCreator(creatorId)
    try {
      const res = await fetch(`/api/admin/blog/seo-metrics?creatorProducts=${creatorId}`)
      if (res.ok) {
        const data = await res.json()
        setCreatorProducts(prev => ({ ...prev, [creatorId]: data.products || [] }))
      }
    } catch {}
    setLoadingProducts(null)
  }, [creatorProducts, expandedCreator])

  const deleteProduct = useCallback(async (productId: string, creatorId: string) => {
    if (!confirm("Delete this product permanently? This cannot be undone.")) return
    setDeletingProduct(productId)
    try {
      const res = await fetch(`/api/admin/blog/seo-metrics?deleteProduct=${productId}`, { method: "DELETE" })
      if (res.ok) {
        setCreatorProducts(prev => ({
          ...prev,
          [creatorId]: (prev[creatorId] || []).filter(p => p.id !== productId)
        }))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`Failed to delete: ${data.error || "Unknown error"}`)
      }
    } catch {}
    setDeletingProduct(null)
  }, [])

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const [metricsRes, settingsRes] = await Promise.all([
        fetch("/api/admin/blog/seo-metrics"),
        fetch("/api/admin/blog/seo-settings"),
      ])
      if (metricsRes.ok) setMetrics(await metricsRes.json())
      if (settingsRes.ok) {
        const { settings } = await settingsRes.json()
        const creatorMap: Record<string, { seo_title: string; seo_description: string }> = {}
        const pageMap: Record<string, { title: string; description: string }> = {}
        for (const s of (settings || [])) {
          if (s.type === "creator") {
            creatorMap[s.identifier] = { seo_title: s.seo_title || "", seo_description: s.seo_description || "" }
          } else if (s.type === "page") {
            pageMap[s.identifier] = { title: s.seo_title || "", description: s.seo_description || "" }
          }
        }
        setCreatorEdits(creatorMap)
        setPageEdits(pageMap)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadMetrics() }, [loadMetrics])

  const overallScore = Math.round(SEO_PAGES.reduce((s, p) => s + p.score, 0) / SEO_PAGES.length)

  async function saveCreatorSeo(username: string) {
    setSavingCreator(username)
    try {
      const edits = creatorEdits[username] || { seo_title: "", seo_description: "" }
      const res = await fetch("/api/admin/blog/seo-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "creator", username, ...edits }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`Failed to save creator SEO: ${err.error || "Unknown error"}`)
        return
      }
    } catch {
      alert("Network error saving creator SEO")
      return
    } finally {
      setSavingCreator(null)
    }
    setSavedCreators(s => new Set([...s, username]))
    setEditingCreator(null)
    setTimeout(() => setSavedCreators(s => { const n = new Set(s); n.delete(username); return n }), 3000)
  }

  async function savePageSeo(url: string) {
    setSavingPage(url)
    try {
      const edits = pageEdits[url] || {}
      const res = await fetch("/api/admin/blog/seo-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "page", url, ...edits }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`Failed to save page SEO: ${err.error || "Unknown error"}`)
        return
      }
    } catch {
      alert("Network error saving page SEO")
      return
    } finally {
      setSavingPage(null)
    }
    setSavedPages(s => new Set([...s, url]))
    setEditingPage(null)
    setTimeout(() => setSavedPages(s => { const n = new Set(s); n.delete(url); return n }), 3000)
  }

  async function savePostSeo(post: BlogPost) {
    setSavingPost(post.id)
    try {
      const edits = postEdits[post.id] || { seo_title: post.seo_title || "", seo_description: post.seo_description || "" }
      const res = await fetch(`/api/admin/blog/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seo_title: edits.seo_title || null, seo_description: edits.seo_description || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(`Failed to save post SEO: ${err.error || "Unknown error"}`)
        return
      }
      setMetrics(m => m ? { ...m, recentPosts: m.recentPosts.map(p => p.id === post.id ? { ...p, seo_title: edits.seo_title || null, seo_description: edits.seo_description || null } : p) } : m)
    } catch {
      alert("Network error saving post SEO")
      return
    } finally {
      setSavingPost(null)
    }
    setSavedPosts(s => new Set([...s, post.id]))
    setEditingPost(null)
    setTimeout(() => setSavedPosts(s => { const n = new Set(s); n.delete(post.id); return n }), 3000)
  }

  const filteredCreators = (metrics?.creators || [])
    .filter(c =>
      !creatorSearch || c.username?.toLowerCase().includes(creatorSearch.toLowerCase()) || c.display_name?.toLowerCase().includes(creatorSearch.toLowerCase())
    )
    .sort((a, b) => {
      if (creatorSort === "newest") return new Date(b.joined_at ?? 0).getTime() - new Date(a.joined_at ?? 0).getTime()
      if (creatorSort === "oldest") return new Date(a.joined_at ?? 0).getTime() - new Date(b.joined_at ?? 0).getTime()
      if (creatorSort === "products") return b.product_count - a.product_count
      if (creatorSort === "az") return (a.display_name || a.username || "").localeCompare(b.display_name || b.username || "")
      return 0
    })

  const filteredPosts = (metrics?.recentPosts || []).filter(p =>
    !postSearch || p.title?.toLowerCase().includes(postSearch.toLowerCase()) || p.slug?.toLowerCase().includes(postSearch.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <header className="sticky top-0 z-20 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/admin/blog/dashboard")} className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-800 text-sm transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Dashboard
          </button>
          <span className="text-neutral-300">/</span>
          <span className="text-sm font-semibold text-neutral-700">SEO Manager</span>
          <div className="ml-auto flex items-center gap-3">
            <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline hidden sm:inline">Search Console</a>
            <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline hidden sm:inline">Rich Results</a>
            <span className="text-xs text-neutral-400">Score</span>
            <span className={`text-sm font-bold ${overallScore >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{overallScore}/100</span>
            <button onClick={loadMetrics} className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors" title="Refresh data">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="flex gap-0 mb-6 border-b border-neutral-200 overflow-x-auto">
          {([
            { id: "overview", label: "Overview" },
            { id: "creators", label: `Creators${metrics ? ` (${metrics.totalSellers})` : ""}` },
            { id: "pages", label: "Pages" },
            { id: "infra", label: "Infrastructure" },
            { id: "blog", label: `Blog Posts${metrics ? ` (${metrics.totalBlogPosts})` : ""}` },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">SEO Health Score</h2>
                  <p className="text-sm text-neutral-500 mt-1">Based on schema coverage, metadata quality, and technical infrastructure</p>
                </div>
                <div className="text-right">
                  <div className={`text-5xl font-bold ${overallScore >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{overallScore}</div>
                  <div className="text-xs text-neutral-400 mt-1">out of 100</div>
                </div>
              </div>
              <FillBar quiet value={overallScore} size="thick" tone={overallScore >= 90 ? "positive" : "warning"} className="mt-4" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {loading ? Array(4).fill(0).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-neutral-200 p-4 animate-pulse h-20" />
              )) : [
                { label: "Published Products", value: metrics?.publishedProducts ?? 0, sub: `${metrics?.totalProducts ?? 0} total` },
                { label: "Published Blog Posts", value: metrics?.publishedBlogPosts ?? 0, sub: `${metrics?.totalBlogPosts ?? 0} total` },
                { label: "Creator Storefronts", value: metrics?.totalSellers ?? 0, sub: "indexed profiles" },
                { label: "Sitemap Pages", value: metrics?.pagesInSitemap ?? 0, sub: `${metrics?.indexablePages ?? 0} indexable`, green: true },
              ].map(m => (
                <div key={m.label} className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="text-xs text-neutral-500 font-medium">{m.label}</div>
                  <div className={`text-2xl font-bold mt-1 ${(m as { green?: boolean }).green ? "text-emerald-600" : "text-neutral-900"}`}>{(m.value as number).toLocaleString()}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{m.sub}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-sm font-semibold text-neutral-900 mb-4">Schema Coverage per Page Type</h3>
              <div className="divide-y divide-neutral-50">
                {SEO_PAGES.map(page => (
                  <div key={page.url} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <ScorePill score={page.score} />
                      <span className="text-sm font-medium text-neutral-800">{page.title}</span>
                      <code className="text-[10px] text-neutral-400 font-mono hidden sm:inline">{page.url}</code>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {page.hasCanonical && <span className="text-[10px] bg-emerald-50 text-emerald-700 font-medium px-1.5 py-0.5 rounded">canonical</span>}
                      {page.hasOgTags && <span className="text-[10px] bg-blue-50 text-blue-700 font-medium px-1.5 py-0.5 rounded">OG</span>}
                      {page.schemaTypes.map(t => <span key={t} className="text-[10px] bg-purple-50 text-purple-700 font-medium px-1.5 py-0.5 rounded">{t}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: "Live Sitemap", href: "https://storelib.com/sitemap.xml", sub: "View all indexed pages" },
                { label: "Robots.txt", href: "https://storelib.com/robots.txt", sub: "Crawl rules" },
                { label: "Google Search Console", href: "https://search.google.com/search-console", sub: "Monitor indexing" },
                { label: "Schema Validator", href: "https://validator.schema.org/", sub: "Test JSON-LD" },
                { label: "Rich Results Test", href: "https://search.google.com/test/rich-results", sub: "Preview snippets" },
                { label: "PageSpeed Insights", href: "https://pagespeed.web.dev/", sub: "Core Web Vitals" },
              ].map(link => (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                  className="bg-white rounded-xl border border-neutral-200 p-4 hover:border-purple-300 hover:bg-purple-50/50 transition-colors group">
                  <div className="text-sm font-medium text-neutral-800 group-hover:text-purple-700">{link.label} →</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{link.sub}</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── CREATORS ─────────────────────────────────────────── */}
        {activeTab === "creators" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">{loading ? "…" : filteredCreators.length} creator storefronts</h2>
                {selected.size > 0 && (
                  /**
                   * Shown only when something is selected, and the destructive
                   * button is not the one nearest the thumb. Ban is the default
                   * answer for nearly everything: it stops the account without
                   * destroying the buyers' records attached to it.
                   */
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                    <span className="text-xs font-medium text-neutral-700">
                      {selected.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="text-xs text-neutral-500 hover:text-neutral-800"
                    >
                      Clear
                    </button>
                    <span className="flex-1" />
                    <button
                      type="button"
                      disabled={moderating}
                      onClick={() => moderate("ban")}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Ban &amp; unpublish
                    </button>
                    <button
                      type="button"
                      disabled={moderating}
                      onClick={() => moderate("unban")}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
                    >
                      Unban
                    </button>
                    <button
                      type="button"
                      disabled={moderating}
                      onClick={() => moderate("delete")}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete permanently
                    </button>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 px-3 py-2">
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      Signed up from
                    </label>
                    <input
                      type="date"
                      value={rangeFrom}
                      onChange={(event) => setRangeFrom(event.target.value)}
                      className="mt-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      Up to (leave blank for now)
                    </label>
                    <input
                      type="date"
                      value={rangeTo}
                      onChange={(event) => setRangeTo(event.target.value)}
                      className="mt-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={moderating}
                    onClick={() => moderate("ban", true)}
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Ban everyone in range
                  </button>
                  <button
                    type="button"
                    disabled={moderating}
                    onClick={() => moderate("delete", true)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete everyone in range
                  </button>
                </div>
                {moderationNote && (
                  <p className="mt-2 text-xs text-neutral-600">{moderationNote}</p>
                )}
                <p className="text-xs text-neutral-400 mt-0.5">Each storefront has ProfilePage + BreadcrumbList schema and subdomain canonical</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={creatorSort} onChange={e => setCreatorSort(e.target.value as typeof creatorSort)}
                  className="px-2.5 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-purple-200 cursor-pointer">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="products">Most products</option>
                  <option value="az">A → Z</option>
                </select>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={creatorSearch} onChange={e => setCreatorSearch(e.target.value)} placeholder="Search creators…" className="pl-7 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-purple-200 w-52" />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                {Array(8).fill(0).map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-neutral-200 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-36 bg-neutral-200 rounded" />
                      <div className="h-3 w-24 bg-neutral-100 rounded" />
                    </div>
                    <div className="h-7 w-16 bg-neutral-100 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : filteredCreators.length === 0 ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-16 text-center text-sm text-neutral-400">No creators found</div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                {filteredCreators.map(creator => {
                  const isEditing = editingCreator === creator.username
                  const edits = creatorEdits[creator.username] || { seo_title: "", seo_description: "" }
                  const score = creator.has_published_products ? 90 : 65
                  return (
                    <div key={creator.id} className="p-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(creator.id)}
                          onChange={(event) => {
                            setSelected((previous) => {
                              const next = new Set(previous)
                              if (event.target.checked) next.add(creator.id)
                              else next.delete(creator.id)
                              return next
                            })
                          }}
                          aria-label={`Select ${creator.username || "creator"}`}
                          className="h-4 w-4 shrink-0 accent-neutral-900"
                        />
                        {/* Photo, else initials, else a plain person. Never a "?". */}
                        <AppAvatar
                          src={creator.avatar_url}
                          name={(creator.display_name || creator.username || "").trim()}
                          alt=""
                          size={36}
                          markWhileLoading
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-neutral-900">{creator.display_name || creator.username}</span>
                            <code className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">@{creator.username}</code>
                            {creator.country && (
                              <span className="text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-medium">{creator.country}</span>
                            )}
                            <ScorePill score={score} />
                            {savedCreators.has(creator.username || "") && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Saved ✓</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-neutral-400">{creator.product_count} published products</span>
                            {creator.joined_at && (
                              <span className="text-[10px] text-neutral-400" title={new Date(creator.joined_at).toLocaleString()}>
                                Joined {new Date(creator.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            )}
                            <a href={`https://${creator.username}.storelib.com`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-500 hover:underline">{creator.username}.storelib.com ↗</a>
                            {creator.onepage_slug && (
                              <a href={onePageUrl(creator.onepage_slug)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-500 hover:underline">
                                {onePageUrlDisplay(creator.onepage_slug)} ↗
                              </a>
                            )}
                            <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">ProfilePage</span>
                            <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">BreadcrumbList</span>
                            {creator.onepage_slug && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">OnePage ✓</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a href={`https://storelib.com/u/${creator.username}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors" title="View storefront">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </a>
                          <button
                            onClick={() => loadCreatorProducts(creator.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${expandedCreator === creator.id ? "bg-purple-100 text-purple-700" : "bg-purple-50 text-purple-600 hover:bg-purple-100"}`}
                          >
                            {loadingProducts === creator.id ? "Loading…" : expandedCreator === creator.id ? "Hide Products" : `${creator.product_count} Products`}
                          </button>
                          <button
                            onClick={() => {
                              if (isEditing) { setEditingCreator(null) } else {
                                setEditingCreator(creator.username || "")
                                setCreatorEdits(prev => ({ ...prev, [creator.username || ""]: prev[creator.username || ""] || { seo_title: "", seo_description: "" } }))
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isEditing ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200" : "bg-neutral-900 text-white hover:bg-neutral-800"}`}>
                            {isEditing ? "Cancel" : "Edit SEO"}
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-neutral-700">SEO Title Override</label>
                              <CharCount value={edits.seo_title} max={60} />
                            </div>
                            <input
                              value={edits.seo_title}
                              onChange={e => setCreatorEdits(p => ({ ...p, [creator.username || ""]: { ...p[creator.username || ""], seo_title: e.target.value } }))}
                              placeholder={`${creator.display_name || creator.username} | Storelib`}
                              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200"
                            />
                            <p className="text-[10px] text-neutral-400 mt-1">Leave blank → auto-generated from display name</p>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-neutral-700">SEO Description Override</label>
                              <CharCount value={edits.seo_description} max={160} />
                            </div>
                            <textarea
                              value={edits.seo_description}
                              onChange={e => setCreatorEdits(p => ({ ...p, [creator.username || ""]: { ...p[creator.username || ""], seo_description: e.target.value } }))}
                              placeholder={`Shop ${creator.display_name || creator.username}'s digital products on Storelib.`}
                              rows={2}
                              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button onClick={() => saveCreatorSeo(creator.username || "")} disabled={savingCreator === creator.username}
                              className="px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                              {savingCreator === creator.username ? "Saving…" : "Save & Update"}
                            </button>
                            <button onClick={() => setEditingCreator(null)} className="px-4 py-2 text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
                            <span className="text-[10px] text-neutral-400 ml-1">Affects Google search snippet for this storefront</span>
                          </div>
                        </div>
                      )}

                      {/* Creator's products list */}
                      {expandedCreator === creator.id && (
                        <div className="mt-4 pt-4 border-t border-neutral-100">
                          <h4 className="text-xs font-semibold text-neutral-700 mb-3">Products by {creator.display_name || creator.username}</h4>
                          {loadingProducts === creator.id ? (
                            <div className="text-xs text-neutral-400 animate-pulse py-4 text-center">Loading products…</div>
                          ) : (creatorProducts[creator.id] || []).length === 0 ? (
                            <div className="text-xs text-neutral-400 py-4 text-center">No products found</div>
                          ) : (
                            <div className="space-y-2">
                              {(creatorProducts[creator.id] || []).map((product: any) => (
                                <div key={product.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
                                  {product.thumbnail_url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={product.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-neutral-200 shrink-0 flex items-center justify-center text-neutral-400">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-neutral-900 truncate">{product.title}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] text-neutral-400">/{product.slug}</span>
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${product.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                        {product.status}
                                      </span>
                                      <span className="text-[10px] text-neutral-500">${((product.price_cents || 0) / 100).toFixed(2)}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <a href={`/p/${product.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors" title="View">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                    </a>
                                    <button onClick={() => deleteProduct(product.id, creator.id)} disabled={deletingProduct === product.id}
                                      className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors disabled:opacity-50" title="Delete">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PAGES ────────────────────────────────────────────── */}
        {activeTab === "pages" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-500">All public page types with their SEO configuration. Edit title/description templates below.</p>
            {SEO_PAGES.map(page => {
              const isEditing = editingPage === page.url
              const edits = pageEdits[page.url] || { title: page.editableTitle, description: page.editableDescription }
              return (
                <div key={page.url} className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-neutral-900">{page.title}</h3>
                        <code className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">{page.url}</code>
                        <ScorePill score={page.score} />
                        {savedPages.has(page.url) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Saved ✓</span>}
                      </div>
                      <p className="text-xs text-neutral-500 mb-2">{page.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${page.hasCanonical ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{page.hasCanonical ? "Canonical ✓" : "No canonical"}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${page.hasOgTags ? "bg-blue-50 text-blue-700" : "bg-neutral-100 text-neutral-500"}`}>{page.hasOgTags ? "OG Tags ✓" : "No OG"}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${page.hasJsonLd ? "bg-purple-50 text-purple-700" : "bg-neutral-100 text-neutral-500"}`}>{page.hasJsonLd ? "JSON-LD ✓" : "No JSON-LD"}</span>
                        {page.schemaTypes.map(t => <span key={t} className="text-[10px] bg-purple-50 text-purple-700 font-medium px-2 py-0.5 rounded">{t}</span>)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (isEditing) { setEditingPage(null) } else {
                          setEditingPage(page.url)
                          setPageEdits(p => ({ ...p, [page.url]: p[page.url] || { title: page.editableTitle, description: page.editableDescription } }))
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors shrink-0">
                      {isEditing ? "Close" : "Edit"}
                    </button>
                  </div>

                  {isEditing && (
                    <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-neutral-700">Title Template</label>
                          <CharCount value={edits.title} max={60} />
                        </div>
                        <input value={edits.title} onChange={e => setPageEdits(p => ({ ...p, [page.url]: { ...p[page.url], title: e.target.value } }))}
                          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200" />
                        <p className="text-[10px] text-neutral-400 mt-1">Tokens {"{Product Name}"}, {"{Creator Name}"}, {"{Category}"} are replaced dynamically at render time.</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-neutral-700">Description Template</label>
                          <CharCount value={edits.description} max={160} />
                        </div>
                        <textarea value={edits.description} onChange={e => setPageEdits(p => ({ ...p, [page.url]: { ...p[page.url], description: e.target.value } }))}
                          rows={2} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => savePageSeo(page.url)} disabled={savingPage === page.url}
                          className="px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                          {savingPage === page.url ? "Saving…" : "Save & Publish"}
                        </button>
                        <button onClick={() => setEditingPage(null)} className="px-4 py-2 text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── INFRASTRUCTURE ───────────────────────────────────── */}
        {activeTab === "infra" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-neutral-900">Technical SEO Configuration</h3>
                <span className="text-xs text-emerald-600 font-medium">{INFRA_ITEMS.length}/{INFRA_ITEMS.length} passing</span>
              </div>
              <p className="text-xs text-neutral-400 mb-4">Platform is fully configured for Google indexing and rich result eligibility</p>
              <div className="divide-y divide-neutral-50">
                {INFRA_ITEMS.map(item => (
                  <div key={item.label} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <div>
                        <span className="text-sm font-medium text-neutral-800">{item.label}</span>
                        <code className="text-[10px] text-neutral-400 font-mono ml-2">{item.file}</code>
                      </div>
                    </div>
                    <code className="text-xs text-neutral-500 font-mono text-right max-w-[260px] truncate hidden sm:block">{item.detail}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">Indexing Permissions</h3>
                <div className="space-y-2">
                  {[
                    { label: "storelib.com (main site)", allowed: true },
                    { label: "*.storelib.com (storefronts)", allowed: true },
                    { label: "/p/* (product pages)", allowed: true },
                    { label: "/blog/* (blog articles)", allowed: true },
                    { label: "/explore/* (categories)", allowed: true },
                    { label: "/u/* (creator profiles)", allowed: true },
                    { label: "/admin/* (admin pages)", allowed: false },
                    { label: "/api/* (API routes)", allowed: false },
                    { label: "/app/* (dashboard)", allowed: false },
                    { label: "/auth/* (auth flows)", allowed: false },
                    { label: "/explore?sort=* (duplicates)", allowed: false },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs">
                      {item.allowed
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                      <span className={item.allowed ? "text-neutral-700" : "text-neutral-400"}>{item.label}</span>
                      {!item.allowed && <span className="text-[10px] text-neutral-300 ml-auto">robots.txt</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">External Tools</h3>
                <div className="space-y-2.5">
                  {[
                    { label: "Live Sitemap", href: "https://storelib.com/sitemap.xml" },
                    { label: "Robots.txt", href: "https://storelib.com/robots.txt" },
                    { label: "Google Search Console", href: "https://search.google.com/search-console" },
                    { label: "Schema.org Validator", href: "https://validator.schema.org/" },
                    { label: "Rich Results Test", href: "https://search.google.com/test/rich-results" },
                    { label: "PageSpeed Insights", href: "https://pagespeed.web.dev/" },
                    { label: "Google Mobile-Friendly Test", href: "https://search.google.com/test/mobile-friendly" },
                    { label: "Bing Webmaster Tools", href: "https://www.bing.com/webmasters" },
                  ].map(link => (
                    <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── BLOG POSTS ───────────────────────────────────────── */}
        {activeTab === "blog" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">{loading ? "…" : filteredPosts.length} blog posts</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Edit per-post SEO title and description — saved directly to Supabase</p>
              </div>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder="Search posts…" className="pl-7 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-purple-200 w-48" />
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-56 bg-neutral-200 rounded" />
                      <div className="h-3 w-72 bg-neutral-100 rounded" />
                    </div>
                    <div className="h-7 w-16 bg-neutral-100 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-16 text-center text-sm text-neutral-400">No posts found</div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                {filteredPosts.map(post => {
                  const isEditing = editingPost === post.id
                  const edits = postEdits[post.id] || { seo_title: post.seo_title || "", seo_description: post.seo_description || "" }
                  const score = (post.seo_title ? 50 : 25) + (post.seo_description ? 50 : 25)
                  return (
                    <div key={post.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-medium text-neutral-900 truncate max-w-xs">{post.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${post.is_published ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                              {post.is_published ? "Published" : "Draft"}
                            </span>
                            <ScorePill score={score} />
                            {savedPosts.has(post.id) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Saved ✓</span>}
                          </div>
                          <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
                            <code className="text-[10px] text-neutral-400 font-mono">/blog/{post.slug}</code>
                            <span className="text-[10px] text-neutral-400">{(post.views || 0).toLocaleString()} views</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${post.seo_title ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>{post.seo_title ? "SEO title ✓" : "No SEO title"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${post.seo_description ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>{post.seo_description ? "SEO desc ✓" : "No SEO desc"}</span>
                          </div>
                          {!isEditing && post.seo_title && <p className="text-xs text-neutral-500 mt-1 truncate">↳ {post.seo_title}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a href={`https://storelib.com/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </a>
                          <button
                            onClick={() => {
                              if (isEditing) { setEditingPost(null) } else {
                                setEditingPost(post.id)
                                setPostEdits(p => ({ ...p, [post.id]: p[post.id] || { seo_title: post.seo_title || "", seo_description: post.seo_description || "" } }))
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isEditing ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200" : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50"}`}>
                            {isEditing ? "Close" : "Edit SEO"}
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-neutral-700">SEO Title <span className="font-normal text-neutral-400">(shown in Google results)</span></label>
                              <CharCount value={edits.seo_title} max={60} />
                            </div>
                            <input value={edits.seo_title}
                              onChange={e => setPostEdits(p => ({ ...p, [post.id]: { ...p[post.id], seo_title: e.target.value } }))}
                              placeholder={post.title}
                              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium text-neutral-700">SEO Description <span className="font-normal text-neutral-400">(shown under title in Google)</span></label>
                              <CharCount value={edits.seo_description} max={160} />
                            </div>
                            <textarea value={edits.seo_description}
                              onChange={e => setPostEdits(p => ({ ...p, [post.id]: { ...p[post.id], seo_description: e.target.value } }))}
                              rows={2} placeholder="Write a compelling 120–160 character description for Google…"
                              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200 resize-none" />
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => savePostSeo(post)} disabled={savingPost === post.id}
                              className="px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                              {savingPost === post.id ? "Saving…" : "Save & Update"}
                            </button>
                            <button onClick={() => setEditingPost(null)} className="px-4 py-2 text-xs font-medium text-neutral-600 border border-neutral-200 rounded-lg hover:bg-neutral-50">Cancel</button>
                            <span className="text-[10px] text-neutral-400">Saved to Supabase — updates Google snippet on next crawl</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
