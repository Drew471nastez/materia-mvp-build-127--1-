import { NextResponse, after } from "next/server"
import { shopCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { collectionsArea, listCollections, saveCollection } from "@/lib/physical/collections-server"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { sizeChartsChanged } from "../size-charts/changed"
import { announce, collectionAddresses } from "@/lib/seo/announce"
import { indexNowKey } from "@/lib/seo/indexnow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  return physicalJson(await collectionsArea(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveCollection(c.db, c.creatorId, null, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  /* A new collection's page, told to search engines once the answer has gone (round 45). */
  if (indexNowKey()) {
    const creatorId = c.creatorId
    const id = saved.id
    after(async () => {
      const { data } = await c.db.from("product_collections").select("slug, published").eq("id", id).maybeSingle()
      const row = data as { slug?: string | null; published?: boolean | null } | null
      if (row?.published !== false) await announce(() => collectionAddresses(creatorId, row?.slug))
    })
  }
  translationsChanged(c.creatorId)
  /* Who is in it decides a size chart set for it (round 13, lib/size-charts/storefront.ts): product pages read it again. */
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ id: saved.id, collections: await listCollections(c.db, c.creatorId) })
}
