import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import BlogPostEditorClient from "../_editor-client"

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  const { id } = await params
  return <BlogPostEditorClient mode="edit" postId={id} />
}
