import { NextRequest, after } from "next/server"
import { announceAddresses, blogPostAddresses } from "@/lib/seo/announce-pages"
import { adminFailure } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { adminView, blogSchema, readAdminPost, savePost } from "@/lib/blog/admin-store"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"
import { isPostLive } from "@/lib/blog/schedule"

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }

  const { id } = await context.params
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const row = await readAdminPost(supabase, id)
  if (!row) return blogJson({ error: "That post no longer exists." }, 404)
  return blogJson({ post: adminView(row), full })
}

/**
 * One save: { action, version, meta, blocks, publish_at?, force? }.
 *
 *   autosave, save   into the draft copy when the post is live (SQL part
 *                    345), into the post itself when nobody can see it yet;
 *                    save also keeps a revision.
 *   publish          live now, or at publish_at (a later date is scheduled).
 *   update           the draft made live; a slug that moved leaves a 308.
 *   unpublish        off the site; the draft is kept.
 *
 * `version` is the one the editor was given; a different one on the row is
 * a 409 with the row as it is now, and nothing is written
 * (lib/blog/save-rules.ts). Every field is cleaned on the server.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return blogJson({ error: "Invalid request body" }, 400)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const saved = await savePost(supabase, id, body, full)
  if (!saved.ok) return blogJson({ error: saved.error, code: saved.code, current: saved.current }, saved.status)
  type Live = { slug?: string | null; is_published?: boolean | null; published_at?: string | null }
  const before = saved.before as Live
  const data = saved.row as Live

  if (saved.liveChanged) {
    revalidateBlogPages(before?.slug, data?.slug)
    /* A live post, or one just taken down: tell the engines after the answer (lib/seo/announce-pages.ts). A draft or a post still scheduled has no page. */
    if (isPostLive(data) || isPostLive(before)) {
      const slugs = [before?.slug, data?.slug]
      after(() => announceAddresses(blogPostAddresses(...slugs)))
    }
  }

  return blogJson({ post: adminView(saved.row), full })
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }

  const { id } = await context.params
  const supabase = createAdminClient()

  // Fetch the post slug before deleting so we can revalidate its page
  const { data: post } = await supabase.from("blog_posts").select("slug, is_published, published_at").eq("id", id).maybeSingle()
  const { error } = await supabase.from("blog_posts").delete().eq("id", id)
  if (error) return adminFailure("blog post", error)

  revalidateBlogPages(post?.slug)
  /* Its address answers 404 now; engines told look again and drop it. */
  if (post && isPostLive(post)) {
    const gone = post.slug
    after(() => announceAddresses(blogPostAddresses(gone)))
  }

  return blogJson({ ok: true })
}
