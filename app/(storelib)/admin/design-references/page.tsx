import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { rowView } from "@/lib/storelib-ai/references/admin"
import { listRows } from "@/lib/storelib-ai/references/store"
import { builtInReferences } from "@/lib/storelib-ai/references"

import { AdminLogin } from "../_console/login"
import { DesignReferencesAdmin } from "./design-references-admin"

/**
 * `storelib.com/admin/design-references`: the screenshots the website AI
 * learns from. Upload one with a note; the vision model turns it into a
 * reference record; the agent sees the best few for each new website.
 * Read with the service role behind the admin cookie, here on the server.
 */
export const metadata: Metadata = {
  title: "Design references | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminDesignReferencesPage() {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  let rows: ReturnType<typeof rowView>[] = []
  let problem: "missing" | "unreadable" | null = null
  try {
    const r = await listRows(createAdminClient() as unknown as Parameters<typeof listRows>[0])
    rows = r.rows.map(rowView)
    if (r.missing) problem = "missing"
  } catch {
    problem = "unreadable"
  }
  const built = builtInReferences()
  return (
    <DesignReferencesAdmin
      initial={rows}
      problem={problem}
      library={{ seeds: built.filter((r) => r.source.origin === "storelib" && r.kind === "site").length, systems: built.filter((r) => r.kind === "system").length, styles: built.filter((r) => r.kind === "style").length, principles: built.filter((r) => r.kind === "principle").length }}
    />
  )
}
