/**
 * ===========================================================================
 *  A WEBSITE'S CONTACT FORM, SENT
 * ===========================================================================
 * Public by design: anybody on a creator's website can write to them. What
 * happens to a message, and every check in front of it, is in
 * lib/site-contact/contact.ts; the order they run in is
 * lib/site-contact/handle.ts. This file hands them the real database,
 * limiter, mailer and automations.
 *
 * Rate limited twice (lib/api/rate-limit): per visitor and per address, so
 * one person cannot write a hundred times, and per creator, so a flood from
 * many addresses stops at the creator's inbox rather than in it.
 */
import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { NextRequest, NextResponse, after } from "next/server"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject } from "@/lib/api/rate-limit"
import { contactSourceFrom, recordContactSource } from "@/lib/contacts/contact-source"
import { recordSignupAttribution } from "@/lib/attribution/server"
import { triggerEmailFlows } from "@/lib/email"
import { buildMailgunFromHeader, sendMailgunEmail } from "@/lib/mailgun"
import { getMainDomain } from "@/lib/url-helpers"
import { siteBrandName } from "@/lib/site-accounts/brand"
import { handleContact } from "@/lib/site-contact/handle"
import { loginEmailFrom } from "@/lib/seller-inbox"
import { notifyCreatorOfMessage } from "@/lib/site-contact/notify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const db = createAdminClient()
  const sent = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).origin : undefined)

  const reply = await handleContact(raw, {
    db,
    platform: `https://${getMainDomain()}`,
    limit: async (msg) => {
      const visitor = await rateLimit({
        bucket: "site-contact",
        subjects: [addressSubject(req), emailSubject(msg.email)],
        windows: [{ limit: 3, seconds: 600 }, { limit: 20, seconds: 86400 }],
        message: "That is a lot of messages at once. Try again in a few minutes.",
      })
      if (visitor) return { status: visitor.status, error: "That is a lot of messages at once. Try again in a few minutes." }
      const inbox = await rateLimit({
        bucket: "site-contact-inbox",
        subjects: [`creator:${msg.creatorId}`],
        windows: [{ limit: 30, seconds: 3600 }, { limit: 200, seconds: 86400 }],
        message: "This store is getting a lot of messages. Try again later.",
      })
      return inbox ? { status: inbox.status, error: "This store is getting a lot of messages. Try again later." } : null
    },
    send: (mail) =>
      sendMailgunEmail({
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        from: buildMailgunFromHeader(mail.fromName),
        tags: ["contact-form"],
      }),
    welcome: async (msg, source) => {
      await triggerEmailFlows(db, {
        triggerType: "new_subscriber",
        creatorId: msg.creatorId,
        recipientEmail: msg.email,
        recipientName: msg.name || undefined,
        source: source as never,
      })
      /*
        A OnePage's contact form, its "keep me updated" box ticked: the creator's own tools for that page (Mailchimp,
        Kit, a Zapier or Sheets hook..., lib/onepage/integrations) get the new subscriber, as every other signup on the
        page does. Only reached for a sender who ticked it and was not on the list already (lib/site-contact/handle).
      */
      if (msg.page === "onepage") {
        const eventId = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).event_id === "string" ? ((raw as Record<string, unknown>).event_id as string) : null
        const pageUrl = req.headers.get("referer")
        after(() => deliverSignup(db, msg.creatorId, pageSignup({ email: msg.email, name: msg.name || null, form: "contact", pageUrl, eventId })))
      }
    },
    source: (msg) => {
      const detail = contactSourceFrom({ request: req, surface: "website", form: "contact", sent, page: msg.page })
      return { site: detail?.site ?? null, detail }
    },
    brand: (creatorId) => siteBrandName(db, creatorId),
    loginEmail: loginEmailFrom(db),
    /* The bell in /app, for the creator whose website this is (lib/site-contact/notify). */
    notify: (notice) => notifyCreatorOfMessage(db, notice),
    recordSource: async (creatorId, email, detail) => {
      await recordContactSource(db, creatorId, email, detail as never)
      /* The website and the visit's touches, onto the same contact (lib/attribution). */
      await recordSignupAttribution(db, { creatorId, email, source: detail as never, sent })
      /* Connected email platforms (Klaviyo, Brevo, MailerLite, Kit...) get it within the minute. */
      await syncPlatformsSoon(db, creatorId)
    },
  })

  return NextResponse.json(reply.body, { status: reply.status, headers: { "Cache-Control": "no-store" } })
}
