import "server-only"

/**
 * ===========================================================================
 *  CONNECT SUPABASE BY SIGNING IN, NOT BY PASTING KEYS
 * ===========================================================================
 * Website settings › Connections › Your own database asked for a project URL
 * and an anon key, typed in. Now it is the way Lovable does it: Connect
 * Supabase, sign in at Supabase, pick a project, done.
 *
 *   1. /api/website-builder/supabase/connect   sends the creator to
 *      Supabase's OAuth page (PKCE), with a signed state naming the site.
 *   2. /api/website-builder/supabase/callback  trades the code for a token,
 *      seals the token into a short lived, http only cookie, and sends the
 *      creator back to Connections.
 *   3. /api/website-builder/supabase/projects  lists the projects that token
 *      can see, and for the one picked, hands back its address and its
 *      PUBLIC key, which the builder saves exactly as the typed form did
 *      (lib/website-builder/own-database.ts). The token is then forgotten.
 *
 * Nothing but the public key ever leaves the server: the token stays sealed
 * in its cookie, and a secret key is refused by checkPublicKey on the way
 * out as it always was.
 *
 * NEEDS AN OAUTH APP. SUPABASE_OAUTH_CLIENT_ID and SUPABASE_OAUTH_CLIENT_SECRET,
 * from an OAuth app made in the Supabase dashboard (Organization › OAuth
 * Apps) with the callback above as its redirect URL. Without them the panel
 * keeps the typed form.
 */
import { createHash, randomBytes } from "node:crypto"
import { checkPublicKey } from "./own-database"

const API = "https://api.supabase.com"

/** The verifier and the token cookies, both scoped to these routes alone. */
export const VERIFIER_COOKIE = "sb_connect_v"
export const TOKEN_COOKIE = "sb_connect_t"
export const COOKIE_PATH = "/api/website-builder/supabase"
/** Long enough to sign in and pick a project, short enough not to linger. */
export const TOKEN_MAX_AGE_S = 15 * 60

export function supabaseOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function callbackUrl(req: Request): string {
  return new URL(`${COOKIE_PATH}/callback`, req.url).toString()
}

/** A PKCE pair: the verifier kept here, the challenge sent to Supabase. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function authorizeUrl(cfg: { clientId: string }, redirectUri: string, state: string, challenge: string): string {
  const u = new URL(`${API}/v1/oauth/authorize`)
  u.searchParams.set("client_id", cfg.clientId)
  u.searchParams.set("redirect_uri", redirectUri)
  u.searchParams.set("response_type", "code")
  u.searchParams.set("state", state)
  u.searchParams.set("code_challenge", challenge)
  u.searchParams.set("code_challenge_method", "S256")
  return u.toString()
}

export async function exchangeCode(
  cfg: { clientId: string; clientSecret: string },
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${API}/v1/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as { access_token?: unknown } | null
    return typeof data?.access_token === "string" ? data.access_token : null
  } catch {
    return null
  }
}

export interface SupabaseProject {
  ref: string
  name: string
  region: string
}

const REF = /^[a-z0-9]{10,40}$/

export async function listProjects(token: string): Promise<SupabaseProject[] | null> {
  try {
    const res = await fetch(`${API}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null
    if (!Array.isArray(rows)) return null
    return rows
      .map((r) => ({
        ref: String(r.ref ?? r.id ?? ""),
        name: typeof r.name === "string" ? r.name : "",
        region: typeof r.region === "string" ? r.region : "",
      }))
      .filter((p) => REF.test(p.ref))
  } catch {
    return null
  }
}

/**
 * The project's address and its public key: a publishable key when it has
 * one, else the legacy anon key. Whatever Supabase answers goes through
 * checkPublicKey, so a secret key could not come out of here by mistake.
 */
export async function projectConnection(token: string, ref: string): Promise<{ url: string; key: string } | null> {
  if (!REF.test(ref)) return null
  try {
    const res = await fetch(`${API}/v1/projects/${ref}/api-keys`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const keys = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null
    if (!Array.isArray(keys)) return null
    const ordered = [
      ...keys.filter((k) => k.type === "publishable"),
      ...keys.filter((k) => k.name === "anon"),
    ]
    for (const k of ordered) {
      const checked = checkPublicKey(k.api_key)
      if (checked.ok) return { url: `https://${ref}.supabase.co`, key: checked.value }
    }
    return null
  } catch {
    return null
  }
}
