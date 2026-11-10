import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { communityEmailFacts, emailWordsFor, isEditableEmail, previewEmailWords, wordsInput, type EmailWords } from "@/lib/communities/server/email-templates"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { sendEmail, buildFromHeader } from "@/lib/mail"
import { rateLimit } from "@/lib/api/rate-limit"
import { maskEmail } from "@/lib/privacy/mask-email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * SEND A TEST of one community email, exactly as a member gets it (its template, the community's name, picture,
 * reply address and domain, and its words, or the words still being typed), to the inbox of the person who pressed
 * the button and nobody else. Sample facts, and "[Test]" in front of the subject so it is never taken for a real one.
 *
 * POST /api/app/community/<id>/emails/test  { kind, subject?, heading?, intro?, button? }  ->  { sentTo } (masked)
 *
 * The community's settings permission, as every route of its emails. Ten an hour a person.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const body = await readJson(request)
  if (!isEditableEmail(body.kind)) return NextResponse.json({ error: "Pick one of the emails." }, { status: 400, headers: noStore })

  const limited = await rateLimit({
    bucket: "community-email-test",
    subjects: [`user:${gate.ctx.userId}`],
    windows: [
      { limit: 3, seconds: 60 },
      { limit: 10, seconds: 3600 },
    ],
    message: "That's a lot of tests. Try again in a little while.",
  })
  if (limited) return limited

  const db = gate.ctx.admin
  const { data: who } = await db.auth.admin.getUserById(gate.ctx.userId)
  const to = who?.user?.email
  if (!to) return NextResponse.json({ error: "Your account has no email address to send the test to." }, { status: 400, headers: noStore })

  /* The words being typed, when the editor sent any and they are valid; else what is saved. */
  const typed = ["subject", "heading", "intro", "button"].some((k) => typeof body[k] === "string") ? wordsInput(body, body.kind) : null
  if (typed && "error" in typed) return NextResponse.json(typed, { status: 400, headers: noStore })
  const words: EmailWords = (typed as EmailWords | null) ?? (await emailWordsFor(db, gate.community.id, body.kind)) ?? { subject: "", heading: "", intro: "", button: "" }
  const community = await communityEmailFacts(db, gate.community)
  const currency = gate.community.creator_id ? (await readStoreCurrency(db, gate.community.creator_id).catch(() => null))?.currency : null
  const mail = previewEmailWords(body.kind, words, { ...community, currency: currency || "USD" })

  const sent = await sendEmail({
    from: buildFromHeader(mail.fromName || community.name),
    /* From the store's own domain when it has one verified, as the real email is. */
    store: gate.community.creator_id ?? null,
    to,
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    subject: `[Test] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
    transactional: true,
    headers: { "X-Storelib-Notification": "COMMUNITY_EMAIL_TEST" },
  })
  if (!sent.success) return NextResponse.json({ error: "The test couldn't be sent just now. Try again in a minute." }, { status: 502, headers: noStore })
  return NextResponse.json({ sentTo: maskEmail(to) }, { headers: noStore })
}
