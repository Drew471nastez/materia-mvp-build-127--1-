import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { NEEDS_345, blogSchema, readCategories } from "@/lib/blog/admin-store"
import { slugify } from "@/lib/blog/editor-model"
import { plainText } from "@/lib/blog/sanitize"
import { blogJson } from "@/lib/blog/admin-http"
import { STORELIB_CATEGORIES } from "@/lib/blog-categories"

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  return blogJson({ categories: await readCategories(supabase, full, STORELIB_CATEGORIES), full })
}

/** A new category: { name, description?, slug? }. Its slug is its address, /blog/category/<slug>, and does not change after. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return blogJson({ error: "Unauthorized" }, 401)
  }
  const body = await req.json().catch(() => null)
  const name = plainText(body?.name, 80).trim()
  const slug = slugify(typeof body?.slug === "string" && body.slug ? body.slug : name)
  if (!name || !slug) return blogJson({ error: "A category needs a name." }, 400)
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  if (!full) return blogJson({ error: NEEDS_345 }, 409)
  const { data: last } = await supabase.from("blog_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1)
  const { data, error } = await supabase
    .from("blog_categories")
    .insert({ name, slug, description: plainText(body?.description, 500).trim(), sort_order: Number(last?.[0]?.sort_order ?? 0) + 1 })
    .select("id, slug, name, description")
    .single()
  if (error) return blogJson({ error: error.code === "23505" ? "A category with that name or address already exists." : "Couldn't add the category." }, error.code === "23505" ? 409 : 500)
  return blogJson({ category: data })
}
