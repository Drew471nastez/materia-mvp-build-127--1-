import type { Metadata, Viewport } from "next"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { readPerfReport } from "@/lib/perf/read"
import { windowOf } from "@/lib/perf/report"

import { AdminLogin } from "../_console/login"
import { PerformanceAdmin } from "./performance-admin"

/**
 * `storelib.com/admin/performance`: how fast Storelib is for the people
 * using it, measured rather than guessed. The Health Index and its sub
 * scores, the live figures, the daily official score with its history,
 * problems by how many people they touch, and the optimizations shipped with
 * their before and after. The admin cookie is checked here, on the server,
 * before anything is read, and again by /api/perf/admin for every refresh.
 * Never indexed.
 */
export const metadata: Metadata = {
  title: "Performance and health | Storelib admin",
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { themeColor: "#0b0b0f", colorScheme: "dark" }

export const dynamic = "force-dynamic"

export default async function AdminPerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await isAdminAuthenticated())) return <AdminLogin />
  const sp = await searchParams
  const raw = Array.isArray(sp.window) ? sp.window[0] : sp.window
  const report = await readPerfReport(windowOf(raw))
  return <PerformanceAdmin initial={report} />
}
