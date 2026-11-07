/**
 * The two emails a handoff sends, in the one Storelib layout
 * (lib/emails/layout.ts): the claim link to the person the business is for,
 * and a line to the founder once it has been taken. Pure, so the suite reads
 * exactly what is sent.
 */
import { identity, platformEmail } from "@/lib/emails/layout"

export function handoffInviteEmail(v: { businessName: string; senderName: string | null; email: string; link: string; days: number }): { subject: string; html: string; text: string } {
  const business = v.businessName.trim() || "a business"
  const sender = v.senderName?.trim() || null
  const subject = sender ? `${sender} is handing ${business} over to you` : `${business} is ready for you on Storelib`
  const opener = sender ? `${sender} built ${business} on Storelib and is handing it over to you.` : `${business} on Storelib is being handed over to you.`
  return platformEmail({
    subject,
    preview: `${opener} The link works for ${v.days} ${v.days === 1 ? "day" : "days"}.`,
    heading: `${business} is yours to take`,
    paragraphs: [
      opener,
      "Its OnePage, store, products and web addresses stay as they are. You sign in with your own account and connect your own payout account to get paid.",
      { html: `Sign in or create an account with ${identity(v.email)} to accept.`, text: `Sign in or create an account with ${v.email} to accept.` },
    ],
    action: { label: "Review and accept", url: v.link },
    note: `The link works for ${v.days} ${v.days === 1 ? "day" : "days"} and only once. If you weren't expecting this, you can ignore it.`,
    reason: `You got this because ${sender ?? "a Storelib seller"} entered your address to hand a business over to you.`,
  })
}

export function handoffAcceptedEmail(v: { businessName: string; takenBy: string | null; keptFounder: boolean }): { subject: string; html: string; text: string } {
  const business = v.businessName.trim() || "Your business"
  const who = v.takenBy?.trim() || "The person you sent it to"
  return platformEmail({
    subject: `${business} has been handed over`,
    heading: `${business} has a new owner`,
    paragraphs: [
      `${who} accepted ${business}. It is no longer in your account menu.`,
      v.keptFounder ? "You are on its team, so you can still open it from Settings, Team." : "You no longer have access to it.",
      "Your payout account, your plan and your other businesses were not moved.",
    ],
    reason: "You got this because you handed a business over on Storelib.",
  })
}
