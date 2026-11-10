/**
 * ===========================================================================
 *  REPLY TO A CONTACT FORM MESSAGE, FROM EMAILS › MESSAGES
 * ===========================================================================
 * POST `{ text }` -> `{ reply: { id, message, created_at }, read_at }`
 *
 * Sent in the store's name to the address that wrote, Reply-To the store's
 * contact address (Settings › Store details), so their answer reaches the
 * creator's inbox. The message is marked read, and the reply is kept beside
 * it (lib/site-contact/reply.ts) so the message's page shows the thread.
 *
 * Scoped as the message's other routes are: the message id AND the store the
 * session works in (its owner, or a team member given Marketing), never a
 * store from the request. Another store's id answers 404.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTeamPermission } from "@/lib/team/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { buildFromHeader, sendEmail } from "@/lib/mail"
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { replyAddress } from "@/lib/emails/customer-copy-server"
import { cleanReply, replyEmail, replyRow, replySubject } from "@/lib/site-contact/reply"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = { params: Promise<{ id: string }> }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  if (!UUID.test(id)) return json({ error: "Not found" }, 404)
  const gate = await requireTeamPermission("marketing")
  if (gate instanceof NextResponse) return gate
  let body: { text?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: "Bad request" }, 400)
  }
  const text = cleanReply(body.text)
  if (!text) return json({ error: "Write a reply first." }, 400)

  const limited = await rateLimit({
    bucket: "contact-reply",
    subjects: [`user:${gate.userId}`],
    windows: [
      { limit: 10, seconds: 60 },
      { limit: 100, seconds: 3600 },
    ],
    message: "That's a lot of replies at once. Try again in a minute.",
  })
  if (limited) return limited

  const db = createAdminClient()
  const { data: message, error } = await db
    .from("site_contact_messages")
    .select("id, email, name, subject, message, site, page, subscriber_id, created_at")
    .eq("id", id)
    .eq("creator_id", gate.creatorId)
    .maybeSingle()
  if (error || !message) return json({ error: "Not found" }, 404)

  const [store, identity] = await Promise.all([
    storeIdentity(db, gate.creatorId).catch(() => null),
    resolveCreatorIdentity(db, gate.creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
  ])
  const shopName = (store?.name || identity.fromName || "Storelib").trim()
  /* The address their answer goes to: the store's contact email, else the one the store's emails already use. */
  const replyTo = replyAddress(store?.email) ?? replyAddress(identity.replyTo) ?? replyAddress(gate.userEmail) ?? undefined
  const mail = replyEmail({
    sender: { kind: "store", name: shopName, pictureUrl: store?.logoUrl ?? null, picture: store?.logoFrom === "profile" ? "avatar" : "logo" },
    text,
    original: { name: message.name ?? null, subject: message.subject ?? null, message: message.message, created_at: message.created_at },
  })
  const sent = await sendEmail({ from: buildFromHeader(shopName), store: gate.creatorId, to: message.email, replyTo, subject: mail.subject, html: mail.html, text: mail.text, transactional: true })
  if (!sent.success) return json({ error: "Your reply was not sent. Try again." }, 502)

  const at = new Date().toISOString()
  /* Kept beside the message, and the message read. Either failing leaves the reply sent: it is in their inbox, said so. */
  const row = replyRow({ creatorId: gate.creatorId, message: { id: message.id, email: message.email, site: message.site ?? null, subscriber_id: message.subscriber_id ?? null }, subject: replySubject(message.subject, shopName), text, shopName, at })
  const [kept] = await Promise.all([
    db.from("site_contact_messages").insert(row).select("id, message, created_at").maybeSingle().then(
      (r: { data: { id: string; message: string; created_at: string } | null; error: unknown }) => (r.error ? null : r.data),
      () => null,
    ),
    db.from("site_contact_messages").update({ read_at: at }).eq("id", id).eq("creator_id", gate.creatorId).is("read_at", null).then(
      () => null,
      () => null,
    ),
  ])
  return json({ reply: kept ?? { id: `sent-${Date.now()}`, message: text, created_at: at }, kept: !!kept, read_at: at })
}
