/**
 * Settings › Domains on its own, for scripts/check-domains.mjs: the real
 * panel, in the settings page's column, over the routes it calls answered
 * from a fixture named in the address (?fixture=pending|verifying|
 * connected|conflict).
 */
import * as React from "react"
import { DomainsPanel, type DomainRow } from "@/components/app/settings/domains-panel"

declare global {
  interface Window {
    __domainCalls?: string[]
  }
}

const TOKEN = "storelib-verify-3f9c2a71d04b8e56a1c7f02e9d4b6a8c"

function fixtureRows(name: string): DomainRow[] {
  const base = { id: "d1", domain: "marastudio.com", created_at: "2026-09-20T10:00:00Z", verification_token: TOKEN }
  if (name === "connected") return [{ ...base, status: "active", target: "creator_page", ssl_status: "active", verified_at: "2026-09-21T10:00:00Z" }]
  if (name === "verifying") return [{ ...base, status: "verifying", target: "website" }]
  return [{ ...base, status: "pending", target: "website" }]
}

const missing = { state: "missing", seen: [] as string[] }
const CHECKS: Record<string, unknown> = {
  pending: { a: missing, cname: missing, txt: missing, aaaa: [], cloudflareProxy: false, caaBlocks: false },
  conflict: {
    a: { state: "conflict", seen: ["192.0.2.10"] },
    cname: { state: "conflict", seen: ["parkingpage.namecheap.com"] },
    txt: missing,
    aaaa: [],
    cloudflareProxy: false,
    caaBlocks: false,
  },
}

function stubFetch(fixture: string) {
  const calls: string[] = (window.__domainCalls = [])
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push(`${method} ${url}`)
    if (url === "/api/domains/verify") {
      const checks = CHECKS[fixture] ?? CHECKS.pending
      return json({ verified: false, message: "The records are not showing yet.", checks, issues: ["x"] })
    }
    if (url === "/api/domains" && method === "PATCH") {
      const { domainId, target } = JSON.parse(String(init?.body ?? "{}")) as { domainId: string; target: string }
      return json({ domain: { id: domainId, target } })
    }
    if (url === "/api/domains" && method === "GET") {
      return json({
        domains: fixtureRows(fixture),
        sources: { website: { live: true, handle: "mara" }, onepage: { live: true }, username: "mara" },
        targetReady: true,
      })
    }
    return json({})
  }) as typeof fetch
}

function App() {
  const [domains, setDomains] = React.useState<DomainRow[]>([])
  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
      <div className="mx-auto max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DomainsPanel username="mara" userPlan="pro" planLoading={false} websiteHandle="mara" domains={domains} onDomainsChange={setDomains} />
      </div>
    </div>
  )
}

export function boot(mount: (el: React.ReactElement) => void) {
  stubFetch(new URLSearchParams(location.search).get("fixture") || "pending")
  mount(<App />)
}
