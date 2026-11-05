import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { readTranslationHealth } from "@/lib/admin/translation-health"

import { AdminLogin } from "../_console/login"
import { TranslationsAdmin } from "./translations-admin"

/**
 * `storelib.com/admin/translations`: whether automatic translation is
 * working (lib/admin/translation-health.ts). Which translators are set up,
 * the models each read from its own list, which are resting and why, the
 * calls per day, and the stores where it stopped. Read with the service
 * role behind the admin cookie, here on the server only. Never indexed.
 */
export const metadata: Metadata = {
  title: "Translations | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminTranslationsPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  const health = await readTranslationHealth(createAdminClient())
  return <TranslationsAdmin health={health} />
}
