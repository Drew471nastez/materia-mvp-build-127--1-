/**
 * Round 8 of the phone polish: the round 17 harness (render-communities-post17.tsx: the real shell, feed, opened post,
 * comments and composer) with the two pieces of the real app that move things when a keyboard comes up, KeyboardGuard
 * (the `keyboard-open` class and its rules in app/globals.css) and the community search's opener, which the phone's tab
 * bar calls. Rendered by scripts/check-community-mobile-r8.mjs.
 */
import "./render-communities-post17"
import React from "react"
import { createRoot } from "react-dom/client"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { openCommunitySearch } from "@/lib/nav/community-search-bridge"

const host = document.createElement("div")
host.id = "r8-extra"
document.body.appendChild(host)
createRoot(host).render(<KeyboardGuard />)
/* As the real tab bar does (components/nav/buyer-tab-bar.tsx useTyping): out of sight while a field is typed in. */
const typing = document.createElement("style")
typing.textContent = `html:has(input:focus, textarea:focus, [contenteditable="true"]:focus) [data-buyer-tab-bar]{translate:0 100%}`
document.head.appendChild(typing)
;(window as unknown as { __openSearch?: () => boolean }).__openSearch = () => openCommunitySearch("clay-studio")

/* The community's search, answered here: one post (round 17's "Is this foot too heavy?"), for a result picked over an opened post. */
const hit = { id: "a0000000-0000-4000-8000-000000000004", title: "Is this foot too heavy?", snippet: "Trimmed it twice and it still reads thick to me.", createdAt: new Date().toISOString(), space: { slug: "critique", name: "Critique" }, author: { name: "Mara Lindqvist", avatarUrl: null } }
const before = window.fetch
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin)
  if (/\/api\/community\/[^/]+\/search$/.test(url.pathname)) {
    const body = url.searchParams.get("index") ? { index: { at: Date.now(), spaces: [], posts: [{ ...hit, text: hit.snippet }], members: [], lessons: [], events: [] } } : { results: { q: url.searchParams.get("q") || "", spaces: [], posts: [hit], members: [], lessons: [], events: [] } }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  return before(input, init)
}
