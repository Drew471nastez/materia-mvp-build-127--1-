import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { UUID_PATTERN } from "@/lib/businesses/rules"

/**
 * ===========================================================================
 *  A CLIENT WHOSE ONLY STORE IS THE ONE HANDED TO THEM
 * ===========================================================================
 * Somebody who signed up to take over a business has a login of their own
 * with nothing in it, and the business they took is a second business on
 * that login (lib/handoff). Left alone, every sign in would open the empty
 * one: Discover after signing in, seller onboarding from /app.
 *
 * So a login with no store of its own that took a business over opens that
 * business instead, through HANDED_HOME (app/(storelib)/team/claim/home),
 * which switches in the way the account menu does. Asked only where the
 * answer would otherwise be "no store": /auth/continue, /auth/callback and
 * the dashboard's gate, never for a seller, so nobody else's way in changes.
 * There is no "last used business" preference in Storelib to lean on; the
 * handover record itself is the preference, and the newest one wins.
 */
export const HANDED_HOME = "/team/claim/home"

export interface HandedBusiness {
  userId: string
  name: string
  avatarUrl: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The newest business this login took over and still holds, or null. Never throws: any doubt is null, the way in it always was. */
export async function handedBusinessOf(loginId: string, db: Db = createAdminClient() as unknown as Db): Promise<HandedBusiness | null> {
  if (!UUID_PATTERN.test(loginId)) return null
  try {
    const { data, error } = await db.from("business_handoffs").select("business_user_id, accepted_at").eq("accepted_by", loginId).eq("status", "accepted").order("accepted_at", { ascending: false }).limit(3)
    if (error || !Array.isArray(data) || data.length === 0) return null
    for (const row of data as { business_user_id: string }[]) {
      const { data: link } = await db.from("business_links").select("owner_id").eq("member_id", row.business_user_id).maybeSingle()
      if ((link as { owner_id?: string } | null)?.owner_id !== loginId) continue
      const { data: profile } = await db.from("profiles").select("display_name, username, avatar_url").eq("id", row.business_user_id).maybeSingle()
      const p = (profile ?? {}) as { display_name?: string | null; username?: string | null; avatar_url?: string | null }
      return { userId: row.business_user_id, name: (p.display_name || p.username || "").trim() || "Your business", avatarUrl: p.avatar_url ?? null }
    }
    return null
  } catch {
    return null
  }
}

/** The same, with a ceiling: a sign in or the dashboard never waits long on it. */
export async function handedHomeFor(loginId: string, ms = 1500): Promise<string | null> {
  const found = await Promise.race([handedBusinessOf(loginId), new Promise<null>((r) => setTimeout(() => r(null), ms))])
  return found ? HANDED_HOME : null
}
