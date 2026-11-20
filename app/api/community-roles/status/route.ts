import { NextResponse } from "next/server"
import { READ, physicalJson, shopCaller } from "@/lib/physical/auth"
import { realDeps } from "@/lib/community-roles/engine"
import { communityRolesStatus } from "@/lib/community-roles/setup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/community-roles/status: the Discord and Telegram cards in
 * Settings › Integrations. Whether each is available (its keys are set),
 * connected, and needs attention. The store's owner only.
 */
export async function GET() {
  const c = await shopCaller("store", READ)
  if (c instanceof NextResponse) return c
  try {
    return physicalJson(await communityRolesStatus(realDeps(c.db), c.creatorId))
  } catch {
    return physicalJson({ error: "Could not check what is connected." }, 503)
  }
}
