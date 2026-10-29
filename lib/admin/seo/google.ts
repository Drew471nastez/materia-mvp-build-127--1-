import "server-only"

import { createSign } from "node:crypto"

/**
 * ===========================================================================
 *  GOOGLE SEARCH CONSOLE: SIGNING IN AS A SERVICE ACCOUNT, AND ASKING
 * ===========================================================================
 * Only /admin/seo, its route and its cron import this.
 *
 * Signing in is Google's two legged OAuth for a service account
 * (developers.google.com/identity/protocols/oauth2/service-account): a JWT
 * signed with the account's private key, RS256, exchanged at
 * oauth2.googleapis.com/token for an access token that lasts an hour. It is
 * signed with node:crypto, so there is no Google library in the bundle.
 *
 * Asking is the URL Inspection API
 * (developers.google.com/webmaster-tools/v1/urlInspection.index/inspect):
 * one POST per address, with the Search Console property it belongs to.
 * The answer is Google's own record of the address. Nothing here guesses at
 * it, and an address Google has not answered for is "not checked", never
 * "indexed".
 */

export const TOKEN_URL = "https://oauth2.googleapis.com/token"
export const INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
export const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"

export interface ServiceAccount {
  clientEmail: string
  privateKey: string
}

/** The service account from the environment, or null when Search Console is not connected. */
export function serviceAccountFromEnv(env: Record<string, string | undefined> = process.env): ServiceAccount | null {
  const clientEmail = env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?.trim()
  /* A key pasted into a dashboard often arrives with its line breaks written as \n. */
  const privateKey = env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim()
  if (!clientEmail || !privateKey || !privateKey.includes("PRIVATE KEY")) return null
  return { clientEmail, privateKey }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url")

/** The signed assertion Google exchanges for a token. `now` is seconds since 1970. */
export function signServiceAccountJwt(account: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(JSON.stringify({ iss: account.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${claims}`)
  signer.end()
  return `${header}.${claims}.${b64url(signer.sign(account.privateKey))}`
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Why a call to Google did not answer, in words the console can show. */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

let held: { token: string; until: number; email: string } | null = null

/** An access token, reused while it has more than a minute left. */
export async function accessToken(account: ServiceAccount, fetchImpl: Fetch = fetch): Promise<string> {
  if (held && held.email === account.clientEmail && held.until > Date.now() + 60_000) return held.token
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt(account) })
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !json.access_token) {
    throw new GoogleError(`Google refused the service account sign in${json.error ? ` (${json.error})` : ""}. Check the client email and private key.`, res.status)
  }
  held = { token: json.access_token, until: Date.now() + (json.expires_in ?? 3600) * 1000, email: account.clientEmail }
  return json.access_token
}

/** For a test: forget the held token. */
export function forgetToken() {
  held = null
}

/* ── The answer ────────────────────────────────────────────────────────── */

export type GoogleStatus = "indexed" | "not_indexed" | "unknown" | "error" | "no_property"

export interface Inspection {
  googleStatus: GoogleStatus
  verdict: string | null
  coverageState: string | null
  indexingState: string | null
  robotsTxtState: string | null
  pageFetchState: string | null
  lastCrawlTime: string | null
  googleCanonical: string | null
  userCanonical: string | null
  inspectionLink: string | null
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * Google's verdict, read as it is. PASS is the only answer that means the
 * address is on Google ("Submitted and indexed", "Indexed, not submitted in
 * sitemap"). FAIL and NEUTRAL are both "not on Google", for different
 * reasons that coverageState names. Anything else is unknown.
 */
export function statusOfVerdict(verdict: string | null): GoogleStatus {
  if (verdict === "PASS") return "indexed"
  if (verdict === "FAIL" || verdict === "NEUTRAL" || verdict === "PARTIAL") return "not_indexed"
  return "unknown"
}

export function parseInspection(json: unknown): Inspection {
  const result = (json as { inspectionResult?: { inspectionResultLink?: unknown; indexStatusResult?: Record<string, unknown> } })?.inspectionResult
  const s = result?.indexStatusResult ?? {}
  const verdict = text(s.verdict)
  const crawl = text(s.lastCrawlTime)
  return {
    googleStatus: statusOfVerdict(verdict),
    verdict,
    coverageState: text(s.coverageState),
    indexingState: text(s.indexingState),
    robotsTxtState: text(s.robotsTxtState),
    pageFetchState: text(s.pageFetchState),
    lastCrawlTime: crawl && !Number.isNaN(Date.parse(crawl)) ? new Date(crawl).toISOString() : null,
    googleCanonical: text(s.googleCanonical),
    userCanonical: text(s.userCanonical),
    inspectionLink: text(result?.inspectionResultLink),
  }
}

/** One address, asked of Google. Throws GoogleError with a plain reason when Google does not answer it. */
export async function inspectUrl(token: string, inspectionUrl: string, siteUrl: string, fetchImpl: Fetch = fetch): Promise<Inspection> {
  const res = await fetchImpl(INSPECT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "en-US" }),
    signal: AbortSignal.timeout(20_000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new GoogleError(inspectionRefusal(res.status, json, siteUrl), res.status)
  return parseInspection(json)
}

/** Google's refusal, said plainly. Its own message is kept short and never carries a key. */
export function inspectionRefusal(status: number, json: unknown, siteUrl: string): string {
  const said = String((json as { error?: { message?: unknown } })?.error?.message ?? "").slice(0, 160)
  if (status === 403) return `The service account is not a user on ${siteUrl} in Search Console.`
  if (status === 429) return "Google's daily inspection quota for this property is used up. It resets at midnight Pacific time."
  if (status === 401) return "Google did not accept the access token."
  if (status === 400) return `Google could not inspect this address${said ? `: ${said}` : "."}`
  return `Google answered ${status}${said ? `: ${said}` : "."}`
}
