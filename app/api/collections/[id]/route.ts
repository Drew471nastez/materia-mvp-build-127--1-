import { NextResponse, after } from "next/server"
import { isUuid, shopCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { deleteCollection, listCollections, saveCollection } from "@/lib/physical/collections-server"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { sizeChartsChanged } from "../../size-charts/changed"
import { announce, collectionAddresses } from "@/lib/seo/announce"
import { indexNowKey } from "@/lib/seo/indexnow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* The address it had, read before the save, so a rename or an unpublish is announced where it was too (round 45). */
  const before = indexNowKey() ? await slugOf(c.db, c.creatorId, id) : null
  const saved = await saveCollection(c.db, c.creatorId, id, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  if (indexNowKey()) {
    const creatorId = c.creatorId
    const db = c.db
    after(async () => announce(async () => collectionAddresses(creatorId, before, await slugOf(db, creatorId, id))))
  }
  /* Its title and description, translated in a few minutes (lib/markets/translate-queue.ts). */
  translationsChanged(c.creatorId)
  /* Who is in it decides a size chart set for it (round 13, lib/size-charts/storefront.ts): product pages read it again. */
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ collections: await listCollections(c.db, c.creatorId) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  /* Where it was, read before it goes: search engines are told to look again and find the 404 (round 45). */
  const gone = indexNowKey() ? await slugOf(c.db, c.creatorId, id) : null
  if (!(await deleteCollection(c.db, c.creatorId, id))) return physicalJson({ error: "The collection could not be deleted." }, 500)
  if (gone) {
    const creatorId = c.creatorId
    after(() => announce(() => collectionAddresses(creatorId, gone)))
  }
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ collections: await listCollections(c.db, c.creatorId) })
}

/** A collection's slug, this creator's only; null when there is none or it cannot be read. */
async function slugOf(db: Exclude<Awaited<ReturnType<typeof shopCaller>>, NextResponse>["db"], creatorId: string, id: string): Promise<string | null> {
  try {
    const { data } = await db.from("product_collections").select("slug").eq("id", id).eq("creator_id", creatorId).maybeSingle()
    return ((data as { slug?: string | null } | null)?.slug ?? null) || null
  } catch {
    return null
  }
}
