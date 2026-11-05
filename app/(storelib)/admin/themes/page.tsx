import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

import { AdminLogin } from "../_console/login"
import { ThemesAdmin } from "./themes-admin"

/**
 * `storelib.com/admin/themes`: the themes in the library's Browse themes and
 * at storelib.com/themes. The admin cookie is checked here and again by
 * every /api/admin/themes route. Never indexed.
 */
export const metadata: Metadata = {
  title: "Themes | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminThemesPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <ThemesAdmin />
}
