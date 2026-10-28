/**
 * ===========================================================================
 *  A REPLY TO A CONTACT FORM MESSAGE, SENT FROM EMAILS › MESSAGES
 * ===========================================================================
 * Round 28, the owner: "reply works smoothly (reply sends, thread shows it,
 * marks read)". Reply used to open the creator's own mail app; now it is
 * written on the message's page and sent from here, in the store's name,
 * with Reply-To on the store's contact address, so the answer to the reply
 * goes to the creator's inbox as before.
 *
 * KEPT BESIDE THE MESSAGE, IN THE SAME TABLE. A reply is a row of
 * site_contact_messages (supabase/sql/run-now 30) marked by `page` =
 * REPLY_PAGE, its message's id in `source_detail.reply_to`, read already,
 * so no new table or column is needed and a database without the contact
 * form's SQL simply cannot keep one (the email still goes). The Messages
 * list leaves these rows out and hangs each under its message (threadRows).
 *
 * Pure: the route, the list's read and the tests share it.
 */
import { platformEmail, type EmailSender } from "@/lib/emails/layout"

/** What marks a row as a reply, not a message somebody wrote. */
export const REPLY_PAGE = "__reply"
/** As long as a message may be (the table's own check, site_contact_messages_sizes). */
export const REPLY_LIMIT = 5000

export interface ReplyLite {
  id: string
  message: string
  created_at: string
}

/** The text as typed, cleaned: no control characters, at most REPLY_LIMIT, blank lines kept to one. */
export function cleanReply(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REPLY_LIMIT)
}

/** "Re: Wholesale order" once, however many times it was answered. */
export function replySubject(subject: string | null | undefined, shopName: string): string {
  const s = (subject ?? "").replace(/\s+/g, " ").trim()
  if (!s) return `Re: your message to ${shopName}`.slice(0, 150)
  return (/^re:/i.test(s) ? s : `Re: ${s}`).slice(0, 150)
}

/** The reply as an email from the store: its words, then what they wrote, quoted, so the thread reads in any inbox. */
export function replyEmail(input: {
  sender: Extract<EmailSender, { kind: "store" }>
  text: string
  original: { name: string | null; subject: string | null; message: string; created_at: string }
}): { subject: string; html: string; text: string } {
  const subject = replySubject(input.original.subject, input.sender.name)
  const paragraphs = input.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const when = new Date(input.original.created_at)
  const day = Number.isNaN(when.getTime()) ? "" : when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  return platformEmail({
    sender: input.sender,
    subject,
    preview: paragraphs[0]?.slice(0, 140) ?? subject,
    heading: subject.replace(/^Re:\s*/i, "") || subject,
    paragraphs: paragraphs.length ? paragraphs : [input.text],
    quote: { text: input.original.message.slice(0, 2000), by: [input.original.name, day].filter(Boolean).join(", ") || null },
    reason: `You wrote to ${input.sender.name} through the contact form on their website. Reply to this email to answer.`,
  })
}

/** The row a sent reply is kept as. */
export function replyRow(input: { creatorId: string; message: { id: string; email: string; site: string | null; subscriber_id: string | null }; subject: string; text: string; shopName: string; at: string }): Record<string, unknown> {
  return {
    creator_id: input.creatorId,
    subscriber_id: input.message.subscriber_id,
    email: input.message.email.toLowerCase(),
    name: input.shopName.slice(0, 120),
    subject: input.subject.slice(0, 150),
    message: input.text.slice(0, REPLY_LIMIT),
    consent: false,
    site: input.message.site,
    page: REPLY_PAGE,
    source_detail: { reply_to: input.message.id },
    emailed_at: input.at,
    read_at: input.at,
    created_at: input.at,
  }
}

/**
 * The list as the Messages tab shows it: the replies taken out, and each
 * hung under the message it answers, oldest first, as a thread reads.
 */
export function threadRows<T extends { id: string; page?: string | null; source_detail?: unknown; message: string; created_at: string }>(rows: T[]): Array<Omit<T, "source_detail"> & { replies: ReplyLite[] }> {
  const replies = new Map<string, ReplyLite[]>()
  const messages: T[] = []
  for (const r of rows) {
    if (r.page !== REPLY_PAGE) {
      messages.push(r)
      continue
    }
    const to = r.source_detail && typeof r.source_detail === "object" ? (r.source_detail as { reply_to?: unknown }).reply_to : null
    if (typeof to !== "string") continue
    const list = replies.get(to) ?? []
    list.push({ id: r.id, message: r.message, created_at: r.created_at })
    replies.set(to, list)
  }
  return messages.map((m) => {
    const { source_detail: _sd, ...rest } = m
    void _sd
    return { ...rest, replies: (replies.get(m.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)) }
  })
}
