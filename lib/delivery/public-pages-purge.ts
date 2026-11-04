import "server-only"

/**
 * ===========================================================================
 *  EVERY PUBLIC PAGE OF ONE CREATOR, TAKEN DOWN FROM EVERY CACHE (round 51)
 * ===========================================================================
 * For a change that touches all of a creator's public addresses at once: a
 * ban or its lifting, an account deleted, a domain connected, moved or
 * removed. Each surface keeps its own purge, and this calls all of them:
 *
 *   creator page and product pages   lib/storefront/creator-page-purge
 *                                    (CDN tag creator-page-<handle>)
 *   the website, every page          lib/website-builder/published-site
 *                                    revalidatePublishedSite (the site tag,
 *                                    ISR by path, the stored copies)
 *   the OnePage                      lib/onepage/public-cache onePageChanged
 *                                    (data and CDN tag onepage-<name>)
 *   the ban and spam verdicts        lib/seo/bans (creatorBanTag, spamStateTag)
 *
 * `names` are read BEFORE a deletion by the caller (readPublicNames): once
 * the rows are gone nothing can say which addresses held them. Never throws:
 * the change has happened, and every copy is a minute old at most.
 */
import { revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export interface PublicNames {
  creatorId: string | null
  userId: string | null
  /** The username, the creator's slug, the website's own name and the OnePage's address. */
  names: string[]
}

const present = (v: unknown): v is string => typeof v === "string" && v.trim() !== ""

/** Every address name a creator's public pages answer to, read now. */
export async function readPublicNames(who: { creatorId?: string | null; userId?: string | null }): Promise<PublicNames> {
  let creatorId = who.creatorId ?? null
  let userId = who.userId ?? null
  const names: (string | null | undefined)[] = []
  try {
    const db = createAdminClient()
    if (creatorId && !userId) userId = ((await db.from("creators").select("user_id").eq("id", creatorId).maybeSingle()).data as { user_id?: string | null } | null)?.user_id ?? null
    if (userId && !creatorId) creatorId = ((await db.from("creators").select("id").eq("user_id", userId).maybeSingle()).data as { id?: string | null } | null)?.id ?? null
    const [creator, profile, page] = await Promise.all([
      creatorId ? db.from("creators").select("slug").eq("id", creatorId).maybeSingle() : Promise.resolve({ data: null }),
      userId ? db.from("profiles").select("username").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
      userId ? db.from("onepages").select("slug").eq("owner_id", userId).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ])
    names.push((creator.data as { slug?: string | null } | null)?.slug, (profile.data as { username?: string | null } | null)?.username, (page.data as { slug?: string | null } | null)?.slug)
    if (creatorId) {
      const { websiteHandleOf } = await import("@/lib/website-builder/site-address-data")
      names.push(await websiteHandleOf(creatorId, db).catch(() => null))
    }
  } catch {
    /* What was read is purged; the rest waits its minute. */
  }
  return { creatorId, userId, names: [...new Set(names.filter(present).map((n) => n.trim().toLowerCase()))] }
}

/** What a purge does, swappable so tests/delivery-r51 can watch it. */
export interface PublicPurgeDeps {
  expire: (tag: string) => void
  creatorPages: (who: { creatorId?: string | null; userId?: string | null; handles: string[] }) => Promise<void>
  site: (creatorId: string) => Promise<void>
  onePage: (change: { ownerUserId: string | null; names: string[] }) => void
}

async function liveDeps(): Promise<PublicPurgeDeps> {
  const [{ creatorPagesChanged }, { revalidatePublishedSite }, { onePageChanged }] = await Promise.all([
    import("@/lib/storefront/creator-page-purge"),
    import("@/lib/website-builder/published-site"),
    import("@/lib/onepage/public-cache"),
  ])
  return {
    expire: (tag) => {
      try {
        revalidateTag(tag, { expire: 0 })
      } catch {
        /* outside a request that can revalidate */
      }
    },
    creatorPages: (who) => creatorPagesChanged({ creatorId: who.creatorId, userId: who.userId, handles: who.handles }),
    site: (creatorId) => revalidatePublishedSite(creatorId),
    onePage: (change) => onePageChanged(change),
  }
}

/** Every public page of this creator: data expired, CDN copies by tag, the website's rendered pages. */
export async function publicPagesChanged(who: PublicNames, deps?: PublicPurgeDeps): Promise<void> {
  try {
    const d = deps ?? (await liveDeps())
    const { creatorBanTag, spamStateTag } = await import("@/lib/seo/ban-tags")
    if (who.creatorId) d.expire(creatorBanTag(who.creatorId))
    if (who.userId) d.expire(spamStateTag(who.userId))
    /* The verdict first, so the redraw each purge below causes reads the new one. */
    await Promise.all([
      d.creatorPages({ creatorId: who.creatorId, userId: who.userId, handles: who.names }).catch(() => undefined),
      who.creatorId ? d.site(who.creatorId).catch(() => undefined) : Promise.resolve(),
    ])
    d.onePage({ ownerUserId: who.userId, names: who.names })
  } catch {
    /* The change stands; the copies are a minute old at most. */
  }
}
