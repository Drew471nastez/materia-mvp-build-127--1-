import "server-only"
import { revalidateTag } from "next/cache"
import { revalidatePublishedPages } from "@/lib/website-builder/published-site"

/**
 * One tag for everything a creator's blog puts in the data cache: its
 * settings, categories, authors, the published cards and each post
 * (lib/site-blog/public-read.ts).
 */
export const siteBlogTag = (creatorId: string) => `site-blog:${creatorId}`

/**
 * After a change visitors see: publish, update, schedule, unpublish,
 * archive, delete, the blog's settings, a category or an author. Never after
 * an autosave: a draft is not public, and clearing the site's pages on every
 * keystroke would make every visitor draw them again.
 *
 * The tag expires at once (`expire: 0`, as revalidatePublishedSite does), and
 * the site's rendered pages go with it, so the creator who presses Publish
 * and opens the post sees it. A scheduled post needs neither: liveness is
 * checked outside the cache, so it appears on its own within the pages'
 * minute.
 */
export async function revalidateSiteBlog(creatorId: string): Promise<void> {
  if (!creatorId) return
  revalidateTag(siteBlogTag(creatorId), { expire: 0 })
  await revalidatePublishedPages(creatorId)
}
