/**
 * Website Settings open on Connections, for scripts/check-connections.mjs.
 *
 * The real `ProjectSettings` screen with the real Connections page in it;
 * only the network is answered here, from `window.PROBE`:
 *
 *   agents      the keys the agent-connections route lists
 *   ready       false: direct connections are not switched on
 *   github      what the GitHub route answers
 *   useAfterMs  a key made on this page reports itself used this long after
 *               it was made, which is the tool starting on the creator's
 *               computer. The page is meant to notice by itself.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProjectSettings } from "@/components/website-builder/project-settings"

interface Key {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

declare global {
  interface Window {
    PROBE: { agents: Key[]; ready?: boolean; github: unknown; useAfterMs?: number; via?: "github" | null; returned?: string | null }
    probeCalls: string[]
  }
}

const S = window.PROBE
const calls: string[] = []
window.probeCalls = calls
const made: { id: string; at: number }[] = []

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  const method = init?.method ?? "GET"
  calls.push(`${method} ${url}`)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (/\/agent-connections/.test(url)) {
    if (method === "POST") {
      const name = (JSON.parse(String(init?.body ?? "{}")) as { name?: string }).name ?? "AI agent"
      const key: Key = { id: `key-${made.length + 1}`, name, prefix: "slb_Q7mX2p", created_at: new Date().toISOString(), last_used_at: null }
      S.agents = [key, ...S.agents]
      made.push({ id: key.id, at: Date.now() })
      return json({ connection: key, token: "slb_Q7mX2pVfH0c9Lr1aZt5WkEo3YbNd8GsuJi4lMqRx6T" })
    }
    if (method === "DELETE") {
      const id = new URL(url, location.href).searchParams.get("id")
      S.agents = S.agents.filter((k) => k.id !== id)
      return json({ ok: true })
    }
    if (S.useAfterMs !== undefined) {
      for (const m of made) {
        const key = S.agents.find((k) => k.id === m.id)
        if (key && !key.last_used_at && Date.now() - m.at >= S.useAfterMs) key.last_used_at = new Date().toISOString()
      }
    }
    return json({ connections: S.agents, ready: S.ready !== false })
  }
  /* Your own AI (components/website-builder/website-settings/own-ai.tsx): nothing connected unless the probe says so. */
  if (/\/api\/ai-keys/.test(url)) {
    const own = (S as { ownAi?: { keys: unknown[] } }).ownAi ?? { keys: [] }
    if (method === "POST") {
      const source = (JSON.parse(String(init?.body ?? "{}")) as { source?: string }).source ?? "anthropic"
      own.keys = [...own.keys, { source, hint: "7Qx2", connectedAt: new Date().toISOString(), lastUsedAt: null, lastError: null }]
    }
    return json({ keys: own.keys, setUp: true, storelib: true })
  }
  if (/\/github/.test(url)) return json(S.github)
  return json({})
}

createRoot(document.getElementById("app")!).render(
  <ProjectSettings
    open
    onClose={() => {}}
    installId="probe-install"
    name="Probe store"
    onRenamed={() => {}}
    websiteUrl="https://probe.storelib.com"
    websiteUrlDisplay="probe.storelib.com"
    live={false}
    publishedAt={null}
    initialSection="connections"
    githubReturned={S.returned ?? null}
    connectVia={S.via ?? null}
  />,
)
