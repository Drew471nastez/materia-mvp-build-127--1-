import "server-only"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Block } from "./blocks"
import { STATIC_BLOG_SLUGS } from "./listing"
import { followBlogRedirect } from "./redirects"
import { normalizeBlocks } from "./editor-model"
import { liveDateFilter } from "./schedule"

/** The columns only the admin reads: a live post's unpublished edits. Never handed to a page. */
const DRAFT_COLUMNS = ["draft_content", "draft_meta", "draft_saved_at"] as const

/**
 * One LIVE post from the database by its slug, or null: published, and its
 * date reached (lib/blog/schedule.ts), so a scheduled post is a 404 until
 * its hour and then appears with no job having to run. Deduped per request:
 * the post's layout, metadata and page share it.
 */
export const fetchPost = cache(async (slug: string) => {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .or(liveDateFilter())
      .single()
    if (!data) return null
    for (const c of DRAFT_COLUMNS) delete (data as Record<string, unknown>)[c]
    return data
  } catch {
    return null
  }
})

/** A post Storelib can draw: a live one in the database, or one of the posts written in code. */
export async function blogPostExists(slug: string): Promise<boolean> {
  return STATIC_BLOG_SLUGS.includes(slug) || Boolean(await fetchPost(slug))
}

/**
 * Where an old slug lives now, or null (SQL part 345 blog_redirects; written
 * when a live post's slug changes, app/api/admin/blog/posts/[id]). Asked
 * only for a slug that is not a post, so a live post never pays for it:
 * app/(marketing)/blog/[slug]/layout.tsx answers it with a 308. Before part
 * 345 runs there is no table, and no slug has moved.
 */
export const blogRedirectFor = cache(async (slug: string): Promise<string | null> => {
  try {
    const supabase = createAdminClient()
    return await followBlogRedirect(slug, async (from) => {
      const { data, error } = await supabase.from("blog_redirects").select("to_slug").eq("from_slug", from).maybeSingle()
      return error || !data ? null : (data.to_slug as string)
    })
  } catch {
    return null
  }
})

/**
 * The reusable blocks a post's snippet blocks name (blog_snippets), by id.
 * The article draws a snippet block as these blocks; a snippet that was
 * deleted, or a table that is not there yet, is missing from the map and the
 * block draws nothing.
 */
export async function readBlogSnippets(blocks: Block[] | null | undefined): Promise<Map<string, Block[]>> {
  const ids = [...new Set((blocks ?? []).filter((b) => b.type === "snippet" && b.snippetId).map((b) => b.snippetId as string))]
  const out = new Map<string, Block[]>()
  if (!ids.length) return out
  try {
    const { data, error } = await createAdminClient().from("blog_snippets").select("id, blocks").in("id", ids)
    if (error) return out
    for (const s of data ?? []) out.set(s.id as string, normalizeBlocks(s.blocks).filter((b) => b.type !== "snippet"))
  } catch {}
  return out
}

/** A post's blocks with each snippet block replaced by the snippet's own blocks. */
export function expandSnippets(blocks: Block[], snippets: Map<string, Block[]>): Block[] {
  return blocks.flatMap((b) => (b.type === "snippet" ? (snippets.get(b.snippetId ?? "") ?? []).map((s) => ({ ...s, id: `${b.id}-${s.id}` })) : [b]))
}

export interface BlogAuthorProfile {
  id: string
  slug: string
  name: string
  role: string
  bio: string
  avatar_url: string | null
  links: { label: string; url: string }[]
}

/** The author profile a post names (blog_posts.author_id, SQL part 345), or null: then the post's byline text is the author. */
export const readBlogAuthor = cache(async (authorId: string | null | undefined): Promise<BlogAuthorProfile | null> => {
  if (!authorId) return null
  try {
    const { data, error } = await createAdminClient().from("blog_authors").select("id, slug, name, role, bio, avatar_url, links").eq("id", authorId).maybeSingle()
    if (error || !data) return null
    return { ...(data as BlogAuthorProfile), links: Array.isArray(data.links) ? (data.links as BlogAuthorProfile["links"]) : [] }
  } catch {
    return null
  }
})
