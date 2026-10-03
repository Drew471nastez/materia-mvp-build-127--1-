/**
 * The member area for scripts/check-community-member.mjs: the real client
 * components (the shell's frame, the feed, the composer, a post with its
 * comments, a chat space, the members, the leaderboard, the inbox) with
 * fixtures, chosen by ?case=. The server components around them (the route
 * group's layout, CommunityShell, CommunityFeedPage) only read data and hand
 * it to these. The API routes they call are answered by the probe, and the
 * realtime client is a stub that reports five people present.
 *
 *   feed            /community/<slug>             home: composer, pinned, poll, pictures, a link
 *   post            /community/<slug>/post/<id>   the post and its comments with replies
 *   chat            /community/<slug>/space/chat  a chat space
 *   members         /community/<slug>/members
 *   leaderboard     /community/<slug>/leaderboard
 *   notifications   /community/<slug>/notifications
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { FeedAside, FeedColumns } from "@/components/community/member/columns"
import { FeedView } from "@/components/community/member/feed"
import { SpaceChips } from "@/components/community/member/space-chips"
import { PostPage } from "@/components/community/member/post-page"
import { ChatView } from "@/components/community/member/chat"
import { MembersDirectory } from "@/components/community/member/members"
import { Leaderboard } from "@/components/community/member/leaderboard"
import { NotificationsList } from "@/components/community/member/notifications"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommentView, FeedPostView, MemberView, Role, ViewerView } from "@/lib/communities/types"
import type { ChatMessageView, LeaderboardRow, NotificationView, ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"

const NOW = Date.now()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()
const CID = "6f1c2a1e-0000-4000-8000-000000000001"

const picture = (a: string, b: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="860" cy="250" r="150" fill="#ffffff" opacity="0.25"/><rect x="0" y="560" width="1200" height="240" fill="#000" opacity="0.08"/></svg>`)}`
const face = (bg: string, fg: string, letter: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="18" fill="${fg}"/><rect x="18" y="62" width="60" height="40" rx="30" fill="${fg}"/><text x="0" y="0" opacity="0">${letter}</text></svg>`)}`

const community: ShellCommunity = {
  id: CID,
  slug: "studio-notes",
  name: "Studio Notes",
  tagline: "A working group for independent product designers. Critique, process and the occasional job lead.",
  logoUrl: picture("#283044", "#5c6b8a"),
  coverUrl: picture("#d8dee9", "#9aa5b8"),
  memberCount: 1284,
  postCount: 3412,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: true,
  gamificationEnabled: true,
  archived: false,
}

const viewer: ViewerView = {
  userId: "u-me",
  signedIn: true,
  role: "moderator",
  status: "active",
  active: true,
  tierId: null,
  level: 3,
  points: 84,
  isOwner: false,
  isCreatorAccount: false,
  mutedUntil: null,
  can: allowedActions("moderator"),
}

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: "Anything about the work.", icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-ann", slug: "announcements", name: "Announcements", description: null, icon: "megaphone", kind: "announcements", canPost: false, commentsEnabled: true, unread: 0 },
  { id: "s-intro", slug: "introductions", name: "Introductions", description: "Say hello.", icon: "hand", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-crit", slug: "critique", name: "Critique", description: "Post work, get honest notes.", icon: "🎯", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-chat", slug: "lounge", name: "Lounge", description: "Live chat, keep it friendly.", icon: null, kind: "chat", canPost: true, commentsEnabled: true, unread: 4 },
]

const people = {
  maya: { id: "u-maya", name: "Maya Okafor", username: "mayao", avatarUrl: face("#e8d5c4", "#8a5a3c", "M"), role: "owner" as const, level: 6 },
  jonas: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: face("#cfdcd2", "#3f6b4f", "J"), role: "member" as const, level: 3 },
  priya: { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, role: "admin" as const, level: 5 },
  leo: { id: "u-leo", name: "Leo Martins", username: "leom", avatarUrl: face("#d6d9ef", "#4a4f8a", "L"), role: "member" as const, level: 2 },
  me: { id: "u-me", name: "Sam Carter", username: "samc", avatarUrl: face("#efe3cf", "#8a6d3c", "S"), role: "moderator" as const, level: 3 },
}

const post = (over: Partial<FeedPostView> & { id: string }): FeedPostView => ({
  communityId: CID,
  space: { id: "s-general", slug: "general", name: "General" },
  kind: "post",
  title: null,
  body: "",
  bodyText: "",
  media: [],
  pinned: false,
  featured: false,
  locked: false,
  status: "published",
  author: people.jonas,
  reactionCount: 0,
  commentCount: 0,
  reacted: false,
  bookmarked: false,
  poll: null,
  createdAt: iso(NOW - 2 * HOUR),
  editedAt: null,
  lastActivityAt: iso(NOW - HOUR),
  canEdit: false,
  canModerate: true,
  ...over,
})

export const POSTS: FeedPostView[] = [
  post({
    id: "p-pinned",
    pinned: true,
    kind: "announcement",
    space: { id: "s-ann", slug: "announcements", name: "Announcements" },
    author: people.maya,
    title: "October critique night is on the 14th",
    bodyText: "We are doing the portfolio review format again: three people, fifteen minutes each, notes in the thread after.\n\nIf you want a slot, comment below with a link to what you would show. @priya will pick by Friday.",
    reactionCount: 42,
    commentCount: 18,
    createdAt: iso(NOW - 3 * DAY),
  }),
  post({
    id: "p-photo",
    title: "Before and after: onboarding for a budgeting app",
    bodyText: "Took the feedback from last week's thread. Fewer steps, the account link moved to after the first win. Curious whether the second screen reads as too sparse now.",
    media: [
      { type: "image", url: picture("#e9e4dc", "#c8b9a6"), w: 1200, h: 800 },
      { type: "image", url: picture("#dfe7ee", "#a9bccd"), w: 1200, h: 800 },
    ],
    reactionCount: 17,
    reacted: true,
    commentCount: 6,
    author: people.leo,
    createdAt: iso(NOW - 5 * HOUR),
    space: { id: "s-crit", slug: "critique", name: "Critique" },
  }),
  post({
    id: "p-poll",
    kind: "poll",
    author: people.priya,
    bodyText: "Planning next month's workshop. What would help you most right now?",
    poll: {
      id: "poll-1",
      question: "Pick one",
      multiple: false,
      closesAt: iso(NOW + 4 * DAY),
      closed: false,
      totalVotes: 63,
      options: [
        { id: "o1", label: "Pricing freelance work", voteCount: 29, voted: true },
        { id: "o2", label: "Writing case studies", voteCount: 21, voted: false },
        { id: "o3", label: "Design systems in small teams", voteCount: 13, voted: false },
      ],
    },
    reactionCount: 8,
    commentCount: 11,
    createdAt: iso(NOW - 9 * HOUR),
  }),
  post({
    id: "p-link",
    author: people.me,
    canEdit: true,
    bodyText: "This piece on writing UI copy for empty states is the best I have read in a while. https://example.com/notes/empty-states",
    media: [{ type: "link", url: "https://example.com/notes/empty-states", title: "Empty states are the first thing people read", image: picture("#f1e9da", "#d9c3a0") }],
    reactionCount: 3,
    commentCount: 0,
    createdAt: iso(NOW - DAY - 2 * HOUR),
  }),
  post({
    id: "p-text",
    author: people.jonas,
    title: null,
    bodyText:
      "Small win: a client agreed to a paid discovery week instead of a free pitch. What made the difference was showing the plan for the week as a one page calendar, with what they get at the end of each day.\n\nHappy to share the template if useful.",
    reactionCount: 24,
    commentCount: 9,
    createdAt: iso(NOW - 2 * DAY),
  }),
]

const comment = (over: Partial<CommentView> & { id: string }): CommentView => ({
  postId: "p-photo",
  parentId: null,
  body: "",
  status: "published",
  deleted: false,
  author: people.jonas,
  reactionCount: 0,
  reacted: false,
  createdAt: iso(NOW - 4 * HOUR),
  editedAt: null,
  replies: [],
  canEdit: false,
  canModerate: true,
  ...over,
})

const COMMENTS: CommentView[] = [
  comment({
    id: "c1",
    author: people.priya,
    body: "The second screen is fine. What I would look at is the button label: \"Continue\" says nothing about what happens next.",
    reactionCount: 5,
    replies: [
      comment({ id: "c1r1", parentId: "c1", author: people.leo, body: "@priya good call. Trying \"Connect your bank\" next.", createdAt: iso(NOW - 3 * HOUR), reactionCount: 2, reacted: true }),
      comment({ id: "c1r2", parentId: "c1", author: people.maya, body: "Agree. Also consider showing what they will see after connecting.", createdAt: iso(NOW - 2 * HOUR) }),
    ],
  }),
  comment({ id: "c2", author: people.jonas, body: "Moving the account link later is the right move. Ours dropped off the cliff there.", createdAt: iso(NOW - 90 * MIN), reactionCount: 1 }),
  comment({ id: "c3", status: "deleted", deleted: true, author: null, body: "Deleted", canModerate: false, replies: [comment({ id: "c3r1", parentId: "c3", author: people.me, canEdit: true, body: "Answering the deleted one: yes, the illustrations are from the brand kit.", createdAt: iso(NOW - 30 * MIN) })] }),
]

const msg = (over: Partial<ChatMessageView> & { id: string }): ChatMessageView => ({
  spaceId: "s-chat",
  body: "",
  status: "published",
  author: people.jonas,
  replyToId: null,
  createdAt: iso(NOW - HOUR),
  editedAt: null,
  canEdit: false,
  canModerate: true,
  ...over,
})

const MESSAGES: ChatMessageView[] = [
  msg({ id: "m1", author: people.maya, body: "Morning all. Critique night signups are open, see the pinned post.", createdAt: iso(NOW - DAY - 3 * HOUR) }),
  msg({ id: "m2", author: people.leo, body: "Signed up!", createdAt: iso(NOW - DAY - 2 * HOUR) }),
  msg({ id: "m3", author: people.jonas, body: "Anyone using Figma variables for spacing yet? Wondering if it is worth the migration for a 40 screen file.", createdAt: iso(NOW - 50 * MIN) }),
  msg({ id: "m4", author: people.jonas, body: "Mostly worried about the handoff side.", createdAt: iso(NOW - 49 * MIN) }),
  msg({ id: "m5", author: people.priya, body: "We moved last quarter. Worth it once you have more than one theme, otherwise I would wait.", createdAt: iso(NOW - 30 * MIN) }),
  msg({ id: "m6", author: people.me, canEdit: true, body: "Same experience here. The handoff got easier because devs read the names directly.", createdAt: iso(NOW - 12 * MIN) }),
]

type Person = { id: string; name: string; username: string | null; avatarUrl: string | null; role: Role; level: number }
const member = (p: Person, extra: Partial<MemberView> = {}): MemberView => ({
  userId: p.id,
  name: p.name,
  username: p.username,
  avatarUrl: p.avatarUrl,
  role: p.role,
  status: "active",
  tierId: null,
  tierName: null,
  level: p.level,
  levelName: ["", "Newcomer", "Regular", "Contributor", "Insider", "Core", "Pillar"][p.level] ?? null,
  points: p.level * 37,
  bio: null,
  joinedAt: iso(NOW - p.level * 30 * DAY),
  lastActiveAt: iso(NOW - HOUR),
  ...extra,
})

export const MEMBERS: MemberView[] = [
  member(people.maya, { bio: "Runs Studio Notes. Product designer, 12 years in fintech." }),
  member(people.priya, { bio: "Design systems at a 30 person startup." }),
  member(people.me),
  member(people.jonas, { bio: "Freelance, mostly early stage SaaS." }),
  member(people.leo),
  ...Array.from({ length: 6 }, (_, i) => member({ id: `u-x${i}`, name: ["Ana Ruiz", "Tom Hale", "Kei Sato", "Nora Lind", "Omar Aziz", "Ella Ward"][i], username: null, avatarUrl: null, role: "member", level: 1 + (i % 3) })),
]

const BOARD: LeaderboardRow[] = [
  { rank: 1, userId: "u-maya", points: 212, level: 6, levelName: "Pillar", name: "Maya Okafor", username: "mayao", avatarUrl: people.maya.avatarUrl },
  { rank: 2, userId: "u-priya", points: 148, level: 5, levelName: "Core", name: "Priya Raman", username: "priya", avatarUrl: null },
  { rank: 3, userId: "u-jonas", points: 97, level: 3, levelName: "Contributor", name: "Jonas Berg", username: "jonasb", avatarUrl: people.jonas.avatarUrl },
  { rank: 3, userId: "u-me", points: 97, level: 3, levelName: "Contributor", name: "Sam Carter", username: "samc", avatarUrl: people.me.avatarUrl },
  { rank: 5, userId: "u-leo", points: 41, level: 2, levelName: "Regular", name: "Leo Martins", username: "leom", avatarUrl: people.leo.avatarUrl },
]

const INBOX: NotificationView[] = [
  { id: "n1", kind: "reply", title: "Priya Raman replied to your comment", body: "Good call, trying it next.", url: "/community/studio-notes/post/p-photo#c-c1", read: false, createdAt: iso(NOW - 20 * MIN), actor: { name: "Priya Raman", avatarUrl: null } },
  { id: "n2", kind: "mention", title: "Maya Okafor mentioned you", body: "@samc can you take the second critique slot?", url: "/community/studio-notes/post/p-pinned", read: false, createdAt: iso(NOW - 3 * HOUR), actor: { name: "Maya Okafor", avatarUrl: people.maya.avatarUrl } },
  { id: "n3", kind: "announcement", title: "Studio Notes: October critique night is on the 14th", body: null, url: "/community/studio-notes/post/p-pinned", read: true, createdAt: iso(NOW - 3 * DAY), actor: { name: "Maya Okafor", avatarUrl: people.maya.avatarUrl } },
  { id: "n4", kind: "level_up", title: "You reached level 3: Contributor", body: "In Studio Notes.", url: "/community/studio-notes/leaderboard", read: true, createdAt: iso(NOW - 6 * DAY), actor: null },
]

const LEVELS = ["Newcomer", "Regular", "Contributor", "Insider", "Core", "Pillar"].map((name, i) => ({ level: i + 1, name }))

const params = new URLSearchParams(location.search)
const which = params.get("case") || "feed"
const me = { name: people.me.name, avatarUrl: people.me.avatarUrl }

const topBar: TopBarData = {
  community: { id: CID, slug: community.slug, name: community.name, logoUrl: community.logoUrl },
  creator: { name: "Maya Okafor", href: "/mayao" },
  me: { name: people.me.name, avatarUrl: people.me.avatarUrl, profileHref: "/@samc" },
  communities: [{ id: CID, slug: community.slug, name: community.name, logoUrl: community.logoUrl }],
  manageHref: null,
}

function Screen() {
  const shell = (children: React.ReactNode) => (
    <ShellFrame community={community} viewer={viewer} topBar={topBar} unreadNotifications={2}>
      {children}
    </ShellFrame>
  )
  if (which === "post") {
    return shell(<FeedColumns main={<PostPage slug={community.slug} viewer={viewer} post={POSTS[1]} comments={{ comments: COMMENTS, nextCursor: null }} me={me} />} />)
  }
  if (which === "chat") {
    /* As app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx draws a chat space: under the chips. */
    return shell(
      <div className="max-w-[760px] pt-4 lg:pt-6">
        <SpaceChips slug={community.slug} spaces={spaces} active={spaces[4].slug} />
        <ChatView communityId={CID} slug={community.slug} space={spaces[4]} viewer={viewer} initial={{ messages: MESSAGES, hasMore: true }} />
      </div>,
    )
  }
  if (which === "members") return shell(<MembersDirectory communityId={CID} slug={community.slug} memberCount={community.memberCount} initial={{ members: MEMBERS, nextCursor: "next" }} />)
  if (which === "leaderboard") return shell(<Leaderboard communityId={CID} slug={community.slug} initial={BOARD} me={{ userId: "u-me", points: 84, level: 3 }} levels={LEVELS} />)
  if (which === "notifications") return shell(<NotificationsList communityId={CID} slug={community.slug} userId="u-me" initial={{ notifications: INBOX, unread: 2, nextCursor: null }} notifyLevel="important" />)
  const onboarding = which === "welcome" ? { name: community.name, welcome: "Glad you are here. Introduce yourself, then jump into a critique thread.", rules: [{ title: "Be specific", body: "Notes that name the problem help more than taste." }, { title: "No pitching", body: "" }], introHref: "/community/studio-notes/space/introductions" } : null
  return shell(
    <FeedColumns
      header={<SpaceChips slug={community.slug} spaces={spaces} active={null} />}
      main={
        <FeedView
          communityId={CID}
          slug={community.slug}
          viewer={viewer}
          initial={{ pinned: [POSTS[0]], posts: POSTS.slice(1), nextCursor: "c2" }}
          onboarding={onboarding}
          composer={{ communityId: CID, userId: "u-me", me, spaces: spaces.filter((s) => s.canPost && s.kind !== "chat").map((s) => ({ id: s.id, name: s.name, kind: s.kind })), fileProductId: null }}
        />
      }
      aside={<FeedAside community={community} stats={{ members: community.memberCount, online: 5, admins: 2 }} upcoming={{ id: "e1", title: "Critique night: portfolios", startsAt: iso(NOW + 11 * DAY), endsAt: iso(NOW + 11 * DAY + 90 * MIN) }} />}
    />,
  )
}

try {
  window.localStorage.clear()
} catch {
  /* fine */
}
createRoot(document.getElementById("app")!).render(<Screen />)
