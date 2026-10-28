/**
 * The email a store's owner sends when they invite someone to their team
 * (lib/team/server.ts inviteMember). Drawn in the one Storelib layout
 * (lib/emails/layout.ts): the store by its picture and name, who invited
 * them, the access they are given and what it lets them do, one Accept
 * button, and the address they have to sign in with as plain text (Gmail
 * would otherwise turn it into a blue link).
 *
 * Pure, so tests/emails-layout.test.ts reads exactly what is sent.
 */
import { identity, platformEmail } from "@/lib/emails/layout"
import { accessSummaryEn, legacyPermissions, permissionLinesEn, type TeamPermission } from "./permissions"

export interface TeamInviteEmailInput {
  storeName: string
  /** The store's picture, https and sized for an inbox. Null draws its first letter. */
  storeImageUrl?: string | null
  /** The inviter's name, when they have one. */
  inviterName?: string | null
  /** What they may do in the store (lib/team/permissions). */
  permissions?: readonly TeamPermission[]
  /** An invite from before part 320 names a role instead: read as what it could use. */
  role?: "manager" | "staff"
  /** The address the invite was sent to, which they must sign in with. */
  email: string
  link: string
  days?: number
}

/** "Edit the website" as the middle of a sentence: "edit the website". */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export function teamInviteEmail(v: TeamInviteEmailInput): { subject: string; html: string; text: string } {
  const store = v.storeName.trim() || "a store"
  const inviter = v.inviterName?.trim() || null
  const perms = v.permissions ?? legacyPermissions(v.role)
  const access = accessSummaryEn(perms)
  const lines = permissionLinesEn(perms)
  const days = v.days ?? 7
  const subject = inviter ? `${inviter} invited you to ${store} on Storelib` : `You're invited to ${store} on Storelib`
  const opener = inviter ? `${inviter} invited you to help run ${store} on Storelib.` : `You've been invited to help run ${store} on Storelib.`
  const can = lines.length ? `You'll be able to ${lines.map(lower).join(", ")}.` : null
  return platformEmail({
    subject,
    preview: `${opener} The link works for ${days} days.`,
    heading: `Join ${store}`,
    media: { title: store, subtitle: access, imageUrl: v.storeImageUrl ?? null, round: true, accentTile: true },
    paragraphs: [
      opener,
      ...(can ? [can] : []),
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
