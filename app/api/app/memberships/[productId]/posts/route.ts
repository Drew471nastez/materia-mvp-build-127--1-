import { NextResponse, after } from "next/server"
import { isResponse, readJson, requireCreator, noStore, UUID } from "@/lib/email-campaigns/route-auth"
import { POST_COLUMNS, ownedMembership } from "@/lib/memberships/creator"
import { checkPost } from "@/lib/memberships/plan"
import { queuePostEmails, sendPendingPostEmails } from "@/lib/memberships/update-email"
import { rateLimit } from "@/lib/api/rate-limit"
import { queueMembershipPostFanout } from "@/lib/notifications/fanout"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/app/memberships/<productId>/posts
 *   { title, body, images: [{url,width,height}], attachments: [{assetId,name,size}],
 *     linkedProductIds, sendEmail }
 *
 * "Post an update to members". The post is on every member's page at once
 * (newest first, with a dot until they open it). With sendEmail, and the
 * membership on sale, every member who can read it now is emailed it once,
 * in the creator's own email style (lib/memberships/update-email.ts): the
 * first batch right after this answers, the rest by /api/cron/memberships.
 *
 * Files must be this membership's own uploads (uploaded through
 * /api/v2/upload/prepare with its product id); linked products must be the
 * creator's. Answers { post, emailing }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  if (!UUID.test(productId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const product = await ownedMembership(ctx.admin, ctx.creatorId, productId)
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const limited = await rateLimit({ bucket: "membership-post", subjects: [`creator:${ctx.creatorId}`], windows: [{ limit: 10, seconds: 600 }, { limit: 60, seconds: 86400 }], message: "That is a lot of updates at once. Try again in a few minutes." })
  if (limited) return limited

  const storageHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname
    } catch {
      return null
    }
  })()
  const checked = checkPost(await readJson(request), storageHost)
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const post = checked.value

  if (post.attachments.length > 0) {
    const { data: assets } = await ctx.admin.from("digital_assets").select("id, file_name, file_size, upload_status").eq("product_id", productId).in("id", post.attachments.map((a) => a.assetId))
    const ready = new Map(((assets as { id: string; file_name: string; file_size: number; upload_status: string | null }[] | null) ?? []).filter((a) => a.upload_status !== "pending" && a.upload_status !== "failed").map((a) => [a.id, a]))
    const missing = post.attachments.filter((a) => !ready.has(a.assetId))
    if (missing.length > 0) return NextResponse.json({ error: "A file has not finished uploading. Wait for it, then post.", field: "attachments" }, { status: 400, headers: noStore })
    post.attachments = post.attachments.map((a) => ({ assetId: a.assetId, name: ready.get(a.assetId)!.file_name || a.name, size: ready.get(a.assetId)!.file_size || a.size }))
  }
  if (post.linkedProductIds.length > 0) {
    const { data: mine } = await ctx.admin.from("products").select("id").eq("creator_id", ctx.creatorId).in("id", post.linkedProductIds)
    const own = new Set(((mine as { id: string }[] | null) ?? []).map((p) => p.id))
    post.linkedProductIds = post.linkedProductIds.filter((id) => own.has(id) && id !== productId)
  }

  const { data: saved, error } = await ctx.admin
    .from("membership_posts")
    .insert({ product_id: productId, creator_id: ctx.creatorId, title: post.title, body: post.body, images: post.images, attachments: post.attachments, linked_product_ids: post.linkedProductIds })
    .select(POST_COLUMNS)
    .single()
  if (error || !saved) return NextResponse.json({ error: "The update could not be posted. Try again." }, { status: 500, headers: noStore })

  /* Every member who can read it hears about it in their bell, in app only; the email below stays the creator's choice (lib/notifications/fanout.ts). Never fails the post. */
  try {
    await queueMembershipPostFanout(ctx.admin, { postId: saved.id, productId })
  } catch (e) {
    console.error("[memberships] post notice not queued:", e instanceof Error ? e.message : e)
  }

  let emailing = 0
  if (post.sendEmail && product.status === "published") {
    try {
      emailing = await queuePostEmails(ctx.admin, { id: saved.id, product_id: productId })
      if (emailing > 0) after(async () => void (await sendPendingPostEmails(ctx.admin, { budgetMs: 40_000, postId: saved.id })))
    } catch (e) {
      console.error("[memberships] update emails not queued:", e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ post: { ...saved, email_status: emailing > 0 ? "queued" : saved.email_status }, emailing }, { headers: noStore })
}
