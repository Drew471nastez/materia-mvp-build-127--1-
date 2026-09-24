import "server-only"

/**
 * The database half of ./site-address.ts: which website a name belongs to,
 * and whether a name is free for one to take.
 *
 * Every read fails soft. Until supabase/sql/RUN_WEBSITE_ADDRESSES.sql has
 * been run the tables are not there, and a website is simply at its
 * creator's username, as it always was.
 */
import { createAdminClient } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

/** The name a creator chose for their website, or null for their username. */
export async function websiteHandleOf(creatorId: string, admin: Admin = createAdminClient()): Promise<string | null> {
  try {
    const { data, error } = await admin.from("website_addresses").select("handle").eq("creator_id", creatorId).maybeSingle()
    if (error) return null
    return ((data as { handle?: string } | null)?.handle ?? null) || null
  } catch {
    return null
  }
}

/**
 * The creator whose website answers to this name: the one it is now, or one
 * it used to be (kept, so a link already given out still arrives).
 */
export async function creatorIdByHandle(handle: string, admin: Admin = createAdminClient()): Promise<string | null> {
  const name = handle.toLowerCase()
  try {
    const { data: now } = await admin.from("website_addresses").select("creator_id").eq("handle", name).maybeSingle()
    const current = (now as { creator_id?: string } | null)?.creator_id
    if (current) return current
    const { data: before } = await admin.from("website_address_history").select("creator_id").eq("handle", name).maybeSingle()
    return (before as { creator_id?: string } | null)?.creator_id ?? null
  } catch {
    return null
  }
}

/**
 * Why this creator cannot take this name, or null when they can. A name is
 * taken when it is somebody else's username or creator name, or another
 * website's name now or before. The creator's own username is always theirs
 * to go back to.
 */
export async function handleTakenFor(handle: string, creatorId: string, admin: Admin = createAdminClient()): Promise<string | null> {
  const name = handle.toLowerCase()
  const { data: profile } = await admin.from("profiles").select("id").eq("username", name).maybeSingle()
  if (profile) {
    const { data: owner } = await admin.from("creators").select("id").eq("user_id", (profile as { id: string }).id).maybeSingle()
    if ((owner as { id?: string } | null)?.id !== creatorId) return "That name is somebody's username."
  }
  const { data: bySlug } = await admin.from("creators").select("id").eq("slug", name).maybeSingle()
  if (bySlug && (bySlug as { id: string }).id !== creatorId) return "That name is taken."
  const owner = await creatorIdByHandle(name, admin)
  if (owner && owner !== creatorId) return "That name is taken."
  return null
}
