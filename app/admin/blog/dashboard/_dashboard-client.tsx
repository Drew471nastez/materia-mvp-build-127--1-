"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { FillBar } from "@/components/ui/fill-bar"

interface Post {
  id: string
  slug: string
  title: string
  category: string
  is_published: boolean
  published_at: string | null
  views: number
  created_at: string
  updated_at: string
  cover_image_url: string | null
  excerpt: string
}

interface Analytics {
  countries: { name: string; count: number }[]
  devices: { name: string; count: number }[]
  browsers: { name: string; count: number }[]
  referrers: { name: string; count: number }[]
  totalViews: number
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", GB: "🇬🇧", CA: "🇨🇦", AU: "🇦🇺", DE: "🇩🇪", FR: "🇫🇷",
  ES: "🇪🇸", IT: "🇮🇹", BR: "🇧🇷", MX: "🇲🇽", IN: "🇮🇳", JP: "🇯🇵",
  KR: "🇰🇷", CN: "🇨🇳", NL: "🇳🇱", SE: "🇸🇪", NO: "🇳🇴", DK: "🇩🇰",
  PL: "🇵🇱", PT: "🇵🇹", RU: "🇷🇺", TR: "🇹🇷", AR: "🇦🇷", CL: "🇨🇱",
  CO: "🇨🇴", ZA: "🇿🇦", NG: "🇳🇬", EG: "🇪🇬", SG: "🇸🇬", TH: "🇹🇭",
  ID: "🇮🇩", PH: "🇵🇭", MY: "🇲🇾", VN: "🇻🇳", PK: "🇵🇰", UA: "🇺🇦",
  RO: "🇷🇴", HU: "🇭🇺", CZ: "🇨🇿", GR: "🇬🇷", FI: "🇫🇮", BE: "🇧🇪",
  AT: "🇦🇹", CH: "🇨🇭", IL: "🇮🇱", AE: "🇦🇪", SA: "🇸🇦",
}

export default function BlogDashboardClient() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"posts" | "traffic">("posts")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [postsRes, analyticsRes] = await Promise.all([
        fetch("/api/admin/blog/posts"),
        fetch("/api/admin/blog/analytics"),
      ])
      if (postsRes.status === 401) { router.push("/admin/blog"); return }
      const postsData = await postsRes.json()
      setPosts(Array.isArray(postsData) ? postsData : [])
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        if (analyticsData && !analyticsData.error) setAnalytics(analyticsData)
      }
    } catch {
      // network error — stay on page, show empty state
    }
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function handleLogout() {
    await fetch("/api/admin/blog/auth", { method: "DELETE" })
    router.push("/admin/blog")
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    await fetch(`/api/admin/blog/posts/${id}`, { method: "DELETE" })
    setPosts(p => p.filter(x => x.id !== id))
    setDeleting(null)
  }

  async function handleTogglePublish(post: Post) {
    const newStatus = !post.is_published
    const body: Record<string, unknown> = { is_published: newStatus }
    if (newStatus && !post.published_at) body._set_published_at = true
    const res = await fetch(`/api/admin/blog/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const updated = await res.json()
      setPosts(p => p.map(x => x.id === post.id ? { ...x, ...updated } : x))
    }
  }

  const filtered = posts.filter(p => {
    if (filter === "published" && !p.is_published) return false
    if (filter === "draft" && p.is_published) return false
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0)
  const published = posts.filter(p => p.is_published).length

  function fmt(date: string) {
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </div>
            <span className="font-semibold text-neutral-900 text-sm">Blog Admin</span>
            <span className="text-neutral-300 text-sm">·</span>
            <a href="https://storelib.com/blog" target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
              View blog
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <span className="text-neutral-300 text-sm">·</span>
            <button
              onClick={() => router.push("/admin/blog/seo")}
              className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
              SEO
            </button>
            <span className="text-neutral-300 text-sm">·</span>
            <button
              onClick={() => router.push("/admin/blog/dashboard/sales-trigger")}
              className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Sales Trigger
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/blog/posts/new")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-xs font-semibold rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Post
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Posts", value: posts.length, icon: "📝" },
            { label: "Published", value: published, icon: "🟢" },
            { label: "Drafts", value: posts.length - published, icon: "📋" },
            { label: "Total Views", value: totalViews.toLocaleString(), icon: "👁️" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold text-neutral-900">{s.value}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 bg-neutral-100 rounded-lg p-1 w-fit">
          {(["posts", "traffic"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${activeTab === tab ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
            >
              {tab === "posts" ? "Blog Posts" : "Traffic"}
            </button>
          ))}
        </div>

        {activeTab === "posts" ? (
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-neutral-100">
              <div className="relative flex-1 max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  placeholder="Search posts…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
                {(["all", "published", "draft"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-all ${filter === f ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p className="text-sm font-medium">No posts found</p>
                <button onClick={() => router.push("/admin/blog/posts/new")} className="mt-3 text-xs text-neutral-900 font-semibold underline underline-offset-2">Create your first post</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide px-4 py-3">Post</th>
                      <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Category</th>
                      <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wide px-4 py-3">Status</th>
                      <th className="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Views</th>
                      <th className="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Date</th>
                      <th className="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wide px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(post => (
                      <tr key={post.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {post.cover_image_url ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={post.cover_image_url} alt="" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 text-neutral-400">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-neutral-900 line-clamp-1">{post.title}</div>
                              <div className="text-xs text-neutral-400 mt-0.5">/{post.slug}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-600">{post.category}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleTogglePublish(post)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${post.is_published ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${post.is_published ? "bg-emerald-500" : "bg-neutral-400"}`} />
                            {post.is_published ? "Published" : "Draft"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="text-neutral-700 font-medium">{(post.views || 0).toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className="text-neutral-400 text-xs">{fmt(post.published_at || post.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => router.push(`/admin/blog/posts/${post.id}`)}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors"
                              title="Edit"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {post.is_published && (
                              <a
                                href={`/blog/${post.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition-colors"
                                title="View live"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                              </a>
                            )}
                            <button
                              onClick={() => handleDelete(post.id, post.title)}
                              disabled={deleting === post.id}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Traffic Tab */
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Top Countries", data: analytics?.countries || [], key: "flag" },
              { title: "Referrers", data: analytics?.referrers || [], key: "link" },
              { title: "Devices", data: analytics?.devices || [], key: "device" },
              { title: "Browsers", data: analytics?.browsers || [], key: "browser" },
            ].map(panel => (
              <div key={panel.title} className="bg-white rounded-xl border border-neutral-200 p-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">{panel.title}</h3>
                {panel.data.length === 0 ? (
                  <p className="text-xs text-neutral-400">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {panel.data.map(item => {
                      const max = panel.data[0].count
                      const pct = Math.round((item.count / max) * 100)
                      const flag = FLAG_MAP[item.name] || ""
                      const label = panel.title === "Top Countries" ? `${flag} ${item.name}` :
                        panel.title === "Referrers" ? (item.name.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || "Direct") :
                          item.name.charAt(0).toUpperCase() + item.name.slice(1)
                      return (
                        <div key={item.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-neutral-700 truncate max-w-[70%]" title={item.name}>{label}</span>
                            <span className="text-xs font-semibold text-neutral-900">{item.count.toLocaleString()}</span>
                          </div>
                          <FillBar quiet value={pct} size="thin" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
