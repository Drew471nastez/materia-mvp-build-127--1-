/**
 * The email a store's owner sends when they invite someone to their team
 * (lib/team/server.ts inviteMember). Drawn in the one Storelib layout
 * (lib/emails/layout.ts): the store by its picture and name, who invited
 * them, the role and what it lets them do, one Accept button, and the
 * address they have to sign in with as plain text (Gmail would otherwise
 * turn it into a blue link).
 *
 * Pure, so tests/emails-layout.test.ts reads exactly what is sent.
 */
import { identity, platformEmail } from "@/lib/emails/layout"
import { ROLE_LABEL, ROLE_SUMMARY, type MemberRole } from "./roles"

export interface TeamInviteEmailInput {
  storeName: string
  /** The store's picture, https and sized for an inbox. Null draws its first letter. */
  storeImageUrl?: string | null
  /** The owner's name, when they have one. */
  inviterName?: string | null
  role: MemberRole
  /** The address the invite was sent to, which they must sign in with. */
  email: string
  link: string
  days?: number
}

export function teamInviteEmail(v: TeamInviteEmailInput): { subject: string; html: string; text: string } {
  const store = v.storeName.trim() || "a store"
  const inviter = v.inviterName?.trim() || null
  const role = ROLE_LABEL[v.role]
  const roleWord = v.role === "manager" ? "a Manager" : "Staff"
  const days = v.days ?? 7
  const subject = inviter ? `${inviter} invited you to ${store} on Storelib` : `You're invited to ${store} on Storelib`
  const opener = inviter ? `${inviter} invited you to help run ${store} on Storelib as ${roleWord}.` : `You've been invited to help run ${store} on Storelib as ${roleWord}.`
  return platformEmail({
    subject,
    preview: `${opener} The link works for ${days} days.`,
    heading: `Join ${store}`,
    media: { title: store, subtitle: `${role} · ${ROLE_SUMMARY[v.role]}`, imageUrl: v.storeImageUrl ?? null, round: true, accentTile: true },
    paragraphs: [
      opener,
      {
        html: `Sign in with ${identity(v.email)} to accept.`,
        text: `Sign in with ${v.email} to accept.`,
      },
    ],
    action: { label: "Accept invite", url: v.link },
    note: `The link works for ${days} days. If you weren't expecting this, you can ignore it.`,
    reason: `You got this because ${inviter ?? `the owner of ${store}`} invited you to their team on Storelib.`,
  })
}
