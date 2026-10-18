/**
 * Website Settings for scripts/check-website-settings-z4.mjs: the real
 * ProjectSettings opened on the subject in the address's hash (performance,
 * backups or connections). Performance answers with the same week of visits
 * scripts/render-performance-tab.tsx builds with the real report code; every
 * other request goes to the network, where the check's own routes answer it.
 * A finished restore is written on window.__restored instead of reloading.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import type { PerfRange } from "@/lib/website-builder/web-performance"
import { readyAnswer } from "./render-performance-tab"

declare global {
  interface Window {
    __restored?: number
    __held?: boolean[]
  }
}

const section = (location.hash.replace(/^#/, "") || "performance") as "performance" | "backups" | "connections"
const real = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("/performance") && !url.includes("/performance/lab")) {
    const range = (new URL(url, location.origin).searchParams.get("range") ?? "7d") as PerfRange
    return Promise.resolve(new Response(JSON.stringify(readyAnswer(false, range)), { status: 200, headers: { "content-type": "application/json" } }))
  }
  return real(input, init)
}) as typeof fetch

window.__restored = 0
window.__held = []

createRoot(document.getElementById("app")!).render(
  <ProjectSettings
    open
    onClose={() => {}}
    installId="install-1"
    name="Astrid Studio"
    onRenamed={() => {}}
    websiteUrl="https://astrid.storelib.com"
    websiteUrlDisplay="astrid.storelib.com"
    live
    publishedAt="2026-08-02T10:00:00Z"
    initialSection={section}
    connectVia={section === "connections" ? "github" : null}
    onRestored={() => {
      window.__restored = (window.__restored ?? 0) + 1
    }}
    onHoldDraft={async (hold) => {
      window.__held?.push(hold)
      return true
    }}
    pages={[
      { key: "home", name: "Home", path: "/" },
      { key: "about", name: "About", path: "/about" },
    ]}
  />,
)
