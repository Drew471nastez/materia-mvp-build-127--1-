import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { loadCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { readCopy } from "@/lib/emails/customer-custom"
import { sendEmail, buildFromHeader } from "@/lib/mail"
import { rateLimit } from "@/lib/api/rate-limit"
import { maskEmail } from "@/lib/privacy/mask-email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * SEND A TEST: one customer email, exactly as a buyer gets it (its own
 * template, the store's name, logo and contact, and the store's words, or
 * the words still being typed in the editor), to the inbox of the person
 * who pressed the button, never to anyone else. A sample order, and
 * "[Test]" in front of the subject so it is never mistaken for a real one.
 *
 *   POST { id, copy? }   ->   { sentTo }   (the address, masked)
 *
 * Ten an hour a person: a test is for looking, not for sending mail.
 */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const id = typeof body?.id === "string" ? body.id : ""
  if (!CUSTOMER_EMAILS.some((e) => e.id === id)) return physicalJson({ error: "That email was not found." }, 404)

  const limited = await rateLimit({
    bucket: "customer-email-test",
    subjects: [`user:${c.userId}`],
    windows: [
      { limit: 3, seconds: 60 },
      { limit: 10, seconds: 3600 },
    ],
    message: "That's a lot of tests. Try again in a little while.",
  })
  if (limited) return limited

  const { data: who } = await c.db.auth.admin.getUserById(c.userId)
  const to = who?.user?.email
  if (!to) return physicalJson({ error: "Your account has no email address to send the test to." }, 400)

  const [identity, store, { data: creator }, saved] = await Promise.all([
    resolveCreatorIdentity(c.db, c.creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    storeIdentity(c.db, c.creatorId).catch(() => null),
    c.db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle(),
    loadCustomerEmailCopy(c.db, c.creatorId),
  ])
  /* The words being typed, when the editor sent them and they are valid; else what is saved. */
  const typed = body?.copy && typeof body.copy === "object" ? readCopy(id, body.copy) : null
  const words = typed?.ok ? typed.copy : saved[id]
  const name = store?.name || identity.fromName || "Your store"
  const mail = previewCustomerEmail(
    id,
    {
      name,
      supportEmail: store?.email || identity.replyTo || null,
      storeUrl: store?.websiteUrl ?? null,
      logoUrl: store?.logoUrl ?? null,
      phone: store?.phone ?? null,
      currency: (creator?.payout_currency as string | null) || "USD",
    },
    words,
  )
  if (!mail) return physicalJson({ error: "That email was not found." }, 404)

  const sent = await sendEmail({
    from: buildFromHeader(name),
    to,
    subject: `[Test] ${mail.subject}`,
    html: mail.html,
    transactional: true,
    headers: { "X-Storelib-Notification": "CUSTOMER_EMAIL_TEST" },
  })
  if (!sent.success) return physicalJson({ error: "The test couldn't be sent just now. Try again in a minute." }, 502)
  return physicalJson({ sentTo: maskEmail(to) })
}
