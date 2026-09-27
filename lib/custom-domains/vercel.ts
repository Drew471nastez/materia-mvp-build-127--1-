import "server-only"

/**
 * ===========================================================================
 *  THE VERCEL PROJECT'S DOMAINS, FROM THE SERVER ONLY
 * ===========================================================================
 * Every connected domain has to be on the Vercel project that serves
 * storelib.com, or Vercel answers it with DEPLOYMENT_NOT_FOUND before any
 * of our code runs. This is the one place that talks to Vercel about it.
 *
 *   VERCEL_TOKEN        a token that can manage the project's domains
 *   VERCEL_PROJECT_ID   the storelib.com project (prj_...)
 *   VERCEL_TEAM_ID      the team it belongs to, when it belongs to one
 *
 * None of the three is NEXT_PUBLIC, and this file is server-only, so the
 * token cannot reach a browser bundle. Without them nothing is registered
 * and the routes say so rather than pretending: `vercelConfigured()` is
 * false and the Domains tab shows the default records.
 *
 * Moved here from app/api/domains/route.ts and its verify route, which each
 * carried a copy (and a route file may export only its handlers).
 */
import { DEFAULT_A, vercelHostsFor } from "./hostname"
import { HOST_DEFAULT_CNAME } from "./targets"

const API = "https://api.vercel.com"

function env() {
  return {
    token: process.env.VERCEL_TOKEN,
    project: process.env.VERCEL_PROJECT_ID,
    team: process.env.VERCEL_TEAM_ID,
  }
}

export function vercelConfigured(): boolean {
  const { token, project } = env()
  return Boolean(token && project)
}

function url(path: string, query: Record<string, string> = {}): string {
  const { team } = env()
  const params = new URLSearchParams(query)
  if (team) params.set("teamId", team)
  const qs = params.toString()
  return `${API}${path}${qs ? `?${qs}` : ""}`
}

async function call(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const { token } = env()
  const { query, ...rest } = init
  try {
    const res = await fetch(url(path, query), {
      ...rest,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(rest.headers || {}) },
      signal: rest.signal ?? AbortSignal.timeout(8000),
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    console.error("[vercel-domains] request failed:", path, err instanceof Error ? err.message : err)
    return { ok: false, status: 0, data: {} }
  }
}

export interface VercelChallenge {
  type: string
  domain: string
  value: string
  reason?: string
}

export interface AddResult {
  ok: boolean
  error?: string
  /** Vercel wants a TXT record first: the domain is in use on another Vercel account. */
  challenges: VercelChallenge[]
}

const ALREADY_HERE = new Set(["domain_already_in_use", "DOMAIN_ALREADY_IN_USE", "domain_already_exists"])

/**
 * Put every host a domain needs on the project: for an apex, www (which
 * serves) and the bare name (a 301 to www at the edge); for a subdomain,
 * itself. Idempotent: a host that is already there counts as added.
 */
export async function addDomainHosts(domain: string): Promise<AddResult> {
  const { project } = env()
  if (!vercelConfigured()) {
    console.warn("[vercel-domains] VERCEL_TOKEN or VERCEL_PROJECT_ID is not set; the domain is saved but not registered")
    return { ok: true, challenges: [] }
  }
  const challenges: VercelChallenge[] = []
  for (const host of vercelHostsFor(domain)) {
    const body: Record<string, unknown> = { name: host.name }
    if (host.redirect) {
      body.redirect = host.redirect
      body.redirectStatusCode = 301
    }
    const res = await call(`/v10/projects/${project}/domains`, { method: "POST", body: JSON.stringify(body) })
    if (res.ok) {
      if (res.data?.verified === false && Array.isArray(res.data?.verification)) challenges.push(...res.data.verification)
      continue
    }
    const code = res.data?.error?.code
    if (ALREADY_HERE.has(code) || res.status === 409) {
      /* Already on this project (fine), or on another project (not ours to take). Read it back to know which. */
      const mine = await readProjectDomain(host.name)
      if (mine) {
        if (mine.verified === false && Array.isArray(mine.verification)) challenges.push(...mine.verification)
        continue
      }
      return { ok: false, error: "This domain is connected to another site. Remove it there first, then try again.", challenges }
    }
    if (res.status === 0) {
      /* Vercel did not answer. Saved anyway; Check again registers it. */
      continue
    }
    const message = String(res.data?.error?.message || "")
    console.error("[vercel-domains] add refused:", host.name, code, message)
    if (code === "invalid_domain" || /invalid/i.test(message)) return { ok: false, error: "That is not a valid domain. It should look like yourname.com.", challenges }
    if (code === "forbidden" || res.status === 403) return { ok: false, error: "Storelib could not register the domain right now. Try again in a few minutes.", challenges }
    return { ok: false, error: message || "Storelib could not register the domain right now.", challenges }
  }
  return { ok: true, challenges }
}

/** Take a domain's hosts off the project. Best effort. */
export async function removeDomainHosts(domain: string): Promise<void> {
  const { project } = env()
  if (!vercelConfigured()) return
  /* The bare name first: it redirects to www, and Vercel refuses to remove a target something still points at. */
  for (const host of vercelHostsFor(domain).reverse()) {
    await call(`/v9/projects/${project}/domains/${encodeURIComponent(host.name)}`, { method: "DELETE" })
  }
}

export async function readProjectDomain(host: string): Promise<{ verified?: boolean; verification?: VercelChallenge[] } | null> {
  const { project } = env()
  if (!vercelConfigured()) return null
  const res = await call(`/v9/projects/${project}/domains/${encodeURIComponent(host)}`, { signal: AbortSignal.timeout(5000) })
  return res.ok ? res.data : null
}

/** Ask Vercel to check a pending TXT challenge now rather than on its own schedule. */
export async function verifyProjectDomain(host: string): Promise<boolean> {
  const { project } = env()
  if (!vercelConfigured()) return false
  const res = await call(`/v9/projects/${project}/domains/${encodeURIComponent(host)}/verify`, { method: "POST" })
  return res.ok && res.data?.verified === true
}

export interface Recommended {
  ipv4: string
  cname: string
  challenges: VercelChallenge[]
  /** Vercel's own reading: the records are not right yet, or a certificate cannot be issued. */
  misconfigured: boolean | null
}

/**
 * The records Vercel recommends for this project, and any TXT challenge it
 * is waiting on. The CNAME can be project specific
 * (`<hash>.vercel-dns-017.com`) and the A record has changed before. The
 * address is shown as Vercel says it; the CNAME a creator sees is always
 * domains.storelib.com (lib/custom-domains/hostname.ts), and this one is
 * only read by the check, which accepts it too.
 */
export async function recommendedRecords(domain: string): Promise<Recommended> {
  const fallback: Recommended = { ipv4: DEFAULT_A, cname: HOST_DEFAULT_CNAME, challenges: [], misconfigured: null }
  if (!vercelConfigured()) return fallback
  const { project } = env()
  const hosts = vercelHostsFor(domain)
  const serving = hosts[0].name
  const [config, apexConfig, projectDomain] = await Promise.all([
    call(`/v6/domains/${encodeURIComponent(serving)}/config`, { query: { projectIdOrName: project! }, signal: AbortSignal.timeout(5000) }),
    hosts.length > 1
      ? call(`/v6/domains/${encodeURIComponent(hosts[1].name)}/config`, { query: { projectIdOrName: project! }, signal: AbortSignal.timeout(5000) })
      : Promise.resolve(null),
    readProjectDomain(serving),
  ])
  const pick = (list: unknown): string | null => {
    if (!Array.isArray(list) || list.length === 0) return null
    const best = [...list].sort((a: any, b: any) => (a?.rank ?? 99) - (b?.rank ?? 99))[0] as { value?: unknown }
    const v = Array.isArray(best?.value) ? best.value[0] : best?.value
    return typeof v === "string" && v ? v.replace(/\.$/, "") : null
  }
  const ipv4 = pick(apexConfig?.data?.recommendedIPv4) || pick(config.data?.recommendedIPv4) || DEFAULT_A
  const cname = pick(config.data?.recommendedCNAME) || HOST_DEFAULT_CNAME
  const challenges = projectDomain?.verified === false && Array.isArray(projectDomain.verification) ? projectDomain.verification : []
  const misconfigured = config.ok ? config.data?.misconfigured === true : null
  return { ipv4, cname, challenges, misconfigured }
}

/**
 * Is the certificate there? An HTTPS request that completes a handshake is
 * the only proof: Vercel's "verified" means the DNS is right, not that a
 * certificate has been issued, and marking a domain live on that alone is
 * what sent visitors to ERR_SSL_PROTOCOL_ERROR before.
 */
export async function httpsAnswers(host: string): Promise<{ ok: boolean; reason?: "ssl" | "dns" | "refused" | "timeout" }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://${host}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" })
      if (res.status > 0) return { ok: true }
    } catch (err: any) {
      const msg = String(err?.cause?.code || err?.message || "")
      if (/SSL|TLS|CERT|certificate/i.test(msg)) return { ok: false, reason: "ssl" }
      if (msg.includes("ENOTFOUND")) return { ok: false, reason: "dns" }
      if (msg.includes("ECONNREFUSED")) return { ok: false, reason: "refused" }
      if (attempt === 0) continue
      return { ok: false, reason: "timeout" }
    }
  }
  return { ok: false, reason: "timeout" }
}
