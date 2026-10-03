import { NextResponse, type NextRequest } from "next/server"

import { requireAdmin, adminFailure } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { PLATFORM_FLAG_KEYS, clearFlagCache, isPlatformFlagKey, readFlag, setFlag } from "@/lib/platform/flags"

/**
 * /api/admin/flags
 *
 * GET   every platform switch and whether it is on.
 * POST  { key, enabled } turns one on or off, then records it in the admin
 *       audit trail. The answer is the switch as the database now has it.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

async function allFlags(): Promise<Record<string, boolean>> {
  clearFlagCache()
  const values = await Promise.all(PLATFORM_FLAG_KEYS.map((key) => readFlag(key)))
  return Object.fromEntries(PLATFORM_FLAG_KEYS.map((key, i) => [key, values[i]]))
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ flags: await allFlags() }, { headers: NO_STORE })
  } catch (error) {
    return adminFailure("platform flags read", error, "Could not read the platform switches.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { key?: unknown; enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400, headers: NO_STORE })
  }
  if (!isPlatformFlagKey(body.key)) {
    return NextResponse.json({ error: `key must be one of: ${PLATFORM_FLAG_KEYS.join(", ")}.` }, { status: 400, headers: NO_STORE })
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false." }, { status: 400, headers: NO_STORE })
  }
  const key = body.key
  const enabled = body.enabled

  try {
    await setFlag(key, enabled, "admin session")
  } catch (error) {
    return adminFailure("platform flag write", error, "Could not save the switch. Nothing was changed. If this keeps happening, run supabase/sql/run-now/81_communities.sql.")
  }
  const recorded = await recordAdminAction(createAdminClient(), {
    action: enabled ? "flag_on" : "flag_off",
    targetType: "flag",
    targetId: key,
    targetLabel: enabled ? "on" : "off",
    detail: { key, enabled },
  })
  return NextResponse.json({ key, enabled: await readFlag(key), recorded }, { headers: NO_STORE })
}
