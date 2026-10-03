/**
 * A name under the sites domain, to the creator whose website answers at it:
 * the username, then the creator slug, then the website's own address, then
 * an address the website had before. The same order lib/site-accounts/hosts.ts
 * has always used, in a file of its own with no server-only imports, so the
 * proxy can ask it too (lib/site-password/proxy-gate.ts).
 *
 * Every read failing reads as null: a name nobody can place is nobody's.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

async function one(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await query
    if (error || !data) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

export async function creatorOfName(db: Db, rawName: string): Promise<string | null> {
  const name = rawName.trim().toLowerCase()
  if (!name || name.length > 63) return null
  const profile = await one(db.from("profiles").select("id").eq("username", name).maybeSingle())
  if (profile?.id) {
    const creator = await one(db.from("creators").select("id").eq("user_id", profile.id).maybeSingle())
    if (typeof creator?.id === "string") return creator.id
  }
  const bySlug = await one(db.from("creators").select("id").eq("slug", name).maybeSingle())
  if (typeof bySlug?.id === "string") return bySlug.id
  const now = await one(db.from("website_addresses").select("creator_id").eq("handle", name).maybeSingle())
  if (typeof now?.creator_id === "string") return now.creator_id
  const before = await one(db.from("website_address_history").select("creator_id").eq("handle", name).maybeSingle())
  return typeof before?.creator_id === "string" ? before.creator_id : null
}
