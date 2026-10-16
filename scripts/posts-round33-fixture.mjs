/**
 * The rows, posts, comments and scheduled posts that scripts/render-posts-round33.tsx draws and that
 * scripts/check-posts-round33.mjs answers its stub of the API with, in one place so the two agree.
 */
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const ME = "00000000-0000-4000-8000-000000000001"
const NOW = Date.UTC(2026, 9, 16, 9, 0, 0)
const ago = (d) => new Date(NOW - d * 86_400_000).toISOString()
const pid = (n) => `a${n}000000-0000-4000-8000-00000000000${n}`
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function picture(ground, ink) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${ground}"/><circle cx="470" cy="130" r="56" fill="${ink}" opacity="0.55"/><path d="M0 330 L220 200 L380 300 L520 230 L640 300 L640 400 L0 400Z" fill="${ink}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const row = (i, over) => ({
  id: pid(i),
  kind: "post",
  title: null,
  excerpt: "",
  spaceName: "General",
  authorName: "Marcus Lee",
  pinned: false,
  locked: false,
  featured: false,
  status: "published",
  reactionCount: 0,
  commentCount: 0,
  createdAt: ago(i * 0.3),
  media: [],
  poll: null,
  spaceId: "s1",
  spaceIcon: "✍️",
  spaceKind: "feed",
  authorId: uid(2),
  authorAvatar: null,
  ...over,
})

const pictures = [
  { type: "image", url: picture("#d9c7a7", "#8b6b47"), w: 640, h: 400 },
  { type: "image", url: picture("#c9d6c3", "#4f6b4a"), w: 640, h: 400 },
]

const all = [
  row(1, { kind: "announcement", title: "Friday call moves to 6pm", excerpt: "From this week the call starts an hour later so more of you can make it.", spaceName: "Announcements", spaceId: "s2", spaceIcon: null, spaceKind: "announcements", authorName: "Ana Popescu", authorId: ME, pinned: true, reactionCount: 48, commentCount: 2 }),
  row(2, { title: "My desk this morning", excerpt: "Day 31. Wrote about my grandmother's kitchen. 640 words before the kettle boiled.", featured: true, reactionCount: 21, commentCount: 2, media: pictures }),
  row(3, { kind: "poll", title: "When should the call be?", excerpt: "Pick the time that suits you.", poll: { question: "Which evening works best?", votes: 37, options: 3, closed: false }, reactionCount: 3, commentCount: 0, authorName: "Sofia Rossi", authorId: uid(3) }),
  row(4, { title: "Prompt deck, March", excerpt: "Thirty prompts, one for each morning.", reactionCount: 15, commentCount: 1, authorId: ME, authorName: "Ana Popescu" }),
  row(5, { title: "Buy my course", excerpt: "Link in bio.", status: "removed", authorName: "Spam Account", authorId: uid(9) }),
]
const pinned = [all[0], row(6, { title: "Start here: how the mornings work", excerpt: "Read this first.", pinned: true, createdAt: ago(40), authorName: "Ana Popescu", authorId: ME })]
const removed = [all[4], row(7, { title: "Free followers", excerpt: "Three sites.", status: "removed", createdAt: ago(9), authorName: "Spam Account", authorId: uid(9) })]

const LONG = "Day 31. Wrote about my grandmother's kitchen. 640 words before the kettle boiled.\n\nThe trick that worked: I set the timer for twenty minutes and did not reread a single line until it rang. The second draft took less time than the first."

/** The post as GET /api/community/<id>/posts/<postId> answers it. */
function post(r) {
  const space = r.spaceId === "s2" ? { id: "s2", slug: "announcements", name: "Announcements", icon: null, kind: "announcements" } : { id: "s1", slug: "general", name: "General", icon: "✍️", kind: "feed" }
  return {
    id: r.id,
    communityId: ID,
    space,
    kind: r.kind,
    title: r.title,
    body: "",
    bodyText: r.id === pid(2) ? LONG : r.excerpt,
    media: r.media,
    pinned: r.pinned,
    featured: r.featured,
    locked: r.locked,
    status: r.status,
    author: { id: r.authorId, name: r.authorName, username: r.authorName.toLowerCase().replace(/[^a-z]+/g, ""), avatarUrl: null, role: r.authorId === ME ? "owner" : "member", level: 2 },
    reactionCount: r.reactionCount,
    commentCount: r.commentCount,
    reacted: false,
    bookmarked: false,
    poll: r.kind === "poll" ? { id: "poll1", question: "Which evening works best?", multiple: false, closesAt: null, closed: false, totalVotes: 37, options: [ { id: "o1", label: "Tuesday", voteCount: 20, voted: false }, { id: "o2", label: "Thursday", voteCount: 12, voted: false }, { id: "o3", label: "Friday", voteCount: 5, voted: false } ] } : null,
    createdAt: r.createdAt,
    editedAt: null,
    lastActivityAt: r.createdAt,
    canEdit: r.authorId === ME,
    canModerate: true,
  }
}

const comment = (n, postId, name, body, over = {}) => ({
  id: `c${n}000000-0000-4000-8000-00000000000${n}`,
  postId,
  parentId: null,
  body,
  status: "published",
  deleted: false,
  author: { id: uid(20 + n), name, username: name.toLowerCase().replace(/[^a-z]+/g, ""), avatarUrl: null, role: "member", level: 1 },
  reactionCount: n,
  reacted: false,
  createdAt: ago(0.1 * n),
  editedAt: null,
  replies: [],
  canEdit: false,
  canModerate: true,
  media: [],
  ...over,
})

/** GET /api/community/<id>/posts/<postId>/comments. */
function comments(postId) {
  const list = postId === pid(2) ? [comment(1, postId, "Priya Raman", "The timer trick is going on my desk too."), comment(2, postId, "Jonas Becker", "Twenty minutes is the right length.")] : postId === pid(1) ? [comment(3, postId, "Hana Sato", "Works for me."), comment(4, postId, "Chen Wei", "Thank you!")] : []
  return { comments: list, nextCursor: null, commentsEnabled: true, me: { name: "Ana Popescu", avatarUrl: null }, mediaReady: true }
}

const scheduled = { ready: true, rows: [], spaces: [{ id: "s1", name: "General", kind: "feed", icon: "✍️" }, { id: "s2", name: "Announcements", kind: "announcements", icon: null }] }

export const FIXTURE = { ID, ME, rows: { all, pinned, removed }, post, comments, scheduled, pid }
