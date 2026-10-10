/**
 * WHO AN EMAIL CAN GO TO: each audience the compose page offers, with how
 * many subscribed people are in it today, and the creator's segments.
 *
 * Counted, not listed. The exact number after bad and duplicate addresses
 * are dropped comes from the confirm step (POST /api/email/send, dry_run).
 */
import { NextResponse } from "next/server"
import { isResponse, noStore, requireCreator } from "@/lib/email-campaigns/route-auth"
import { monthlyLimit } from "@/lib/email-campaigns/limits"
import { isModernSchema, usedThisMonth } from "@/lib/email-campaigns/queue"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { segmentMemberIds } from "@/lib/email-campaigns/segments-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DAY = 86_400_000

export async function GET() {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const db = ctx.admin
  const base = () =>
    db.from("subscribers").select("id", { count: "exact", head: true }).eq("creator_id", ctx.creatorId).eq("status", "subscribed").or("is_active.is.null,is_active.eq.true")
  const since = (days: number) => new Date(Date.now() - days * DAY).toISOString()

  const [all, week, month, quarter, onepage, store, segments, creator, used, brand, upgraded, products] = await Promise.all([
    base(),
    base().gte("subscribed_at", since(7)),
    base().gte("subscribed_at", since(30)),
    base().gte("subscribed_at", since(90)),
    base().eq("source", "onepage"),
    base().eq("source", "store_builder"),
    db.from("email_segments").select("id, name, filters").eq("creator_id", ctx.creatorId).order("name"),
    db.from("creators").select("subscription_plan_id, subscription_status").eq("id", ctx.creatorId).maybeSingle(),
    usedThisMonth(db, ctx.creatorId),
    /* The look the email will be sent in, for the preview beside the editor. */
    loadBrand(db, ctx.creatorId),
    isModernSchema(db),
    /* For New segment's "bought a product you pick": the creator's own products, names only. */
    db.from("products").select("id, title").eq("creator_id", ctx.creatorId).neq("status", "deleted").order("created_at", { ascending: false }).limit(200),
  ])
  if (all.error) return NextResponse.json({ error: "Could not read your subscriber list. Try again in a moment." }, { status: 503 })

  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0)
  /* A segment of rules is counted as it would be sent today; the first twenty, so a long list of segments can't slow the page. */
  type SegRow = { id: string; name: string; filters: { subscriber_ids?: unknown; rules?: unknown } | null }
  const segRows = (segments.data ?? []) as SegRow[]
  const ruleCounts = new Map<string, number | null>()
  await Promise.all(
    segRows
      .filter((s) => s.filters?.rules)
      .slice(0, 20)
      .map(async (s) => {
        try {
          ruleCounts.set(s.id, (await segmentMemberIds(db, ctx.creatorId, s.filters?.rules)).length)
        } catch {
          ruleCounts.set(s.id, null)
        }
      }),
  )
  return NextResponse.json(
    {
      options: [
        { type: "all", label: "All subscribers", count: n(all) },
        { type: "last_7days", label: "Joined in the last 7 days", count: n(week) },
        { type: "last_30days", label: "Joined in the last 30 days", count: n(month) },
        { type: "last_90days", label: "Joined in the last 90 days", count: n(quarter) },
        { type: "onepage", label: "Joined on your OnePage", count: n(onepage) },
        { type: "store_builder", label: "Joined on your website", count: n(store) },
      ],
      segments: segRows.map((s) => ({
        id: s.id,
        name: s.name,
        count: s.filters?.rules ? ruleCounts.get(s.id) ?? null : Array.isArray(s.filters?.subscriber_ids) ? (s.filters?.subscriber_ids as unknown[]).length : null,
      })),
      products: ((products.data ?? []) as { id: string; title: string | null }[]).map((p) => ({ id: p.id, title: p.title || "Untitled product" })),
      plan: { limit: monthlyLimit(creator.data?.subscription_plan_id, creator.data?.subscription_status), used },
      brand,
      upgraded,
    },
    { headers: noStore },
  )
}
