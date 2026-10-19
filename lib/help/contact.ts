/**
 * THE HELP CENTER'S CONTACT FORM: what it asks and what it accepts. Shared
 * by the page (components/help/contact-form.tsx) and the route that sends it
 * (app/api/help/contact), so both read the same reasons and the same limits.
 */

export const SUPPORT_INBOX = "team@storelib.com"

export const CONTACT_REASONS = [
  { id: "orders", label: "Orders and payouts", hint: "A sale, a payout or a fee" },
  { id: "payments", label: "Payments and refunds", hint: "Card payments, refunds, disputes" },
  { id: "website", label: "My store or website", hint: "The builder, a theme, a domain" },
  { id: "products", label: "Products and delivery", hint: "Files, courses, shipping" },
  { id: "account", label: "Account and login", hint: "Signing in, email, security" },
  { id: "billing", label: "Plan and billing", hint: "Pro, invoices, cancelling" },
  { id: "purchase", label: "Something I bought", hint: "Access, downloads, a refund" },
  { id: "other", label: "Something else", hint: "Ideas, partnerships, anything" },
] as const

export type ContactReason = (typeof CONTACT_REASONS)[number]["id"]

export const MESSAGE_MIN = 20
export const MESSAGE_MAX = 5000

export interface ContactInput {
  reason: string
  name: string
  email: string
  link: string
  message: string
  /** A field people never see: anything in it is a bot. */
  company?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** What is wrong with a submission, by field, or null when it can be sent. */
export function contactProblems(input: Partial<ContactInput>): Partial<Record<"reason" | "email" | "message" | "link", string>> | null {
  const out: Partial<Record<"reason" | "email" | "message" | "link", string>> = {}
  if (!CONTACT_REASONS.some((r) => r.id === input.reason)) out.reason = "Pick what it is about."
  const email = (input.email ?? "").trim()
  if (!EMAIL.test(email) || email.length > 254) out.email = "Enter the email we should reply to."
  const message = (input.message ?? "").trim()
  if (message.length < MESSAGE_MIN) out.message = `Tell us a little more, at least ${MESSAGE_MIN} characters.`
  else if (message.length > MESSAGE_MAX) out.message = `Keep it under ${MESSAGE_MAX} characters.`
  const link = (input.link ?? "").trim()
  if (link.length > 500) out.link = "That link is too long."
  return Object.keys(out).length ? out : null
}

export function reasonLabel(id: string): string {
  return CONTACT_REASONS.find((r) => r.id === id)?.label ?? "Something else"
}
