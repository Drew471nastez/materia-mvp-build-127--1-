import { NextResponse, after } from "next/server"
import { isUuid, physicalCaller, physicalJson } from "@/lib/physical/auth"
import { getPhysicalReadiness, noteReadiness } from "@/lib/physical/readiness-server"
import { NEW_PRODUCT } from "@/lib/physical/readiness"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/physical/readiness: what stops this store selling what it ships
 * (lib/physical/readiness.ts), for the caller's own store, while physical
 * commerce is on. Home, Products, the product editor, Settings and the
 * website builder all read this one answer.
 *
 *   ?fresh=1          read now, not the minute old answer (Settings, after a save)
 *   ?product=<id>     that product as if it were already published (the editor, before publishing);
 *   ?product=new      a product not saved yet, which saving publishes
 *
 * After the answer goes, the store's recorded state is compared with it and
 * a change is told (lib/physical/readiness-server.ts noteReadiness): the
 * screen a creator lands on after publishing is often the first to see it.
 */
export async function GET(request: Request) {
  const c = await physicalCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const product = url.searchParams.get("product")
  const asLive = isUuid(product) || product === NEW_PRODUCT ? product : null
  const fresh = url.searchParams.get("fresh") === "1"
  const r = await getPhysicalReadiness(c.creatorId, { fresh, asLive }).catch(() => null)
  if (!r) return physicalJson({ error: "Could not check your store right now." }, 503)
  /* The editor's what-if answer is not the store's state: only a real one is recorded. */
  if (!asLive) after(() => noteReadiness(c.db, c.creatorId, r).then(() => undefined))
  return physicalJson({ readiness: r })
}
