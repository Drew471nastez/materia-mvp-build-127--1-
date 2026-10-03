import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { physicalAnalytics } from "@/lib/physical/analytics-server"
import { loadSettings } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30))
  const settings = await loadSettings(c.db, c.creatorId)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  return physicalJson({ days, analytics: await physicalAnalytics(c.db, c.creatorId, since, settings.lowStockDefault) })
}
