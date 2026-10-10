import "server-only"

/**
 * ===========================================================================
 *  A SUGGESTED REPLY, FOR STORELIB TO READ BEFORE IT SENDS ANYTHING
 * ===========================================================================
 * "Suggest a reply" in /admin/resolution: the request's thread goes to
 * Storelib's own AI (the same provider the website builder uses, on
 * Storelib's account) with how Storelib answers, and a draft comes back into
 * the reply box. Nothing is ever sent from here: a person reads it, changes
 * it and presses Send.
 *
 * What goes to the model is the thread, the topic and the order number. No
 * email address, no payment details, and never an internal note's author.
 */
import { loggable } from "@/lib/admin/plain-reason"
import { NoProviderConfiguredError, resolveProvider } from "@/lib/sites/agent/provider"
import { TOPIC_LABELS, type TicketMessage, type TicketSummary } from "@/lib/support/tickets"

const SYSTEM = `You draft replies for Storelib support. Storelib is where creators sell digital and physical products, run a website, communities, memberships and courses. The person writing in runs a store on Storelib.

How Storelib answers:
- Plain, friendly and short. Say what happens next and when. No corporate phrases.
- Answer what was asked first. If something is needed from them (an order number, a screenshot, a date), ask for exactly that.
- Payments, payouts and disputes: never promise an outcome or a date the bank or Stripe decides. Explain the step and what they can do now (for a dispute: add evidence in Payouts > Disputes before the due date).
- Never ask for passwords, card numbers, bank details or ID documents in a reply.
- Never invent a policy, a feature or a fix. If unsure, say we're checking with the team and will come back.
- Sign off as "Storelib support". No em dashes.

Write only the reply's text, ready to send.`

export function threadPrompt(ticket: Pick<TicketSummary, "topic" | "subject" | "orderRef">, messages: TicketMessage[], storeName: string | null): string {
  const lines = [`Store: ${storeName || "unknown"}`, `Topic: ${TOPIC_LABELS[ticket.topic]}`, `Subject: ${ticket.subject}`]
  if (ticket.orderRef) lines.push(`Order: #${ticket.orderRef}`)
  lines.push("", "Thread, oldest first:")
  for (const m of messages.slice(-20)) {
    const who = m.internal ? "Storelib internal note (not seen by the store)" : m.author === "creator" ? "Store" : "Storelib"
    lines.push(`--- ${who}:`, m.body.slice(0, 3000))
  }
  lines.push("", "Draft Storelib's next reply to the store.")
  return lines.join("\n")
}

export async function suggestReply(ticket: Pick<TicketSummary, "topic" | "subject" | "orderRef">, messages: TicketMessage[], storeName: string | null): Promise<{ ok: true; draft: string } | { ok: false; error: string; status: number }> {
  try {
    const { provider, model } = resolveProvider({ tier: "fast" })
    const turn = await provider.complete({ model, system: SYSTEM, turns: [{ role: "user", content: threadPrompt(ticket, messages, storeName) }], tools: [], maxOutputTokens: 900 })
    const draft = turn.text.trim()
    if (!draft || turn.stop === "refusal") return { ok: false, error: "No suggestion this time. Write the reply yourself.", status: 422 }
    return { ok: true, draft: draft.replace(/\s*—\s*/g, ", ") }
  } catch (e) {
    if (e instanceof NoProviderConfiguredError) return { ok: false, error: "Storelib AI isn't set up on this deployment, so there's no suggestion.", status: 503 }
    console.error(`[support] suggestion failed: ${loggable(e)}`)
    return { ok: false, error: "The suggestion didn't come back. Try again, or write the reply yourself.", status: 502 }
  }
}
