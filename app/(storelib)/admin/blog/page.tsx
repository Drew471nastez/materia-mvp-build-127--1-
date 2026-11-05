import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { NEEDS_345, blogSchema, listAdminPosts, readAuthors, readCategories } from "@/lib/blog/admin-store"
import { STORELIB_CATEGORIES } from "@/lib/blog-categories"
import { AdminLogin } from "../_console/login"
import BlogListClient from "./_list-client"

export const dynamic = "force-dynamic"

/**
 * /admin/blog: every post, read here on the server with light columns, so
 * the list, its counts and its filters draw on the first paint with no
 * fetch from the browser. Signed out, the console's own sign in.
 */
export default async function AdminBlogPage() {
  const authed = await isAdminAuthenticated()
  if (!authed) return <AdminLogin />
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const [{ rows, error }, categories, authors] = await Promise.all([listAdminPosts(supabase, full), readCategories(supabase, full, STORELIB_CATEGORIES), readAuthors(supabase, full)])
  return <BlogListClient rows={rows} error={error} categories={categories.map((c) => c.name)} authors={authors.map((a) => ({ id: a.id, name: a.name }))} full={full} note345={NEEDS_345} />
}
