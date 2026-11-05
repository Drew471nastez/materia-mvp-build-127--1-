import { notFound, redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { adminView, readAdminPost } from "@/lib/blog/admin-store"
import BlogPostEditorClient from "../_editor-client"
import { editorContext } from "../_load"

export const dynamic = "force-dynamic"

/** One post in the editor, read on the server with everything the editor needs, so it draws with no fetch first. */
export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  const { id } = await params
  const { supabase, full, categories, authors, snippets, tags, note345 } = await editorContext()
  const row = await readAdminPost(supabase, id)
  if (!row) notFound()
  return <BlogPostEditorClient initial={adminView(row)} full={full} categories={categories} authors={authors} snippets={snippets} tags={tags} note345={note345} />
}
