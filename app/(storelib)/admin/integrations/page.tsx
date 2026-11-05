import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { IntegrationsAdmin } from "./integrations-admin"

/**
 * `storelib.com/admin/integrations`: what stores ask to connect, the
 * directory every store sees and how each integration is doing. The admin
 * cookie is checked here and again by /api/admin/integrations. Never indexed.
 */
export const metadata: Metadata = {
  title: "Integrations | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminIntegrationsPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <IntegrationsAdmin />
}
