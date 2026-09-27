import { permanentRedirect } from "next/navigation"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"

/**
 * `storelib.com/admin/scanner` was the ClamAV scanner's page. The upload
 * checks, and the optional malware engine with them, live on
 * /admin/security now; an old bookmark lands there, after the admin session
 * is checked like every other admin page.
 */
export const dynamic = "force-dynamic"

export default async function AdminScannerPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  permanentRedirect("/admin/security")
}
