import { NextResponse } from "next/server"
import { shopCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { collectionsArea, listCollections, saveCollection } from "@/lib/physical/collections-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await collectionsArea(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveCollection(c.db, c.creatorId, null, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  return physicalJson({ id: saved.id, collections: await listCollections(c.db, c.creatorId) })
}
