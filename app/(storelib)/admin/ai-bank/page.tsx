import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { bankRowView, type BankRowView } from "@/lib/storelib-ai/bank/admin"
import { listBank } from "@/lib/storelib-ai/bank/store"
import { BANK_INDUSTRIES } from "@/lib/storelib-ai/bank/snapshot"

import { AdminLogin } from "../_console/login"
import { AiBankAdmin } from "./ai-bank-admin"

/**
 * `storelib.com/admin/ai-bank`: the websites the AI builds from. Pick an
 * account's library websites (Materia Themes and anything imported with
 * Import theme) and put them in the bank; the website AI starts new sites
 * from the one that suits each business best, fitted to it, and learns how
 * their parts are put together. Read with the service role behind the admin
 * cookie, here on the server.
 */
export const metadata: Metadata = {
  title: "AI source bank | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminAiBankPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  let rows: BankRowView[] = []
  let problem: "missing" | "unreadable" | null = null
  try {
    const r = await listBank(createAdminClient() as unknown as Parameters<typeof listBank>[0])
    rows = r.rows.map(bankRowView)
    if (r.missing) problem = "missing"
  } catch {
    problem = "unreadable"
  }
  return <AiBankAdmin initial={rows} problem={problem} industries={[...BANK_INDUSTRIES]} />
}
