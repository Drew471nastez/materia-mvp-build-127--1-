import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { SecurityAdmin } from "./security-admin"

/**
 * `storelib.com/admin/security`: the upload checks, for the owner. Which
 * checks are on, what they refused lately and why, product files by state,
 * a test tool, and the security log. The admin cookie is checked here and
 * again by /api/admin/security for every read and test. Never indexed, and
 * linked only from inside the admin console. /admin/scanner comes here.
 */
export const metadata: Metadata = {
  title: "File security | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminSecurityPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <SecurityAdmin />
}
