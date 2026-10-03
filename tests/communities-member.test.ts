/**
 * ===========================================================================
 *  COMMUNITIES: THE MEMBER EXPERIENCE
 * ===========================================================================
 * Held from their inputs:
 *
 *   FEED        keyset cursors (Latest on created_at and id, Popular on
 *               reaction_count too), tampered cursors refused, pinned read
 *               apart, what a post may carry, polls, the kind a space gives
 *   SPACES      who may see and post where: announcements need announce, a
 *               space's post_role, tier rules, chat only while chat is on
 *   COMMENTS    one reply level, a gone comment kept only for its replies,
 *               locked posts closed to members and open to moderators; a
 *               reply to a reply is stored under its top level comment
 *   REACTIONS   the point key, a like recorded once, nothing outside the
 *               community or out of sight
 *   FAN OUT     the announcement job's rows respect notify_level and never
 *               tell the author; its handler is registered
 *   LINKS       previews read from og tags, only https pictures, private
 *               addresses refused before any fetch
 *   INBOX, ME, REPORTS, DIRECTORY   the shapes a client may send
 *   SHELL       which section an address is, which places show
 *   ROUTES      every member route: the switch first, requireMember, a rate
 *               limit on every write, no role strings, no select("*")
 *   BOUNDARY    no client module reaches server code
 *   REALTIME    chat listens to its space's rows, removal blanks the body,
 *               presence is the only source of the online count
 *   COPY        no em dash and no banned word in anything here
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import {
  canPostIn,
  checkMedia,
  checkPoll,
  checkPostInput,
  cursorAfter,
  decodeCursor,
  encodeCursor,
  feedSort,
  keysetCondition,
  kindFor,
  linkUrl,
  ownImageUrl,
  parsePreview,
  spaceViews,
} from "@/lib/communities/server/feed"
import { buildThread, commentsOpen, createComment, decodeCommentCursor, encodeCommentCursor } from "@/lib/communities/server/comments"
import { reactionPointKey, setReaction } from "@/lib/communities/server/reactions"
import { fanoutRows, FANOUT_PAGE } from "@/lib/communities/server/jobs/fanout_announcement"
import { JOB_HANDLERS } from "@/lib/communities/server/jobs/index"
import { checkReport } from "@/lib/communities/server/reports"
import { checkMe, cleanQuery, decodeDirectoryCursor, displayName, encodeDirectoryCursor, excerpt } from "@/lib/communities/server/directory"
import { everyoneAllowed, inboxUrl, snippet } from "@/lib/communities/server/mentions"
import type { Viewer } from "@/lib/communities/server/context"
import { navEntries, sectionFromPath } from "@/components/community/member/nav"
import { REOPEN, moderationMenu, muteUntil } from "@/components/community/member/moderation"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommentRow, CommunityRow, Role, SpaceRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])) : [])

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const COMMUNITY = U(900)

function viewer(role: Role | null, o: Partial<Viewer> = {}): Viewer {
  return {
    userId: U(1),
    member: null,
    role,
    active: !!role,
    status: role ? "active" : null,
    tierId: null,
    ownedProductIds: [],
    level: 1,
    points: 0,
    isOwner: false,
    isCreatorAccount: false,
    banned: false,
    mutedUntil: null,
    ...o,
  }
}

function space(o: Partial<SpaceRow> & { id: string }): SpaceRow {
  return {
    community_id: COMMUNITY,
    slug: o.id,
    name: o.id,
    description: null,
    icon: null,
    kind: "feed",
    position: 0,
    view_access: {},
    post_role: "member",
    comments_enabled: true,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...o,
  }
}

const community = { id: COMMUNITY, slug: "studio", name: "Studio", chat_enabled: true } as CommunityRow

async function main() {
  /* ── Feed cursors ────────────────────────────────────────────────────── */
  console.log("\nThe feed pages by keyset")
  const at = "2026-09-01T10:00:00.000Z"
  const latest = encodeCursor({ c: at, i: U(5) })
  check("a Latest cursor reads back as written", JSON.stringify(decodeCursor(latest, "latest")) === JSON.stringify({ c: at, i: U(5) }))
  check("a Popular cursor needs its reaction count", decodeCursor(latest, "popular") === null && decodeCursor(encodeCursor({ c: at, i: U(5), r: 7 }), "popular")?.r === 7)
  check("a tampered or foreign cursor is no cursor", decodeCursor("not-base64-json", "latest") === null && decodeCursor(Buffer.from(JSON.stringify({ c: "yesterday", i: "x" })).toString("base64url"), "latest") === null)
  check("a negative or fractional count is refused", decodeCursor(encodeCursor({ c: at, i: U(5), r: -1 }), "popular") === null && decodeCursor(encodeCursor({ c: at, i: U(5), r: 1.5 }), "popular") === null)
  check("an over long cursor is refused", decodeCursor("a".repeat(401), "latest") === null)
  check("Latest: older, or as old with a smaller id", keysetCondition("latest", { c: at, i: U(5) }) === `created_at.lt."${at}",and(created_at.eq."${at}",id.lt.${U(5)})`)
  check(
    "Popular: fewer likes, or as many and older, or as many, as old and a smaller id",
    keysetCondition("popular", { c: at, i: U(5), r: 3 }) === `reaction_count.lt.3,and(reaction_count.eq.3,created_at.lt."${at}"),and(reaction_count.eq.3,created_at.eq."${at}",id.lt.${U(5)})`,
  )
  check("the next cursor comes from the page's last post", decodeCursor(cursorAfter("popular", { created_at: at, id: U(6), reaction_count: 4 }), "popular")?.r === 4)
  check("anything but popular sorts by latest", feedSort("popular") === "popular" && feedSort("weird") === "latest" && feedSort(undefined) === "latest")
  const feedSrc = code("lib/communities/server/feed.ts")
  check("pinned posts are read on their own, first page only, and the pages skip them", /if \(!cursor\)[\s\S]{0,200}\.eq\("pinned", true\)/.test(feedSrc) && /\.eq\("pinned", false\)/.test(feedSrc))
  check("pages ask for one more than they show, to know there is a next", /\.limit\(limit \+ 1\)/.test(feedSrc))
  check("no offset paging anywhere in the member modules", !["feed", "comments", "chat", "directory", "mentions"].some((m) => /\.range\(/.test(code(`lib/communities/server/${m}.ts`))))
  check("a page of posts is hydrated in a fixed number of reads (authors, likes, saves, polls)", /authorViews\(db, h\.community\.id, rows\.map/.test(feedSrc) && /\.in\("target_id", ids\)/.test(feedSrc) && /\.in\("post_id", ids\)/.test(feedSrc))

  /* ── What a post may carry ───────────────────────────────────────────── */
  console.log("\nWhat a post may carry")
  check("an empty post is refused", !checkPostInput({}).ok)
  check("a title over 200 characters is refused", !checkPostInput({ title: "x".repeat(201) }).ok)
  check("text alone is a post", checkPostInput({ body: "  hello\r\nthere  " }).ok && (checkPostInput({ body: "  hello\r\nthere  " }) as { value: { body: string } }).value.body === "hello\nthere")
  check("control characters are taken out", (checkPostInput({ body: "a\u0000b\u0007c" }) as { value: { body: string } }).value.body === "abc")
  check("a picture from Storelib's own storage is kept", checkMedia([{ type: "image", url: "https://abc.supabase.co/storage/v1/object/public/product-images/u/x.jpg", w: 800, h: 600 }]).ok)
  check("a picture from anywhere else is refused", !checkMedia([{ type: "image", url: "https://evil.example/x.jpg" }]).ok && !checkMedia([{ type: "image", url: "http://storelib.com/x.jpg" }]).ok)
  check("ownImageUrl: https on storelib.com or the storage host only", !!ownImageUrl("https://cdn.storelib.com/a.png", null) && !ownImageUrl("https://storelib.com.evil.io/a.png", null) && !ownImageUrl("javascript:alert(1)", null))
  check("a link card: one per post", !checkMedia([{ type: "link", url: "https://a.com/x" }, { type: "link", url: "https://b.com/y" }]).ok)
  check("a link to a private address is refused", !linkUrl("http://127.0.0.1/admin") && !linkUrl("http://169.254.169.254/latest") && !linkUrl("http://localhost:3000") && !linkUrl("ftp://a.com/x") && !!linkUrl("https://example.com/a"))
  check("a link card's picture must be https", !("image" in ((checkMedia([{ type: "link", url: "https://a.com/x", image: "http://a.com/i.png" }]) as { value: { image?: string }[] }).value[0] ?? {})))
  check("a file or video is only a reference with a proper id", !checkMedia([{ type: "file", assetId: "../etc" }]).ok && checkMedia([{ type: "file", assetId: U(3), name: "notes.pdf" }]).ok && !checkMedia([{ type: "video", videoId: "x" }]).ok)
  check("at most ten pictures and files", !checkMedia(Array.from({ length: 11 }, () => ({ type: "image", url: "https://storelib.com/a.png" }))).ok)
  check("unknown media kinds are dropped, not stored", (checkMedia([{ type: "script", src: "x" }]) as { value: unknown[] }).value.length === 0)
  check("a video must be this community's and ready", /from\("media_videos"\)[\s\S]{0,300}r\.status === "ready"/.test(feedSrc))
  check("the composer uploads a video through the community's video route and plays it with StorelibVideo", /uploadCommunityVideo\(\{ endpoint: `\$\{apiBase\(communityId\)\}\/videos`/.test(code("components/community/member/composer.tsx")) && /<StorelibVideo communityId=\{communityId\} videoId=\{videoId\}/.test(code("components/community/member/media.tsx")))
  check("createPost keeps only files and videos that are the poster's own, for this community", /\.eq\("uploaded_by", viewer\.userId\)/.test(feedSrc) && /from\("media_videos"\)[\s\S]{0,200}\.eq\("community_id", community\.id\)/.test(feedSrc))

  console.log("\nPolls")
  check("a poll needs a question", !checkPoll({ options: ["a", "b"] }).ok)
  check("a poll needs two different choices", !checkPoll({ question: "Q", options: ["a", "A"] }).ok && checkPoll({ question: "Q", options: ["a", "b", " "] }).ok)
  check("at most ten choices", !checkPoll({ question: "Q", options: Array.from({ length: 11 }, (_, i) => `o${i}`) }).ok)
  check("a closing time must be in the future", !checkPoll({ question: "Q", options: ["a", "b"], closesAt: "2000-01-01T00:00:00Z" }).ok)
  check("no poll is fine", JSON.stringify(checkPoll(undefined)) === JSON.stringify({ ok: true, value: null }))
  check("a vote goes through the atomic rpc", /rpc\("community_cast_vote"/.test(feedSrc))

  /* ── Spaces ──────────────────────────────────────────────────────────── */
  console.log("\nWho may see and post where")
  const ann = space({ id: "ann", kind: "announcements", post_role: "admin" })
  const general = space({ id: "general" })
  const modsOnly = space({ id: "mods", post_role: "moderator" })
  const paid = space({ id: "paid", view_access: { tierIds: ["t-paid"] } })
  const chat = space({ id: "chat", kind: "chat" })
  check("a member posts in General", canPostIn(general, viewer("member")))
  check("a member may not post an announcement; an admin may", !canPostIn(ann, viewer("member")) && canPostIn(ann, viewer("admin")))
  check("a space's post_role is respected", !canPostIn(modsOnly, viewer("member")) && canPostIn(modsOnly, viewer("moderator")))
  check("a space behind a tier is out of sight and out of reach for others", !canPostIn(paid, viewer("member")) && canPostIn(paid, viewer("member", { tierId: "t-paid" })))
  check("chat only while chat is on", canPostIn(chat, viewer("member"), true) && !canPostIn(chat, viewer("member"), false))
  check("nobody who is not active posts anywhere", !canPostIn(general, viewer(null)))
  const views = spaceViews([general, paid, chat, ann], viewer("member"), { chat_enabled: false })
  check("the shell lists only the spaces the member may see, no chat while it is off", views.map((s) => s.slug).join() === "general,ann", views.map((s) => s.slug).join())
  check("and says where they may post", views.find((s) => s.slug === "ann")?.canPost === false && views.find((s) => s.slug === "general")?.canPost === true)
  check("an announcements space makes announcements, a poll a poll, resources resources", kindFor(ann, false) === "announcement" && kindFor(general, true) === "poll" && kindFor(space({ id: "r", kind: "resources" }), false) === "resource" && kindFor(general, false) === "post")
  check("@everyone needs mention_everyone", !everyoneAllowed("hi @everyone", "moderator") && everyoneAllowed("hi @everyone", "admin") && everyoneAllowed("hi @maya", "member"))

  /* ── Comments ────────────────────────────────────────────────────────── */
  console.log("\nComments, one reply level")
  const c = (id: string, o: Partial<CommentRow> = {}): CommentRow => ({
    id,
    post_id: "p",
    community_id: COMMUNITY,
    parent_id: null,
    author_id: "a",
    body: id,
    status: "published",
    reaction_count: 0,
    removed_by: null,
    removed_reason: null,
    edited_at: null,
    created_at: `2026-09-01T10:00:0${id.length % 10}.000Z`,
    updated_at: "",
    deleted_at: null,
    ...o,
  })
  const thread = buildThread(
    [c("c1"), c("c2", { status: "deleted", body: "" }), c("c3", { status: "removed" })],
    [c("r1", { parent_id: "c1", created_at: "2026-09-01T11:00:00.000Z" }), c("r0", { parent_id: "c1", created_at: "2026-09-01T10:30:00.000Z" }), c("r2", { parent_id: "c2" }), c("rx", { parent_id: "c1", status: "removed" })],
    { viewerId: "a", moderator: false, authors: new Map(), reacted: new Set(["r1"]) },
  )
  check("a deleted comment with replies stays as Deleted; a removed one with none is left out", thread.map((t) => `${t.id}:${t.body}`).join() === "c1:c1,c2:Deleted", thread.map((t) => `${t.id}:${t.body}`).join())
  check("replies are in order and a removed reply is not shown", thread[0].replies.map((r) => r.id).join() === "r0,r1")
  check("a gone comment names nobody and cannot be edited", thread[1].author === null && !thread[1].canEdit && thread[1].deleted)
  check("the viewer's own likes are marked", thread[0].replies[1].reacted && !thread[0].replies[0].reacted)
  check("a locked post is closed to members and open to moderators", commentsOpen({ status: "published", locked: true }, true, { role: "member" }) !== null && commentsOpen({ status: "published", locked: true }, true, { role: "moderator" }) === null)
  check("comments off in a space close every post in it", commentsOpen({ status: "published", locked: false }, false, { role: "admin" }) !== null)
  check("comment cursors read back", decodeCommentCursor(encodeCommentCursor({ c: at, i: U(9) }))?.i === U(9) && decodeCommentCursor("junk") === null)

  {
    const POST = U(100)
    const TOP = U(101)
    const REPLY = U(102)
    const db = fakeDb({
      communities: [{ id: COMMUNITY, slug: "studio", name: "Studio", status: "published", deleted_at: null }],
      community_spaces: [{ ...general, id: U(50) }],
      community_feed_posts: [{ id: POST, community_id: COMMUNITY, space_id: U(50), author_id: U(2), status: "published", locked: false, media: [], title: null, body_text: "hello", reaction_count: 0 }],
      community_feed_comments: [
        c(TOP, { post_id: POST, author_id: U(3) }),
        c(REPLY, { post_id: POST, parent_id: TOP, author_id: U(4) }),
      ],
      community_members: [],
      profiles: [{ id: U(1), username: "sam", display_name: "Sam", avatar_url: null }],
    })
    const r = await createComment({ db, community: { ...community, id: COMMUNITY }, viewer: viewer("member") }, POST, { body: "agreed", parentId: REPLY })
    const stored = db.tables.community_feed_comments.find((x) => x.body === "agreed")
    check("a reply to a reply is stored under the top level comment", r.ok && stored?.parent_id === TOP, JSON.stringify(stored))
    const other = await createComment({ db, community: { ...community, id: COMMUNITY }, viewer: viewer("member") }, U(999), { body: "x" })
    check("a comment on a post that is not in this community is refused", !other.ok && (other as { status?: number }).status === 404)
    const empty = await createComment({ db, community: { ...community, id: COMMUNITY }, viewer: viewer("member") }, POST, { body: "   " })
    check("an empty comment is refused", !empty.ok)
  }

  /* ── Reactions ───────────────────────────────────────────────────────── */
  console.log("\nLikes and the points they give")
  check("the point key names the type, the target and who liked it", reactionPointKey("post", "p1", "u1") === "react:post:p1:u1")
  {
    const POST = U(200)
    const HIDDEN = U(201)
    const db = fakeDb(
      {
        community_spaces: [{ ...general, id: U(60) }, { ...paid, id: U(61) }],
        community_feed_posts: [
          { id: POST, community_id: COMMUNITY, space_id: U(60), author_id: U(1), status: "published", media: [], title: "t", body_text: "b", reaction_count: 0 },
          { id: HIDDEN, community_id: COMMUNITY, space_id: U(61), author_id: U(2), status: "published", media: [], title: "t", body_text: "b", reaction_count: 0 },
          { id: U(202), community_id: U(901), space_id: null, author_id: U(2), status: "published", media: [], title: "t", body_text: "b", reaction_count: 0 },
        ],
      },
      { unique: { community_reactions: [["target_type", "target_id", "user_id", "kind"]] } },
    )
    const w = { db, community: { ...community, id: COMMUNITY }, viewer: viewer("member") }
    const first = await setReaction(w, "post", POST, true)
    const again = await setReaction(w, "post", POST, true)
    check("a like is recorded once, however many presses", first.ok && again.ok && db.tables.community_reactions.length === 1)
    check("liking your own post gives no point (no award is asked for)", !db.log.some((l) => l.table === "community_point_events"))
    check("a post in a space the member cannot see cannot be liked", !(await setReaction(w, "post", HIDDEN, true)).ok)
    check("a post in another community cannot be liked", !(await setReaction(w, "post", U(202), true)).ok)
    const off = await setReaction(w, "post", POST, false)
    check("unliking removes the row", off.ok && db.tables.community_reactions.length === 0)
  }
  const reactSrc = code("lib/communities/server/reactions.ts")
  check("a like gives the author a point, an unlike takes it back by the same key", /awardPoints\(db, \{[^}]*reason: "reaction_received", sourceKey: key, actorId: viewer\.userId/.test(reactSrc) && /revokePoints\(db, \{[^}]*sourceKey: key/.test(reactSrc))
  check("no point and no notification for a self like", /target\.authorId !== viewer\.userId/.test(reactSrc))

  /* ── Fan out ─────────────────────────────────────────────────────────── */
  console.log("\nAnnouncements and @everyone reach every member, a page at a time")
  const rows = fanoutRows(
    [
      { user_id: "author", notify_level: "all" },
      { user_id: "a", notify_level: "important" },
      { user_id: "b", notify_level: "mentions" },
      { user_id: "c", notify_level: "none" },
      { user_id: "d", notify_level: null },
    ],
    { communityId: COMMUNITY, postId: "p9", actorId: "author", title: "T", body: null, url: "/community/studio/post/p9", reason: "announcement" },
  )
  check("never the author; mentions only and none hear nothing; the default hears it", rows.map((r) => r.user_id).join() === "a,d", rows.map((r) => r.user_id).join())
  check("each row is keyed so a retried page writes nothing twice", rows.every((r) => r.dedupe_key === `announcement:p9:${r.user_id}`))
  check("a page is 500 members, one read and one write", FANOUT_PAGE === 500)
  check("the job is registered", typeof JOB_HANDLERS.fanout_announcement === "function")
  const fanSrc = code("lib/communities/server/jobs/fanout_announcement.ts")
  check("it walks members by user id and hands back its cursor before the deadline", /\.gt\("user_id", after\)/.test(fanSrc) && /again: \{ payload: \{ \.\.\.payload, after \} \}/.test(fanSrc) && /ctx\.deadline/.test(fanSrc))
  check("it writes with ignoreDuplicates on dedupe_key", /onConflict: "dedupe_key", ignoreDuplicates: true/.test(fanSrc))
  check("a removed post tells nobody", /post\.status !== "published"\) return/.test(fanSrc))
  check("posting an announcement or @everyone queues it once per post", /queueEveryone\(db/.test(feedSrc) && /idempotencyKey: `fanout_announcement:\$\{p\.postId\}`/.test(code("lib/communities/server/mentions.ts")))

  /* ── Link previews ───────────────────────────────────────────────────── */
  console.log("\nLink previews")
  const html = `<html><head><title>Fallback</title><meta property="og:title" content="A &amp; B"><meta content="/img/card.png" property="og:image"><meta property="og:site_name" content="Example"></head></html>`
  const prev = parsePreview(html, "https://example.com/a/b")
  check("og tags are read, entities decoded, a relative picture made absolute", prev.title === "A & B" && prev.image === "https://example.com/img/card.png" && prev.site === "Example", JSON.stringify(prev))
  const plain = parsePreview("<title>Just a title</title>", "http://www.example.org/")
  check("without og tags: the title and the host", plain.title === "Just a title" && plain.site === "example.org" && plain.image === null)
  check("an http picture is not shown", parsePreview(`<meta property="og:image" content="http://x.com/i.png">`, "https://x.com").image === null)
  check("the fetch is the public one: size cap, timeout, redirects checked", /fetchPublic\(url, \{ maxBytes: PREVIEW_MAX_BYTES, timeoutMs: PREVIEW_TIMEOUT_MS, maxRedirects: 3 \}\)/.test(feedSrc))

  /* ── Small shapes ────────────────────────────────────────────────────── */
  console.log("\nReports, settings, the inbox and the directory")
  check("a report needs a known target, a uuid and a reason", !checkReport({ targetType: "space", targetId: U(1), reason: "spam" }).ok && !checkReport({ targetType: "post", targetId: "1", reason: "spam" }).ok && !checkReport({ targetType: "post", targetId: U(1), reason: "meh" }).ok && checkReport({ targetType: "post", targetId: U(1), reason: "spam" }).ok)
  check("a report note over 500 characters is refused", !checkReport({ targetType: "post", targetId: U(1), reason: "other", note: "x".repeat(501) }).ok)
  check("me: only notify level, emails, bio and onboarded", JSON.stringify((checkMe({ notifyLevel: "mentions", bio: "  hi  ", role: "owner", onboarded: true }, 0) as { value: unknown }).value) === JSON.stringify({ notify_level: "mentions", bio: "hi", onboarded_at: "1970-01-01T00:00:00.000Z" }))
  check("me: an unknown level or a long bio is refused", !checkMe({ notifyLevel: "loud" }).ok && !checkMe({ bio: "x".repeat(281) }).ok && !checkMe({}).ok)
  check("a notification's link is kept only inside its community", inboxUrl("/community/studio/post/1", "studio") === "/community/studio/post/1" && inboxUrl("https://evil.example", "studio") === null && inboxUrl("/community/other/x", "studio") === null)
  check("a search box sends letters and names, never filter syntax", cleanQuery("@ma,ya)(%*") === "maya" && cleanQuery(42) === "")
  check("directory cursors read back and refuse junk", decodeDirectoryCursor(encodeDirectoryCursor({ j: at, i: U(4) }))?.i === U(4) && decodeDirectoryCursor("zz") === null)
  check("a person's name: display name, then username, then Member", displayName({ display_name: " ", username: "sam" }) === "sam" && displayName(null) === "Member")
  check("excerpts cut at a word", excerpt("alpha beta gamma delta", 14) === "alpha beta...")
  check("snippets stay one short line", snippet("a\n\nb   c") === "a b c" && snippet("x".repeat(200)).length === 140)
  const dirSrc = code("lib/communities/server/directory.ts")
  check("the directory never reads an email or a payment", !/email|stripe|source_membership|source_order/.test(dirSrc.replace(/email_announcements|email_events|emailAnnouncements|emailEvents/g, "")))
  check("the directory pages active members by (joined_at, id)", /\.eq\("status", "active"\)/.test(dirSrc) && /order\("joined_at"[\s\S]{0,80}order\("id"/.test(dirSrc))

  /* ── Shell ───────────────────────────────────────────────────────────── */
  console.log("\nThe shell")
  check("the community's address is home", sectionFromPath("/community/studio", "studio") === "home" && sectionFromPath("/community/studio/", "studio") === "home")
  check("a space is space:<slug>", sectionFromPath("/community/studio/space/lounge", "studio") === "space:lounge")
  check("the places are themselves; a post is home", sectionFromPath("/community/studio/events/1", "studio") === "events" && sectionFromPath("/community/studio/members/u", "studio") === "members" && sectionFromPath("/community/studio/post/p", "studio") === "home")
  const off = navEntries({ slug: "s", classroomEnabled: false, eventsEnabled: false, directoryEnabled: false, gamificationEnabled: false }, false)
  check("switched off places are not drawn", off.map((e) => e.key).join() === "home,saved", off.map((e) => e.key).join())
  check("staff see Members even with the directory off", navEntries({ slug: "s", classroomEnabled: true, eventsEnabled: true, directoryEnabled: false, gamificationEnabled: true }, true).map((e) => e.key).join() === "home,classroom,events,members,leaderboard,saved")
  const modView = { can: allowedActions("moderator"), role: "moderator" as Role, userId: "me" }
  check("a moderator's menu: remove, pin, lock, mute and ban a member", JSON.stringify(moderationMenu(modView, { id: "x", role: "member" })) === JSON.stringify({ remove: true, pin: true, lock: true, mute: true, ban: true }))
  check("but never mute or ban an admin, or themselves", !moderationMenu(modView, { id: "x", role: "admin" }).ban && !moderationMenu(modView, { id: "me", role: "member" }).mute)
  check("a member's menu has no moderation", Object.values(moderationMenu({ can: allowedActions("member"), role: "member", userId: "me" }, { id: "x", role: "member" })).every((v) => !v))
  check("reopening comments sends the action the moderation route names", REOPEN === "reopen")
  check("a mute lasts a day from now", muteUntil(24, 0) === "1970-01-02T00:00:00.000Z")

  /* ── Routes ──────────────────────────────────────────────────────────── */
  console.log("\nEvery member route")
  const mine = ["posts", "comments", "reactions", "bookmarks", "polls", "reports", "spaces", "messages", "members", "leaderboard", "notifications", "me"]
  const routes = mine.flatMap((d) => walk(`app/api/community/[communityId]/${d}`)).filter((f) => f.endsWith("route.ts"))
  check("all the member routes exist", routes.length >= 18, String(routes.length))
  for (const f of routes) {
    const src = code(f)
    const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|DELETE)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
    const short = f.replace("app/api/community/[communityId]/", "")
    check(`${short}: every handler checks the switch first`, handlers.length > 0 && handlers.every((h) => /^\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(h[2])))
    check(`${short}: every handler goes through requireMember`, handlers.every((h) => /requireMember\(db, communityId, await sessionUserId\(\), "\w+"\)/.test(h[2])))
    const writes = handlers.filter((h) => h[1] !== "GET")
    check(`${short}: every write is rate limited`, writes.every((h) => /rateLimit\(\{[\s\S]*?bucket: rateBucket\("\w+"\)/.test(h[2])))
    check(`${short}: no role strings and no select("*")`, !/role === "|role !== "|select\("\*"\)/.test(src))
  }
  const serverMods = ["feed", "comments", "reactions", "chat", "directory", "mentions", "reports"].map((m) => `lib/communities/server/${m}.ts`)
  check("every member server module says server-only", [...serverMods, "lib/communities/server/jobs/fanout_announcement.ts", "components/community/member/data.ts", "components/community/member/shell.tsx", "components/community/member/feed-page.tsx"].every((f) => /^import "server-only"/m.test(read(f))))
  check("no member module compares role strings itself", serverMods.every((f) => !/role === "(owner|admin|moderator|member)"/.test(code(f))))
  check("edits and deletes are the author's own (author_id in the write)", /\.eq\("author_id", viewer\.userId\)/.test(feedSrc) && /\.eq\("author_id", w\.viewer\.userId\)/.test(code("lib/communities/server/comments.ts")))

  /* ── Pages ───────────────────────────────────────────────────────────── */
  console.log("\nThe pages")
  const G = "app/(marketing)/community/[slug]/(member)"
  const layout = code(`${G}/layout.tsx`)
  check("the layout: 404 when off or missing, about for non members, a plain screen otherwise", /page\.state === "off" \|\| page\.state === "missing"[\s\S]{0,60}notFound\(\)/.test(layout) && /redirect\(`\/community\/\$\{page\.community\.slug\}\/about`\)/.test(layout) && /MemberStateScreen/.test(layout))
  check("member pages are never indexed", /robots: \{ index: false, follow: false \}/.test(layout))
  check("the member state is read per request", /await connection\(\)/.test(layout))
  for (const p of ["space/[space]", "post/[postId]", "members", "members/[userId]", "leaderboard", "saved", "notifications"]) check(`${p} exists and 404s for anyone not an active member`, existsSync(`${G}/${p}/page.tsx`) && /page\.state !== "member"[\s\S]{0,80}notFound\(\)/.test(code(`${G}/${p}/page.tsx`)))
  check("the leaderboard page needs points on; members need the directory or staff", /gamification_enabled\) notFound/.test(code(`${G}/leaderboard/page.tsx`)) && /directory_enabled && !can\(viewer\.role, "manage_members"\)\) notFound/.test(code(`${G}/members/page.tsx`)))
  const feedPage = read("components/community/member/feed-page.tsx")
  check("CommunityFeedPage({ slug }) is exported for /community/[slug]", /export const CommunityFeedPage = [\s\S]*\(props: \{ slug: string \}\)/.test(feedPage))
  check("CommunityShell({ community, viewer, active, children }) is exported", /export const CommunityShell = [\s\S]*active\?: ShellSection; children: React\.ReactNode/.test(read("components/community/member/shell.tsx")))
  check("the invite landing sits outside the member group and calls the redeem route", existsSync("app/(marketing)/community/[slug]/join/page.tsx") && /\/invite\/redeem/.test(code("components/community/member/invite-landing.tsx")))

  /* ── Boundary ────────────────────────────────────────────────────────── */
  console.log("\nNo server code in the browser")
  const memberFiles = walk("components/community/member")
  const clientFiles = memberFiles.filter((f) => /^["']use client["']/m.test(read(f)))
  const pureHelpers = ["ui.ts", "api.ts", "nav.ts", "moderation.ts", "view-types.ts"].map((f) => `components/community/member/${f}`)
  check("there are client modules to check", clientFiles.length >= 15, String(clientFiles.length))
  const serverish = /from "(server-only|next\/headers)"|@\/lib\/communities\/server|@\/lib\/supabase\/(server|admin)|lib\/admin-blog-auth|\.\/(data|shell|feed-page)"|@\/lib\/communities\/flag/
  const leaks = [...clientFiles, ...pureHelpers].filter((f) => serverish.test(code(f)))
  check("no client module, or helper they import, imports server code", leaks.length === 0, leaks.join(", "))
  check("view-types is types and pure helpers only", !/^import (?!type)/m.test(read("components/community/member/view-types.ts")))

  /* ── Realtime ────────────────────────────────────────────────────────── */
  console.log("\nLive, from the database and from presence only")
  const chatUi = code("components/community/member/chat.tsx")
  check("chat listens to postgres_changes on community_messages for its space", /"postgres_changes", \{ event: "\*", schema: "public", table: "community_messages", filter: `space_id=eq\.\$\{space\.id\}` \}/.test(chatUi))
  check("chat writes go to the server route, never the database from the browser", !/\.from\("community_messages"\)/.test(chatUi) && /\/spaces\/\$\{space\.id\}\/messages/.test(chatUi))
  const chatSrv = code("lib/communities/server/chat.ts")
  check("removing or deleting a message blanks its body in the same update", /status: "deleted", body: "", deleted_at/.test(chatSrv) && /status: "removed", body: "", deleted_at/.test(chatSrv))
  check("a moderator's removal is written to the audit log", /action: "message\.removed"/.test(chatSrv))
  const rt = code("components/community/member/realtime.ts")
  check("the bell follows the member's own community_notifications rows", /table: "community_notifications", filter: `user_id=eq\.\$\{userId\}`/.test(rt))
  check("the online count comes from a presence channel and is null until it answers", /presenceState\(\)/.test(rt) && /useState<number \| null>\(null\)/.test(rt))
  check("presence keys are hashed, not user ids", /crypto\.subtle\.digest\("SHA-256"/.test(rt))
  check("the shell draws an online count only from presence, and only when others are there", /online !== null && online > 1/.test(code("components/community/member/shell-frame.tsx")))

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nCopy")
  const all = [
    ...memberFiles,
    ...serverMods,
    "lib/communities/server/jobs/fanout_announcement.ts",
    ...walk(G),
    "app/(marketing)/community/[slug]/join/page.tsx",
    ...routes,
    "scripts/check-community-member.mjs",
    "scripts/render-community-member.tsx",
  ]
  const offenders = all.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word, in copy, comments or names", offenders.length === 0, offenders.join(", "))
  check("no violet fill on the member side", !memberFiles.some((f) => /bg-\[#8b5cf6\]|bg-violet|bg-purple/.test(read(f))))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
