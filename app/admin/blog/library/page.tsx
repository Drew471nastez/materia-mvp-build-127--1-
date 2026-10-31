import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { NEEDS_345, blogSchema, readAuthors, readCategories, readSnippets } from "@/lib/blog/admin-store"
import { STORELIB_CATEGORIES } from "@/lib/blog-categories"
import LibraryClient from "./_library-client"

export const dynamic = "force-dynamic"

/** /admin/blog/library: the blog's categories, author profiles and reusable snippets, read here with how many posts use each. */
export default async function BlogLibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  const { tab } = await searchParams
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const [categories, authors, snippets, posts] = await Promise.all([
    readCategories(supabase, full, STORELIB_CATEGORIES),
    readAuthors(supabase, full),
    readSnippets(supabase, full),
    supabase.from("blog_posts").select(full ? "category, author_id, content" : "category").range(0, 1999),
  ])
  const rows = (posts.data ?? []) as unknown as { category: string | null; author_id?: string | null; content?: unknown }[]
  const byCategory: Record<string, number> = {}
  const byAuthor: Record<string, number> = {}
  const bySnippet: Record<string, number> = {}
  for (const r of rows) {
    if (r.category) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1
    if (r.author_id) byAuthor[r.author_id] = (byAuthor[r.author_id] ?? 0) + 1
    if (Array.isArray(r.content)) for (const b of r.content as { type?: string; snippetId?: string }[]) if (b?.type === "snippet" && b.snippetId) bySnippet[b.snippetId] = (bySnippet[b.snippetId] ?? 0) + 1
  }
  const initialTab = tab === "authors" || tab === "snippets" ? tab : "categories"
  return (
    <LibraryClient
      tab={initialTab}
      full={full}
      note345={NEEDS_345}
      categories={categories.map((c) => ({ ...c, posts: byCategory[c.name] ?? 0 }))}
      authors={authors.map((a) => ({ ...a, posts: byAuthor[a.id] ?? 0 }))}
      snippets={snippets.map((s) => ({ ...s, posts: bySnippet[s.id] ?? 0 }))}
    />
  )
}
