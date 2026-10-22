/**
 * ===========================================================================
 *  COMMUNITY MESSAGES, ROUND 39: WHO TO WRITE TO, AND A POST IN A CHAT
 * ===========================================================================
 * Held from their inputs, and through the real server code on an in-memory
 * database (tests/_fake-db.ts):
 *
 *   SUGGESTED   the owner, then admins, then moderators (at most four), then
 *               the people the member deals with (a conversation, comments on
 *               their posts, posts of theirs they liked), the top contributors,
 *               the recently here; never the member, never somebody blocked
 *               either way, banned, gone, or refused by the message rules
 *   SEARCH      a member only; a name or an @handle; the handle or name that
 *               starts with it first; blocked, banned and gone people never
 *               come back; somebody the rules refuse is greyed with the reason;
 *               names, handles, pictures and roles only
 *   SHARE       only a post the sender may see; at most five chats; stored as
 *               the post's id and nothing else; each chat's own send decides;
 *               the list's line says "Post" when there is no note
 *   THE CARD    drawn for each reader from what they may see: the title, two
 *               lines, the author, the first picture, the link; "not
 *               available" (and nothing else) for a reader without the space,
 *               or once the post is removed
 *   THE PAGE    the picker's motion is opacity, translate and scale, never the
 *               combined property; the search waits a short pause; the
 *               skeleton is for a first open only; the panel, the bubble and
 *               the post card mount what they should
 *
 * Run with: npx tsx --conditions=react-server tests/community-people-r39.test.ts
 */
import { readCode, readSource } from "./_source"
import { fakeDb } from "./_fake-db"
import { SHARE_TARGETS_MAX, TEAM_MAX, cleanPeopleQuery, postRefsIn, rankSearch, rankSuggestions, sharedPostCard, withoutPostRefs, type SuggestSignals } from "@/lib/communities/chat-people"
import { attachmentLine, pushPreviewText } from "@/lib/communities/chat-rules"
import { searchPeople, sharePostToChats, shareTargets, suggestPeople } from "@/lib/communities/server/chat-people"
import { checkChatMedia } from "@/lib/communities/server/chat-media"
import { conversationOf, listDirectMessages, sendDirectMessage } from "@/lib/communities/server/direct"
import { setPushBridgeDeps } from "@/lib/notifications/push-bridge"

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
const code = (f: string) => readCode(f)

const hex = (n: number) => `00000000-0000-4000-a000-${n.toString(16).padStart(12, "0")}`
const C = hex(1)
const OWNER = hex(2)
const ADMIN = hex(3)
const MOD = hex(4)
const ANA = hex(10)
const BEN = hex(11)
const CLEO = hex(12)
const DAN = hex(13)
const EVE = hex(14)
const FAY = hex(15)
const GUS = hex(16)
const HAL = hex(17)
const IVY = hex(18)
const JO = hex(19)
const TIER = hex(90)
const GENERAL = hex(100)
const PAID = hex(101)
const LOUNGE = hex(102)
const P_ANA = hex(200)
const P_DAN = hex(201)
const P_PAID = hex(202)
const P_GONE = hex(203)
const GROUP = hex(300)
const now = Date.now()
const ago = (min: number) => new Date(now - min * 60_000).toISOString()

async function main() {
  /* ── THE ORDER, PURE ─────────────────────────────────────────────────── */
  console.log("\nSuggested, in order")
  {
    const s: SuggestSignals = {
      me: ANA,
      ownerId: OWNER,
      team: [
        { id: MOD, role: "moderator" },
        { id: ADMIN, role: "admin" },
        { id: hex(5), role: "moderator" },
        { id: hex(6), role: "moderator" },
        { id: hex(7), role: "moderator" },
      ],
      talked: [{ id: BEN, at: ago(60) }],
      commented: [
        { id: CLEO, at: ago(30) },
        { id: CLEO, at: ago(40) },
        { id: DAN, at: ago(50) },
      ],
      liked: [{ id: DAN, at: ago(20) }, { id: FAY, at: ago(10) }],
      top: [
        { id: HAL, points: 50 },
        { id: EVE, points: 900 },
      ],
      active: [{ id: IVY, at: ago(1) }],
    }
    const order = rankSuggestions(s, () => true, 20, now).map((x) => x.id)
    check("the owner first, then admins, then moderators", order[0] === OWNER && order[1] === ADMIN && order[2] === MOD, order)
    check(`  at most ${TEAM_MAX} of the team`, order.filter((id) => [OWNER, ADMIN, MOD, hex(5), hex(6), hex(7)].includes(id)).length === TEAM_MAX)
    const rest = order.slice(TEAM_MAX)
    check("then a conversation, then the most comments, then likes", rest.indexOf(BEN) === 0 && rest.indexOf(CLEO) < rest.indexOf(DAN) && rest.indexOf(DAN) < rest.indexOf(FAY), rest)
    check("then the top contributors by points, then the recently here", rest.indexOf(FAY) < rest.indexOf(EVE) && rest.indexOf(EVE) < rest.indexOf(HAL) && rest.indexOf(HAL) < rest.indexOf(IVY), rest)
    const without = rankSuggestions({ ...s, me: BEN }, (id) => id !== DAN && id !== OWNER, 20, now).map((x) => x.id)
    check("never the member, never anybody the rules refuse (left out, not greyed)", !without.includes(BEN) && !without.includes(DAN) && !without.includes(OWNER) && without[0] === ADMIN)
    check("each once, at most twelve by default", new Set(order).size === order.length && rankSuggestions(s, () => true).length <= 12)
    const from = Object.fromEntries(rankSuggestions(s, () => true, 20, now).map((x) => [x.id, x.from]))
    check("each says where it came from", from[OWNER] === "team" && from[BEN] === "talked" && from[CLEO] === "commented" && from[FAY] === "liked" && from[EVE] === "top" && from[IVY] === "active", from)
  }

  console.log("\nThe search's words and order")
  {
    check("a leading @, control characters and extra spaces go; 60 characters", cleanPeopleQuery("  @@ana\u0000  ruiz ") === "ana ruiz" && cleanPeopleQuery("x".repeat(90)).length === 60 && cleanPeopleQuery(5) === "")
    const people = [
      { name: "Benedict Cole", username: "bcole", role: "member" },
      { name: "Abe Bennett", username: "ben", role: "member" },
      { name: "Ben Okafor", username: "okafor", role: "member" },
      { name: "Ruben Diaz", username: "ruben", role: "admin" },
      { name: "Ben Admin", username: "benadmin", role: "admin" },
    ]
    const ranked = rankSearch("ben", people).map((p) => p.name)
    check("the exact handle, then a name from its first letter (the team first on a tie), then a word of the name, then the rest", ranked.join("|") === "Abe Bennett|Ben Admin|Benedict Cole|Ben Okafor|Ruben Diaz", ranked)
  }

  console.log("\nA post in a message, pure")
  {
    const raw = [{ type: "image", url: "https://x.supabase.co/a.jpg" }, { type: "post", postId: P_DAN.toUpperCase() }, { type: "post", postId: "nope" }]
    check("the post ids a message names (well formed ones, lower case)", postRefsIn(raw).join() === P_DAN && postRefsIn(null).length === 0)
    check("without its post, the rest goes through the pictures' own checks", JSON.stringify(withoutPostRefs(raw)) === JSON.stringify([raw[0]]))
    const gone = sharedPostCard({ postId: P_DAN, visible: false, title: "Secret", bodyText: "words", image: "https://x/y.jpg", author: { name: "Dan", avatarUrl: null }, href: "/x", space: "Paid" })
    check("a reader who may not see it: the id and not available, nothing else", JSON.stringify(gone) === JSON.stringify({ postId: P_DAN, available: false }))
    const card = sharedPostCard({ postId: P_DAN, visible: true, title: "  Dovetail  jig ", bodyText: `${"word ".repeat(60)}end`, image: null, author: { name: "Dan", avatarUrl: null }, href: "/community/club/post/x", space: "General" })
    check("a reader who may: its title, two lines of it (160 characters), the author, the link", card.available && card.title === "Dovetail jig" && card.excerpt.length <= 160 && card.excerpt.endsWith("…") && card.author?.name === "Dan" && card.href === "/community/club/post/x")
    check("the list's line and a phone's banner say Post when there is no note", attachmentLine([{ type: "post" }]) === "Post" && pushPreviewText(true, "", [{ type: "post" }]) === "Post" && attachmentLine([{ type: "image" }, { type: "post" }]) === "Photo" && attachmentLine([{ type: "link" }]) === "Link")
  }

  /* ── THROUGH THE SERVER ─────────────────────────────────────────────── */
  setPushBridgeDeps({ sender: async () => undefined, communitiesOn: async () => true, defer: (task) => task() })
  const member = (id: number, user: string, extra: Record<string, unknown> = {}) => ({ id: hex(1000 + id), community_id: C, user_id: user, role: "member", status: "active", banned_at: null, level: 1, points: 0, joined_at: "2026-01-01T00:00:00Z", chat_dms: "everyone", last_seen_at: null, ...extra })
  const profile = (id: string, name: string, username: string) => ({ id, display_name: name, username, avatar_url: null, email: `${username}@example.com` })
  const seed = () =>
    fakeDb(
      {
        communities: [{ id: C, slug: "club", name: "Club", chat_enabled: true, directory_enabled: false, owner_user_id: OWNER, deleted_at: null, suspended_at: null, status: "published" }],
        community_members: [
          member(1, OWNER, { role: "owner", points: 50 }),
          member(2, ADMIN, { role: "admin" }),
          member(3, MOD, { role: "moderator" }),
          member(10, ANA),
          member(11, BEN, { points: 300, last_seen_at: ago(120) }),
          member(12, CLEO),
          member(13, DAN),
          member(14, EVE, { points: 900, tier_id: TIER }),
          member(15, FAY, { last_seen_at: ago(1) }),
          member(16, GUS, { points: 400 }),
          member(17, HAL, { points: 500, chat_dms: "nobody" }),
          member(18, IVY, { points: 700, banned_at: ago(600) }),
          member(19, JO, { status: "left" }),
        ],
        profiles: [
          profile(OWNER, "Olivia Hart", "olivia"),
          profile(ADMIN, "Ada Stone", "ada"),
          profile(MOD, "Milo Grant", "milo"),
          profile(ANA, "Ana Ruiz", "ana"),
          profile(BEN, "Ben Okafor", "ben"),
          profile(CLEO, "Cleo Park", "cleo"),
          profile(DAN, "Dan Wu", "dan"),
          profile(EVE, "Eve Laine", "eve"),
          profile(FAY, "Fay Moss", "fay"),
          profile(GUS, "Gus Bell", "gus"),
          profile(HAL, "Hal Reed", "hal"),
          profile(IVY, "Ivy Cho", "ivy"),
          profile(JO, "Jo Marsh", "jo"),
        ],
        community_chat_settings: [{ community_id: C, dm_policy: "everyone", groups_policy: "members", attachments_enabled: true, push_previews: true, rules: "", rules_version: 0, dm_min_level: 2, dm_min_days: 7, dm_to_staff: true, chat_tab: true, main_space_id: null }],
        community_spaces: [
          { id: GENERAL, community_id: C, slug: "general", name: "General", kind: "feed", position: 0, view_access: {}, post_role: "member", comments_enabled: true, archived_at: null, created_at: ago(9000) },
          { id: PAID, community_id: C, slug: "inner", name: "Inner circle", kind: "feed", position: 1, view_access: { tierIds: [TIER] }, post_role: "member", comments_enabled: true, archived_at: null, created_at: ago(9000) },
          { id: LOUNGE, community_id: C, slug: "lounge", name: "lounge", kind: "chat", position: 2, view_access: {}, post_role: "member", comments_enabled: true, archived_at: null, created_at: ago(9000), post_min_level: 0 },
        ],
        community_feed_posts: [
          { id: P_ANA, community_id: C, space_id: GENERAL, author_id: ANA, title: "My bench", body: "", body_text: "Built a bench.", media: [], status: "published", created_at: ago(500) },
          { id: P_DAN, community_id: C, space_id: GENERAL, author_id: DAN, title: "Dovetail jig", body: "", body_text: "How I cut the tails with a cheap dozuki, step by step.", media: [{ type: "image", url: "https://placeholder.supabase.co/storage/v1/object/public/community/jig.jpg" }], status: "published", created_at: ago(400) },
          { id: P_PAID, community_id: C, space_id: PAID, author_id: OWNER, title: "Members only plan", body: "", body_text: "The secret schedule for next month.", media: [], status: "published", created_at: ago(300) },
          { id: P_GONE, community_id: C, space_id: GENERAL, author_id: DAN, title: "Old news", body: "", body_text: "Removed.", media: [], status: "removed", created_at: ago(300) },
        ],
        community_feed_comments: [
          { id: hex(400), post_id: P_ANA, community_id: C, author_id: CLEO, body: "Nice", status: "published", created_at: ago(30) },
          { id: hex(401), post_id: P_ANA, community_id: C, author_id: CLEO, body: "Wood?", status: "published", created_at: ago(29) },
          { id: hex(402), post_id: P_ANA, community_id: C, author_id: GUS, body: "Meh", status: "published", created_at: ago(28) },
          { id: hex(403), post_id: P_ANA, community_id: C, author_id: JO, body: "Hi", status: "published", created_at: ago(27) },
          { id: hex(404), post_id: P_ANA, community_id: C, author_id: IVY, body: "Buy now", status: "published", created_at: ago(26) },
        ],
        community_reactions: [{ id: hex(500), community_id: C, target_type: "post", target_id: P_DAN, user_id: ANA, kind: "like", created_at: ago(20) }],
        community_conversations: [{ id: hex(600), community_id: C, user_a: ANA, user_b: BEN, started_by: BEN, last_message_at: ago(60), last_author_id: BEN, last_body: "Hey", a_read_at: ago(59), b_read_at: ago(60), created_at: ago(70) }],
        community_direct_messages: [],
        community_member_blocks: [{ user_id: ANA, blocked_id: GUS }],
        community_chat_groups: [{ id: GROUP, community_id: C, name: "Makers", created_by: ANA, archived_at: null, last_message_at: ago(90), last_author_id: ANA, last_body: "x", created_at: ago(100), updated_at: ago(90) }],
        community_chat_group_members: [
          { group_id: GROUP, user_id: ANA, community_id: C, role: "owner", last_read_at: ago(90), joined_at: ago(100) },
          { group_id: GROUP, user_id: BEN, community_id: C, role: "member", last_read_at: ago(90), joined_at: ago(100) },
        ],
        community_chat_group_messages: [],
        community_messages: [],
        community_space_reads: [],
        community_chat_prefs: [],
        community_levels: [],
        creators: [],
        rate_limit_hits: [],
      },
    )
  const viewer = (id: string, extra: Record<string, unknown> = {}) =>
    ({ userId: id, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, perms: null, member: { level: 1, joined_at: "2026-01-01T00:00:00Z" }, ...extra }) as never
  const OWNER_V = viewer(OWNER, { role: "owner", isOwner: true })

  console.log("\nSuggested, from the member's own rows")
  {
    const db = seed()
    const community = (db.tables.communities as unknown[])[0] as never
    const people = await suggestPeople(db as never, community, viewer(ANA))
    const ids = people.map((p) => p.id)
    const name = (id: string) => people.find((p) => p.id === id)?.name ?? id
    check("the owner, the admin, the moderator, in that order, first", ids[0] === OWNER && ids[1] === ADMIN && ids[2] === MOD, ids.map(name))
    check("then the conversation, the commenter, the author of a liked post", ids.indexOf(BEN) === 3 && ids.indexOf(CLEO) === 4 && ids.indexOf(DAN) === 5, ids.map(name))
    check("then the top contributor and the recently here", ids.indexOf(EVE) > ids.indexOf(DAN) && ids.indexOf(FAY) > ids.indexOf(EVE), ids.map(name))
    check("never the member, the blocked, the banned, the gone, or who takes no messages", ![ANA, GUS, IVY, JO, HAL].some((id) => ids.includes(id)), ids.map(name))
    check("the owner is Owner whatever their row says; every suggestion can be pressed", people[0].role === "owner" && people.every((p) => p.can && p.why === null))
    const fay = people.find((p) => p.id === FAY)
    const ben = people.find((p) => p.id === BEN)
    check("online from the heartbeat (seen in the last five minutes)", fay?.online === true && ben?.online === false)
    check("names, handles, pictures and roles only: never an email", people.every((p) => Object.keys(p).sort().join() === "avatarUrl,can,from,id,name,online,role,username,why") && !JSON.stringify(people).includes("@example.com"))
    ;(db.tables.community_member_blocks as Record<string, unknown>[]).push({ user_id: BEN, blocked_id: ANA })
    const after = (await suggestPeople(db as never, community, viewer(ANA))).map((p) => p.id)
    check("a block the other way leaves them out too", !after.includes(BEN))

    ;(db.tables.community_chat_settings as Record<string, unknown>[])[0].dm_policy = "staff"
    const staff = (await suggestPeople(db as never, community, viewer(ANA))).map((p) => p.id)
    check("the team only rule: the team, nobody else (a reply to an existing conversation aside)", staff.slice(0, 3).join() === [OWNER, ADMIN, MOD].join() && !staff.some((id) => [CLEO, DAN, EVE, FAY].includes(id)), staff.map(name))
    ;(db.tables.community_chat_settings as Record<string, unknown>[])[0].dm_policy = "off"
    check("messages off: nobody suggested", (await suggestPeople(db as never, community, viewer(ANA))).length === 0)
  }

  console.log("\nThe search")
  {
    const db = seed()
    const community = (db.tables.communities as unknown[])[0] as never
    const ben = await searchPeople(db as never, community, viewer(ANA), "@ben")
    check("an @handle finds them, first", ben[0]?.id === BEN && ben[0].can, ben.map((p) => p.name))
    check("the member never finds themself", (await searchPeople(db as never, community, viewer(ANA), "ana")).every((p) => p.id !== ANA))
    check("blocked, banned and gone people never come back", (await searchPeople(db as never, community, viewer(ANA), "gus")).length === 0 && (await searchPeople(db as never, community, viewer(ANA), "ivy")).length === 0 && (await searchPeople(db as never, community, viewer(ANA), "jo")).length === 0)
    const hal = await searchPeople(db as never, community, viewer(ANA), "hal")
    check("somebody who takes no messages is found, greyed, with the reason", hal.length === 1 && !hal[0].can && hal[0].why === "Not taking messages", hal)
    check("an existing conversation always opens, whatever the rule says now", await (async () => {
      ;(db.tables.community_chat_settings as Record<string, unknown>[])[0].dm_policy = "staff"
      const r = await searchPeople(db as never, community, viewer(ANA), "ben")
      const c = await searchPeople(db as never, community, viewer(ANA), "cleo")
      ;(db.tables.community_chat_settings as Record<string, unknown>[])[0].dm_policy = "everyone"
      return r[0]?.can === true && c[0]?.can === false && c[0]?.why === "Only the team can message members here"
    })())
    check("nothing typed is no search", (await searchPeople(db as never, community, viewer(ANA), "  @ ")).length === 0)
    check("works with the member list switched off (as @ mentions do), and answers no email", !JSON.stringify(ben).includes("@example.com"))
    const route = code("app/api/community/[communityId]/chat/people/route.ts")
    check("the route: a member of this community first, then the rate limit, then the search", route.indexOf('requireMember(db, communityId, await sessionUserId(), "view")') > 0 && route.indexOf('chatLimit(gate, "chatPeople")') > route.indexOf("requireMember(") && route.indexOf("searchPeople(") > route.indexOf('chatLimit(gate, "chatPeople")'))
  }

  console.log("\nSending a post")
  {
    const db = seed()
    const community = (db.tables.communities as unknown[])[0] as never
    const T = db.tables as Record<string, Record<string, unknown>[]>
    const secret = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_PAID, targets: [{ kind: "person", id: BEN }] })
    check("a post in a space the sender cannot open is refused, and nothing is written", "error" in secret && secret.status === 404 && T.community_direct_messages.length === 0)
    const removed = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_GONE, targets: [{ kind: "person", id: BEN }] })
    check("so is a removed post", "error" in removed && removed.status === 404)
    const many = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, targets: Array.from({ length: SHARE_TARGETS_MAX + 1 }, (_, i) => ({ kind: "person", id: hex(700 + i) })) })
    check(`at most ${SHARE_TARGETS_MAX} chats at once`, "error" in many && many.status === 400 && /up to 5/i.test(many.error))
    check("an unknown kind or a bad id is refused", "error" in (await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, targets: [{ kind: "email", id: BEN }] })) && "error" in (await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, targets: [{ kind: "dm", id: "x" }] })))

    const sent = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, note: "Look at this", clientId: "share-0001-abcdef", targets: [{ kind: "person", id: BEN }, { kind: "space", id: LOUNGE }, { kind: "group", id: GROUP }] })
    check("to a person, a channel and a group: each sent", "value" in sent && sent.value.results.every((r) => r.ok) && sent.value.results.length === 3, sent)
    const dm = T.community_direct_messages[0]
    check("stored as the post's id and nothing else (no title, words or picture in the row realtime carries)", JSON.stringify(dm?.attachments) === JSON.stringify([{ type: "post", postId: P_DAN }]) && dm?.body === "Look at this" && !JSON.stringify(dm).includes("Dovetail"))
    check("into the existing conversation, its line the note", dm?.conversation_id === hex(600) && T.community_conversations.find((c) => c.id === hex(600))?.last_body === "Look at this")
    check("the channel's and the group's own sends wrote theirs", T.community_messages.length === 1 && T.community_messages[0].space_id === LOUNGE && T.community_chat_group_messages.some((m) => m.group_id === GROUP && JSON.stringify(m.attachments).includes(P_DAN)))
    const again = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, note: "Look at this", clientId: "share-0001-abcdef", targets: [{ kind: "person", id: BEN }] })
    check("the same send retried is one message", "value" in again && T.community_direct_messages.length === 1)

    const fresh = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, targets: [{ kind: "person", id: CLEO }] })
    const cleoChat = T.community_conversations.find((c) => (c.user_a === CLEO || c.user_b === CLEO) && (c.user_a === ANA || c.user_b === ANA))
    check("to somebody new: their conversation is made, and its line says Post", "value" in fresh && fresh.value.results[0].ok && cleoChat?.last_body === "Post")
    const nobody = await sharePostToChats(db as never, community, viewer(ANA), { postId: P_DAN, targets: [{ kind: "person", id: HAL }, { kind: "person", id: EVE }] })
    check("a chat that refuses says why and the rest still go", "value" in nobody && !nobody.value.results[0].ok && /not taking messages/i.test(nobody.value.results[0].error ?? "") && nobody.value.results[1].ok, nobody)
    const notIn = await sharePostToChats(db as never, community, viewer(CLEO), { postId: P_DAN, targets: [{ kind: "group", id: GROUP }] })
    check("a group the sender is not in is not reached", "value" in notIn && !notIn.value.results[0].ok && !T.community_chat_group_messages.some((m) => m.author_id === CLEO))

    const conversation = (await conversationOf(db as never, community, viewer(ANA), hex(600)))!
    const direct = await sendDirectMessage(db as never, community, viewer(ANA), conversation, { body: "", attachments: [{ type: "post", postId: P_PAID }] })
    check("the chat box's own send checks a post the same way (a member cannot attach what they cannot see)", "error" in direct && direct.status === 404)
    const two = await sendDirectMessage(db as never, community, viewer(ANA), conversation, { body: "", attachments: [{ type: "post", postId: P_DAN }, { type: "post", postId: P_ANA }] })
    check("one post per message", "error" in two && /One post per message/.test(two.error))
    const media = await checkChatMedia(db as never, community, viewer(ANA), [{ type: "post", postId: P_DAN }], { attachmentsEnabled: false })
    check("a post is not an upload: pictures and files switched off do not refuse it", "value" in media && media.value.length === 0)

    console.log("\nThe card, for each reader")
    /* The column defaults a real table fills in (the in-memory one does not). */
    const defaults = () => {
      for (const t of ["community_direct_messages", "community_messages", "community_chat_group_messages"]) for (const r of T[t]) r.status ??= "published"
    }
    defaults()
    const benView = viewer(BEN)
    const benConvo = (await conversationOf(db as never, community, benView, hex(600)))!
    const read = await listDirectMessages(db as never, benConvo, benView, {})
    const m = read.messages.find((x) => x.body === "Look at this")
    const card = m?.post
    check("the recipient who may see it: title, two lines, the author, the first picture, the link", !!card && card.available && card.title === "Dovetail jig" && /dozuki/.test(card.excerpt) && card.author?.name === "Dan Wu" && /jig\.jpg$/.test(card.image ?? "") && card.href.startsWith("/community/club/post/dovetail-jig-") && card.space === "General", card)
    check("  and the message's own attachments are its pictures and files, the post apart", m?.attachments.length === 0)

    /* The owner sends the members only post to Ben (no tier) and to Eve (the tier). */
    const ownerShare = await sharePostToChats(db as never, community, OWNER_V, { postId: P_PAID, note: "", targets: [{ kind: "person", id: BEN }, { kind: "person", id: EVE }] })
    check("the owner may send a members only post", "value" in ownerShare && ownerShare.value.results.every((r) => r.ok), ownerShare)
    defaults()
    const ownerBen = T.community_conversations.find((c) => [c.user_a, c.user_b].includes(OWNER) && [c.user_a, c.user_b].includes(BEN))!
    const benRead = await listDirectMessages(db as never, (await conversationOf(db as never, community, benView, String(ownerBen.id)))!, benView, {})
    const hidden = benRead.messages.find((x) => x.post)
    check("a reader without the space: not available, and not a word of it in the answer", JSON.stringify(hidden?.post) === JSON.stringify({ postId: P_PAID, available: false }) && !JSON.stringify(benRead).includes("Members only") && !JSON.stringify(benRead).includes("secret schedule"), hidden?.post)
    const eveV = viewer(EVE, { tierId: TIER })
    const ownerEve = T.community_conversations.find((c) => [c.user_a, c.user_b].includes(OWNER) && [c.user_a, c.user_b].includes(EVE))!
    const eveRead = await listDirectMessages(db as never, (await conversationOf(db as never, community, eveV, String(ownerEve.id)))!, eveV, {})
    check("a reader with the space's plan reads the card", eveRead.messages.find((x) => x.post)?.post?.available === true)

    T.community_feed_posts.find((p) => p.id === P_DAN)!.status = "removed"
    const later = await listDirectMessages(db as never, benConvo, benView, {})
    check("once the post is removed, every reader's card says not available", later.messages.filter((x) => x.post).every((x) => x.post?.available === false) && !JSON.stringify(later).includes("Dovetail"))

    const targets = await shareTargets(db as never, community, viewer(ANA))
    check("where a post may go: the latest conversations and groups, then the channels the member may post in", targets.ready && targets.chats.some((c) => c.kind === "dm" && c.personId === BEN) && targets.chats.some((c) => c.kind === "group" && c.id === GROUP) && targets.chats[targets.chats.length - 1].kind === "space" && targets.chats.filter((c) => c.kind === "space").map((c) => c.id).join() === LOUNGE)
    ;(T.community_spaces.find((s) => s.id === LOUNGE) as Record<string, unknown>).post_role = "moderator"
    check("a channel only the team posts in is not offered to a member", !(await shareTargets(db as never, community, viewer(ANA))).chats.some((c) => c.kind === "space"))

    const share = code("app/api/community/[communityId]/chat/share/route.ts")
    check("the route: a member who may chat, the share's rate limit, and a new conversation counted as one opened", /requireMember\(db, communityId, await sessionUserId\(\), "chat"\)/.test(share) && /chatLimit\(gate, "chatShare"\)/.test(share) && /chatLimit\(gate, "dmOpen"\)/.test(share))
  }

  console.log("\nThe page")
  {
    const shell = code("components/community/member/picker-shell.tsx")
    check("the picker moves by opacity, translate and scale only, from a committed closed frame", /transition-\[translate\]/.test(shell) && /transition-\[opacity,scale,translate\]/.test(shell) && !/transition-transform|transition-\[transform|transition-all/.test(shell) && /getBoundingClientRect\(\)\s*\n\s*setOn\(true\)/.test(shell))
    check("a sheet on a phone sized to what the keyboard leaves; Escape closes only the picker", /top-\[var\(--vv-top,0px\)\][^"]*h-\[var\(--vv-h,100dvh\)\]/.test(shell) && /e\.stopPropagation\(\)\s*\n\s*onClose\(\)/.test(shell))
    const picker = code("components/community/member/people-picker.tsx")
    const pause = Number(/export const SEARCH_PAUSE_MS = (\d+)/.exec(picker)?.[1])
    check("the search: narrowed at once, the server after a short pause, answers kept per word", pause > 0 && pause <= 200 && /else if \(term\) setPeople\(narrowed\(communityId, term\)\)/.test(picker) && /ANSWERS\.set\(keyOf\(communityId, term\)/.test(picker))
    check("the skeleton only before the first Suggested list ever came back; a row is always 56px", /people === null \? \(/.test(picker) && /<SkeletonRows \/>/.test(picker) && /flex h-14 w-full/.test(picker))
    check("focused as it opens; up, down and Enter over the rows", /input\.current\?\.focus\(\{ preventScroll: true \}\)/.test(picker) && /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(picker) && /aria-activedescendant/.test(picker))
    const messages = code("components/community/member/messages.tsx")
    check("the panel: New message opens the picker over the list; its Suggested list is asked for as the panel opens", /onNew=\{\(\) => setPicking\(true\)\}/.test(messages) && /warmPeople\(communityId\)/.test(messages) && /<NewMessagePicker/.test(messages) && !/function NewMessage\(/.test(messages))
    const surface = code("components/community/member/chat-surface.tsx")
    check("a bubble draws its post's card, and redraws when the card changes", /\{m\.post \? <ChatPostCard post=\{m\.post\} mine=\{mine\} \/> : null\}/.test(surface) && /JSON\.stringify\(old\.post \?\? null\) === JSON\.stringify\(m\.post \?\? null\)/.test(surface))
    const card = code("components/community/member/post-card.tsx")
    check("a post's share menu and its dots offer Send in a message, built on its first press", /label: "Send in a message"/.test(card) && /lazy\(\(\) => import\("\.\/share-to-chat"\)/.test(card) && /items=\{shareItems\}/.test(card) && /if \(canSend\) items\.push\(sendItem\)/.test(card))
    const files = ["lib/communities/chat-people.ts", "lib/communities/server/chat-people.ts", "lib/communities/server/chat-post.ts", "components/community/member/people-picker.tsx", "components/community/member/picker-shell.tsx", "components/community/member/share-to-chat.tsx", "components/community/member/chat-post-card.tsx", "app/api/community/[communityId]/chat/people/route.ts", "app/api/community/[communityId]/chat/share/route.ts"]
    const words = files.filter((f) => /—/.test(readSource(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(readSource(f)))
    check("copy: no em dash, no banned word", words.length === 0, words)
    const clients = ["components/community/member/people-picker.tsx", "components/community/member/picker-shell.tsx", "components/community/member/share-to-chat.tsx", "components/community/member/chat-post-card.tsx"]
    check("the client parts import nothing from the server", clients.every((f) => !/lib\/communities\/server|server-only/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
