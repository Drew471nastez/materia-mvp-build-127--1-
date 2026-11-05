import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { summariseRuns, type AiRunRow } from "@/lib/admin/ai-runs"

import { AdminLogin } from "../_console/login"
import { AiRunsAdmin } from "./ai-runs-admin"

/**
 * `storelib.com/admin/ai-runs`: how the website builder's Storelib AI has been
 * doing, from its run log (storelib_ai_runs). Facts per run, never the words
 * of a request. Read with the service role behind the admin cookie, here on
 * the server only. Never indexed.
 */
export const metadata: Metadata = {
  title: "Storelib AI runs | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

const DAYS = [1, 7, 14, 30] as const

export default async function AdminAiRunsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  const asked = Number((await searchParams).days)
  const days = (DAYS as readonly number[]).includes(asked) ? asked : 14
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const db = createAdminClient()
  const { data, error } = await db
    .from("storelib_ai_runs")
    .select("id, created_at, install_id, creator_id, page_key, status, intent_kind, intent_flags, ops_count, wrote_code, pages_built, unresolved, duration_ms, model, provider, input_tokens, output_tokens")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000)
  const rows = (data ?? []) as AiRunRow[]
  /* A database without the table yet says so, with the file that makes it. */
  const missing = !!error && /storelib_ai_runs|relation|schema cache|does not exist/i.test(error.message ?? "")
  return (
    <AiRunsAdmin
      days={days}
      choices={[...DAYS]}
      summary={summariseRuns(rows)}
      recent={rows.slice(0, 60)}
      problem={error ? (missing ? "missing" : "unreadable") : null}
    />
  )
}
