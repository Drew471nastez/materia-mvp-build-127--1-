/*
 * Support from both sides against a stubbed API, for scripts/check-support.mjs:
 * the store's /app/support (`window.__panel = "store"`) and Storelib's
 * /admin/resolution (`"admin"`). `window.__api` answers by "METHOD path" or
 * path; every POST is recorded in `window.__sent`.
 */
import { createRoot } from "react-dom/client"
import { SupportClient } from "@/app/app/support/support-client"
import { ResolutionCenter } from "@/app/admin/resolution/resolution-center"

type W = Window & { __panel?: string; __api?: Record<string, unknown>; __sent?: { method: string; path: string; body: unknown }[] }
const w = window as W
w.__sent = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const full = url.replace(/^https?:\/\/[^/]+/, "")
  const path = full.split("?")[0]
  const method = (init?.method || "GET").toUpperCase()
  if (!path.startsWith("/api/")) return realFetch(input, init)
  if (method !== "GET") w.__sent!.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
  const body = w.__api?.[`${method} ${full}`] ?? w.__api?.[`${method} ${path}`] ?? w.__api?.[path] ?? {}
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

const admin = w.__panel === "admin"
createRoot(document.getElementById("app")!).render(admin ? <ResolutionCenter /> : <div style={{ height: "100vh" }}><SupportClient /></div>)
