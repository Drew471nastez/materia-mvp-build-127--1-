import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { CommunitiesAdmin } from "./communities-admin"

/**
 * `storelib.com/admin/communities`: the communities switch for the whole of
 * Storelib, the figures, every community with suspend and hide, and the
 * reports members escalated to Storelib. The admin cookie is checked here,
 * on the server, before anything is sent, and again by
 * /api/admin/communities and /api/admin/flags for every read and write.
 * Never indexed.
 */
export const metadata: Metadata = {
  title: "Communities | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminCommunitiesPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <CommunitiesAdmin />
}
