import { NextResponse } from "next/server"
import { sendEmail } from "@/lib/mail"
import { platformEmail } from "@/lib/emails/layout"
import { addressSubject, emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { SUPPORT_INBOX, contactProblems, reasonLabel, type ContactInput } from "@/lib/help/contact"

export const dynamic = "force-dynamic"

/**
 * THE HELP CENTER'S CONTACT FORM, sent to the team (team@storelib.com) with
 * the sender as Reply-To, so a reply from the inbox goes straight back to
 * them. Limited per address and per email; a filled hidden field is a bot,
 * answered as if it went through. Nothing is stored and nothing is sent to
 * the address typed, so the form cannot be used to mail somebody else.
 */
export async function POST(request: Request) {
  let body: Partial<ContactInput>
  try {
    body = (await request.json()) as Partial<ContactInput>
  } catch {
    return NextResponse.json({ error: "That did not come through. Try again." }, { status: 400 })
  }
  if (typeof body.company === "string" && body.company.trim()) return NextResponse.json({ ok: true })

  const problems = contactProblems(body)
  if (problems) return NextResponse.json({ error: "Check the highlighted fields.", problems }, { status: 400 })

  const email = String(body.email).trim()
  const limited = await rateLimit({
    bucket: "help-contact",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: [{ limit: 4, seconds: 600 }, { limit: 12, seconds: 86_400 }],
    message: "We have your messages. Give the team a moment to reply.",
  })
  if (limited) return limited

  const reason = reasonLabel(String(body.reason))
  const name = String(body.name ?? "").trim().slice(0, 120)
  const link = String(body.link ?? "").trim().slice(0, 500)
  const message = String(body.message).trim()
  const from = request.headers.get("referer") ?? ""
  const agent = (request.headers.get("user-agent") ?? "").slice(0, 300)
  const firstLine = message.split("\n")[0].slice(0, 70)

  /* The shared Storelib layout (lib/emails/layout.ts): the message quoted, the details as facts, every value escaped by it. */
  const mail = platformEmail({
    subject: `[Help] ${reason}: ${firstLine}`,
    label: "Help Center message",
    heading: reason,
    paragraphs: [`From ${name ? `${name} (${email})` : email}. Reply to this email to answer them directly.`],
    quote: { text: message, by: name || email },
    facts: [
      { label: "From", value: name ? `${name} <${email}>` : email },
      { label: "About", value: reason },
      ...(link ? [{ label: "Link", value: link }] : []),
      ...(from ? [{ label: "Sent from", value: from }] : []),
      ...(agent ? [{ label: "Device", value: agent }] : []),
    ],
    reason: "Sent from the contact form in the Storelib Help Center.",
  })

  const sent = await sendEmail({
    to: SUPPORT_INBOX,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: email,
    transactional: true,
  }).catch(() => null)
  if (!sent || (sent as { success?: boolean }).success === false) {
    return NextResponse.json({ error: `It did not send. Try again, or write to ${SUPPORT_INBOX}.` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
