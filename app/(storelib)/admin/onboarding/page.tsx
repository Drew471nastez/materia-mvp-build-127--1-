import type { Metadata, Viewport } from "next"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { AdminLogin } from "../_console/login"
import { OnboardingPreview } from "./preview"

/**
 * storelib.com/admin/onboarding: the live join onboarding, for checking the
 * slides without signing up. The admin cookie is checked before it is sent.
 */
export const metadata: Metadata = {
  title: "Onboarding | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" }

export const dynamic = "force-dynamic"

export default async function AdminOnboardingPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  return <OnboardingPreview />
}
