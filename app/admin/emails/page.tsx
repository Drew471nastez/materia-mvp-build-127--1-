import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { emailGallery } from "@/lib/admin/email-gallery"

import { AdminLogin } from "../_console/login"
import { EmailsAdmin } from "./emails-admin"

/**
 * `storelib.com/admin/emails`: every email Storelib sends, by section and category, each with its preview
 * (lib/admin/email-gallery.ts). The admin cookie is checked here and by /api/admin/emails. Never indexed.
 */
export const metadata: Metadata = {
  title: "Every email | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminEmailsPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <EmailsAdmin emails={emailGallery()} />
}
