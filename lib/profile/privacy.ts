import "server-only"

/**
 * WHAT A PERSON SHOWS ON THEIR PROFILE.
 *
 * profiles.show_activity and profiles.show_communities come with run-now
 * part 85. Until it has run there is no switch to read, and both are on,
 * which is what the columns default to once they exist. `supported` tells
 * Settings whether there is anywhere to save a choice.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface ProfilePrivacy {
  showActivity: boolean
  showCommunities: boolean
  supported: boolean
}

export const PRIVACY_DEFAULT: ProfilePrivacy = { showActivity: true, showCommunities: true, supported: false }

const MISSING_COLUMN = new Set(["42703", "PGRST204"])

export async function readPrivacy(db: Db, userId: string): Promise<ProfilePrivacy> {
  try {
    const { data, error } = await db.from("profiles").select("show_activity, show_communities").eq("id", userId).maybeSingle()
    if (error) return { ...PRIVACY_DEFAULT, supported: !MISSING_COLUMN.has(String(error.code ?? "")) }
    const row = (data ?? {}) as { show_activity?: boolean | null; show_communities?: boolean | null }
    return { showActivity: row.show_activity !== false, showCommunities: row.show_communities !== false, supported: true }
  } catch {
    return PRIVACY_DEFAULT
  }
}

/** The switches a request may change, and nothing else. */
export function privacyPatch(body: unknown): { show_activity?: boolean; show_communities?: boolean } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  const patch: { show_activity?: boolean; show_communities?: boolean } = {}
  if (typeof b.showActivity === "boolean") patch.show_activity = b.showActivity
  if (typeof b.showCommunities === "boolean") patch.show_communities = b.showCommunities
  return Object.keys(patch).length ? patch : null
}

export function missingPrivacyColumn(error: { code?: string | null } | null | undefined): boolean {
  return MISSING_COLUMN.has(String(error?.code ?? ""))
}
