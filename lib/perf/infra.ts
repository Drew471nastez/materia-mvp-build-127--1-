import "server-only"

import type { SupabaseInfo, VercelInfo } from "./infra-types"

export type { SupabaseInfo, VercelInfo }

/**
 * ===========================================================================
 *  SUPABASE AND VERCEL, ONLY WHEN A TOKEN SAYS WE MAY ASK
 * ===========================================================================
 * Neither platform hands its resource figures to the app by default, and
 * Vercel's observability API is not enabled on this project. So:
 *
 *   SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com, account
 *   settings): the Management API's health of each service (database, auth,
 *   REST, storage, realtime) and yesterday's request counts.
 *
 *   VERCEL_API_TOKEN (vercel.com, account settings, tokens): the production
 *   deployments of the last seven days, how many failed and how long a build
 *   took. The project comes from VERCEL_PROJECT_ID, or from the deployment
 *   this code is running in (VERCEL_DEPLOYMENT_ID, set by Vercel);
 *   VERCEL_TEAM_ID when the project belongs to a team.
 *
 * Without a token the answer is `configured: false`, and the page says what
 * to set. A failed call is `ok: false` with the reason; never a zero. Each
 * answer is kept for five minutes per server instance, and every call gives
 * up after four seconds.
 */

const TTL_MS = 5 * 60_000
const TIMEOUT_MS = 4000

const cache = new Map<string, { until: number; value: unknown }>()

async function remember<T>(key: string, read: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.value as T
  const value = await read()
  cache.set(key, { until: Date.now() + TTL_MS, value })
  return value
}

async function getJson(url: string, token: string): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return { ok: false, reason: `Answered ${res.status}` }
    return { ok: true, body: await res.json() }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "No answer within four seconds" : "Could not be reached" }
  }
}

/** The project ref from the Supabase address: `abcd` from https://abcd.supabase.co. */
export function supabaseRef(url: string | undefined): string | null {
  const m = /^https:\/\/([a-z0-9]{8,40})\.supabase\.co/i.exec(url ?? "")
  return m ? m[1] : null
}

export async function supabaseInfo(): Promise<SupabaseInfo> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) return { configured: false }
  const ref = supabaseRef(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (!ref) return { configured: true, ok: false, reason: "The project could not be told from NEXT_PUBLIC_SUPABASE_URL" }
  return remember<SupabaseInfo>("supabase", async () => {
    const base = `https://api.supabase.com/v1/projects/${ref}`
    const [health, usage] = await Promise.all([
      getJson(`${base}/health?services=db&services=auth&services=rest&services=storage&services=realtime`, token),
      getJson(`${base}/analytics/endpoints/usage.api-counts?interval=1day`, token),
    ])
    if (!health.ok) return { configured: true, ok: false, reason: health.reason }
    const services = (Array.isArray(health.body) ? health.body : [])
      .map((s: { name?: unknown; healthy?: unknown }) => ({ name: String(s.name ?? ""), healthy: s.healthy === true }))
      .filter((s) => s.name)
    let requests: { rest: number; auth: number; storage: number; realtime: number } | null = null
    if (usage.ok) {
      const rows = ((usage.body as { result?: unknown })?.result ?? []) as Array<Record<string, unknown>>
      if (Array.isArray(rows) && rows.length) {
        const sum = (k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
        requests = { rest: sum("total_rest_requests"), auth: sum("total_auth_requests"), storage: sum("total_storage_requests"), realtime: sum("total_realtime_requests") }
      }
    }
    return { configured: true, ok: true, services, down: services.filter((s) => !s.healthy).length, requests }
  })
}

export async function vercelInfo(now = Date.now()): Promise<VercelInfo> {
  const token = process.env.VERCEL_API_TOKEN
  if (!token) return { configured: false }
  return remember<VercelInfo>("vercel", async () => {
    const team = process.env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : ""
    let project = process.env.VERCEL_PROJECT_ID ?? null
    if (!project && process.env.VERCEL_DEPLOYMENT_ID) {
      const own = await getJson(`https://api.vercel.com/v13/deployments/${encodeURIComponent(process.env.VERCEL_DEPLOYMENT_ID)}?${team.slice(1)}`, token)
      if (own.ok) project = String((own.body as { projectId?: unknown })?.projectId ?? "") || null
    }
    if (!project) return { configured: true, ok: false, reason: "Set VERCEL_PROJECT_ID, or run on Vercel so the project can be read from the deployment" }
    const since = now - 7 * 86_400_000
    const list = await getJson(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(project)}&target=production&limit=100&since=${since}${team}`, token)
    if (!list.ok) return { configured: true, ok: false, reason: list.reason }
    const deployments = ((list.body as { deployments?: unknown })?.deployments ?? []) as Array<{ state?: string; readyState?: string; created?: number; buildingAt?: number; ready?: number }>
    const finished = deployments.filter((d) => ["READY", "ERROR"].includes(String(d.readyState ?? d.state)))
    const builds = finished
      .filter((d) => typeof d.ready === "number" && typeof d.buildingAt === "number" && (d.ready as number) > (d.buildingAt as number))
      .map((d) => (d.ready as number) - (d.buildingAt as number))
      .sort((a, b) => a - b)
    const newest = deployments[0]
    return {
      configured: true,
      ok: true,
      total: finished.length,
      failed: finished.filter((d) => String(d.readyState ?? d.state) === "ERROR").length,
      medianBuildMs: builds.length ? builds[Math.floor((builds.length - 1) / 2)] : null,
      latest: newest && typeof newest.created === "number" ? { state: String(newest.readyState ?? newest.state ?? ""), createdAt: new Date(newest.created).toISOString() } : null,
    }
  })
}
