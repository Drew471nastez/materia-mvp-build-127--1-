import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { ResolutionCenter } from "./resolution-center"

/**
 * `storelib.com/admin/resolution`: stores' support requests and payment
 * disputes in one place. The admin cookie is checked here and again by
 * /api/admin/support and /api/admin/payments/disputes on every read and
 * reply. Never indexed.
 */
export const metadata: Metadata = {
  title: "Resolution center | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminResolutionPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <ResolutionCenter />
}
