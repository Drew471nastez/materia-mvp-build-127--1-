/**
 * Backups & Versions on its own, for scripts/check-release-versions.mjs: the
 * real Website Settings, opened on that subject, over a page with nothing
 * else on it. The routes it calls are answered by a fake fetch whose answers
 * the check picks with `?releases=` and `?restore=`:
 *
 *   releases  list (four versions) | none (an empty list) | off ({ available: false }) | wait (never answers)
 *   restore   ok | fail (the route's own refusal) | hold (answers when window.__finishRestore() is called)
 *
 * Every call is written to window.__calls, the editor's reload (what
 * `onRestored` does in the editor) to window.__reloads, and Website
 * Settings closing to window.__closes.
 */
import * as React from "react"
import { ProjectSettings } from "@/components/website-builder/project-settings"

declare global {
  interface Window {
    __calls?: string[]
    __reloads?: number
    __closes?: number
    __finishRestore?: () => void
  }
}

const RELEASES = [
  { id: "aaaaaaaa-1111-4111-8111-111111111111", createdAt: "2026-10-14T16:42:00Z", files: 12, restored: false, live: true },
  { id: "bbbbbbbb-2222-4222-8222-222222222222", createdAt: "2026-10-09T09:05:00Z", files: 12, restored: true, live: false },
  { id: "cccccccc-3333-4333-8333-333333333333", createdAt: "2026-10-02T18:20:00Z", files: 11, restored: false, live: false },
  { id: "dddddddd-4444-4444-8444-444444444444", createdAt: "2026-09-22T09:30:00Z", files: 9, restored: false, live: false },
]

function stubFetch() {
  const q = new URLSearchParams(location.search)
  const releases = q.get("releases") || "list"
  const restore = q.get("restore") || "ok"
  const calls: string[] = (window.__calls = [])
  window.__reloads = 0
  window.__closes = 0
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push(`${method} ${url}`)
    if (/\/releases\/[^/]+\/restore$/.test(url) && method === "POST") {
      if (restore === "fail") return json({ error: "This version cannot be restored. Nothing changed." }, 422)
      if (restore === "hold") {
        return new Promise<Response>((resolve) => {
          window.__finishRestore = () => resolve(new Response(JSON.stringify({ ok: true, releaseId: "new", status: "published" }), { status: 200 }))
        })
      }
      return json({ ok: true, releaseId: "eeeeeeee-5555-4555-8555-555555555555", status: "published" })
    }
    if (url.endsWith("/releases")) {
      if (releases === "wait") return new Promise<Response>(() => {})
      if (releases === "off") return json({ available: false })
      if (releases === "none") return json({ available: true, releases: [] })
      return json({ available: true, releases: RELEASES })
    }
    if (url.endsWith("/backups") && method === "GET") {
      if (releases === "wait") return new Promise<Response>(() => {})
      return json({
        backups: [
          { id: "b1", label: "Published", source: "publish", created_at: "2026-10-14T16:42:00Z" },
          { id: "b2", label: "Added a pricing section", source: "ai", created_at: "2026-10-13T11:15:00Z" },
          { id: "b3", label: "Manual backup", source: "manual", created_at: "2026-10-10T08:02:00Z" },
        ],
      })
    }
    return json({})
  }) as typeof fetch
}

function App() {
  return (
    <ProjectSettings
      open
      onClose={() => { window.__closes = (window.__closes ?? 0) + 1 }}
      installId="install-1"
      name="Astrid Studio"
      onRenamed={() => {}}
      websiteUrl="https://astrid.storelib.com"
      websiteUrlDisplay="astrid.storelib.com"
      live
      publishedAt="2026-10-14T16:42:00Z"
      initialSection="backups"
      onRestored={() => { window.__reloads = (window.__reloads ?? 0) + 1 }}
    />
  )
}

export function boot(mount: (el: React.ReactElement) => void) {
  stubFetch()
  mount(<App />)
}
