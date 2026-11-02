import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { fileUsage } from "@/lib/files/usage-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Where one of the owner's own files shows: their products, variants,
 * website pages and OnePages (lib/files/usage-server.ts). Asked by Files'
 * detail view and before a delete, so the warning names what will go blank.
 *
 *   GET ?bucket=<bucket>&path=<path>
 */
export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const u = new URL(request.url)
  const out = await fileUsage(c.db, { userId: c.ownerUserId ?? c.userId, creatorId: c.creatorId }, u.searchParams.get("bucket"), u.searchParams.get("path"))
  if (out.ok === false) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ uses: out.uses })
}
