import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { listCasesForStore } from "@/lib/support/cases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The store's cases from its buyers (lib/support/cases.ts), newest first. */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const out = await listCasesForStore(c.db, c.creatorId)
  if (!out.ok) return physicalJson({ error: out.error, notReady: out.status === 503 }, out.status)
  return physicalJson({ cases: out.cases })
}
