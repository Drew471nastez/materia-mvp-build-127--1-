/**
 * ===========================================================================
 *  WHAT A NOTIFICATION'S PUSH SAYS: A FEW WORDS AND WHERE TO GO
 * ===========================================================================
 * A push lands on a lock screen, a watch, a shared computer. So it carries a
 * short title and a fixed line, and nothing else: no amount, no product or
 * buyer name, no email address, no domain, no words a buyer wrote. The
 * details are one tap away, behind the creator's sign-in.
 *
 * The title is the rule's pushTitle when it has one (a finding whose title
 * names money or a domain gives a plainer one), cut to PUSH_TITLE_MAX. The
 * data is the kind and the /app address the tap opens (lib/push/sender for
 * browsers, lib/push/client for the apps), nothing more.
 *
 * Pure, for tests/notification-rules.test.ts.
 */
import { clip } from "./format"
import type { Category } from "./types"

export const PUSH_TITLE_MAX = 60

export const PUSH_BODY: Record<"critical" | "other", string> = {
  critical: "Open Storelib to see what to do.",
  other: "Open Storelib to see it.",
}

export interface NotificationPush {
  title: string
  body: string
  data: { type: "notification"; kind: string; url: string }
}

/** A tap goes somewhere inside /app, or to /app itself. */
export function appPath(href: string | null | undefined): string {
  const h = String(href ?? "")
  return /^\/app(?:[/?#]|$)/.test(h) && !h.includes("//") && !/[\s<>"']/.test(h) ? h : "/app"
}

export function pushPayloadOf(row: { kind: string; category: Category; title: string; pushTitle: string | null; href: string }): NotificationPush {
  return {
    title: clip(row.pushTitle || row.title, PUSH_TITLE_MAX),
    body: row.category === "critical" ? PUSH_BODY.critical : PUSH_BODY.other,
    data: { type: "notification", kind: row.kind, url: appPath(row.href) },
  }
}
