import "server-only"

/**
 * ===========================================================================
 *  A SAVE THAT CHANGES A CREATOR PAGE TAKES THE CDN'S COPY DOWN (round 48)
 * ===========================================================================
 * A stranger's storelib.com/<handle> and /<handle>/<product> may be held by
 * the CDN for a minute (next.config.mjs, lib/storefront/shared-view). The
 * owner is always drawn afresh (their request is private), so a save shows
 * to them at once either way; this is for everybody else. On Vercel,
 * revalidatePath deletes the CDN's copy by path (Next 16), and "layout"
 * takes every address under the handle with it: the creator page and each
 * of its product pages.
 *
 * Never throws: the save has happened, and the copy is a minute old at most.
 */
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,63}$/i

/** By the person (userId), their store (creatorId, whose owner's name it is), or the name itself when the caller has just read it from the database. */
export async function creatorPagesChanged(who: { userId?: string | null; creatorId?: string | null; handle?: string | null; handles?: (string | null | undefined)[] }): Promise<void> {
  try {
    const handles = new Set<string>()
    for (const h of [who.handle, ...(who.handles ?? [])]) if (h && HANDLE.test(h.trim())) handles.add(h.trim().toLowerCase())
    let userId = who.userId ?? null
    if (!userId && who.creatorId && handles.size === 0) {
      const { data } = await createAdminClient().from("creators").select("user_id").eq("id", who.creatorId).maybeSingle()
      userId = (data as { user_id?: string | null } | null)?.user_id ?? null
    }
    if (userId && handles.size === 0) {
      const { data } = await createAdminClient().from("profiles").select("username").eq("id", userId).maybeSingle()
      const name = (data as { username?: string | null } | null)?.username
      if (name && HANDLE.test(name)) handles.add(name.toLowerCase())
    }
    for (const h of handles) revalidatePath(`/${h}`, "layout")
  } catch {
    /* Outside a request that can revalidate, or the name could not be read: the CDN's minute does it. */
  }
}
