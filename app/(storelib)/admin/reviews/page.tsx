import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { ReviewsAdmin } from "./reviews-admin"

/**
 * `storelib.com/admin/reviews`: reviews sellers reported, hidden until
 * Storelib decides. The admin cookie is checked here and again by
 * /api/admin/reviews for every read and decision. Never indexed.
 */
export const metadata: Metadata = {
  title: "Reported reviews | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminReviewsPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <ReviewsAdmin />
}
