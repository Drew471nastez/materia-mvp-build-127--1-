import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import SeoAdminClient from "./_seo-client"

export default async function SeoAdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/blog")
  }
  return <SeoAdminClient />
}
