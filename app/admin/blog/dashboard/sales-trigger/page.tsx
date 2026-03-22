import { redirect } from "next/navigation"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import SalesTriggerClient from "./_sales-trigger-client"

export default async function SalesTriggerPage() {
  const authed = await isAdminAuthenticated()
  if (!authed) redirect("/admin/blog")
  return <SalesTriggerClient />
}
