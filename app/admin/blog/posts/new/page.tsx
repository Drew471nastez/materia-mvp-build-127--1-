import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import BlogPostEditorClient from "../_editor-client"

export default async function NewBlogPostPage() {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  return <BlogPostEditorClient mode="new" />
}
