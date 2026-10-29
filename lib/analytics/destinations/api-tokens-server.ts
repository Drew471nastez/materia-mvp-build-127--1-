import "server-only"

/**
 * ===========================================================================
 *  READ ONLY KEYS FOR GET /api/v1/analytics
 * ===========================================================================
 * A store's owner makes a key (Analytics › Send to › Analytics API) for a
 * spreadsheet, a dashboard or a script to fetch the store's figures. What
 * the database keeps is the key's SHA-256 and its first characters
 * (analytics_api_tokens, SQL part 338); the key itself is shown once, when
 * it is made. A key reads one store's analytics and nothing else, and is
 * revoked with one press. At most ten live keys per store.
 */

import { createHash, randomBytes } from "node:crypto"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const API_TOKEN_PREFIX = "sla_"
export const MAX_LIVE_TOKENS = 10

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function mintApiToken(): { token: string; hash: string; prefix: string } {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  return { token, hash: hashApiToken(token), prefix: token.slice(0, API_TOKEN_PREFIX.length + 6) }
}

/** The shape a real key has, checked before the database is asked. */
export function looksLikeApiToken(v: string): boolean {
  return /^sla_[A-Za-z0-9_-]{43}$/.test(v)
}

/** The key from "Authorization: Bearer sla_…". */
export function bearerOf(header: string | null): string | null {
  const m = header ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null
  return m && looksLikeApiToken(m[1]) ? m[1] : null
}

export interface ApiTokenView {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

function tableMissing(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42703")
}

export async function listApiTokens(db: Db, creatorId: string): Promise<{ ready: boolean; tokens: ApiTokenView[] }> {
  const { data, error } = await db.from("analytics_api_tokens").select("id, name, token_prefix, created_at, last_used_at, revoked_at").eq("creator_id", creatorId).is("revoked_at", null).order("created_at", { ascending: false }).limit(MAX_LIVE_TOKENS)
  if (error) return { ready: !tableMissing(error), tokens: [] }
  return { ready: true, tokens: ((data ?? []) as { id: string; name: string; token_prefix: string; created_at: string; last_used_at: string | null }[]).map((r) => ({ id: r.id, name: r.name, prefix: r.token_prefix, createdAt: r.created_at, lastUsedAt: r.last_used_at })) }
}

export async function createApiToken(db: Db, creatorId: string, userId: string, name: unknown): Promise<{ ok: true; token: string; view: ApiTokenView } | { ok: false; error: string; status: number }> {
  const clean = typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "API key"
  const { count, error: countError } = await db.from("analytics_api_tokens").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).is("revoked_at", null)
  if (countError) return { ok: false, error: tableMissing(countError) ? "API keys need SQL part 338 run in Supabase first." : "That key could not be made. Try again.", status: tableMissing(countError) ? 409 : 500 }
  if ((count ?? 0) >= MAX_LIVE_TOKENS) return { ok: false, error: `A store can have ${MAX_LIVE_TOKENS} keys. Revoke one first.`, status: 400 }
  const t = mintApiToken()
  const at = new Date().toISOString()
  const { data, error } = await db.from("analytics_api_tokens").insert({ creator_id: creatorId, name: clean, token_hash: t.hash, token_prefix: t.prefix, created_by: userId, created_at: at }).select("id").maybeSingle()
  if (error || !data?.id) return { ok: false, error: "That key could not be made. Try again.", status: 500 }
  return { ok: true, token: t.token, view: { id: data.id, name: clean, prefix: t.prefix, createdAt: at, lastUsedAt: null } }
}

export async function revokeApiToken(db: Db, creatorId: string, id: unknown): Promise<boolean> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return false
  const { error } = await db.from("analytics_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("creator_id", creatorId).is("revoked_at", null)
  return !error
}

/** The store a key reads, or null for a key that is wrong or revoked. Marks it used, at most once a minute. */
export async function storeOfApiToken(db: Db, token: string, now = Date.now()): Promise<{ tokenId: string; creatorId: string } | null> {
  if (!looksLikeApiToken(token)) return null
  const { data, error } = await db.from("analytics_api_tokens").select("id, creator_id, revoked_at, last_used_at").eq("token_hash", hashApiToken(token)).maybeSingle()
  if (error || !data || data.revoked_at) return null
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0
  if (!Number.isFinite(last) || now - last > 60_000) await db.from("analytics_api_tokens").update({ last_used_at: new Date(now).toISOString() }).eq("id", data.id)
  return { tokenId: data.id, creatorId: data.creator_id }
}
