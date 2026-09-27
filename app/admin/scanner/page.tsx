import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { ScannerAdmin } from "./scanner-admin"

/**
 * `storelib.com/admin/scanner`: the malware scanner, for the owner to test.
 * Whether it is set up, ClamAV's version and signature date, a test with the
 * EICAR string, a file of your own, or a file already in storage, and the
 * latest scans. The admin cookie is checked here and again by
 * /api/admin/scanner for every read and test. Never indexed, and linked only
 * from inside the admin console.
 */
export const metadata: Metadata = {
  title: "Malware scanner | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminScannerPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <ScannerAdmin />
}
