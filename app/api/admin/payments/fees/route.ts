import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { activateFeeDraft, activateFeeVersion, getFeesAdminState, saveFeeDraft } from "@/lib/admin/payments/fees-admin"
import type { StorelibFeeConfig } from "@/lib/payments/fees/types"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const state = await getFeesAdminState(createAdminClient())
    return NextResponse.json(state, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments fees", e, "Fee configuration could not be read.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json().catch(() => null)
    const action = body?.action
    const db = createAdminClient()

    if (action === "activate") {
      const versionId = body?.versionId as string | undefined
      const effectiveAt = body?.effectiveAt as string | undefined
      const result = versionId ? await activateFeeVersion(db, versionId, effectiveAt) : await activateFeeDraft(db, effectiveAt)
      if (!result.ok) {
        return NextResponse.json(result, { status: 400, headers: NO_STORE })
      }
      return NextResponse.json(result, { headers: NO_STORE })
    }

    const config = body?.config as StorelibFeeConfig
    if (!config) return NextResponse.json({ error: "config required" }, { status: 400, headers: NO_STORE })
    const result = await saveFeeDraft(db, config, body?.summary as string | undefined)
    if (!result.ok) return NextResponse.json(result, { status: 400, headers: NO_STORE })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("payments fees save", e, "Fee change could not be saved.")
  }
}
