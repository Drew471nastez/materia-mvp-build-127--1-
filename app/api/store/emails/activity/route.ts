import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { emailActivity } from "@/lib/emails/activity-server"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Emails › Customer emails: what each email sent in the last 30 days and when
 * the last one went, and the automations that go with each family, on or off
 * (lib/emails/activity-server.ts). Read after the list is drawn; the list
 * never waits for it.
 *
 *   GET ?communities=<id>,<id>   ->   EmailActivity
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const asked = (new URL(request.url).searchParams.get("communities") ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  /* Only the store's own communities are counted, whatever was asked. */
  let communityIds: string[] = []
  if (asked.length) {
    const { data } = await c.db.from("communities").select("id").eq("creator_id", c.creatorId).in("id", asked.slice(0, 50))
    communityIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  }
  const physical = await isPhysicalCommerceEnabled().catch(() => false)
  return physicalJson(await emailActivity(c.db, c.creatorId, { physical, communityIds }))
}
