import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { NotificationsAdmin } from "./notifications-admin"

/**
 * `storelib.com/admin/notifications`: the notification engine traced and
 * counted (lib/notify/admin-trace.ts). The admin cookie is checked here, on
 * the server, before anything is sent, and again by
 * /api/admin/notifications for every read. Never indexed.
 */
export const metadata: Metadata = {
  title: "Notifications | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminNotificationsPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <NotificationsAdmin />
}
