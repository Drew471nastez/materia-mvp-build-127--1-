import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { NEEDS_345, blogSchema, readAuthors, readCategories, readSnippets, readTagSuggestions } from "@/lib/blog/admin-store"
import { STORELIB_CATEGORIES } from "@/lib/blog-categories"

/** What every editor page reads with the post, on the server, in one go. */
export async function editorContext() {
  const supabase = createAdminClient()
  const { full } = await blogSchema(supabase)
  const [categories, authors, snippets, tags] = await Promise.all([
    readCategories(supabase, full, STORELIB_CATEGORIES),
    readAuthors(supabase, full),
    readSnippets(supabase, full),
    readTagSuggestions(supabase, full),
  ])
  return { supabase, full, categories, authors, snippets, tags, note345: NEEDS_345 }
}
