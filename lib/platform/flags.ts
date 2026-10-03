import "server-only"

/**
 * ===========================================================================
 *  PLATFORM SWITCHES, READ ON THE SERVER
 * ===========================================================================
 * One row per switch in `public.platform_flags` (supabase/sql/run-now/
 * 79_communities.sql), written from /admin and read by every page, route and
 * job the switch covers. Server only: the table is closed to visitors, and a
 * client component asks GET /api/platform/flags instead (lib/platform/
 * use-flags.ts).
 *
 * OFF UNTIL SAID OTHERWISE. A missing table (the part has not run), a missing
 * row or a database that does not answer all read as off, so a feature that is
 * not switched on can never appear by accident.
 *
 * CACHED FOR TEN SECONDS PER SERVER INSTANCE, because a page may ask several
 * times while it renders and the answer changes only when an admin presses the
 * switch. setFlag updates this instance at once; the others catch up within
 * ten seconds. When the database fails after a good read, the last good answer
 * is kept rather than flipping a live feature off for one blip.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { tableMissing } from "@/lib/memberships/server"

export const PLATFORM_FLAG_KEYS = ["communities"] as const
export type PlatformFlagKey = (typeof PLATFORM_FLAG_KEYS)[number]

export const FLAG_CACHE_MS = 10_000

const cache = new Map<PlatformFlagKey, { value: boolean; at: number }>()

export function isPlatformFlagKey(value: unknown): value is PlatformFlagKey {
  return typeof value === "string" && (PLATFORM_FLAG_KEYS as readonly string[]).includes(value)
}

/** Whether a switch is on. Never throws; anything uncertain reads as off. */
export async function readFlag(key: PlatformFlagKey): Promise<boolean> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.at < FLAG_CACHE_MS) return hit.value
  try {
    const { data, error } = await createAdminClient().from("platform_flags").select("enabled").eq("key", key).maybeSingle()
    if (error) {
      if (tableMissing(error)) {
        cache.set(key, { value: false, at: now })
        return false
      }
      return hit?.value ?? false
    }
    const value = data?.enabled === true
    cache.set(key, { value, at: now })
    return value
  } catch {
    return hit?.value ?? false
  }
}

/** Turns a switch on or off. Throws when it could not be saved, so the admin is told. */
export async function setFlag(key: PlatformFlagKey, enabled: boolean, by: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("platform_flags")
    .upsert({ key, enabled, updated_at: new Date().toISOString(), updated_by: by.slice(0, 200) }, { onConflict: "key" })
  if (error) throw new Error(`platform flag ${key}: ${error.code ?? ""} ${error.message ?? ""}`.trim())
  cache.set(key, { value: enabled, at: Date.now() })
}

/** Forgets every cached answer on this instance (tests, and after a write elsewhere). */
export function clearFlagCache(): void {
  cache.clear()
}
