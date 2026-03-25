"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import BlogEditor, { Block, BlockType } from "@/components/admin/blog-editor"

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
}

const CATEGORIES = ["Getting Started", "Creator Tips", "Growth", "Strategy", "Product Updates", "Case Studies", "Tutorials", "Announcements"]

interface PostData {
  id?: string
  title: string
  slug: string
  excerpt: string
  content: Block[]
  cover_image_url: string
  category: string
  read_time: string
  author: string
  seo_title: string
  seo_description: string
  seo_keywords: string
  is_published: boolean
  published_at: string | null
}

export default function BlogPostEditorClient({ mode, postId }: { mode: "new" | "edit"; postId?: string }) {
  const router = useRouter()
  const [post, setPost] = useState<PostData>({
    title: "",
    slug: "",
    excerpt: "",
    content: [{ id: Math.random().toString(36).slice(2), type: "p" as BlockType, html: "" }],
    cover_image_url: "",
    category: "Getting Started",
    read_time: "5 min read",
    author: "Anisia - Head of Marketing",
    seo_title: "",
    seo_description: "",
    seo_keywords: "",
    is_published: false,
    published_at: null,
  })
  const [loading, setLoading] = useState(mode === "edit")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverUrlInput, setCoverUrlInput] = useState("")
  const [coverError, setCoverError] = useState(false)
  const [slugManual, setSlugManual] = useState(false)

  // Load existing post
  useEffect(() => {
    if (mode === "edit" && postId) {
      fetch(`/api/admin/blog/posts/${postId}`)
        .then(r => r.json())
        .then(data => {
          setPost({
            ...data,
            author: data.author_name || data.author || "Anisia - Head of Marketing",
            slug: data.slug ?? "",
            title: data.title ?? "",
            read_time: data.read_time ?? "5 min read",
            category: data.category ?? "Getting Started",
            seo_title: data.seo_title ?? "",
            seo_description: data.seo_description ?? "",
            seo_keywords: data.seo_keywords ?? "",
            excerpt: data.excerpt ?? "",
            cover_image_url: data.cover_image_url ?? "",
            content: Array.isArray(data.content) ? data.content : [],
          })
          setCoverUrlInput(data.cover_image_url || "")
          setSlugManual(true) // Don't auto-update slug when editing
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [mode, postId])

  // Auto-generate slug from title (new posts only)
  const handleTitleChange = (title: string) => {
    setPost(p => ({
      ...p,
      title,
      slug: slugManual ? p.slug : slugify(title),
      seo_title: p.seo_title || title,
    }))
  }

  const save = useCallback(async (publish?: boolean) => {
    if (!post.title.trim()) { setError("Title is required"); return }
    if (!post.slug.trim()) { setError("Slug is required"); return }

    setSaving(true)
    setError("")

    const wasPublished = post.is_published
    const nowPublishing = publish !== undefined ? publish : post.is_published
    const body = {
      ...post,
      is_published: nowPublishing,
      _set_published_at: nowPublishing && !wasPublished,
    }

    let res: Response
    if (mode === "new") {
      res = await fetch("/api/admin/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } else {
      res = await fetch(`/api/admin/blog/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    }

    if (res.ok) {
      const saved = await res.json()
      setPost(p => ({
        ...p,
        ...saved,
        author: saved.author_name || saved.author || p.author,
        slug: saved.slug ?? p.slug ?? "",
        title: saved.title ?? p.title ?? "",
        read_time: saved.read_time ?? p.read_time ?? "5 min read",
        category: saved.category ?? p.category ?? "Getting Started",
        seo_title: saved.seo_title ?? p.seo_title ?? "",
        seo_description: saved.seo_description ?? p.seo_description ?? "",
        seo_keywords: saved.seo_keywords ?? p.seo_keywords ?? "",
        excerpt: saved.excerpt ?? p.excerpt ?? "",
        cover_image_url: saved.cover_image_url ?? p.cover_image_url ?? "",
        content: Array.isArray(saved.content) ? saved.content : p.content,
      }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      if (mode === "new") {
        router.replace(`/admin/blog/posts/${saved.id}`)
      }
    } else {
      const err = await res.json()
      setError(err.error || "Failed to save")
    }
    setSaving(false)
  }, [post, mode, router])

  async function uploadCover(file: File) {
    setCoverUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: fd })
    const data = await res.json()
    setPost(p => ({ ...p, cover_image_url: data.url || "" }))
    setCoverUploading(false)
  }

  // Keyboard shortcut: Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        save()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [save])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-400 text-sm">
        Loading post…
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
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
          <span className="text-sm text-neutral-700 font-medium truncate max-w-xs">{post.title || "New Post"}</span>

          <div className="ml-auto flex items-center gap-2">
            {error && <span className="text-xs text-red-500 hidden sm:block">{error}</span>}
            {saved && <span className="text-xs text-emerald-600 flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Saved</span>}

            <span className="text-xs text-neutral-400 hidden sm:block">⌘S to save</span>

            <button
              onClick={() => save(false)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>

            <button
              onClick={() => save(!post.is_published)}
              disabled={saving}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${post.is_published ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
            >
              {post.is_published ? "Unpublish" : "Publish"}
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex gap-6 items-start">
        {/* Editor column */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Post title…"
              value={post.title}
              onChange={e => handleTitleChange(e.target.value)}
              className="w-full text-3xl font-bold text-neutral-900 placeholder-neutral-300 border-none outline-none bg-transparent"
            />
            {post.is_published && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Published · <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">storelib.com/blog/{post.slug}</a>
              </div>
            )}
          </div>

          {/* Content editor */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 min-h-[500px]">
            <BlogEditor
              blocks={post.content}
              onChange={content => setPost(p => ({ ...p, content }))}
            />
          </div>
        </div>

        {/* Settings sidebar */}
        <aside className="w-72 flex-shrink-0 space-y-4 sticky top-20">
          {/* Cover Image */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Cover Image</h3>

            {/* Preview */}
            {post.cover_image_url && !coverError && (
              <div className="relative rounded-lg overflow-hidden bg-neutral-100 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.cover_image_url}
                  alt="Cover"
                  className="w-full h-36 object-cover"
                  onError={() => setCoverError(true)}
                />
                <button
                  onClick={() => { setPost(p => ({ ...p, cover_image_url: "" })); setCoverUrlInput(""); setCoverError(false) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* Broken image feedback */}
            {post.cover_image_url && coverError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 mb-2 text-center">
                <svg className="mx-auto mb-1 text-red-300" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
                <p className="text-[10px] text-red-500">Image failed to load. Check the URL.</p>
                <button
                  onClick={() => { setPost(p => ({ ...p, cover_image_url: "" })); setCoverUrlInput(""); setCoverError(false) }}
                  className="text-[10px] text-red-600 underline mt-1"
                >
                  Remove
                </button>
              </div>
            )}

            {/* Upload + URL input (always visible when no cover) */}
            {!post.cover_image_url && (
              <label className="block w-full cursor-pointer border-2 border-dashed border-neutral-200 rounded-lg p-4 text-center hover:border-neutral-300 transition-colors mb-2">
                <svg className="mx-auto mb-1.5 text-neutral-300" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span className="text-xs text-neutral-500">{coverUploading ? "Uploading…" : "Upload cover image"}</span>
                <input type="file" accept="image/*" className="hidden" disabled={coverUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
              </label>
            )}

            {/* URL input — separate from the actual cover_image_url state so typing doesn't flash broken images */}
            <div className="flex gap-1.5">
              <input
                type="url"
                placeholder="Paste image URL…"
                value={post.cover_image_url ? post.cover_image_url : coverUrlInput}
                onChange={e => {
                  if (post.cover_image_url) {
                    // Already has a cover — clear it and start fresh
                    setPost(p => ({ ...p, cover_image_url: "" }))
                    setCoverUrlInput(e.target.value)
                    setCoverError(false)
                  } else {
                    setCoverUrlInput(e.target.value)
                  }
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && coverUrlInput.trim()) {
                    e.preventDefault()
                    setCoverError(false)
                    setPost(p => ({ ...p, cover_image_url: coverUrlInput.trim() }))
                  }
                }}
                onPaste={e => {
                  // Auto-apply pasted URLs immediately
                  const pasted = e.clipboardData.getData("text").trim()
                  if (pasted && (pasted.startsWith("http://") || pasted.startsWith("https://"))) {
                    e.preventDefault()
                    setCoverError(false)
                    setCoverUrlInput(pasted)
                    setPost(p => ({ ...p, cover_image_url: pasted }))
                  }
                }}
                className="flex-1 px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
              {coverUrlInput && !post.cover_image_url && (
                <button
                  onClick={() => { setCoverError(false); setPost(p => ({ ...p, cover_image_url: coverUrlInput.trim() })) }}
                  className="px-2 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors flex-shrink-0"
                >
                  Set
                </button>
              )}
            </div>
            {!post.cover_image_url && coverUrlInput && (
              <p className="text-[10px] text-neutral-400 mt-1">Press Enter or click Set to apply</p>
            )}
          </div>

          {/* Post Details */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Post Details</h3>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Slug</label>
              <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-neutral-900">
                <span className="px-2 py-1.5 text-xs text-neutral-400 bg-neutral-50 border-r border-neutral-200 whitespace-nowrap">/blog/</span>
                <input
                  type="text"
                  value={post.slug}
                  onChange={e => { setSlugManual(true); setPost(p => ({ ...p, slug: e.target.value })) }}
                  className="flex-1 px-2 py-1.5 text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Category</label>
              <select
                value={post.category}
                onChange={e => setPost(p => ({ ...p, category: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Read Time</label>
                <input
                  type="text"
                  value={post.read_time}
                  onChange={e => setPost(p => ({ ...p, read_time: e.target.value }))}
                  placeholder="5 min read"
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Author</label>
                <input
                  type="text"
                  value={post.author}
                  onChange={e => setPost(p => ({ ...p, author: e.target.value }))}
                  placeholder="Storelib Team"
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Excerpt</label>
              <textarea
                value={post.excerpt}
                onChange={e => setPost(p => ({ ...p, excerpt: e.target.value }))}
                placeholder="Short description shown in post previews…"
                rows={3}
                className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
              />
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">SEO</h3>
              <span className="text-[10px] bg-emerald-50 text-emerald-600 font-medium px-1.5 py-0.5 rounded">Google</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">SEO Title <span className="text-neutral-400">(60 chars)</span></label>
              <input
                type="text"
                value={post.seo_title}
                onChange={e => setPost(p => ({ ...p, seo_title: e.target.value }))}
                placeholder={post.title || "SEO title…"}
                maxLength={70}
                className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-neutral-400">Falls back to post title</span>
                <span className={`text-[10px] font-medium ${(post.seo_title?.length ?? 0) > 60 ? "text-amber-500" : "text-neutral-400"}`}>{post.seo_title?.length ?? 0}/60</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Meta Description <span className="text-neutral-400">(160 chars)</span></label>
              <textarea
                value={post.seo_description}
                onChange={e => setPost(p => ({ ...p, seo_description: e.target.value }))}
                placeholder={post.excerpt || "Describe the article for search engines…"}
                maxLength={170}
                rows={3}
                className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-neutral-400">Falls back to excerpt</span>
                <span className={`text-[10px] font-medium ${(post.seo_description?.length ?? 0) > 160 ? "text-amber-500" : "text-neutral-400"}`}>{post.seo_description?.length ?? 0}/160</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Keywords</label>
              <input
                type="text"
                value={post.seo_keywords}
                onChange={e => setPost(p => ({ ...p, seo_keywords: e.target.value }))}
                placeholder="keyword1, keyword2, keyword3"
                className="w-full px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            {/* Live SERP preview */}
            {(post.seo_title || post.title) && (
              <div className="border border-neutral-100 rounded-lg p-3 bg-neutral-50">
                <div className="text-[10px] font-semibold text-neutral-400 mb-2 uppercase tracking-wide">Search preview</div>
                <div className="text-xs text-[#1a0dab] font-medium leading-snug truncate">{post.seo_title || post.title}</div>
                <div className="text-[10px] text-[#006621] mt-0.5">storelib.com › blog › {post.slug || "your-slug"}</div>
                <div className="text-[10px] text-[#545454] mt-0.5 line-clamp-2 leading-relaxed">{post.seo_description || post.excerpt || "Add a meta description to control how this post appears in search results."}</div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>
          )}
        </aside>
      </div>
    </div>
  )
}
