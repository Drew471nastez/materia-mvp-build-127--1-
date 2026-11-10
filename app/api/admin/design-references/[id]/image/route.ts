import type { NextRequest } from "next/server"

import { requireAdmin } from "@/lib/admin/gate"
import { referenceAdmin } from "@/lib/storelib-ai/references/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/design-references/:id/image?size=original
 *
 * The picture from the private bucket, streamed to the signed in admin with
 * no-store. There is no public or signed URL for it anywhere.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  return referenceAdmin().image(id, req.nextUrl.searchParams.get("size") === "original" ? "original" : "view")
}
