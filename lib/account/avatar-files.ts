import "server-only"

/**
 * ===========================================================================
 *  THE PHOTO THAT WAS REPLACED STOPS BEING SERVED
 * ===========================================================================
 * Every upload writes a new file, `avatars/<user id>/avatar-<time>.jpg`, and
 * nothing ever removed the one before it. The avatars bucket is public, so
 * "delete my photo" left the old picture sitting at an address anybody who
 * had seen it could still open, and every change added another.
 *
 * This removes exactly one file: the address the profile held a moment ago,
 * and only when
 *
 *   it is inside that person's own folder of the avatars bucket, and
 *   no row that is left points at it.
 *
 * The second test is the important one. The OnePage, the creator row and the
 * creator page header each keep their own copy of the photo, and a copy that
 * somebody chose is not moved by lib/account/profile-follow — so a file one
 * of them still names is a file still in use, and deleting it would blank a
 * picture on a live page.
 */
import { createAdminClient } from "@/lib/supabase/admin"

type Row = Record<string, unknown>

/** The path inside the avatars bucket, for an address in this person's own folder. */
export function ownAvatarPath(url: unknown, userId: string, supabaseUrl: string | undefined): string | null {
  if (typeof url !== "string" || !supabaseUrl) return null
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/avatars/`
  const value = url.trim().split("?")[0]
  if (!value.startsWith(`${base}${userId}/`)) return null
  const path = decodeURIComponent(value.slice(base.length))
  /* No traversal, no empty name: the path this builds is the one it deletes. */
  if (path.includes("..") || !/^[\w-]+\/[\w.-]+$/.test(path)) return null
  return path
}

/** Every photo address still named by a row, as plain strings. */
export function photosStillNamed(rows: {
  profile?: Row | null
  onepage?: Row | null
  creator?: Row | null
  configs?: Row[] | null
}): Set<string> {
  const out = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim() !== "") out.add(value.trim().split("?")[0])
  }
  add(rows.profile?.avatar_url)
  add(rows.onepage?.avatar_url)
  add((rows.onepage?.published_profile as Row | null)?.avatar_url)
  add(rows.creator?.avatar_url)
  for (const config of rows.configs ?? []) {
    for (const key of ["draft_config", "published_config"]) {
      const cfg = config[key] as Row | null
      if (!cfg || typeof cfg !== "object") continue
      add((cfg.headerSettings as Row | null)?.avatarUrl)
      add((cfg.headerSettings as Row | null)?.faviconUrl)
      const sections = cfg.sections
      if (Array.isArray(sections)) {
        for (const section of sections as Row[]) add((section?.settings as Row | null)?.avatarUrl)
      }
    }
  }
  return out
}

/**
 * Removes the file the profile pointed at before this change, when nothing
 * points at it any more. Returns the path removed, or null. Never throws:
 * a photo that saved but whose old file stayed is a tidiness problem, not a
 * failed save.
 */
export async function sweepReplacedAvatar(userId: string, previousUrl: string | null, creatorId: string | null): Promise<string | null> {
  const path = ownAvatarPath(previousUrl, userId, process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (!path || !previousUrl) return null
  try {
    const admin = createAdminClient()
    const [profile, onepage, creator, configs] = await Promise.all([
      admin.from("profiles").select("avatar_url").eq("id", userId).maybeSingle(),
      admin.from("onepages").select("avatar_url, published_profile").eq("owner_id", userId).maybeSingle(),
      admin.from("creators").select("avatar_url").eq("user_id", userId).maybeSingle(),
      creatorId
        ? admin.from("store_builder_configs").select("draft_config, published_config").eq("creator_id", creatorId)
        : Promise.resolve({ data: [] as Row[] }),
    ])
    const named = photosStillNamed({
      profile: profile.data as Row | null,
      onepage: onepage.data as Row | null,
      creator: creator.data as Row | null,
      configs: (configs.data ?? []) as Row[],
    })
    if (named.has(previousUrl.trim().split("?")[0])) return null
    const { error } = await admin.storage.from("avatars").remove([path])
    if (error) {
      console.error(`[account/avatar] old photo not removed (${error.message})`)
      return null
    }
    return path
  } catch (e) {
    console.error("[account/avatar] old photo not removed:", (e as Error).message)
    return null
  }
}
