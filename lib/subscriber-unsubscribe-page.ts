/**
 * ===========================================================================
 *  LEAVING A CREATOR'S LIST: WHAT THE PAGE SAYS IN EACH STATE
 * ===========================================================================
 * The link at the foot of a creator's campaign or automation email opens
 * /unsubscribe?token= (and a mail client that opens the List-Unsubscribe
 * address in a browser lands on /api/email/unsubscribe?token=, the same
 * page). Opening it changes nothing: mail security scanners open every link
 * in an email, and a link that unsubscribed on open took people off lists
 * they meant to stay on. The page asks, and its button posts the form to
 * /api/email/unsubscribe, which does the work and answers with this page
 * again in its new state.
 *
 *   confirm   still on the list: "Unsubscribe from <store>?" and the button
 *   off       just left: a calm confirmation and a quiet Resubscribe
 *   already   opened again after leaving: the same, in other words
 *   on        came back: and a quiet Unsubscribe, in case
 *   invalid   no token, or one nobody has
 *   limited   too many tries from one place
 *   error     the write failed: nothing changed, try again
 *
 * The sender is drawn as the creator is now: their website's logo or their
 * photo (https only), else the first letter of the store name in a neutral
 * circle. The address the email went to is shown masked, as it always was.
 *
 * Pure (no server imports); the drawing is lib/unsubscribe-card.ts, shared
 * with Storelib's own notification emails.
 */
import { unsubscribeCard, type CardButton, type CardSender, type CardTone } from "@/lib/unsubscribe-card"

export const SUBSCRIBER_UNSUBSCRIBE_ACTION = "/api/email/unsubscribe"

export interface ListSender {
  name: string
  imageUrl: string | null
}

export type SubscriberPageState =
  | { kind: "confirm"; token: string; sender: ListSender; maskedEmail: string }
  | { kind: "off"; token: string; sender: ListSender; maskedEmail: string }
  | { kind: "already"; token: string; sender: ListSender; maskedEmail: string }
  | { kind: "on"; token: string; sender: ListSender; maskedEmail: string }
  | { kind: "invalid" }
  | { kind: "limited" }
  | { kind: "error"; token: string | null; sender: ListSender | null; action: "unsubscribe" | "resubscribe" }

/** j***n@example.com: enough to know which address, not enough to learn one. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return "***"
  const masked = local.length > 2 ? local[0] + "***" + local[local.length - 1] : "***"
  return `${masked}@${domain}`
}

export function subscriberPageWords(state: SubscriberPageState): {
  heading: string
  body: string
  button?: { label: string; action: "unsubscribe" | "resubscribe"; look: "primary" | "secondary" }
} {
  switch (state.kind) {
    case "confirm":
      return {
        heading: `Unsubscribe from ${state.sender.name}?`,
        body: `You will stop getting their emails at this address.`,
        button: { label: "Unsubscribe", action: "unsubscribe", look: "primary" },
      }
    case "off":
      return {
        heading: "You are unsubscribed",
        body: `${state.sender.name} will not email you again. Changed your mind? You can come back.`,
        button: { label: "Resubscribe", action: "resubscribe", look: "secondary" },
      }
    case "already":
      return {
        heading: "You are already unsubscribed",
        body: `${state.sender.name} is not sending you emails.`,
        button: { label: "Resubscribe", action: "resubscribe", look: "secondary" },
      }
    case "on":
      return {
        heading: "You are back on the list",
        body: `You will get emails from ${state.sender.name} again.`,
        button: { label: "Unsubscribe", action: "unsubscribe", look: "secondary" },
      }
    case "invalid":
      return {
        heading: "This link does not work",
        body: "It may be old, or only part of it was copied. Use the unsubscribe link in a recent email from the sender.",
      }
    case "limited":
      return { heading: "Too many tries just now", body: "Wait a few minutes, then open the link again." }
    case "error":
      return {
        heading: "That did not go through",
        body: "Nothing was changed. Try again in a moment.",
        button: state.token ? { label: "Try again", action: state.action, look: "primary" } : undefined,
      }
  }
}

function senderOf(state: SubscriberPageState): CardSender {
  const s = "sender" in state ? state.sender : null
  /* With no sender known, a plain envelope: never Storelib's mark, since Storelib did not send the email. */
  return s ? { kind: "creator", name: s.name, imageUrl: s.imageUrl } : { kind: "none" }
}

export function subscriberPage(state: SubscriberPageState): string {
  const words = subscriberPageWords(state)
  const tone: CardTone = state.kind === "confirm" ? "asked" : state.kind === "off" || state.kind === "already" || state.kind === "on" ? "done" : "problem"
  const token = "token" in state ? state.token : null
  const buttons: CardButton[] =
    words.button && token
      ? [{ label: words.button.label, action: SUBSCRIBER_UNSUBSCRIBE_ACTION, fields: { token, action: words.button.action }, look: words.button.look }]
      : []
  return unsubscribeCard({
    title: words.heading,
    sender: senderOf(state),
    tone,
    heading: words.heading,
    body: words.body,
    note: "maskedEmail" in state ? state.maskedEmail : undefined,
    buttons,
    footer: "Sent with Storelib",
  })
}
