import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson } from "@/lib/physical/auth"
import { movements } from "@/lib/physical/inventory-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const variantId = url.searchParams.get("variantId")
  return physicalJson({ movements: await movements(c.db, c.creatorId, { variantId: isUuid(variantId) ? variantId : undefined, limit: 200 }) })
}
