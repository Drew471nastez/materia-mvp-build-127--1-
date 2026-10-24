import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { warmPublishedSites } from "@/lib/website-builder/warm-sites"

/**
 * GET /api/cron/warm-sites
 *
 * Every five minutes (vercel.json), and nothing at all once this deployment
 * has been warmed: each published website's front page and products page
 * are drawn before their first visitor after a deploy
 * (lib/website-builder/warm-sites.ts). Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const RUN_BUDGET_MS = 45_000

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const started = Date.now()
  try {
    const summary = await warmPublishedSites({ budgetMs: RUN_BUDGET_MS })
    const ms = Date.now() - started
    /* A line only when it did something: an already warmed deploy is silent. */
    if (!summary.skipped) console.log(`[cron/warm-sites] ${summary.sites} sites, pages ${summary.pages.drawn} drawn ${summary.pages.held} already held ${summary.pages.failed} failed, ${summary.done ? "done" : "more next run"}, ${ms}ms`)
    return NextResponse.json({ ...summary, ms }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[cron/warm-sites] the run failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return runJob(request)
}

export async function POST(request: Request) {
  return runJob(request)
}
