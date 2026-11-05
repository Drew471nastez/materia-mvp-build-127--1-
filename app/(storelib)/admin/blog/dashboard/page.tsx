import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import BlogDashboardClient from "./_dashboard-client"

/** /admin/blog/dashboard: where the blog's readers come from. The posts themselves are at /admin/blog. */
export default async function BlogDashboardPage() {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  return <BlogDashboardClient />
}
