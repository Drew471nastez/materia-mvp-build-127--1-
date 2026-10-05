/**
 * ===========================================================================
 *  A MEMBER OF A COMMUNITY, BY EMAIL
 * ===========================================================================
 * Raised by lib/communities/server/email.ts sendCommunityEmail, which has
 * already decided the person should hear it (an active member, their own
 * email switches in the community) and put their address in the payload:
 *
 *   community.welcome            COMMUNITY_WELCOME, once per member and community
 *   community.join_approved      COMMUNITY_JOIN_APPROVED, once per approved request
 *   community.invite             COMMUNITY_INVITE, once per invite and address
 *   community.announcement       COMMUNITY_ANNOUNCEMENT, once per announcement and member
 *   community.event_reminder     COMMUNITY_EVENT_REMINDER, once per event, reminder and member
 *   community.course_available   COMMUNITY_COURSE_AVAILABLE, once per course and member
 *   community.report_digest      COMMUNITY_REPORT_DIGEST, once per moderator, community and day,
 *                                to the person (a creator template: it opens /app)
 *
 * The step is the caller's own key, so the same announcement told twice
 * plans one job. A reminder is no use once its event has started, so it
 * expires then. Nothing here is raised for an ordinary feed post.
 */
import type { NotificationType } from "../types"
import { HOUR_MS, job, plan, str, type Workflow } from "./common"

const TYPE_OF: Partial<Record<string, NotificationType>> = {
  "community.welcome": "COMMUNITY_WELCOME",
  "community.join_approved": "COMMUNITY_JOIN_APPROVED",
  "community.invite": "COMMUNITY_INVITE",
  "community.announcement": "COMMUNITY_ANNOUNCEMENT",
  "community.event_reminder": "COMMUNITY_EVENT_REMINDER",
  "community.course_available": "COMMUNITY_COURSE_AVAILABLE",
  "community.report_digest": "COMMUNITY_REPORT_DIGEST",
}

export const communities: Workflow = (event, ctx) => {
  const type = TYPE_OF[event.name]
  if (!type) return null
  const email = str(event.payload.recipientEmail)
  if (!email || !email.includes("@")) return null
  const communityId = event.entityType === "community" ? event.entityId : str(event.payload.communityId)
  const step = str(event.payload.dedupeKey) ?? event.key
  let expiresInMs: number | null = null
  if (type === "COMMUNITY_EVENT_REMINDER") {
    const starts = Date.parse(str(event.payload.startsAt) ?? "")
    expiresInMs = Number.isFinite(starts) && starts > ctx.now ? starts - ctx.now : HOUR_MS
  }
  const toPerson = type === "COMMUNITY_REPORT_DIGEST"
  return plan([
    job(type, event, ctx, {
      recipientType: toPerson ? "creator" : "customer",
      recipientUserId: toPerson ? (event.userId ?? null) : null,
      recipientEmail: email,
      entityType: "community",
      entityId: communityId ?? null,
      step: step.slice(0, 200),
      expiresInMs,
      data: { communityId },
    }),
  ])
}
