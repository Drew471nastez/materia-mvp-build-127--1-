/**
 * Website settings for scripts/check-site-settings-r51.mjs: the real
 * ProjectSettings (and the real Settings › Team panel at ?team=1), every
 * route they call answered as the real one answers, with a few states to
 * choose from in the address:
 *
 *   ?section=apps|blog|backups|connections|domains   the subject opened
 *   &github=connect|pick                              GitHub before a repository / picking one
 *   &domain=pending|securing                          the custom domain's state
 *   &posts=0|3                                        the blog's posts
 */
import * as React from "react"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import { TeamPanel } from "@/components/app/settings/team-panel"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window {
    __calls?: string[]
    __verifyCalls?: number
  }
}

const q = new URLSearchParams(location.search)
const NOW = Date.now()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const CAT = "c1111111-1111-4111-8111-111111111111"
const AUTHOR = "a1111111-1111-4111-8111-111111111111"

function post(i: number, extra: Record<string, unknown> = {}) {
  const id = `p${i}111111-1111-4111-8111-111111111111`
  const meta = { title: ["Linen care", "Spring drop", "Behind the studio"][i] ?? `Post ${i}`, slug: `post-${i}`, excerpt: "", coverImageUrl: "", coverAlt: "", categoryId: i === 0 ? CAT : null, tags: [], authorId: null, seoTitle: "", seoDescription: "", canonicalUrl: "", ogTitle: "", ogDescription: "", ogImageUrl: "", noindex: false, featured: i === 1, publishedAt: i < 2 ? iso(86_400_000 * (i + 1)) : null }
  return { id, status: i < 2 ? "published" : "draft", title: meta.title, slug: meta.slug, excerpt: "", coverImageUrl: "", categoryId: meta.categoryId, tags: [], authorId: null, featured: meta.featured, publishedAt: meta.publishedAt, updatedAt: iso(3_600_000 * (i + 1)), hasUnpublishedChanges: false, livePath: i < 2 ? `/blogs/news/${meta.slug}` : null, meta, blocks: [], version: 1, liveSlug: i < 2 ? meta.slug : null, createdAt: iso(86_400_000 * 3), firstPublishedAt: meta.publishedAt, wordCount: 0, readingMinutes: 1, ...extra }
}

function stubFetch() {
  const calls: string[] = (window.__calls = [])
  window.__verifyCalls = 0
  const json = (body: unknown, status = 200, wait = 0) => {
    const r = () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    return wait ? new Promise<Response>((res) => setTimeout(() => res(r()), wait)) : Promise.resolve(r())
  }
  const posts = Number(q.get("posts") ?? "3")
  let made = 0
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push(`${method} ${url}`)
    /* Apps and integrations: Storelib Reviews (a Storelib app, no logo of its own), Klaviyo and Google Analytics (their files in public/integrations). */
    if (url.startsWith("/api/store/integrations/installed")) {
      return json({ installed: [
        { id: "storelib-reviews", name: "Storelib Reviews", logo: null, needsAttention: false },
        { id: "klaviyo", name: "Klaviyo", logo: "/integrations/klaviyo.png", needsAttention: false },
        { id: "google-analytics", name: "Google Analytics", logo: "/integrations/google-analytics.svg", needsAttention: false },
      ] })
    }
    /* The blog. */
    if (/\/blog$/.test(url) && method === "GET") {
      return json({ settings: { handle: "news", previousHandles: [], title: "Journal", description: "", postsPerPage: 12, seoTitle: "", seoDescription: "", ogImageUrl: "" }, categories: [{ id: CAT, slug: "care", name: "Care", description: "", sortOrder: 0, seoTitle: "", seoDescription: "" }], authors: [{ id: AUTHOR, slug: "mara", name: "Mara Ionescu", role: "", bio: "", avatarUrl: "", links: [] }], tags: ["linen"], counts: { all: posts, draft: Math.max(0, posts - 2), scheduled: 0, published: Math.min(2, posts), archived: 0 }, templates: { listing: "blogs", post: "article" }, liveBase: "https://astrid.storelib.com" })
    }
    if (url.includes("/blog/posts?")) {
      const list = Array.from({ length: posts }, (_, i) => post(i))
      return json({ posts: list, total: list.length, counts: { all: posts, draft: Math.max(0, posts - 2), scheduled: 0, published: Math.min(2, posts), archived: 0 } }, 200, 120)
    }
    if (/\/blog\/posts$/.test(url) && method === "POST") return json({ post: post(9 + made++, { title: "", status: "draft", meta: { ...post(9).meta, title: "", slug: "untitled" } }) }, 200, 150)
    if (/\/blog\/posts\/[^/]+$/.test(url) && method === "GET") return json({ post: post(0) }, 200, 400)
    if (/\/blog\/posts\/[^/]+$/.test(url) && method === "PUT") return json({ post: post(0) })
    if (/\/blog\/categories$/.test(url) && method === "POST") {
      const { name } = JSON.parse(String(init?.body ?? "{}")) as { name: string }
      return json({ category: { id: "c2222222-2222-4222-8222-222222222222", slug: "news", name, description: "", sortOrder: 1, seoTitle: "", seoDescription: "" } })
    }
    /* Backups: two restore points, a preview, and Back up now (the second press: nothing changed). */
    if (/\/backups$/.test(url) && method === "POST") {
      const n = calls.filter((c) => /POST .*\/backups$/.test(c)).length
      return json({ backup: { id: n === 1 ? "b0" : "b0", label: "Manual backup" }, skipped: n > 1 }, 200, 200)
    }
    if (/\/backups$/.test(url)) {
      const pressed = calls.some((c) => /POST .*\/backups$/.test(c))
      return json({ backups: [
        ...(pressed ? [{ id: "b0", label: "Manual backup", source: "manual", created_at: iso(5_000) }] : []),
        { id: "b1", label: "Published", source: "publish", created_at: iso(86_400_000) },
        { id: "b2", label: "Added a pricing section", source: "ai", created_at: iso(2 * 86_400_000) },
      ] })
    }
    if (/\/backups\/b\d$/.test(url)) {
      return json({ backup: { id: "b1" }, preview: { pages: [
        { key: "home", sections: 8, types: [], change: "changed" },
        { key: "about", sections: 3, types: [], change: "same" },
        { key: "lookbook", sections: 4, types: [], change: "comes back" },
        { key: "faq", sections: 2, types: [], change: "stays" },
      ], settingsChanged: 3, filesChanged: 0, same: false } }, 200, 350)
    }
    if (url.includes("/releases")) return json({ available: true, releases: [{ id: "r1", createdAt: iso(86_400_000), restored: false, live: true }] })
    /* Domains: one website domain, waiting for DNS or securing its certificate. */
    if (url === "/api/domains/verify") {
      window.__verifyCalls = (window.__verifyCalls ?? 0) + 1
      return json({ verified: true, sslPending: false, status: "active", message: "Connected. The domain is live with HTTPS." })
    }
    if (url.startsWith("/api/domains")) {
      const state = q.get("domain") ?? "pending"
      return json({ domains: [{ id: "d1", domain: "astridstudio.com", status: state === "securing" ? "ssl_provisioning" : "pending", ssl_status: state === "securing" ? "provisioning" : null, verification_token: "storelib-verify-3f9c2a71", purpose: "website", is_primary: true, host: "www.astridstudio.com", apex: true }] })
    }
    /* Connections. */
    if (url.includes("/agent-connections")) return json({ connections: [], ready: true })
    if (url.includes("/github")) {
      const state = q.get("github") ?? "connect"
      return json({ configured: true, ready: true, link: state === "pick" ? { account: "astrid", repo: null, branch: null, folder: "", lastSyncedAt: null, lastSyncedSha: null, lastError: null, pushOnSave: true, pullOnPush: true } : null, repos: [{ fullName: "astrid/site", defaultBranch: "main", private: true }, { fullName: "astrid/notes", defaultBranch: "main", private: false }], accounts: [], events: [] })
    }
    if (url.includes("/supabase/")) return json({ configured: true, projects: null })
    if (url.includes("/own-ai") || url.includes("/ai-memory") || url.includes("/memory")) return json({ connections: [], memory: [], memories: [], ready: true })
    /* Settings › Team. */
    if (url === "/api/team" && method === "GET") {
      return json({ ready: true, team: { members: [{ id: "m1", email: "ana@example.com", permissions: ["orders"], status: "active", invited_at: iso(9 * 86_400_000), expires_at: null, accepted_at: iso(8 * 86_400_000), name: "Ana Pop" }], limit: 3, byOwner: true, grant: ["orders", "products", "website", "emails", "analytics", "team"], open: ["orders", "products", "website", "emails", "analytics", "team"], self: null }, stores: [], acting: null, me: { name: "Astrid", avatarUrl: null, email: "astrid@example.com" } })
    }
    return json({})
  }) as typeof fetch
}

function App() {
  const [settings, setSettings] = React.useState<ThemeSettingsValues>({ brand_name: "Astrid" })
  return (
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Astrid Studio"
      onRenamed={() => {}}
      websiteUrl="https://astrid.storelib.com"
      websiteUrlDisplay="astrid.storelib.com"
      onAddressChanged={() => {}}
      live
      publishedAt={iso(86_400_000)}
      initialSection={(q.get("section") as SettingsSection | null) ?? null}
      settings={settings}
      onSettingChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
      pages={[
        { key: "home", name: "Home", path: "/" },
        { key: "about", name: "About", path: "/about" },
        { key: "lookbook", name: "Lookbook", path: "/lookbook", custom: true },
        { key: "faq", name: "FAQ", path: "/faq", custom: true },
      ]}
      productCount={7}
      onUnpublished={() => {}}
      onNavigate={(href) => window.__calls?.push(`navigate ${href}`)}
    />
  )
}

function Team() {
  return (
    <div style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px", background: "#f8f9fa" }}>
      <TeamPanel />
    </div>
  )
}

export function boot(mount: (el: React.ReactElement) => void) {
  stubFetch()
  mount(q.has("team") ? <Team /> : <App />)
}
