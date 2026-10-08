import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { loadIntegrations } from "@/lib/physical/integrations-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Every commerce integration and where it stands, for Settings › Integrations. Secrets come back as their last four characters only. */
export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  return physicalJson({ integrations: await loadIntegrations(c.db, c.creatorId) })
}
