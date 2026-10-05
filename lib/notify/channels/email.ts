/**
 * ===========================================================================
 *  ONE NOTIFICATION AS ONE EMAIL
 * ===========================================================================
 * The worker has already decided this email goes: the recipient type is
 * right, the condition still holds, preferences and suppressions allow it,
 * cooldown and daily caps passed, and its delivery row is written in
 * "sending" before anything leaves. This turns the job into the message and
 * hands it to the EmailProvider:
 *
 *   body       the template for the type (lib/notify/templates renderEmail),
 *              from the job's data. Every value is escaped by the template;
 *              no HTML from a creator, a buyer or a payload is ever placed
 *              in the email as HTML.
 *   subject    one line, no line breaks, at most 200 characters
 *   from       Storelib, unless the template named a sender: a review
 *              request is the seller's ask, so it goes out as "<Seller> via
 *              Storelib" with Reply-To their support inbox. Only the display
 *              name and Reply-To change; the address it is sent from is
 *              Storelib's verified one on every email, because a creator's
 *              own domain is not ours to sign for.
 *   headers    List-Unsubscribe and List-Unsubscribe-Post (RFC 8058) on
 *              optional and marketing email only; required service email
 *              has no way out, by design
 *   tag        the notification type, for Mailgun's reports
 *   variables  delivery_id and job_id, which come back on every webhook
 *   Message-Id made from the delivery id, the same on every retry, so a
 *              mailbox can recognise a repeat as the same message
 *   files      what the template drew beside the words: the event's
 *              calendar file on a ticket receipt, and nothing else today
 *
 * The renderer, the unsubscribe link and the provider are handed in, so the
 * worker's tests run this file with a fake provider and no network.
 */
import type { ChannelResult, EmailProvider, NotificationType, PreferenceCategory, RegistryEntry, RenderedEmail, TemplateContext } from "../types"
import type { JobRow } from "../store"

export type RenderEmail = (type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext) => RenderedEmail

export interface EmailChannelOptions {
  provider: EmailProvider
  render: RenderEmail
  baseUrl: () => string
  unsubscribeUrl?: (userId: string, category: PreferenceCategory) => string
  /** A customer's optional email (a review request): the link that turns those off for their address, from the order it is about. */
  customerUnsubscribeUrl?: (job: JobRow) => string | null
  preferencesUrl?: () => string
  /** The domain part of the Message-Id. */
  messageDomain?: string
}

export interface EmailInput {
  job: JobRow
  entry: RegistryEntry
  to: string
  recipientName: string | null
  deliveryId: string
}

export type EmailSend = (input: EmailInput) => Promise<ChannelResult>

export function wantsUnsubscribe(entry: RegistryEntry): boolean {
  return entry.requirement !== "required_service"
}

export function emailChannel(o: EmailChannelOptions): EmailSend {
  return async ({ job, entry, to, recipientName, deliveryId }) => {
    const optional = wantsUnsubscribe(entry)
    const unsubscribe =
      optional && job.recipient_user_id && o.unsubscribeUrl
        ? o.unsubscribeUrl(job.recipient_user_id, entry.category)
        : optional && entry.recipient === "customer" && o.customerUnsubscribeUrl
          ? o.customerUnsubscribeUrl(job)
          : null
    const ctx: TemplateContext = {
      baseUrl: o.baseUrl(),
      recipientName: recipientName ?? null,
      unsubscribeUrl: unsubscribe,
      preferencesUrl: entry.recipient === "creator" && o.preferencesUrl ? o.preferencesUrl() : null,
      when: null,
    }
    let rendered: RenderedEmail
    try {
      rendered = o.render(entry.type, job.data ?? {}, ctx)
    } catch {
      /* A template that cannot draw this data will not draw it on a retry either. */
      return { status: "failed", error: "The email could not be drawn from its template." }
    }
    const subject = rendered.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200)
    if (!subject || !rendered.html) return { status: "failed", error: "The template produced an empty email." }

    const headers: Record<string, string> = {}
    if (unsubscribe) {
      headers["List-Unsubscribe"] = `<${unsubscribe}>`
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    }
    headers["X-Storelib-Notification"] = entry.type
    const domain = o.messageDomain || "storelib.com"
    /* The seller's name in front of Storelib's address, so the buyer sees who is asking. */
    const fromName = rendered.fromName ? `${rendered.fromName} via Storelib` : undefined
    return o.provider.send({
      to,
      subject,
      html: rendered.html,
      text: rendered.text,
      fromName,
      replyTo: rendered.replyTo ?? undefined,
      headers,
      tags: [entry.type],
      variables: { delivery_id: deliveryId, job_id: job.id },
      messageId: `<notify.${deliveryId}@${domain}>`,
      ...(rendered.attachments?.length ? { attachments: rendered.attachments } : {}),
    })
  }
}
