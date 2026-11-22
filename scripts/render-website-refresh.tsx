/**
 * THE WEBSITE PAGE AND ITS SERVER, FOR scripts/check-website-refresh.mjs.
 *
 * The real WebsiteBuilderClient over a fake data layer that behaves the way
 * the app router does on `router.refresh()`: the server is asked for the
 * page again and its new props arrive IN A TRANSITION, after `__serverMs`.
 * While they are on their way the client's own useTransition is pending and
 * the page on screen stays (React keeps the old tree while the new one
 * suspends in a transition). That is what Next does with an RSC payload, so
 * the client's one-refresh-at-a-time fold is exercised for real.
 *
 *   __refreshes      every router.refresh() the page made, with its time
 *   __mounts         how many times the page's subtree was mounted (1 is right)
 *   __server         the rows the server answers with next; a probe edits it
 *   __serverMs       how long the server takes
 *   __calls          every API call the page made (method, path)
 *   __saved(id)      this tab saved a website in the editor (cover-refresh)
 *   __start()        draws the page
 */
import React, { Suspense, startTransition, use, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"
import { scheduleCoverRefresh } from "@/lib/website-builder/cover-refresh"

type W = {
  __refreshes: { at: number }[]
  __mounts: number
  __server: WebsiteSummary[]
  __serverMs: number
  __calls: { method: string; path: string; at: number }[]
  __saved: (id: string) => void
  __start: () => void
  __refresh: () => void
  __answers: Record<string, unknown>
}
const w = window as unknown as W

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
function site(id: string, name: string, status: WebsiteSummary["status"], minutes: number): WebsiteSummary {
  return {
    id,
    name,
    status,
    theme_id: "storelib-default",
    created_at: ago(60 * 48),
    updated_at: ago(minutes),
    published_at: status === "published" ? ago(minutes) : null,
    /* A cover taken after the last save, so the page does not ask for one. */
    snapshot_url: `/covers/${id}-v1.webp`,
    snapshot_mobile_url: null,
    snapshot_updated_at: ago(Math.max(0, minutes - 1)),
    saved_at: ago(minutes),
    theme: { name: "Storelib Default", version: "1.0.0", slug: "storelib-default" },
    settings: null,
  }
}
w.__server = [site("live-1", "Northwind", "published", 4), site("lib-0", "Studio", "draft", 120), site("lib-1", "Atelier", "draft", 180)]
/* Three of the library's seven places: room for the copies the probe makes (THEME_INSTALL_LIMIT). */
w.__serverMs = 450
w.__refreshes = []
w.__mounts = 0
w.__calls = []
w.__answers = {}
w.__saved = (id) => scheduleCoverRefresh(id)

/* The API: every call recorded; a probe sets what an address answers (w.__answers[path]); the rest answer {}. */
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = new URL(url, location.href).pathname
  if (!path.startsWith("/api/")) return realFetch(input, init)
  w.__calls.push({ method: (init?.method ?? "GET").toUpperCase(), path, at: performance.now() })
  await new Promise((r) => setTimeout(r, 60))
  const answer = w.__answers[path]
  if (answer === 404) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } })
  return new Response(JSON.stringify(answer ?? {}), { status: 200, headers: { "content-type": "application/json" } })
}) as typeof fetch

function ask(): Promise<WebsiteSummary[]> {
  const rows = w.__server.map((r) => ({ ...r }))
  return new Promise((r) => setTimeout(() => r(rows), w.__serverMs))
}

/** The page's subtree: mounted once for the whole visit, whatever the refreshes do. */
function MountProbe() {
  useEffect(() => {
    w.__mounts++
  }, [])
  return null
}

function Page({ data }: { data: Promise<WebsiteSummary[]> }) {
  const installs = use(data)
  return (
    <div data-page="website" className="h-full">
      <MountProbe />
      <WebsiteBuilderClient installs={installs} username="northwind" />
    </div>
  )
}

const first = Promise.resolve(w.__server.map((r) => ({ ...r })))
function Server() {
  const [data, setData] = useState<Promise<WebsiteSummary[]>>(first)
  /* router.refresh(): the server again, its answer in a transition (the app router's own setState is one). */
  w.__refresh = () => {
    w.__refreshes.push({ at: performance.now() })
    const next = ask()
    startTransition(() => setData(next))
  }
  return (
    <Suspense fallback={<div data-fallback="" />}>
      <Page data={data} />
    </Suspense>
  )
}

w.__start = () => {
  document.documentElement.classList.add("app-layout")
  createRoot(document.getElementById("app")!).render(
    <TooltipProvider>
      <div className="h-svh overflow-y-auto bg-[#f8f9fa]">
        <Server />
      </div>
    </TooltipProvider>,
  )
}
