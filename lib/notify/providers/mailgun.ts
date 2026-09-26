import "server-only"

/**
 * ===========================================================================
 *  MAILGUN CARRIES THE EMAIL, AND DECIDES NOTHING
 * ===========================================================================
 * EmailProvider over lib/mailgun.ts sendMailgunOnce: exactly one attempt,
 * with a timeout, and no retry inside. The worker owns retries, with its own
 * backoff, and a timeout is "unknown" (the provider may have it), never
 * "try again", so a slow answer cannot put two copies in an inbox.
 *
 *   region     MAILGUN_BASE_URL, as lib/mailgun.ts reads it (EU by default,
 *              https://api.mailgun.net for US)
 *   from       MAILGUN_FROM_NAME <MAILGUN_FROM_EMAIL> when both are set,
 *              else EMAIL_FROM
 *   reply-to   EMAIL_REPLY_TO
 *   o:tag      the notification type
 *   v:*        delivery_id and job_id, back on every webhook event
 *
 * What an answer means is lib/email-campaigns/retry.ts classify, the rule the
 * campaign queue already follows. A 4xx that names the address is marked
 * permanent, so the worker suppresses it.
 */
import { EMAIL_FROM, EMAIL_REPLY_TO, mailgunDomain, sendMailgunOnce, type MailgunOnceResult } from "@/lib/mailgun"
import { classify, plainReason } from "@/lib/email-campaigns/retry"
import type { ChannelResult, EmailProvider, OutgoingEmail } from "../types"

type SendOnce = typeof sendMailgunOnce

export function notifyFrom(env: Record<string, string | undefined> = process.env): string {
  const name = (env.MAILGUN_FROM_NAME || "").replace(/[<>"\r\n]/g, "").trim()
  const email = (env.MAILGUN_FROM_EMAIL || "").replace(/[<>"\s]/g, "").trim()
  if (name && email && email.includes("@")) return `${name} <${email}>`
  if (email && email.includes("@")) return `Storelib <${email}>`
  return EMAIL_FROM
}

export function resultOf(answer: MailgunOnceResult): ChannelResult {
  const outcome = classify(answer)
  const error = outcome === "sent" ? null : plainReason(answer)
  switch (outcome) {
    case "sent":
      return { status: "sent", providerMessageId: answer.messageId ?? null }
    case "unknown":
      return { status: "unknown", error }
    case "failed": {
      const msg = (answer.error || "").toLowerCase()
      const permanent = /address|recipient|mailbox|to parameter/.test(msg)
      return { status: "failed", error, permanent }
    }
    case "halt":
    case "retry":
    default:
      return { status: "retry", error }
  }
}

export class MailgunEmailProvider implements EmailProvider {
  readonly name = "mailgun"
  constructor(private readonly sendOnce: SendOnce = sendMailgunOnce) {}

  async send(email: OutgoingEmail): Promise<ChannelResult> {
    const answer = await this.sendOnce({
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      from: email.from || notifyFrom(),
      replyTo: email.replyTo || EMAIL_REPLY_TO,
      headers: email.headers,
      tags: email.tags,
      metadata: email.variables,
      messageId: email.messageId,
    })
    return resultOf(answer)
  }
}

export function emailProvider(): EmailProvider {
  return new MailgunEmailProvider()
}

export { mailgunDomain }
