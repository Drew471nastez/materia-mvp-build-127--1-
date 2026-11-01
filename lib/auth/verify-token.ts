import "server-only"

import type { User } from "@supabase/supabase-js"

/**
 * ===========================================================================
 *  WHO SIGNED THIS TOKEN, CHECKED HERE, WITHOUT ASKING SUPABASE AUTH
 * ===========================================================================
 * The project signs access tokens with the legacy shared secret (HS256):
 * its JWKS endpoint answers {"keys":[]}. So the only way any server code
 * could check a token was GET /auth/v1/user, a round trip to Supabase Auth,
 * and when Auth had a slow minute every page and API call waited on it
 * (production, Nov 1 09:03 UTC: "auth/v1/user took longer than 10s" on
 * /app, /auth/sync-session, the proxy) and people saw "Cannot reach the
 * server" with a valid session in their cookie.
 *
 * This checks the token the way PostgREST checks it on every query:
 *
 *   HS256        with SUPABASE_JWT_SECRET (the project's legacy JWT secret,
 *                server only, never in a client bundle, never logged)
 *   ES256/RS256  with the project's public keys from its JWKS endpoint,
 *                once the owner migrates to asymmetric signing keys
 *                (docs/reliability/AUTH_KEYS.md). No secret needed then.
 *
 * and then the claims: exp and nbf (30s of clock skew), iss is this
 * project's Auth, aud and role are "authenticated", sub is present. The alg
 * in the header picks the key TYPE and nothing else: HS256 only ever meets
 * the secret, an asymmetric alg only ever meets a public key of its own
 * kind, "none" and anything else meets nothing. WebCrypto's verify is
 * constant time.
 *
 * A YES ONLY. Every caller treats a failure here as "could not tell" and
 * asks Supabase Auth as before, so a wrong or missing secret can never sign
 * anybody out: it only means the fallback does not help.
 *
 * What it cannot see is a session revoked within the token's own life (one
 * hour), which row level security cannot see either. That is why callers
 * ask Supabase Auth first and use this only when Auth does not answer.
 */

export interface VerifiedClaims {
  sub: string
  aud: string | string[]
  role: string
  exp: number
  email?: string
  phone?: string
  session_id?: string
  is_anonymous?: boolean
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}

/** Seconds of clock difference allowed on exp and nbf. */
export const CLOCK_SKEW_S = 30

/** The name of the env var with the legacy JWT secret. Server only: no NEXT_PUBLIC_ prefix, ever. */
export const JWT_SECRET_ENV = "SUPABASE_JWT_SECRET"

const enc = new TextEncoder()

function b64urlBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : s.length % 4 === 1 ? null : ""
    if (pad === null) return null
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function b64urlJson(s: string): Record<string, unknown> | null {
  const bytes = b64urlBytes(s)
  if (!bytes) return null
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes))
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------- the secret */

let hmacCache: { secret: string; key: Promise<CryptoKey> } | null = null

function jwtSecret(): string | null {
  const s = process.env[JWT_SECRET_ENV]
  /* Supabase's legacy secrets are at least 32 characters; anything shorter is a mistake, not a key. */
  return typeof s === "string" && s.trim().length >= 32 ? s.trim() : null
}

function hmacKey(secret: string): Promise<CryptoKey> {
  if (hmacCache?.secret !== secret) {
    /* Supabase Auth signs with the secret's bytes as written (not base64 decoded). */
    hmacCache = { secret, key: crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]) }
  }
  return hmacCache.key
}

/* ------------------------------------------------------------- the public keys */

type Jwk = JsonWebKey & { kid?: string; alg?: string }
export type Jwks = { keys: Jwk[] }
const JWKS_FRESH_MS = 10 * 60_000
const JWKS_FAILED_MS = 60_000
/** An unknown kid (a key rotated in) asks again, but not more often than this. */
const JWKS_UNKNOWN_KID_MS = 60_000
let jwksCache: { url: string; jwks: Jwks; until: number; at: number } | null = null
let jwksLoading: Promise<Jwks> | null = null
const importedKeys = new Map<string, Promise<CryptoKey | null>>()

/**
 * The project's public signing keys, kept per server instance. Fetched with a
 * 2s ceiling; an empty or failed answer is remembered for a minute so a
 * project on the shared secret is not asked on every request.
 */
export async function signingKeys(supabaseUrl: string, { force = false }: { force?: boolean } = {}): Promise<Jwks> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`
  const now = Date.now()
  if (!force && jwksCache && jwksCache.url === url && jwksCache.until > now) return jwksCache.jwks
  if (jwksLoading) return jwksLoading
  jwksLoading = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      const body = res.ok ? ((await res.json()) as Partial<Jwks>) : null
      const keys = Array.isArray(body?.keys) ? (body!.keys as Jwk[]) : []
      const jwks: Jwks = { keys }
      jwksCache = { url, jwks, until: Date.now() + (keys.length ? JWKS_FRESH_MS : JWKS_FAILED_MS), at: Date.now() }
      return jwks
    } catch {
      jwksCache = { url, jwks: { keys: [] }, until: Date.now() + JWKS_FAILED_MS, at: Date.now() }
      return jwksCache.jwks
    } finally {
      jwksLoading = null
    }
  })()
  return jwksLoading
}

/** For tests: forget the keys and the imported secret. */
export function forgetSigningKeys() {
  jwksCache = null
  jwksLoading = null
  importedKeys.clear()
  hmacCache = null
}

const ASYMMETRIC: Record<string, { kty: string; import: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams; verify: AlgorithmIdentifier | EcdsaParams }> = {
  ES256: { kty: "EC", import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { kty: "RSA", import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
}

function importPublic(jwk: Jwk, alg: keyof typeof ASYMMETRIC): Promise<CryptoKey | null> {
  const id = `${alg}:${jwk.kid ?? ""}:${(jwk as { x?: string; n?: string }).x ?? (jwk as { n?: string }).n ?? ""}`
  let p = importedKeys.get(id)
  if (!p) {
    /* Only the public members: a key with "d" in it is never imported for verifying. */
    const { kty, crv, x, y, n, e } = jwk as Record<string, string>
    const pub = kty === "EC" ? { kty, crv, x, y } : { kty, n, e }
    p = crypto.subtle.importKey("jwk", pub as JsonWebKey, ASYMMETRIC[alg].import, false, ["verify"]).catch(() => null)
    importedKeys.set(id, p)
  }
  return p
}

/* ------------------------------------------------------------------ the check */

/** Whether a token could be checked here at all (a secret set, or public keys published). */
export async function canVerifyLocally(supabaseUrl: string | null | undefined): Promise<boolean> {
  if (jwtSecret()) return true
  if (!supabaseUrl) return false
  return (await signingKeys(supabaseUrl)).keys.length > 0
}

/**
 * The token's claims when its signature and claims check out, else null.
 * Never throws, never logs the token or the secret.
 */
export async function verifyAccessToken(
  token: string | null | undefined,
  supabaseUrl: string | null | undefined,
  { nowS = Math.floor(Date.now() / 1000) }: { nowS?: number } = {},
): Promise<VerifiedClaims | null> {
  try {
    if (!token || !supabaseUrl || token.length > 16_384) return null
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const header = b64urlJson(h)
    const payload = b64urlJson(p)
    const sig = b64urlBytes(s)
    if (!header || !payload || !sig || !sig.length) return null
    if (header.typ !== undefined && String(header.typ).toUpperCase() !== "JWT") return null
    const signed = enc.encode(`${h}.${p}`)
    const alg = header.alg

    let ok = false
    if (alg === "HS256") {
      const secret = jwtSecret()
      if (!secret) return null
      ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig as BufferSource, signed)
    } else if (alg === "ES256" || alg === "RS256") {
      const spec = ASYMMETRIC[alg]
      const kid = typeof header.kid === "string" ? header.kid : null
      const pick = (jwks: Jwks) => jwks.keys.filter((k) => k.kty === spec.kty && (!k.alg || k.alg === alg) && (kid ? k.kid === kid : true))
      let candidates = pick(await signingKeys(supabaseUrl))
      if (!candidates.length && kid && jwksCache && Date.now() - jwksCache.at > JWKS_UNKNOWN_KID_MS) candidates = pick(await signingKeys(supabaseUrl, { force: true }))
      for (const jwk of candidates.slice(0, 4)) {
        const key = await importPublic(jwk, alg)
        if (key && (await crypto.subtle.verify(spec.verify, key, sig as BufferSource, signed))) {
          ok = true
          break
        }
      }
    } else {
      return null
    }
    if (!ok) return null

    const exp = payload.exp
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp + CLOCK_SKEW_S <= nowS) return null
    if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf - CLOCK_SKEW_S > nowS)) return null
    if (payload.iss !== `${supabaseUrl.replace(/\/$/, "")}/auth/v1`) return null
    const aud = payload.aud
    if (!(aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated")))) return null
    if (payload.role !== "authenticated") return null
    if (typeof payload.sub !== "string" || !payload.sub) return null

    return payload as unknown as VerifiedClaims
  } catch {
    return null
  }
}

/**
 * A User built from verified claims: who, their email and metadata as of the
 * token. Fields the token does not carry are empty, never invented.
 */
export function userFromClaims(claims: VerifiedClaims): User {
  return {
    id: claims.sub,
    aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
    role: claims.role,
    email: typeof claims.email === "string" ? claims.email : undefined,
    phone: typeof claims.phone === "string" ? claims.phone : undefined,
    app_metadata: (claims.app_metadata as User["app_metadata"]) ?? {},
    user_metadata: (claims.user_metadata as User["user_metadata"]) ?? {},
    is_anonymous: claims.is_anonymous === true,
    created_at: "",
  } as User
}
