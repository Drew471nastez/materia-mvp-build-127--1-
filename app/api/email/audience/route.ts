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

  const [all, week, month, quarter, onepage, store, segments, creator, used, brand, upgraded] = await Promise.all([
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
  ])
  if (all.error) return NextResponse.json({ error: "Could not read your subscriber list. Try again in a moment." }, { status: 503 })

  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0)
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
      segments: (segments.data ?? []).map((s: { id: string; name: string; filters: { subscriber_ids?: unknown } | null }) => ({
        id: s.id,
        name: s.name,
        count: Array.isArray(s.filters?.subscriber_ids) ? (s.filters?.subscriber_ids as unknown[]).length : null,
      })),
      plan: { limit: monthlyLimit(creator.data?.subscription_plan_id, creator.data?.subscription_status), used },
      brand,
      upgraded,
    },
    { headers: noStore },
  )
}
