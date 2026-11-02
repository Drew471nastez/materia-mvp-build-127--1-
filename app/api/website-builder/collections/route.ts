import { NextResponse } from "next/server"

import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { saveCollection } from "@/lib/physical/collections-server"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { siteCollections } from "@/lib/website-builder/storefront-collections-server"

/*
 * ===========================================================================
 *  THE BUILDER'S COLLECTIONS: READ, AND ONE MADE FROM A PICKER (round 12)
 * ===========================================================================
 * GET               -> { choices, cards }
 * POST { title, productIds? } -> { id, choices, cards }
 *
 * The owner: "If there's no collection, or in general, there should be a New
 * collection button, or if none, Add collection, in the modal." A collection
 * picker in the builder makes one in place: the same save Products ›
 * Collections makes (lib/physical/collections-server.ts saveCollection, as
 * /api/collections POST), a manual collection of the products ticked,
 * published. The answer is the builder's whole list again, in the shape the
 * editor was handed when it opened (/api/website-builder/themes/[installId]
 * `collections`), so the new one is picked and drawn on the canvas at once.
 *
 * The store is the caller's own, or the one their team role reaches
 * (shopCaller, the Products area's rule), never a store named in the body.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/* Round 42: the builder's collection picker reads the store's for Website (and Products); making one is Products'. */
export async function GET() {
  const c = await shopCaller(["website", "products"], { read: true })
  if (c instanceof NextResponse) return c
  const { collections, choices } = await siteCollections(c.db, c.creatorId, { published: false })
  return physicalJson({ choices, cards: collections })
}

export async function POST(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const productIds = Array.isArray(body.productIds) ? body.productIds.filter((x): x is string => typeof x === "string").slice(0, 1000) : []
  const saved = await saveCollection(c.db, c.creatorId, null, { title: body.title, kind: "manual", productIds, published: true })
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  translationsChanged(c.creatorId)
  const { collections, choices } = await siteCollections(c.db, c.creatorId, { published: false, fresh: true })
  return physicalJson({ id: saved.id.toLowerCase(), choices, cards: collections })
}
