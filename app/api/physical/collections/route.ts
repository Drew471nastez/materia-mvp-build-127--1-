import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { listCollections, saveCollection } from "@/lib/physical/collections-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const [collections, { data: products }] = await Promise.all([
    listCollections(c.db, c.creatorId),
    c.db.from("products").select("id, title, thumbnail_url, type, status, price_cents").eq("creator_id", c.creatorId).order("created_at", { ascending: false }).limit(1000),
  ])
  return physicalJson({ collections, products: products ?? [] })
}

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveCollection(c.db, c.creatorId, null, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  return physicalJson({ id: saved.id, collections: await listCollections(c.db, c.creatorId) })
}
