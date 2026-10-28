import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { forgetReviewPages } from "@/lib/reviews/store"
import { deleteWidgetConfig, updateWidgetConfig } from "@/lib/reviews/widgets/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * One saved widget look (lib/reviews/widgets/server.ts), the store's own.
 *
 *   PUT { name, settings }   changed; every section that names it follows
 *   DELETE                   gone; a section that named it draws the
 *                            widget's defaults with its own changes
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "That widget is gone." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await updateWidgetConfig(c.db, c.creatorId, id, body)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  forgetReviewPages({ creatorId: c.creatorId })
  return physicalJson({ config: out.config })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ ok: true })
  const out = await deleteWidgetConfig(c.db, c.creatorId, id)
  if (!out.ok) return physicalJson({ error: out.error }, out.status ?? 500)
  forgetReviewPages({ creatorId: c.creatorId })
  return physicalJson({ ok: true })
}
