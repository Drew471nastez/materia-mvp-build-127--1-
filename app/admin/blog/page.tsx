import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import BlogAdminLoginClient from "./_login-client"

export default async function AdminBlogPage() {
  const authed = await isAdminAuthenticated()
  if (authed) redirect("/admin/blog/dashboard")
  return <BlogAdminLoginClient />
}
