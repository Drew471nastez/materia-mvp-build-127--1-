import { NextResponse } from "next/server"
import { isUuid, shopCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { deleteCollection, listCollections, saveCollection } from "@/lib/physical/collections-server"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { sizeChartsChanged } from "../../size-charts/changed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveCollection(c.db, c.creatorId, id, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  /* Its title and description, translated in a few minutes (lib/markets/translate-queue.ts). */
  translationsChanged(c.creatorId)
  /* Who is in it decides a size chart set for it (round 13, lib/size-charts/storefront.ts): product pages read it again. */
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ collections: await listCollections(c.db, c.creatorId) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  if (!(await deleteCollection(c.db, c.creatorId, id))) return physicalJson({ error: "The collection could not be deleted." }, 500)
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ collections: await listCollections(c.db, c.creatorId) })
}
