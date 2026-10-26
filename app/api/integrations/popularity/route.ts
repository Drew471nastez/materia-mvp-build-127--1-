import { NextResponse } from "next/server"
import { shopCaller } from "@/lib/physical/auth"
import { integrationPopularity } from "@/lib/integrations/popularity-server"

/**
 * How much each integration is used across Storelib's stores, one score per
 * integration id, for the directory's order (components/app/settings/
 * integrations-directory.tsx, lib/integrations/popularity-server.ts). Signed
 * in store owners only: the numbers are the platform's, and nobody else
 * needs them. Counts, never a store.
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const scores = await integrationPopularity(c.db)
  return NextResponse.json({ scores }, { headers: { "Cache-Control": "private, max-age=3600" } })
}

