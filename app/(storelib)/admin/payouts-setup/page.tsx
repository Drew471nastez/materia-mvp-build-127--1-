import type { Metadata, Viewport } from "next"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { AdminLogin } from "../_console/login"
import { PayoutsSetupPreview } from "./preview"

/**
 * storelib.com/admin/payouts-setup: the live payout setup, the same screen
 * a creator gets from Settings. The admin cookie is checked before it is sent.
 */
export const metadata: Metadata = {
  title: "Payout setup | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#f6f7f9", colorScheme: "light" }

export const dynamic = "force-dynamic"

export default async function AdminPayoutsSetupPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <PayoutsSetupPreview />
}
