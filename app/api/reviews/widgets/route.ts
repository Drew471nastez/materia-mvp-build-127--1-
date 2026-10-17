import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { forgetReviewPages } from "@/lib/reviews/store"
import { createWidgetConfig, listWidgetConfigs } from "@/lib/reviews/widgets/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Storelib Reviews › Widgets: the store's saved widget looks
 * (lib/reviews/widgets/server.ts). The store's owner, or a teammate with
 * the store area, only.
 *
 *   GET                              every saved configuration, newest first
 *   POST { type, name, settings }    a new one, its settings cleaned to the
 *                                    widget's lists and ranges
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { configs, ready } = await listWidgetConfigs(c.db, c.creatorId)
  return physicalJson({ configs, ready })
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await createWidgetConfig(c.db, c.creatorId, body)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  forgetReviewPages({ creatorId: c.creatorId })
  return physicalJson({ config: out.config }, 201)
}
