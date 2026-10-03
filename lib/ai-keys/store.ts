import "server-only"

/**
 * ===========================================================================
 *  WHICH OF THEIR OWN AI A CREATOR HAS CONNECTED
 * ===========================================================================
 * One row per creator and source in `creator_ai_keys`:
 *
 *   anthropic    their own Claude API key (console.anthropic.com)
 *   openai       their own OpenAI API key (platform.openai.com)
 *
 * A row with any other provider, kept from a connection Storelib no longer
 * offers, is left in place and read as nothing connected: Storelib AI
 * answers on its own key, and no row is ever deleted to get there.
 *
 * The table has row level security on and no policy at all, so only this
 * server (the admin client) reads or writes it: a key never goes back to a
 * browser, not even its owner's, only its last four characters.
 *
 * A DATABASE WITHOUT THE TABLE YET (supabase/sql/run-now/37_own_ai_keys.sql
 * not run) is not an error anywhere: reads answer "nothing connected" and
 * `tableMissing`, so Storelib AI keeps answering as it always has and the
 * settings say the feature is not switched on yet.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { hintOf, open, seal } from "./crypto"

export type KeySource = "anthropic" | "openai"
export const KEY_SOURCES: readonly KeySource[] = ["anthropic", "openai"]

export function isKeySource(value: unknown): value is KeySource {
  return value === "anthropic" || value === "openai"
}

export interface ConnectedKey {
  source: KeySource
  hint: string
  connectedAt: string
  lastUsedAt: string | null
  /** The last time a run was refused on this key, in the provider's words, cleared by the next run that works. */
  lastError: string | null
}

export interface OwnKeys {
  keys: ConnectedKey[]
  /** The table is not in this database yet. */
  tableMissing: boolean
}

const TABLE = "creator_ai_keys"

export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || (/does not exist|could not find the table/i.test(error.message ?? "") && /creator_ai_keys|relation|table/i.test(error.message ?? ""))
}

/** What the settings show: the sources, their last four characters, when they were last used. Never a key. */
export async function listKeys(creatorId: string): Promise<OwnKeys> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select("provider, key_hint, created_at, last_used_at, last_error")
    .eq("creator_id", creatorId)
  if (error) {
    if (isMissingTable(error)) return { keys: [], tableMissing: true }
    throw new Error(error.message)
  }
  const rows = (data ?? []) as { provider: string; key_hint: string; created_at: string; last_used_at: string | null; last_error: string | null }[]
  return {
    tableMissing: false,
    keys: rows
      .filter((r) => isKeySource(r.provider))
      .map((r) => ({ source: r.provider as KeySource, hint: r.key_hint, connectedAt: r.created_at, lastUsedAt: r.last_used_at, lastError: r.last_error }))
      .sort((a, b) => KEY_SOURCES.indexOf(a.source) - KEY_SOURCES.indexOf(b.source)),
  }
}

/** The keys themselves, opened, for the one request about to use them. A row that no longer opens is left out. */
export async function readKeys(creatorId: string): Promise<Partial<Record<KeySource, string>>> {
  const { data, error } = await createAdminClient().from(TABLE).select("provider, sealed_key").eq("creator_id", creatorId)
  if (error) return {}
  const out: Partial<Record<KeySource, string>> = {}
  for (const row of (data ?? []) as { provider: string; sealed_key: string }[]) {
    if (!isKeySource(row.provider)) continue
    const key = open(row.sealed_key)
    if (key) out[row.provider] = key
  }
  return out
}

export async function saveKey(creatorId: string, source: KeySource, key: string): Promise<{ ok: true } | { ok: false; tableMissing: boolean; message: string }> {
  const { error } = await createAdminClient()
    .from(TABLE)
    .upsert(
      {
        creator_id: creatorId,
        provider: source,
        sealed_key: seal(key.trim()),
        key_hint: hintOf(key),
        created_at: new Date().toISOString(),
        last_used_at: null,
        last_error: null,
      },
      { onConflict: "creator_id,provider" },
    )
  if (!error) return { ok: true }
  return { ok: false, tableMissing: isMissingTable(error), message: error.message }
}

export async function removeKey(creatorId: string, source: KeySource): Promise<void> {
  const { error } = await createAdminClient().from(TABLE).delete().eq("creator_id", creatorId).eq("provider", source)
  if (error && !isMissingTable(error)) throw new Error(error.message)
}

/** After a run on their key: when it was used, and whether the provider refused it. Best effort, never in the way of the run. */
export async function noteUse(creatorId: string, source: KeySource, error: string | null): Promise<void> {
  try {
    await createAdminClient()
      .from(TABLE)
      .update({ last_used_at: new Date().toISOString(), last_error: error ? error.slice(0, 300) : null })
      .eq("creator_id", creatorId)
      .eq("provider", source)
  } catch {
    /* a note, not the work: never a reason for a run to fail */
  }
}
