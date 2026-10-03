/**
 * ===========================================================================
 *  WHETHER A WEBSITE ASKS FOR A PASSWORD, IN THE DATABASE
 * ===========================================================================
 * One row per creator in `site_access` (supabase/sql/run-now/92), written and
 * read by the server only, with the key that skips row level security. So
 * the scoping is here: every read and write names the creator, and the
 * creator is never taken from a request. The route that changes it
 * (app/api/website-builder/site-password) has already checked the signed in
 * user owns the website.
 *
 * Before part 92 has run the table is missing: reads say "not available",
 * the settings page says so in a line, and no website asks for a password.
 */
import { isMissingTable, type Db } from "@/lib/site-accounts/db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SiteAccess {
  /** The table is there. False before part 92 has run. */
  available: boolean
  enabled: boolean
  /** The hash, for the server's own check. Never sent to a browser. */
  hash: string | null
  version: number
}

const NONE: SiteAccess = { available: true, enabled: false, hash: null, version: 1 }

export async function readSiteAccess(db: Db, creatorId: string): Promise<SiteAccess> {
  if (!UUID.test(creatorId)) return { ...NONE, available: false }
  try {
    const { data, error } = await db
      .from("site_access")
      .select("password_enabled, password_hash, password_version")
      .eq("creator_id", creatorId)
      .maybeSingle()
    /* Missing (part 92 not run) or unreadable: not available, which no page takes as "ask for a password". */
    if (error) return { ...NONE, available: false }
    if (!data) return NONE
    const row = data as { password_enabled?: boolean | null; password_hash?: string | null; password_version?: number | null }
    const hash = typeof row.password_hash === "string" && row.password_hash ? row.password_hash : null
    return {
      available: true,
      enabled: row.password_enabled === true && !!hash,
      hash,
      version: typeof row.password_version === "number" && row.password_version > 0 ? row.password_version : 1,
    }
  } catch {
    return { ...NONE, available: false }
  }
}

/** What Website Settings is told: on or off, and whether a password is set. Never the hash. */
export function publicAccess(access: SiteAccess): { available: boolean; enabled: boolean; hasPassword: boolean } {
  return { available: access.available, enabled: access.enabled, hasPassword: !!access.hash }
}

export type SaveAccessResult = { ok: true; access: SiteAccess } | { ok: false; why: "unavailable" | "needs_password" | "failed" }

/**
 * Turns the password on or off, or sets a new one (already hashed by the
 * caller, lib/site-password/hash.ts). A new password is a new version, which
 * ends every pass made for the old one. Turning it on needs a password,
 * typed now or kept from before.
 */
export async function saveSiteAccess(
  db: Db,
  creatorId: string,
  change: { enabled?: boolean; hash?: string | null },
  now = new Date(),
): Promise<SaveAccessResult> {
  if (!UUID.test(creatorId)) return { ok: false, why: "failed" }
  const current = await readSiteAccess(db, creatorId)
  if (!current.available) return { ok: false, why: "unavailable" }
  const hash = change.hash ?? current.hash
  const enabled = change.enabled ?? current.enabled
  if (enabled && !hash) return { ok: false, why: "needs_password" }
  const version = change.hash ? current.version + 1 : current.version
  const row = {
    creator_id: creatorId,
    password_enabled: enabled,
    password_hash: hash,
    password_version: version,
    updated_at: now.toISOString(),
  }
  try {
    const { error } = await db.from("site_access").upsert(row, { onConflict: "creator_id" })
    if (error) return { ok: false, why: isMissingTable(error) ? "unavailable" : "failed" }
    return { ok: true, access: { available: true, enabled, hash, version } }
  } catch {
    return { ok: false, why: "failed" }
  }
}

/**
 * Every website that asks for a password now, as creator id to the
 * password's version. What the proxy asks first (./proxy-gate.ts): while no
 * site asks, no page pays for a name lookup. Null when it cannot be read,
 * which the gate takes as none.
 */
export async function protectedSites(db: Db): Promise<Map<string, number> | null> {
  try {
    const { data, error } = await db
      .from("site_access")
      .select("creator_id, password_version")
      .eq("password_enabled", true)
      .not("password_hash", "is", null)
      .limit(5000)
    if (error) return null
    const out = new Map<string, number>()
    for (const r of (data ?? []) as { creator_id?: string; password_version?: number }[]) {
      if (typeof r.creator_id === "string" && UUID.test(r.creator_id)) out.set(r.creator_id, typeof r.password_version === "number" && r.password_version > 0 ? r.password_version : 1)
    }
    return out
  } catch {
    return null
  }
}
