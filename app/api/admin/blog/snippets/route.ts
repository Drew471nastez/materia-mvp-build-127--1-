import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema, readSnippets } from "@/lib/blog/admin-store"
import { normalizeBlocks } from "@/lib/blog/editor-model"
import { plainText } from "@/lib/blog/sanitize"
import { blogJson } from "@/lib/blog/admin-http"

/**
 * Reusable blocks (blog_snippets, SQL part 345): a sign-up box, a
 * disclaimer, a "what Storelib charges" table, written once and placed in
 * any post with a snippet block. Admin only and noindex (lib/blog/admin-http.ts).
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  return blogJson({ snippets: await readSnippets(supabase, full), full, note: full ? undefined : NEEDS_345 })
}

/** A new snippet: { name, blocks }. A snippet may not hold another snippet. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const body = await req.json().catch(() => null)
  const name = plainText(body?.name, 120).trim()
  if (!name) return blogJson({ error: "A snippet needs a name." }, 400)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const blocks = normalizeBlocks(body?.blocks).filter((b) => b.type !== "snippet")
  const { data, error } = await supabase.from("blog_snippets").insert({ name, blocks }).select("id, name, blocks, updated_at").single()
  if (error) return blogJson({ error: "Couldn't save the snippet." }, 500)
  return blogJson({ snippet: data })
}
