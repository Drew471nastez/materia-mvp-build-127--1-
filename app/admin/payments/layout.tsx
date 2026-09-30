import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { PaymentsShell } from "./_shell"

export const metadata: Metadata = {
  title: "Payments | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminPaymentsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <PaymentsShell>{children}</PaymentsShell>
}
