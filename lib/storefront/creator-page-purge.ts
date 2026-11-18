import "server-only"

/**
 * ===========================================================================
 *  A SAVE THAT CHANGES A CREATOR PAGE TAKES THE CDN'S COPY DOWN (rounds 48, 49)
 * ===========================================================================
 * storelib.com/<handle> and /<handle>/<product> are held by the CDN for a
 * minute for EVERYBODY since round 49, the owner included (next.config.mjs:
 * one HTML for all, the owner's controls asked for after load). So a save
 * must take the copy down, or the creator saves and sees the old page.
 *
 * Three things go, in this order:
 *   1. the shared data the next render reads (creatorTag: the creator, its
 *      configs and products, lib/commerce/product-page-cache; the layout's
 *      held facts; and any tags the caller names), EXPIRED, not marked
 *      stale: a render that read the stale copy after the CDN purge would be
 *      held by the CDN for another minute;
 *   2. the CDN's copies by tag: every response for the handle carries
 *      `Vercel-Cache-Tag: creator-page-<handle>` (next.config.mjs), and
 *      revalidateTag deletes them on Vercel (Next 16);
 *   3. by path too, "layout", which takes every address under the handle
 *      with it (the creator page and each of its product pages).
 *
 * Never throws: the save has happened, and the copy is a minute old at most.
 */
import { revalidatePath, revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { forgetCreatorPageLastGood } from "@/lib/commerce/creator-page-held"

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,63}$/i

/** The tag every CDN copy of a handle's pages carries (next.config.mjs, `creator-page-:handle`). */
export const creatorPageCdnTag = (handle: string) => `creator-page-${handle}`

/** Explore's CDN copies (next.config.mjs, `explore`), expired when a product is taken down (lib/explore/catalogue-cache). */
export const EXPLORE_CDN_TAG = "explore"

const expireTag = (tag: string) => {
  try {
    revalidateTag(tag, { expire: 0 })
  } catch {
    /* outside a request that can revalidate */
  }
}
const expirePath = (path: string) => {
  try {
    revalidatePath(path, "layout")
  } catch {
    /* outside a request that can revalidate */
  }
}

/** What a purge does, swappable so tests/cdnpages-r49 can watch it. */
export interface PurgeDeps {
  expire: (tag: string) => void
  path: (path: string) => void
}
const LIVE: PurgeDeps = { expire: expireTag, path: expirePath }

/**
 * By the person (userId), their store (creatorId), or the name itself when
 * the caller has just read it from the database. `tags`: more shared data
 * the caller changed (a product's productTag), expired with the rest.
 */
export async function creatorPagesChanged(who: {
  userId?: string | null
  creatorId?: string | null
  handle?: string | null
  handles?: (string | null | undefined)[]
  tags?: string[]
}, deps: PurgeDeps = LIVE): Promise<void> {
  const expire = deps.expire
  try {
    const handles = new Set<string>()
    for (const h of [who.handle, ...(who.handles ?? [])]) if (h && HANDLE.test(h.trim())) handles.add(h.trim())
    let userId = who.userId ?? null
    let creatorId = who.creatorId ?? null
    for (const t of who.tags ?? []) expire(t)
    if (creatorId && !userId && handles.size === 0) {
      const { data } = await createAdminClient().from("creators").select("user_id").eq("id", creatorId).maybeSingle()
      userId = (data as { user_id?: string | null } | null)?.user_id ?? null
    }
    if (userId && !creatorId) {
      const { data } = await createAdminClient().from("creators").select("id").eq("user_id", userId).maybeSingle()
      creatorId = (data as { id?: string | null } | null)?.id ?? null
    }
    if (userId && handles.size === 0) {
      const { data } = await createAdminClient().from("profiles").select("username").eq("id", userId).maybeSingle()
      const name = (data as { username?: string | null } | null)?.username
      if (name && HANDLE.test(name)) handles.add(name)
    }

    /* 1. The data the next render reads, gone, not stale (cachedCreatorProfile is tagged by the person's id). */
    if (creatorId) expire(creatorTag(creatorId))
    if (userId) expire(creatorTag(userId))
    /* And this instance's last good answers of the page (lib/commerce/creator-page-held, round AU). */
    if (creatorId) forgetCreatorPageLastGood(creatorId)
    if (userId) forgetCreatorPageLastGood(userId)
    for (const h of handles) expire(`shop-layout:${h.toLowerCase()}`)

    /* 2 and 3. The CDN's copies, by tag (as stored, and lower case: an address may be typed either way) and by path. */
    for (const h of handles) {
      for (const name of new Set([h, h.toLowerCase()])) {
        expire(creatorPageCdnTag(name))
        deps.path(`/${name}`)
      }
    }
  } catch {
    /* The name could not be read: the CDN's minute does it. */
  }
}
