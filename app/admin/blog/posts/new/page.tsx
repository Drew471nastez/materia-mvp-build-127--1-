import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import BlogPostEditorClient from "../_editor-client"
import { editorContext } from "../_load"

export const dynamic = "force-dynamic"

/** A new post. Nothing is written until there is something to save: the first autosave makes the row. */
export default async function NewBlogPostPage() {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  const { full, categories, authors, snippets, tags, note345 } = await editorContext()
  return <BlogPostEditorClient initial={null} full={full} categories={categories} authors={authors} snippets={snippets} tags={tags} note345={note345} />
}
