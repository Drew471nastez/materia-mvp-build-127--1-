import type { Metadata } from "next"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { AdminLogin } from "../_console/login"
import { SqlUpdatesAdmin } from "./sql-updates-admin"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "SQL updates | Storelib admin", robots: { index: false, follow: false, nocache: true } }

export default async function SqlUpdatesPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <SqlUpdatesAdmin />
}
