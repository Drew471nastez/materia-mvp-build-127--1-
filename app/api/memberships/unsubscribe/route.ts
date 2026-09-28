import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { unsubscribeCard, type CardSender } from "@/lib/unsubscribe-card"
import { emailImageUrl } from "@/lib/email-campaigns/brand"
import { verifyToken, signToken, siteUrl } from "@/lib/memberships/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /api/memberships/unsubscribe?t=<token>
 *
 * The way out at the foot of a creator's update email to members
 * (lib/memberships/update-email.ts). It turns off those emails for this one
 * membership; the membership, its billing notices and its posts on the
 * membership page are unchanged, and Manage on that page turns the emails
 * back on.
 *
 *   GET    asks, and changes nothing: mail scanners open every link.
 *   POST   does it. The form on the page posts here, and so does an inbox's
 *          one-click unsubscribe (List-Unsubscribe-Post, RFC 8058). A
 *          `resubscribe=1` field turns them back on.
 *
 * The token is the membership's id with a signature; nothing else is read
 * from the request.
 */
const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" }

async function context(token: string | null) {
  const id = verifyToken("unsubscribe", token)
  if (!id) return null
  const admin = createAdminClient()
  const { data: m } = await admin.from("memberships").select("id, title, email_updates, creator_id").eq("id", id).maybeSingle()
  if (!m) return null
  let sender: CardSender = { kind: "none" }
  if (m.creator_id) {
    const { data: creator } = await admin.from("creators").select("user_id").eq("id", m.creator_id).maybeSingle()
    const { data: profile } = creator?.user_id ? await admin.from("profiles").select("display_name, username, avatar_url").eq("id", creator.user_id).maybeSingle() : { data: null }
    const name = (profile?.display_name || profile?.username || m.title || "").trim()
    if (name) sender = { kind: "creator", name, imageUrl: emailImageUrl(profile?.avatar_url) }
  }
  return { admin, membership: m as { id: string; title: string | null; email_updates: boolean }, sender }
}

function page(state: "confirm" | "off" | "on" | "invalid" | "error", token: string | null, title: string | null, sender: CardSender) {
  const what = title ? `posts from ${title}` : "members' posts"
  const action = "/api/memberships/unsubscribe"
  const fields = { t: token || "" }
  const words = {
    confirm: { tone: "asked" as const, heading: "Stop emails for new posts?", body: `You will stop getting ${what} by email. You stay a member, and every post is still on your membership page.`, buttons: [{ label: "Stop these emails", action, fields, look: "primary" as const }] },
    off: { tone: "done" as const, heading: "Emails stopped", body: `You will not get ${what} by email any more. Your membership and its posts are unchanged.`, buttons: [{ label: "Turn them back on", action, fields: { ...fields, resubscribe: "1" }, look: "secondary" as const }] },
    on: { tone: "done" as const, heading: "Emails are on", body: `You will get ${what} by email again.`, buttons: [{ label: "Stop these emails", action, fields, look: "secondary" as const }] },
    invalid: { tone: "problem" as const, heading: "This link does not work", body: "It may be incomplete. You can turn post emails on or off from Manage on your membership page.", buttons: [] },
    error: { tone: "problem" as const, heading: "That did not save", body: "Nothing changed. Try again in a moment.", buttons: [] },
  }[state]
  return unsubscribeCard({
    title: "Membership emails",
    sender,
    tone: words.tone,
    heading: words.heading,
    body: words.body,
    buttons: words.buttons,
    link: { href: siteUrl("/library/memberships"), label: "Open your memberships" },
  })
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t")
  const ctx = await context(token).catch(() => null)
  if (!ctx) return new Response(page("invalid", null, null, { kind: "none" }), { status: 404, headers: HEADERS })
  return new Response(page(ctx.membership.email_updates ? "confirm" : "off", token, ctx.membership.title, ctx.sender), { headers: HEADERS })
}

export async function POST(request: Request) {
  const limited = await rateLimit({ bucket: "membership-unsubscribe", subjects: [addressSubject(request)], windows: LIMITS.subscribe, message: "Too many tries. Wait a minute." })
  if (limited) return new Response(page("error", null, null, { kind: "none" }), { status: 429, headers: HEADERS })
  const url = new URL(request.url)
  let token = url.searchParams.get("t")
  let resubscribe = false
  try {
    const form = await request.formData()
    token = (form.get("t") as string | null) || token
    resubscribe = form.get("resubscribe") === "1"
  } catch {
    /* one-click posts "List-Unsubscribe=One-Click" with the token in the address */
  }
  const ctx = await context(token).catch(() => null)
  if (!ctx || !token) return new Response(page("invalid", null, null, { kind: "none" }), { status: 404, headers: HEADERS })
  const { error } = await ctx.admin.from("memberships").update({ email_updates: resubscribe }).eq("id", ctx.membership.id)
  if (error) return new Response(page("error", token, ctx.membership.title, ctx.sender), { status: 500, headers: HEADERS })
  return new Response(page(resubscribe ? "on" : "off", signToken("unsubscribe", ctx.membership.id), ctx.membership.title, ctx.sender), { headers: HEADERS })
}
