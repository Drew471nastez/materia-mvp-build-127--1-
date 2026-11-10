import type { NextRequest } from "next/server"

import { requireAdmin } from "@/lib/admin/gate"
import { referenceAdmin } from "@/lib/storelib-ai/references/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * PATCH  /api/admin/design-references/:id   { enabled?, notes?, record?: { title, summary, styleTags, industries, tone, borrow, avoid, fitsPoorly, quality } }
 * DELETE /api/admin/design-references/:id   the row and its pictures
 * POST   /api/admin/design-references/:id   analyse the picture again
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  return referenceAdmin().patch(req, id)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  return referenceAdmin().remove(id)
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  return referenceAdmin().analyse(id)
}
