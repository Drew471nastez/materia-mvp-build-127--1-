import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { undoImport } from "@/lib/reviews/import-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

/**
 * Undo an import (Reviews › Import): the reviews that import wrote are
 * deleted, with the photos it copied, and nothing else. Only the signed in
 * store's own import; another store's id reads as not found.
 *
 *   DELETE  → { removed, import }
 */
export async function DELETE(_request: Request, { params }: Params) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return physicalJson({ error: "That import is not here." }, 404)
  const limited = await rateLimit({ bucket: "review-import-undo", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 30, seconds: 3600 }] })
  if (limited) return limited
  const result = await undoImport(c.db, c.creatorId, id)
  if (result.ok === false) return physicalJson({ error: (result as { error: string }).error }, (result as { status: number }).status)
  return physicalJson({ removed: result.removed, import: result.record })
}
