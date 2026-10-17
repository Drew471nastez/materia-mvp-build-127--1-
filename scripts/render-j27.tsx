/**
 * ROUND 27 (J27), for scripts/check-j27.mjs: the real /app shell
 * (components/app/sidebar, with its Setup pill and a community's) around
 * the real pages the owner named, every /api request answered here.
 *
 *   /app/community/new             the create wizard (create-flow.tsx), store setup 5 of 7 (71%)
 *   /app/community/makers/members  a community page with its save bar (EditorFoot), raised with window.__dirty(true)
 *   /app/products                  a page with no bottom bar: the pill as it always was
 *   ?view=analytics                a community's Analytics (analytics-section.tsx) inside the shell
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { LocaleProvider } from "@/components/locale-provider"
import { SWRProvider } from "@/lib/swr-config"
import { AppSidebar } from "@/components/app/sidebar"
import { CreateCommunity } from "@/components/community/creator/create-flow"
import { EditorFoot, ToastHost } from "@/components/community/creator/parts"

const path = location.pathname
const ME = "1b2c3d4e-0000-4000-8000-000000000001"
const MADE = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const w = window as unknown as { __sent: { url: string; method: string; body: unknown }[]; __dirty?: (on: boolean) => void }
w.__sent = []

const setupList = {
  id: MADE,
  slug: "makers",
  name: "Makers",
  steps: [
    { id: "rules", title: "Write the rules", detail: "Members see them before they join.", href: "/app/community/makers/moderation?tab=rules", action: "Write", done: false, skipped: false },
    { id: "post", title: "Write your first post", detail: "Say who it is for.", href: "/app/community/makers/feed?compose=welcome", action: "Write", done: true, skipped: false },
  ],
  done: 1,
  total: 2,
  percent: 50,
  pillHidden: false,
}
const spaces = [
  { id: "a0000000-0000-4000-8000-000000000001", slug: "general", name: "General", description: null, icon: null, kind: "feed", position: 0, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 0 },
  { id: "a0000000-0000-4000-8000-000000000002", slug: "announcements", name: "Announcements", description: null, icon: null, kind: "announcements", position: 1, postRole: "admin", commentsEnabled: true, viewAccess: {}, archived: false, posts: 0 },
  { id: "a0000000-0000-4000-8000-000000000003", slug: "introductions", name: "Introductions", description: null, icon: null, kind: "feed", position: 2, postRole: "member", commentsEnabled: true, viewAccess: {}, archived: false, posts: 0 },
]

const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const method = (init?.method || "GET").toUpperCase()
  let body: unknown = null
  try {
    body = init?.body ? JSON.parse(String(init.body)) : null
  } catch {
    body = String(init?.body)
  }
  if (!url.startsWith("/api")) return realFetch(input, init)
  w.__sent.push({ url, method, body })
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
  await new Promise((r) => setTimeout(r, 60))
  if (url.startsWith("/api/app/community?address=")) return json({ slug: decodeURIComponent(url.split("=")[1]), available: true, reason: null })
  if (url === "/api/app/community" && method === "POST") return json({ id: MADE, slug: "morning-writers" }, 201)
  if (/\/api\/app\/community\/[^/]+\/setup/.test(url)) return json(setupList)
  if (/\/api\/app\/community\/[^/]+\/spaces$/.test(url)) return json({ spaces })
  if (/\/api\/app\/community\/[^/]+\/moderation$/.test(url)) return json({ ok: true })
  if (/\/api\/community\/[^/]+\/posts$/.test(url) && method === "POST") {
    const b = body as { title?: string; body?: string; spaceId?: string }
    return json({ post: { id: "b0000000-0000-4000-8000-000000000009", title: b.title, bodyText: b.body, media: [], poll: null, space: { id: b.spaceId, slug: "announcements", name: "Announcements", kind: "announcements" }, author: { id: ME, name: "Mara Lind", avatarUrl: null }, createdAt: new Date().toISOString(), reactionCount: 0, commentCount: 0 } }, 201)
  }
  if (/link-preview/.test(url)) return json({ preview: null })
  return json({})
}) as typeof window.fetch

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316]">
      <AppSidebar creatorSlug="maralind" username="maralind" storePublished displayName="Mara Lind" stripeConnected={false} stripeStatus="not_connected" onePagePublished setupProgress={{ completed: 5, total: 7 }} businesses={[]} communitiesEnabled />
      <main className="app-main-content h-svh overflow-hidden rounded-t-[20px] bg-[#f8f9fa] pt-[68px] md:rounded-none md:pl-[var(--app-rail-w,240px)] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">{children}</div>
      </main>
    </div>
  )
}

function Members() {
  const [dirty, setDirty] = React.useState(false)
  w.__dirty = setDirty
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Makers</h1>
      <div className="mt-6 h-[900px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      <EditorFoot dirty={dirty} busy={false} error={null} onSave={() => setDirty(false)} onCancel={() => setDirty(false)} />
    </div>
  )
}

function Page() {
  if (path.startsWith("/app/community/new")) return <CreateCommunity me={{ userId: ME, name: "Mara Lind", avatarUrl: null }} />
  if (path.startsWith("/app/community/makers")) return <Members />
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Products</h1>
      <div className="mt-6 h-[640px] rounded-2xl border border-[#e5e7eb]/60 bg-white" />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <SWRProvider>
    <LocaleProvider>
      <LanguageProvider>
        <ToastHost>
          <Shell>
            <Page />
          </Shell>
        </ToastHost>
      </LanguageProvider>
    </LocaleProvider>
  </SWRProvider>,
)
