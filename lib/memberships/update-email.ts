import "server-only"

/**
 * ===========================================================================
 *  A CREATOR'S UPDATE, BY EMAIL, TO EVERY MEMBER, ONCE
 * ===========================================================================
 * "Post an update to members" also emails it, the way Patreon and Substack
 * do. The email is the creator's, not Storelib's: drawn in the layout every
 * email a creator sends is drawn in (lib/email-campaigns/template.ts
 * buildEmail), from their name with Storelib's verified address and their
 * own Reply-To (lib/email-campaigns/queue.ts loadSender), with the one
 * picture of the creator an email carries (lib/email-campaigns/sender.ts
 * senderPicture: their photo, else their website's logo, else a letter).
 *
 * WHAT IT SAYS. The title, the text (paragraphs as written), the first
 * picture, a line saying how many files are attached, and one button to
 * read it on the membership page, where the files and the rest of the
 * pictures are, behind sign in. Attachments are never sent by email.
 *
 * WHO GETS IT, AND ONCE. Publishing writes one row per member who can read
 * it now (membership_post_emails, keyed by post and membership), then the
 * rows are sent in batches: right after the post, and by the scheduled job
 * (/api/cron/memberships) for whatever did not fit. Each row is claimed by
 * moving it off "pending" before its email goes, so two runs never send the
 * same row. At the moment of sending the member is checked again: still
 * with access, still wanting these emails, and the address not suppressed
 * (a bounce, a complaint or a Storelib wide unsubscribe).
 *
 * THE WAY OUT turns off these emails for this one membership
 * (/api/memberships/unsubscribe), in the footer and in the one-click
 * List-Unsubscribe header Gmail and Yahoo ask bulk senders for. The posts
 * stay on the membership page, and Manage turns the emails back on.
 */
import { loadSender, type Sender } from "@/lib/email-campaigns/queue"
import { sendEmail } from "@/lib/mail"
import { isSuppressed } from "@/lib/notify/suppressions"
import { grantsAccess } from "./state"
import { renderUpdateEmail, type PostForEmail } from "./update-email-render"
import type { Db } from "./server"

export { renderUpdateEmail, type PostForEmail }

/** One row per member who can read the post now and has not turned these emails off. Answers how many. */
export async function queuePostEmails(admin: Db, post: { id: string; product_id: string }): Promise<number> {
  const { data } = await admin
    .from("memberships")
    .select("id, buyer_email, status, current_period_end, past_due_since, email_updates")
    .eq("product_id", post.product_id)
    .in("status", ["active", "trialing", "past_due", "canceled"])
    .eq("email_updates", true)
    .limit(20000)
  const rows = ((data as { id: string; buyer_email: string; status: string; current_period_end: string | null; past_due_since: string | null }[] | null) ?? []).filter(
    (m) => grantsAccess(m) && m.buyer_email && !m.buyer_email.endsWith("@storelib.invalid"),
  )
  const seen = new Set<string>()
  const queue = rows
    .filter((m) => (seen.has(m.buyer_email) ? false : (seen.add(m.buyer_email), true)))
    .map((m) => ({ post_id: post.id, membership_id: m.id, email: m.buyer_email, status: "pending" }))
  for (let i = 0; i < queue.length; i += 500) {
    const { error } = await admin.from("membership_post_emails").upsert(queue.slice(i, i + 500), { onConflict: "post_id,membership_id", ignoreDuplicates: true })
    if (error) throw new Error(`${error.code ?? ""} ${error.message ?? ""}`)
  }
  await admin.from("membership_posts").update({ email_status: queue.length ? "queued" : "sent" }).eq("id", post.id)
  return queue.length
}

export interface SendSummary {
  sent: number
  skipped: number
  failed: number
  left: boolean
}

/** Sends pending update emails for up to `budgetMs`. Safe to run from several places at once. */
export async function sendPendingPostEmails(admin: Db, opts: { budgetMs: number; postId?: string; batch?: number } = { budgetMs: 20_000 }): Promise<SendSummary> {
  const started = Date.now()
  const summary: SendSummary = { sent: 0, skipped: 0, failed: 0, left: false }
  const posts = new Map<string, { post: PostForEmail; title: string; sender: Sender | null } | null>()
  while (Date.now() - started < opts.budgetMs) {
    let q = admin.from("membership_post_emails").select("post_id, membership_id, email, attempts").eq("status", "pending").order("created_at", { ascending: true }).limit(opts.batch ?? 50)
    if (opts.postId) q = q.eq("post_id", opts.postId)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    for (const row of data as { post_id: string; membership_id: string; email: string; attempts: number }[]) {
      if (Date.now() - started >= opts.budgetMs) {
        summary.left = true
        break
      }
      /* Claimed by moving it off pending: a second run racing this one finds nothing to take. */
      const { data: claimed } = await admin
        .from("membership_post_emails")
        .update({ status: "failed", attempts: (row.attempts ?? 0) + 1, last_error: "sending" })
        .eq("post_id", row.post_id)
        .eq("membership_id", row.membership_id)
        .eq("status", "pending")
        .select("post_id")
      if (!claimed || claimed.length === 0) continue
      const outcome = await sendOne(admin, row, posts).catch((e: unknown) => ({ status: "failed" as const, error: e instanceof Error ? e.message : String(e) }))
      const retry = outcome.status === "failed" && (row.attempts ?? 0) + 1 < 3
      await admin
        .from("membership_post_emails")
        .update({ status: retry ? "pending" : outcome.status, last_error: outcome.status === "sent" ? null : outcome.error ?? null, sent_at: outcome.status === "sent" ? new Date().toISOString() : null })
        .eq("post_id", row.post_id)
        .eq("membership_id", row.membership_id)
      summary[outcome.status === "sent" ? "sent" : outcome.status === "skipped" ? "skipped" : "failed"]++
    }
    if (summary.left) break
  }
  /* Each post whose rows are all done is marked sent, with how many went. */
  for (const [postId, loaded] of posts) {
    if (!loaded) continue
    const { count: pending } = await admin.from("membership_post_emails").select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("status", "pending")
    const { count: sent } = await admin.from("membership_post_emails").select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("status", "sent")
    await admin.from("membership_posts").update({ email_status: (pending ?? 0) > 0 ? "sending" : "sent", emailed_count: sent ?? 0 }).eq("id", postId)
  }
  return summary
}

async function sendOne(
  admin: Db,
  row: { post_id: string; membership_id: string; email: string },
  posts: Map<string, { post: PostForEmail; title: string; sender: Sender | null } | null>,
): Promise<{ status: "sent" | "skipped" | "failed"; error?: string }> {
  if (!posts.has(row.post_id)) {
    const { data: post } = await admin.from("membership_posts").select("id, product_id, creator_id, title, body, images, attachments, deleted_at").eq("id", row.post_id).maybeSingle()
    if (!post || post.deleted_at) posts.set(row.post_id, null)
    else {
      const { data: product } = await admin.from("products").select("title").eq("id", post.product_id).maybeSingle()
      posts.set(row.post_id, { post: post as PostForEmail, title: (product?.title as string) || "", sender: await loadSender(admin, post.creator_id) })
    }
  }
  const loaded = posts.get(row.post_id)
  if (!loaded || !loaded.sender || loaded.sender.blocked) return { status: "skipped", error: "post or sender gone" }
  const { data: m } = await admin.from("memberships").select("id, status, current_period_end, past_due_since, email_updates, buyer_email").eq("id", row.membership_id).maybeSingle()
  if (!m || !m.email_updates || !grantsAccess(m)) return { status: "skipped", error: "no longer a member, or emails off" }
  if (await isSuppressed(admin, m.buyer_email, "optional_product")) return { status: "skipped", error: "suppressed" }
  const mail = renderUpdateEmail({ post: loaded.post, membershipId: m.id, membershipTitle: loaded.title, sender: loaded.sender })
  const result = await sendEmail({
    to: m.buyer_email,
    from: loaded.sender.from,
    ...(loaded.sender.sendingDomain ? { sendingDomain: loaded.sender.sendingDomain } : {}),
    replyTo: loaded.sender.replyTo,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "membership_update", value: "1" }],
  })
  return result.success ? { status: "sent" } : { status: "failed", error: result.error || "not sent" }
}
