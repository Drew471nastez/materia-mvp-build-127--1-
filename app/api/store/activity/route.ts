import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { loadActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PREFIX: Record<string, string> = { products: "product.", orders: "order.", files: "file.", settings: "settings." }

/**
 * Settings › Activity (lib/activity): the store's changes, newest first, a
 * page at a time.
 *
 *   GET ?group=products|orders|settings|files&before=<row id>
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const url = new URL(request.url)
  const before = Number(url.searchParams.get("before"))
  const group = url.searchParams.get("group") ?? ""
  return physicalJson(await loadActivity(c.db, c.creatorId, { before: Number.isSafeInteger(before) && before > 0 ? before : null, prefix: PREFIX[group] ?? null }))
}
