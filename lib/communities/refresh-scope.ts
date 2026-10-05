/**
 * Pull-to-refresh scopes for community member pages (components/ui/pull-to-refresh.tsx).
 */

/** The home feed and a space's feed (components/community/member/feed-live.tsx). */
export const COMMUNITY_FEED_REFRESH_SCOPE = "community-feed"

/** /community/<slug>/members */
export const COMMUNITY_MEMBERS_REFRESH_SCOPE = "community-members"

/** /community/<slug>/learn */
export const COMMUNITY_LEARN_REFRESH_SCOPE = "community-learn"

/** /community/<slug>/events */
export const COMMUNITY_EVENTS_REFRESH_SCOPE = "community-events"

/** /community/<slug>/leaderboard */
export const COMMUNITY_LEADERBOARD_REFRESH_SCOPE = "community-leaderboard"

/** /community/<slug>/about */
export const COMMUNITY_ABOUT_REFRESH_SCOPE = "community-about"

/** The member's Membership page in a community (components/community/member/membership.tsx). */
export const COMMUNITY_MEMBERSHIP_REFRESH_SCOPE = "community-membership"
