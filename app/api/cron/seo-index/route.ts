import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { runSeoCron } from "@/lib/admin/seo/run"
import { recordCronRun } from "@/lib/observability/report"
import { announceScheduledBlogPosts } from "@/lib/blog/went-live"

/**
 * GET /api/cron/seo-index
 *
 * Every ten minutes (vercel.json): the next sitemap files read into the SEO
 * inventory, this run's share of Google's daily URL inspections (never
 * checked and stalest first), and the pages scored longest ago fetched and
 * scored again (lib/admin/seo/run.ts). /admin/seo shows the result.
 * Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const RUN_BUDGET_MS = 48_000

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  try {
    /* A blog post scheduled for the last few minutes: its cached pages rebuilt and the engines told (lib/blog/went-live.ts). */
    const wentLive = await announceScheduledBlogPosts()
    if (wentLive) console.log(`[cron/seo-index] blog posts gone live: ${wentLive}`)
    const summary = await runSeoCron({ budgetMs: RUN_BUDGET_MS })
    const asked = Object.values(summary.inspected).reduce((n, p) => n + p.granted, 0)
    console.log(
      `[cron/seo-index] files ${summary.files.map((f) => `${f.name}:${f.listed}`).join(" ") || "none"}, sites ${summary.sites}, inspected ${asked}${summary.google === "not_connected" ? " (Search Console not connected)" : ""}, scored ${summary.scored}, ${summary.ms}ms${summary.problems.length ? `, problems: ${summary.problems.join(" | ")}` : ""}`,
    )
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[cron/seo-index] the run failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

/* Every run recorded and timed with the other jobs (admin System view, lib/observability/report.ts). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/seo-index", request, () => runJob(request), { maxDurationS: maxDuration })
}

export async function POST(request: Request) {
  return recordCronRun("/api/cron/seo-index", request, () => runJob(request), { maxDurationS: maxDuration })
}
