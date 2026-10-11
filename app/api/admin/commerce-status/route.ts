/**
 * The live status on /admin/physical-commerce, read again for Refresh. The
 * admin cookie is checked first, before any service-role read or any call
 * to Stripe (lib/admin/gate); a stranger gets a 401 and nothing else.
 */
import { NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { readCommerceStatus } from "@/lib/admin/commerce-status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const status = await readCommerceStatus()
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return adminFailure("commerce status", e, "The status could not be read.")
  }
}
