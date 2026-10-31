import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema } from "@/lib/blog/admin-store"
import { normalizeBlocks } from "@/lib/blog/editor-model"
import { plainText } from "@/lib/blog/sanitize"
import { blogJson, revalidateBlogPages } from "@/lib/blog/admin-http"

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const { data, error } = await createAdminClient().from("blog_snippets").select("id, name, blocks, updated_at").eq("id", id).maybeSingle()
  if (error || !data) return blogJson({ error: "That snippet is gone." }, 404)
  return blogJson({ snippet: { ...data, blocks: normalizeBlocks(data.blocks) } })
}

/** Change a snippet: every post that places it shows the change at its next revalidate. */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body?.name === "string") {
    const name = plainText(body.name, 120).trim()
    if (!name) return blogJson({ error: "A snippet needs a name." }, 400)
    update.name = name
  }
  if (Array.isArray(body?.blocks)) update.blocks = normalizeBlocks(body.blocks).filter((b) => b.type !== "snippet")
  const { data, error } = await supabase.from("blog_snippets").update(update).eq("id", id).select("id, name, blocks, updated_at").maybeSingle()
  if (error) return blogJson({ error: "Couldn't save the snippet." }, 500)
  if (!data) return blogJson({ error: "That snippet is gone." }, 404)
  revalidateBlogPages()
  return blogJson({ snippet: data })
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const { id } = await context.params
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { error } = await supabase.from("blog_snippets").delete().eq("id", id)
  if (error) return blogJson({ error: "Couldn't delete the snippet." }, 500)
  revalidateBlogPages()
  return blogJson({ ok: true })
}
