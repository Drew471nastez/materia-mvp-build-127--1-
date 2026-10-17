/**
 * ===========================================================================
 *  EVERY NOTIFICATION STORELIB SENDS, IN ONE LIST
 * ===========================================================================
 * The owner asked that notifications cover comments, replies, mentions,
 * reactions, announcements, new discussions, event reminders, course updates,
 * membership changes, join approvals, moderation actions and messages; that
 * each one opens THE EXACT THING it is about; that none arrives twice; and
 * that a member can turn kinds off. Answering any of that meant reading
 * fifteen files and hoping, so this is the list, and
 * tests/notification-catalog.test.ts walks it:
 *
 *   it fails when a kind is added with no row here;
 *   it fails when a row names a file that no longer raises that kind;
 *   it fails when a row's destination is not a route this app has;
 *   it fails when a kind that writes a row has no dedupe key, because the
 *   same event reaching two serverless instances is the way a notification
 *   arrives twice and nothing in memory can stop it.
 *
 * WHAT THE COLUMNS MEAN
 *
 *   raisedIn     the module that decides this notification happens. Empty
 *                for a kind nothing raises yet, which the test holds as a
 *                list of its own so one cannot appear by accident.
 *   channels     where it can reach somebody. "inApp" is the bell and its
 *                count; "push" is a phone, through the push bridge, which
 *                holds and digests the quieter kinds; "email" is a workflow
 *                in lib/notify.
 *   silencedBy   what a member sets to stop hearing it. "level" is their
 *                own notify_level for that community (all, important,
 *                mentions, none; lib/communities/permissions
 *                wantsNotification). "always" means it is about their own
 *                account or their own membership and is not switched off.
 *   opens        the thing it opens, as a path with its parts named. A
 *                comment opens its post AT THE COMMENT, not the feed; an
 *                event opens that event; a join request opens the member
 *                list already filtered to the people waiting.
 *
 * This file is a description of what the code does. It is not where any of
 * it is decided, and nothing reads it at runtime.
 */
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/communities/types"
import { USER_NOTIFICATION_KINDS, type UserNotificationKind } from "./user-inbox-shared"

export type Channel = "inApp" | "push" | "email"
export type Silencer = "level" | "always" | "following" | "purchases"

export interface NotificationRow {
  kind: NotificationKind | UserNotificationKind
  /** What happens in the product for this to be sent. */
  what: string
  /** The modules that raise it. Empty means nothing does yet. */
  raisedIn: string[]
  channels: Channel[]
  silencedBy: Silencer
  /** Where a press lands, with its parts in <angle brackets>. */
  opens: string
  /** The page that answers it, spelt the way this app's folders are. */
  route: string
}

/** The community's own notifications: what the bell in a community shows. */
export const COMMUNITY_NOTIFICATIONS: NotificationRow[] = [
  {
    kind: "reaction",
    what: "Somebody reacted to your post or your comment.",
    raisedIn: ["lib/communities/server/reactions.ts"],
    channels: ["inApp", "push"],
    silencedBy: "level",
    opens: "/community/<slug>/post/<postId>",
    route: "/community/[slug]/post/[postId]",
  },
  {
    kind: "comment",
    what: "Somebody commented on your post.",
    raisedIn: ["lib/communities/server/comments.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/post/<postId>#c-<commentId>",
    route: "/community/[slug]/post/[postId]",
  },
  {
    kind: "reply",
    what: "Somebody replied to your comment.",
    raisedIn: ["lib/communities/server/comments.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/post/<postId>#c-<commentId>",
    route: "/community/[slug]/post/[postId]",
  },
  {
    kind: "mention",
    what: "Somebody wrote your name in a post or a comment.",
    raisedIn: ["lib/communities/server/mentions.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/post/<postId>#c-<commentId>",
    route: "/community/[slug]/post/[postId]",
  },
  {
    kind: "announcement",
    what: "The people who run the community announced something to everybody.",
    raisedIn: ["lib/communities/server/jobs/fanout_announcement.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/post/<postId>",
    route: "/community/[slug]/post/[postId]",
  },
  {
    kind: "event",
    what: "A new event, or a change to one you are going to.",
    raisedIn: ["lib/communities/server/jobs/fanout_event.ts", "lib/communities/server/events.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/events/<eventId>",
    route: "/community/[slug]/events/[eventId]",
  },
  {
    kind: "event_reminder",
    what: "An event you said you were going to is about to start.",
    raisedIn: ["lib/communities/server/jobs/event_reminder.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/events/<eventId>",
    route: "/community/[slug]/events/[eventId]",
  },
  {
    kind: "course_available",
    what: "A new program, or a lesson added to one you can reach.",
    raisedIn: ["lib/communities/server/jobs/fanout_program.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "level",
    opens: "/community/<slug>/learn",
    route: "/community/[slug]/learn",
  },
  {
    kind: "level_up",
    what: "You reached a new level in this community.",
    raisedIn: ["lib/communities/server/points.ts"],
    channels: ["inApp", "push"],
    silencedBy: "level",
    opens: "/community/<slug>/leaderboard",
    route: "/community/[slug]/leaderboard",
  },
  {
    kind: "membership",
    what: "Something happened to your own membership: approved, a plan changed, a payment, a restriction, the end of it.",
    raisedIn: [
      "lib/communities/server/membership-lifecycle.ts",
      "lib/communities/server/moderation.ts",
      "lib/communities/server/invite-joins.ts",
    ],
    channels: ["inApp", "push", "email"],
    silencedBy: "always",
    opens: "/community/<slug>/membership",
    route: "/community/[slug]/membership",
  },
  {
    kind: "admin_message",
    what: "A message from the people who run the community, to one member.",
    raisedIn: [],
    channels: ["inApp", "push"],
    silencedBy: "always",
    opens: "/community/<slug>",
    route: "/community/[slug]",
  },
  {
    kind: "report",
    what: "Somebody reported a post, a comment or a member, and you are one of the people who handle that.",
    raisedIn: ["lib/communities/server/safety.ts", "lib/communities/server/reports.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "always",
    opens: "/app/community/<id>/moderation",
    route: "/app/community/[id]/moderation",
  },
  {
    kind: "join_request",
    what: "Somebody asked to join a community you run.",
    raisedIn: ["lib/communities/server/join.ts"],
    channels: ["inApp", "push", "email"],
    silencedBy: "always",
    opens: "/app/community/<id>/members?status=pending",
    route: "/app/community/[id]/members",
  },
]

/** The ones that are about somebody's own account rather than one community. */
export const ACCOUNT_NOTIFICATIONS: NotificationRow[] = [
  {
    kind: "new_follower",
    what: "Somebody followed you.",
    raisedIn: ["lib/profile/notify-follow.ts"],
    channels: ["inApp", "push"],
    silencedBy: "following",
    opens: "/<sellername>",
    route: "/[sellername]",
  },
  {
    kind: "followed_new_product",
    what: "A creator you follow put something new on sale.",
    raisedIn: ["lib/communities/server/jobs/fanout_followers.ts"],
    channels: ["inApp", "push"],
    silencedBy: "following",
    opens: "/<sellername>/<productSlug>",
    route: "/[sellername]/[productSlug]",
  },
  {
    kind: "followed_new_community",
    what: "A creator you follow opened a community.",
    raisedIn: ["lib/communities/server/jobs/fanout_followers.ts"],
    channels: ["inApp", "push"],
    silencedBy: "following",
    opens: "/community/<slug>",
    route: "/community/[slug]",
  },
  {
    kind: "membership_post",
    what: "A new post in a membership you pay for.",
    raisedIn: ["lib/communities/server/jobs/fanout_membership_post.ts"],
    channels: ["inApp", "push"],
    silencedBy: "purchases",
    opens: "/account/library/memberships/<membershipId>",
    route: "/account/library/memberships/[id]",
  },
  {
    kind: "purchased_creator_new_product",
    what: "A creator you have bought from before put something new on sale.",
    raisedIn: ["lib/communities/server/jobs/fanout_followers.ts"],
    channels: ["inApp", "push"],
    silencedBy: "purchases",
    opens: "/<sellername>/<productSlug>",
    route: "/[sellername]/[productSlug]",
  },
  {
    kind: "system",
    what: "Storelib itself has something to tell this account.",
    raisedIn: [],
    channels: ["inApp", "push"],
    silencedBy: "always",
    opens: "/account",
    route: "/account",
  },
]

export const ALL_NOTIFICATIONS: NotificationRow[] = [...COMMUNITY_NOTIFICATIONS, ...ACCOUNT_NOTIFICATIONS]

/** The kinds nothing raises yet. Named here so a new one cannot appear quietly. */
export const RAISED_BY_NOTHING: readonly string[] = ["admin_message", "system"]

/** Every kind the product declares, community and account alike. */
export const DECLARED_KINDS: readonly string[] = [...NOTIFICATION_KINDS, ...USER_NOTIFICATION_KINDS]

/** The row for a kind, or undefined. */
export function rowFor(kind: string): NotificationRow | undefined {
  return ALL_NOTIFICATIONS.find((r) => r.kind === kind)
}

/**
 * A destination with every named part replaced by a star, so two ways of
 * writing the same page compare equal: the address a notification carries
 * and the route that answers it. The test reads both this way, so a row
 * cannot name a page that is not the one its own address would open.
 */
export function shapeOf(path: string): string {
  return path
    .split("#")[0]
    .split("?")[0]
    .replace(/<[a-zA-Z]+>/g, "*")
    .replace(/\[[a-zA-Z]+\]/g, "*")
}
