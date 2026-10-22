/**
 * ===========================================================================
 *  COMMUNITY CHAT, ROUND 38
 * ===========================================================================
 * Held from their inputs, and through the real server code on an in-memory
 * database (tests/_fake-db.ts):
 *
 *   WHO MAY MESSAGE   who may start a conversation: everyone, from a points
 *                     level, after some days, the team only (with or without
 *                     members writing to the team), off; answering is not
 *                     starting; blocks and the recipient's own choice still
 *                     hold; the profile's button and the list's reasons
 *   CHANNELS          who can post (everyone, from a level, the team only),
 *                     the note a member reads, the server refusing a level
 *                     not reached; the Chat tab, its main channel, its chips
 *   AUTOMATIONS       what an admin may save; {first_name} and {community};
 *                     which events start which automation; a level up
 *                     crossing levels; the days window never reaching back
 *                     before the automation was made
 *   ONCE              the same event twice is one delivery; a drain run
 *                     twice is one message; a delivery whose message was
 *                     written before it was marked is marked, not written
 *                     again; a paused automation sends nothing
 *   BATCHES           a broadcast to 400 members: at most 150 for one
 *                     community in a run, every member once, done at the end
 *   ADMINS            the routes: the team reads, manage_settings writes,
 *                     every write rate limited
 *   SQL               part 272: idempotent, RLS on, nothing for members, the
 *                     unique keys, its migration byte for byte, a README row
 *                     and a check column
 *
 * Run with: npx tsx --conditions=react-server tests/community-chat-r38.test.ts
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { fakeDb } from "./_fake-db"
import {
  DEFAULT_CHAT_SETTINGS,
  channelPostColumns,
  channelPostNote,
  channelPostOf,
  chatSettingsOf,
  chatSettingsPatch,
  chatTabChannels,
  chatTabOf,
  cleanClientId,
  daysSince,
  dmButtonReason,
  dmDecision,
  dmStartDecision,
  levelLetsPost,
} from "@/lib/communities/chat-rules"
import {
  AUTOMATION_TRIGGERS,
  DELIVERIES_PER_COMMUNITY_RUN,
  automationInput,
  automationsFor,
  broadcastFinished,
  daysWindow,
  deliveryClientId,
  inSegment,
  levelsCrossed,
  renderAutomation,
  takeBatch,
} from "@/lib/communities/chat-automations"
import { automationsOnEvent, createAutomation, changeAutomation, drainDeliveries, runChatAutomations } from "@/lib/communities/server/chat-automations"
import { openConversation } from "@/lib/communities/server/direct"
import { setPushBridgeDeps } from "@/lib/notifications/push-bridge"
import { navEntries } from "@/components/community/member/nav"
import { placeTab } from "@/lib/communities/client/places"
import { SETTINGS_TABS, settingsTabOf } from "@/components/community/creator/logic"

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => readCode(f)

const hex = (n: number) => `00000000-0000-4000-a000-${n.toString(16).padStart(12, "0")}`
const C = hex(1)
const OWNER = hex(2)
const ADMIN = hex(3)
const ANA = hex(10)
const BEN = hex(11)
const now = Date.parse("2026-10-22T12:00:00Z")
const DAY = 86_400_000

async function main() {
  /* ── WHO MAY MESSAGE ─────────────────────────────────────────────────── */
  console.log("\nWho may start a conversation")
  {
    const d = (o: Partial<Parameters<typeof dmDecision>[0]>) => dmDecision({ policy: "everyone", senderId: ANA, senderRole: "member", recipientId: BEN, recipientRole: "member", recipientDms: "everyone", blocked: false, now, ...o })
    check("everyone: any member, as before", d({}).ok)
    check("from level 3: a level 2 member is refused, with the level in the words", !d({ policy: "level", minLevel: 3, senderLevel: 2 }).ok && /level 3/.test((d({ policy: "level", minLevel: 3, senderLevel: 2 }) as { error: string }).error))
    check("  level 3 and up may", d({ policy: "level", minLevel: 3, senderLevel: 3 }).ok && d({ policy: "level", minLevel: 3, senderLevel: 9 }).ok)
    check("after 7 days: a member here 6 days is refused, 7 days may", !d({ policy: "days", minDays: 7, senderJoinedAt: new Date(now - 6 * DAY).toISOString() }).ok && d({ policy: "days", minDays: 7, senderJoinedAt: new Date(now - 7 * DAY - 1000).toISOString() }).ok)
    check("answering a conversation the other started is not starting: level and days do not hold it back", d({ policy: "level", minLevel: 5, senderLevel: 1, replying: true }).ok && d({ policy: "days", minDays: 30, senderJoinedAt: new Date(now).toISOString(), replying: true }).ok)
    check("members write to the team whatever the threshold, unless the admins said no", d({ policy: "level", minLevel: 5, senderLevel: 1, recipientRole: "admin" }).ok && !d({ policy: "level", minLevel: 5, senderLevel: 1, recipientRole: "admin", toStaff: false }).ok)
    check("  and answering the team is still fine when they said no", d({ policy: "staff", recipientRole: "moderator", toStaff: false, replying: true }).ok)
    check("the team only: members never start one with each other; with toStaff off, not with the team either", !d({ policy: "staff" }).ok && d({ policy: "staff", recipientRole: "owner" }).ok && !d({ policy: "staff", recipientRole: "owner", toStaff: false }).ok)
    check("the team reaches anyone while messages are on, never when off", d({ policy: "level", minLevel: 50, senderRole: "moderator", senderLevel: 1 }).ok && d({ senderRole: "admin", recipientDms: "nobody" }).ok && !d({ policy: "off", senderRole: "owner" }).ok)
    check("a block either way and the recipient's own choice still hold", !d({ blocked: true }).ok && !d({ policy: "level", minLevel: 2, senderLevel: 4, recipientDms: "nobody" }).ok && !d({ policy: "days", minDays: 1, senderJoinedAt: "2026-01-01T00:00:00Z", recipientDms: "staff" }).ok)
    check("whole days since joining", daysSince(new Date(now - 3 * DAY - 5).toISOString(), now) === 3 && daysSince(null, now) === 0)
    const view = { policy: "level" as const, minLevel: 3, minDays: 7, toStaff: true, myRole: "member", myLevel: 1, myJoinedAt: null }
    check("the members list: greyed with a short reason for a member, open for the team's rows", dmButtonReason(view, "member", now) === "Messages open at level 3" && dmButtonReason(view, "admin", now) === null && dmButtonReason({ ...view, myRole: "admin" }, "member", now) === null)
    check("  the sender's half is the decision's own (one rule, two places)", "error" in dmStartDecision({ policy: "days", senderRole: "member", recipientRole: "member", senderJoinedAt: new Date(now).toISOString(), minDays: 2, now }))
  }

  console.log("\nChat settings (part 272)")
  {
    check("defaults: everyone, level 2, 7 days, members reach the team, the Chat tab on, no main channel", DEFAULT_CHAT_SETTINGS.dmPolicy === "everyone" && DEFAULT_CHAT_SETTINGS.dmMinLevel === 2 && DEFAULT_CHAT_SETTINGS.dmMinDays === 7 && DEFAULT_CHAT_SETTINGS.dmToStaff && DEFAULT_CHAT_SETTINGS.chatTab && DEFAULT_CHAT_SETTINGS.mainSpaceId === null)
    check("a stored row is read with every value checked", chatSettingsOf({ dm_policy: "days", dm_min_days: 400, dm_min_level: 5, dm_to_staff: false, chat_tab: false, main_space_id: "nope" }).dmMinDays === 7 && chatSettingsOf({ dm_policy: "days" }).dmPolicy === "days" && chatSettingsOf({ dm_min_level: 5 }).dmMinLevel === 5 && chatSettingsOf({ chat_tab: false }).chatTab === false && chatSettingsOf({ main_space_id: "nope" }).mainSpaceId === null)
    const p = chatSettingsPatch({ dmPolicy: "level", dmMinLevel: 4, dmToStaff: false }, DEFAULT_CHAT_SETTINGS)
    check("level and its number saved; part 272's columns sent with it", "next" in p && p.next.dmPolicy === "level" && p.next.dmMinLevel === 4 && !!p.extra && p.extra.dm_min_level === 4 && p.extra.dm_to_staff === false)
    const old = chatSettingsPatch({ groupsPolicy: "staff" }, DEFAULT_CHAT_SETTINGS)
    check("a change that is only part 270's sends none of 272's columns (saves before the part ran)", "next" in old && old.extra === null)
    check("out of range or the wrong kind is refused", "error" in chatSettingsPatch({ dmMinLevel: 0 }, DEFAULT_CHAT_SETTINGS) && "error" in chatSettingsPatch({ dmMinDays: 366 }, DEFAULT_CHAT_SETTINGS) && "error" in chatSettingsPatch({ chatTab: "yes" }, DEFAULT_CHAT_SETTINGS) && "error" in chatSettingsPatch({ mainSpaceId: "general" }, DEFAULT_CHAT_SETTINGS) && "error" in chatSettingsPatch({ dmPolicy: "friends" }, DEFAULT_CHAT_SETTINGS))
    const settings = code("lib/communities/server/chat-settings.ts")
    check("the server reads part 272's columns, and falls back to 270's before it ran; saving them first needs the part", /SETTINGS_272 = `\$\{SETTINGS_270\}, dm_min_level, dm_min_days, dm_to_staff, chat_tab, main_space_id`/.test(settings) && /if \(patch\.extra && !current\.ready272\) return \{ ok: false/.test(settings))
  }

  console.log("\nWho can post in a channel")
  {
    check("stored as post_role and post_min_level, read back as the admin's pick", channelPostOf("moderator", 0).post === "team" && channelPostOf("member", 4).post === "level" && channelPostOf("member", 4).minLevel === 4 && channelPostOf("member", 0).post === "everyone" && channelPostOf(null, 1).post === "everyone")
    const team = channelPostColumns({ post: "team" })
    const lvl = channelPostColumns({ post: "level", minLevel: 3 })
    check("an announcements channel is the team only; a level writes its number", "columns" in team && team.columns.post_role === "moderator" && "columns" in lvl && lvl.columns.post_min_level === 3 && lvl.columns.post_role === "member" && "error" in channelPostColumns({ post: "level", minLevel: 1 }) && "error" in channelPostColumns({ post: "admins" }))
    check("the team always posts; a member needs the level", levelLetsPost("moderator", 1, 9) && !levelLetsPost("member", 2, 3) && levelLetsPost("member", 3, 3) && levelLetsPost("member", 1, 0))
    check("the note a member reads instead of the box", channelPostNote({ post: "team", minLevel: 0 }, "member", 1) === "Only the team posts in this channel." && /level 3/.test(channelPostNote({ post: "level", minLevel: 3 }, "member", 2) ?? "") && channelPostNote({ post: "level", minLevel: 3 }, "member", 3) === null && channelPostNote({ post: "team", minLevel: 0 }, "admin", 1) === null)
    const chat = code("lib/communities/server/chat.ts")
    const post = chat.slice(chat.indexOf("export async function postMessage"), chat.indexOf("async function tellAboutMessage"))
    check("the server refuses a member under the channel's level before anything is written", post.indexOf("levelLetsPost(viewer.role") > 0 && post.indexOf("levelLetsPost(") < post.indexOf(".insert("))
    const places = code("lib/communities/server/places.ts")
    check("the channel's first screen carries its pinned message and the member's post note", /intro: \{ \.\.\.intro, pinned, postNote \}/.test(places) && /\|\| !!postNote/.test(places))
  }

  console.log("\nThe Chat tab")
  {
    const spaces = [
      { id: hex(101), slug: "general", kind: "feed" },
      { id: hex(102), slug: "lounge", kind: "chat" },
      { id: hex(103), slug: "news", kind: "chat" },
    ]
    check("the main channel when the member can read it, else the first; none when the admins turned the tab off", chatTabOf(spaces, { chatTab: true, mainSpaceId: hex(103) })?.slug === "news" && chatTabOf(spaces, { chatTab: true, mainSpaceId: hex(999) })?.slug === "lounge" && chatTabOf(spaces, { chatTab: false, mainSpaceId: null }) === null && chatTabOf(spaces.slice(0, 1), { chatTab: true, mainSpaceId: null }) === null)
    check("its chips: the chat channels only, the main one first", chatTabChannels(spaces, "news").map((s) => s.slug).join() === "news,lounge")
    const entries = navEntries({ slug: "club", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true, chatEnabled: true, chatTab: { slug: "news" } }, false)
    check("Chat sits right after Community and opens the main channel", entries.map((e) => e.key).join() === "home,chat,classroom,events,members,leaderboard,about" && entries[1].label === "Chat" && entries[1].href === "/community/club/space/news")
    check("no tab when chat is off or there is no tab", !navEntries({ slug: "club", classroomEnabled: false, eventsEnabled: false, directoryEnabled: true, gamificationEnabled: false, chatEnabled: false, chatTab: { slug: "news" } }, false).some((e) => e.key === "chat") && !navEntries({ slug: "club", classroomEnabled: false, eventsEnabled: false, directoryEnabled: true, gamificationEnabled: false }, false).some((e) => e.key === "chat"))
    const chats = new Set(["lounge", "news"])
    check("a chat channel lights Chat; a feed space stays Community; without the tab nothing changes", placeTab({ kind: "space", slug: "news" }, chats) === "chat" && placeTab({ kind: "space", slug: "general" }, chats) === "home" && placeTab({ kind: "space", slug: "news" }) === "home")
    const views = code("components/community/member/place-views.tsx")
    check("one channel: no chips at all (one group chat); several: no All chip, above the chat from 640px and under its name on a phone", /channels\.length > 1 \? \(\s*<div className="max-sm:hidden">\s*<SpaceChips slug=\{slug\} spaces=\{channels\} active=\{data\.space\.slug\} noAll \/>/.test(views) && /channels=\{channels\}/.test(views) && /data-chat-channels-phone=""/.test(code("components/community/member/chat.tsx")))
  }

  console.log("\nMessage from a profile and the members list")
  {
    const profile = code("components/community/member/member-profile.tsx")
    check("a Message button beside Follow opens the conversation; greyed, it says why and stays put", /data-member-profile-message=/.test(profile) && /openMessages\(\{ userId: person\.userId \}\)/.test(profile) && /aria-disabled=\{data\.message\.can \? undefined : true\}/.test(profile) && /data-member-profile-message-why=""/.test(profile))
    const direct = code("lib/communities/server/direct.ts")
    check("the profile asks the server's own decision (dmDecision through dmVerdict), and an existing conversation always opens", /export async function messageButton\(/.test(direct) && /if \(existing\) return \{ can: true, reason: null \}/.test(direct) && /const d = await dmVerdict\(db, community, viewer, otherId, false\)/.test(direct))
    check("a send answering a conversation the other started is a reply (no threshold)", /mayMessage\(db, community, viewer, other, answering\(conversation, viewer\.userId\)\)/.test(direct))
    const members = code("components/community/member/members.tsx")
    check("the list greys a Message the viewer may not send, and a press says why", /const why = canMessage \? dmButtonReason\(dmStart, m\.role \?\? "member"\) : null/.test(members) && /why \? toast\(why\) : openMessages/.test(members))

    /* The real server path: a level rule, on the in-memory database. */
    const db = fakeDb({
      communities: [{ id: C, slug: "club", name: "Club", chat_enabled: true, owner_user_id: OWNER, deleted_at: null, suspended_at: null, status: "published" }],
      community_members: [
        { id: hex(201), community_id: C, user_id: ANA, role: "member", status: "active", banned_at: null, level: 1, joined_at: "2026-10-01T00:00:00Z", chat_dms: "everyone" },
        { id: hex(202), community_id: C, user_id: BEN, role: "member", status: "active", banned_at: null, level: 4, joined_at: "2026-10-01T00:00:00Z", chat_dms: "everyone" },
      ],
      community_chat_settings: [{ community_id: C, dm_policy: "level", dm_min_level: 3, groups_policy: "members", attachments_enabled: true, push_previews: true, rules: "", rules_version: 0, dm_min_days: 7, dm_to_staff: true, chat_tab: true, main_space_id: null }],
      community_conversations: [],
      community_member_blocks: [],
      profiles: [],
    })
    const community = (db.tables.communities as unknown[])[0] as never
    const viewer = (id: string, level: number) => ({ userId: id, role: "member", active: true, member: { level, joined_at: "2026-10-01T00:00:00Z" } }) as never
    const low = await openConversation(db as never, community, viewer(ANA, 1), BEN)
    check("server: a level 1 member cannot start a conversation where the rule is level 3", "error" in low && low.status === 403 && /level 3/.test(low.error))
    const high = await openConversation(db as never, community, viewer(BEN, 4), ANA)
    check("server: a level 4 member can, and the conversation is made", "value" in high && (db.tables.community_conversations as unknown[]).length === 1)
    const answer = await openConversation(db as never, community, viewer(ANA, 1), BEN)
    check("server: the level 1 member can open the conversation the other started", "value" in answer)
  }

  /* ── AUTOMATIONS, PURE ───────────────────────────────────────────────── */
  console.log("\nAutomated messages: what an admin may save")
  {
    const ok = automationInput({ name: " Welcome ", trigger: "join", body: "Hi {first_name}" }, now)
    check("a join message: the name trimmed, into their messages by default", "value" in ok && ok.value.name === "Welcome" && ok.value.target === "dm")
    check("a level needs 2 to 100, days 1 to 365", "error" in automationInput({ name: "x", trigger: "level", body: "b" }, now) && "value" in automationInput({ name: "x", trigger: "level", triggerLevel: 5, body: "b" }, now) && "error" in automationInput({ name: "x", trigger: "days", triggerDays: 0, body: "b" }, now))
    check("a channel message needs its channel; a name and words are required", "error" in automationInput({ name: "x", trigger: "join", target: "channel", body: "b" }, now) && "error" in automationInput({ name: "", trigger: "join", body: "b" }, now) && "error" in automationInput({ name: "x", trigger: "join", body: "  " }, now) && "error" in automationInput({ name: "x", trigger: "nope", body: "b" }, now))
    const b = automationInput({ name: "x", trigger: "broadcast", body: "b", segment: { minLevel: 3, joinedWithinDays: 30 }, sendAt: new Date(now + DAY).toISOString() }, now)
    check("a broadcast keeps its audience and its time; a time gone or a year away is refused", "value" in b && b.value.segment.minLevel === 3 && b.value.segment.joinedWithinDays === 30 && b.value.sendAt === new Date(now + DAY).toISOString() && "error" in automationInput({ name: "x", trigger: "broadcast", body: "b", sendAt: new Date(now - DAY).toISOString() }, now) && "error" in automationInput({ name: "x", trigger: "broadcast", body: "b", sendAt: new Date(now + 400 * DAY).toISOString() }, now))
    check("every trigger the owner asked for", ["join", "level", "days", "paid_start", "paid_cancel", "broadcast"].every((t) => (AUTOMATION_TRIGGERS as readonly string[]).includes(t)))
    check("{first_name}, {name}, {community}, {level} filled in; other braces left as written", renderAutomation("Hi {first_name} ({name}), welcome to {community}! Level {level}. {other}", { name: "Ana Silva", community: "Club", level: 3 }) === "Hi Ana (Ana Silva), welcome to Club! Level 3. {other}" && renderAutomation("Hi {first_name}", { name: null }) === "Hi there")
    check("a delivery's message id is a valid client id (part 270's unique key per author)", cleanClientId(deliveryClientId(hex(77))) === deliveryClientId(hex(77)))
  }

  console.log("\nAutomated messages: which event starts which")
  {
    const list = [
      { id: "j", trigger: "join", status: "active", trigger_level: null },
      { id: "p", trigger: "join", status: "paused", trigger_level: null },
      { id: "l3", trigger: "level", status: "active", trigger_level: 3 },
      { id: "l5", trigger: "level", status: "active", trigger_level: 5 },
      { id: "c", trigger: "paid_cancel", status: "active", trigger_level: null },
    ]
    check("a join starts the active join messages only", automationsFor(list, { kind: "join" }).map((a) => a.id).join() === "j")
    check("a level up from 2 to 6 crosses 3 and 5; from 3 to 4 crosses none", automationsFor(list, { kind: "level", before: 2, after: 6 }).map((a) => a.id).join() === "l3,l5" && levelsCrossed(list, 3, 4).length === 0 && levelsCrossed(list, 4, 4).length === 0)
    check("a cancelled paid membership", automationsFor(list, { kind: "paid_cancel" }).map((a) => a.id).join() === "c")
    const made = new Date(now - 3 * DAY).toISOString()
    const w = daysWindow({ trigger_days: 7, created_at: made, cursor: null }, now)
    check("days: the window starts N days before the automation was made, so nobody from long ago gets it", !!w && w.from === new Date(now - 10 * DAY).toISOString() && w.to === new Date(now - 7 * DAY).toISOString())
    check("  and it moves on from its cursor", daysWindow({ trigger_days: 7, created_at: made, cursor: new Date(now - 8 * DAY).toISOString() }, now)?.from === new Date(now - 8 * DAY).toISOString() && daysWindow({ trigger_days: 7, created_at: new Date(now).toISOString(), cursor: null }, now) !== null)
    check("an audience: level, tier, joined lately", inSegment({ level: 3, tier_id: null, joined_at: null }, { minLevel: 3 }) && !inSegment({ level: 2, tier_id: null, joined_at: null }, { minLevel: 3 }) && !inSegment({ level: 9, tier_id: "a", joined_at: null }, { tierId: "b" }) && inSegment({ level: 1, tier_id: null, joined_at: new Date(now - 2 * DAY).toISOString() }, { joinedWithinDays: 7 }, now) && !inSegment({ level: 1, tier_id: null, joined_at: new Date(now - 9 * DAY).toISOString() }, { joinedWithinDays: 7 }, now))
    const waiting = [...Array(200).fill(0).map(() => ({ community_id: "big" })), ...Array(20).fill(0).map(() => ({ community_id: "small" }))]
    const batch = takeBatch(waiting, 300, 150)
    check("a run's batch: 150 at most for one community, the others not held back behind it", batch.filter((d) => d.community_id === "big").length === 150 && batch.filter((d) => d.community_id === "small").length === 20 && takeBatch(waiting, 100, 150).length === 100)
    check("a broadcast is done once all are queued and nothing waits", broadcastFinished({ fanned_out_at: "x" }, 0) && !broadcastFinished({ fanned_out_at: "x" }, 1) && !broadcastFinished({ fanned_out_at: null }, 0))
  }

  /* ── AUTOMATIONS, THROUGH THE SERVER ─────────────────────────────────── */
  const pushes: { userId: string; title: string; body: string }[] = []
  setPushBridgeDeps({ sender: async (userId, payload) => void pushes.push({ userId, title: payload.title, body: payload.body }), communitiesOn: async () => true, defer: (task) => task() })
  const people = Array.from({ length: 400 }, (_, i) => hex(1000 + i))
  const db = fakeDb(
    {
      communities: [{ id: C, slug: "club", name: "Club", chat_enabled: true, owner_user_id: OWNER, deleted_at: null, suspended_at: null, status: "published" }],
      community_members: [
        { id: hex(300), community_id: C, user_id: OWNER, role: "owner", status: "active", banned_at: null, level: 1, joined_at: "2026-01-01T00:00:00Z", notify_level: "all" },
        { id: hex(301), community_id: C, user_id: ADMIN, role: "admin", status: "active", banned_at: null, level: 1, joined_at: "2026-01-01T00:00:00Z", notify_level: "all" },
        { id: hex(302), community_id: C, user_id: ANA, role: "member", status: "active", banned_at: null, level: 1, joined_at: new Date(now).toISOString(), notify_level: "all" },
      ],
      profiles: [{ id: ANA, display_name: "Ana Silva", username: "ana" }, { id: OWNER, display_name: "Olivia", username: "olivia" }],
      community_chat_settings: [],
      community_chat_automations: [],
      community_chat_automation_deliveries: [],
      community_conversations: [],
      community_direct_messages: [],
      community_member_blocks: [],
      community_chat_prefs: [],
      community_spaces: [],
      community_messages: [],
      community_audit_log: [],
      push_tokens: [{ id: hex(8000), user_id: ANA }],
      rate_limit_hits: [],
    },
    { unique: { community_chat_automation_deliveries: [["automation_id", "user_id"]], community_direct_messages: [["author_id", "client_id"]] } },
  )
  const community = { id: C, owner_user_id: OWNER }
  const T = db.tables as Record<string, Record<string, unknown>[]>

  console.log("\nAutomated messages: each member once")
  {
    const made = await createAutomation(db as never, community, OWNER, { name: "Welcome", trigger: "join", body: "Hi {first_name}, welcome to {community}!" }, now)
    check("an admin's join message is saved, active, from the person who made it", "value" in made && made.value.status === "active" && made.value.senderId === OWNER && T.community_audit_log.some((r) => r.action === "chat.automation_created"))
    await automationsOnEvent(db as never, C, ANA, [{ kind: "join" }])
    await automationsOnEvent(db as never, C, ANA, [{ kind: "join" }])
    check("the same join twice is one delivery (the unique key)", T.community_chat_automation_deliveries.length === 1)
    const msgs = T.community_direct_messages
    check("it arrived as a real message from the owner, the words filled in, sent at once after the response", msgs.length === 1 && msgs[0].author_id === OWNER && msgs[0].body === "Hi Ana, welcome to Club!" && T.community_chat_automation_deliveries[0].status === "sent")
    check("in a conversation of their own, with the list's line and unread for the member", T.community_conversations.length === 1 && T.community_conversations[0].last_author_id === OWNER && T.community_conversations[0].last_body === "Hi Ana, welcome to Club!")
    check("and a push to the member's phone, through the same pipeline as a person's message", pushes.some((p) => p.userId === ANA && /welcome to Club/.test(p.body)))
    await drainDeliveries(db as never, { communityId: C, now: now + 60_000 })
    await runChatAutomations(db as never, now + 120_000, 5_000)
    check("drained again and run again: still one message", T.community_direct_messages.length === 1)

    /* A drain that wrote the message and died before marking it: the next try finds its message and marks it. */
    const lost = { id: hex(5000), automation_id: (made as { value: { id: string } }).value.id, community_id: C, user_id: BEN, status: "pending", attempts: 1, due_at: new Date(now).toISOString(), claimed_at: null, created_at: new Date(now).toISOString() }
    T.community_members.push({ id: hex(303), community_id: C, user_id: BEN, role: "member", status: "active", banned_at: null, level: 1, joined_at: new Date(now).toISOString() })
    T.community_chat_automation_deliveries.push(lost)
    T.community_conversations.push({ id: hex(6000), community_id: C, user_a: OWNER < BEN ? OWNER : BEN, user_b: OWNER < BEN ? BEN : OWNER, started_by: OWNER })
    T.community_direct_messages.push({ id: hex(6001), conversation_id: hex(6000), community_id: C, author_id: OWNER, body: "Hi Ben", client_id: deliveryClientId(lost.id), created_at: new Date(now).toISOString(), status: "published" })
    await drainDeliveries(db as never, { communityId: C, now: now + 60_000 })
    check("a delivery written before it was marked is marked sent, never written again", T.community_direct_messages.filter((m) => m.conversation_id === hex(6000)).length === 1 && T.community_chat_automation_deliveries.find((d) => d.id === lost.id)?.status === "sent" && T.community_chat_automation_deliveries.find((d) => d.id === lost.id)?.message_id === hex(6001))

    const level = await createAutomation(db as never, community, OWNER, { name: "Level 3", trigger: "level", triggerLevel: 3, body: "Level {level}, {first_name}!" }, now)
    await automationsOnEvent(db as never, C, ANA, [{ kind: "level", before: 3, after: 4 }])
    check("a level up that crosses no level sends nothing", !T.community_chat_automation_deliveries.some((d) => d.automation_id === (level as { value: { id: string } }).value.id))
    T.community_members.find((m) => m.user_id === ANA)!.level = 3
    await automationsOnEvent(db as never, C, ANA, [{ kind: "level", before: 2, after: 3 }])
    check("reaching level 3 sends the level 3 message, with the level in it", T.community_direct_messages.some((m) => m.body === "Level 3, Ana!"))

    const paused = await createAutomation(db as never, community, OWNER, { name: "Cancelled", trigger: "paid_cancel", body: "Sorry to see you go" }, now)
    const pid = (paused as { value: { id: string } }).value.id
    await automationsOnEvent(db as never, C, ANA, [{ kind: "paid_cancel" }])
    check("a paid membership cancelled sends its message", T.community_direct_messages.some((m) => m.body === "Sorry to see you go"))
    await changeAutomation(db as never, { id: C }, OWNER, pid, "pause")
    T.community_chat_automation_deliveries.push({ id: hex(5001), automation_id: pid, community_id: C, user_id: BEN, status: "pending", attempts: 0, due_at: new Date(now).toISOString(), claimed_at: null })
    await drainDeliveries(db as never, { communityId: C, now: now + 60_000 })
    check("paused: what is queued waits, nothing is sent", T.community_chat_automation_deliveries.find((d) => d.id === hex(5001))?.status === "pending" && !T.community_direct_messages.some((m) => m.body === "Sorry to see you go" && m.author_id === OWNER && T.community_conversations.find((c) => c.id === m.conversation_id && (c.user_a === BEN || c.user_b === BEN))))
    const sender = await createAutomation(db as never, community, OWNER, { name: "x", trigger: "join", body: "b", senderId: BEN }, now)
    check("the sender must be on the team", "error" in sender && sender.status === 400)
  }

  console.log("\nAutomated messages: a broadcast in batches")
  {
    for (const [i, id] of people.entries()) T.community_members.push({ id: hex(20_000 + i), community_id: C, user_id: id, role: "member", status: "active", banned_at: null, level: 1, joined_at: "2026-09-01T00:00:00Z" })
    T.community_members.push({ id: hex(30_000), community_id: C, user_id: hex(4000), role: "member", status: "active", banned_at: "2026-09-02T00:00:00Z", level: 1, joined_at: "2026-09-01T00:00:00Z" })
    const before = T.community_direct_messages.length
    const b = await createAutomation(db as never, community, OWNER, { name: "News", trigger: "broadcast", body: "New lessons are up, {first_name}." }, now)
    const bid = (b as { value: { id: string } }).value.id
    check("a broadcast for now is scheduled for now", "value" in b && b.value.status === "scheduled")
    const r1 = await runChatAutomations(db as never, now + 1000, 10_000)
    const sentAfter = (n: number) => T.community_direct_messages.length - before === n
    check(`one run sends at most ${DELIVERIES_PER_COMMUNITY_RUN} for one community (no push storm)`, r1.sent === DELIVERIES_PER_COMMUNITY_RUN && sentAfter(DELIVERIES_PER_COMMUNITY_RUN), r1)
    check("every active member is queued once; the banned one and the sender are not", T.community_chat_automation_deliveries.filter((d) => d.automation_id === bid).length === 403 && !T.community_chat_automation_deliveries.some((d) => d.automation_id === bid && (d.user_id === hex(4000) || d.user_id === OWNER)))
    await runChatAutomations(db as never, now + 2000, 10_000)
    await runChatAutomations(db as never, now + 3000, 10_000)
    const r4 = await runChatAutomations(db as never, now + 4000, 10_000)
    const auto = T.community_chat_automations.find((a) => a.id === bid)!
    check("after a few runs everyone has it, once, and the broadcast reads done with its count", T.community_chat_automation_deliveries.filter((d) => d.automation_id === bid && d.status === "sent").length === 403 && auto.status === "done" && auto.sent_count === 403, { r4, status: auto.status, sent: auto.sent_count })
    await runChatAutomations(db as never, now + 5000, 10_000)
    check("a run after it is done sends nothing more", T.community_direct_messages.filter((m) => /New lessons are up/.test(String(m.body))).length === 403)
  }

  console.log("\nAutomated messages: days after joining")
  {
    const made = new Date(now - 2 * DAY).toISOString()
    T.community_members.push({ id: hex(40_001), community_id: C, user_id: hex(4001), role: "member", status: "active", banned_at: null, level: 1, joined_at: new Date(now - 8 * DAY).toISOString() })
    T.community_members.push({ id: hex(40_002), community_id: C, user_id: hex(4002), role: "member", status: "active", banned_at: null, level: 1, joined_at: new Date(now - 60 * DAY).toISOString() })
    T.community_chat_automations.push({ id: hex(7000), community_id: C, name: "A week in", trigger: "days", trigger_level: null, trigger_days: 7, segment: {}, target: "dm", space_id: null, sender_id: OWNER, body: "One week in!", status: "active", send_at: null, cursor_at: null, cursor_user: null, fanned_out_at: null, sent_count: 0, failed_count: 0, last_sent_at: null, created_by: OWNER, created_at: made, updated_at: made })
    await runChatAutomations(db as never, now, 10_000)
    const got = T.community_chat_automation_deliveries.filter((d) => d.automation_id === hex(7000)).map((d) => d.user_id)
    check("a member whose 7th day came after the automation was made gets it; one from two months ago does not", got.includes(hex(4001)) && !got.includes(hex(4002)), got)
  }
  setPushBridgeDeps(null)

  /* ── ADMINS ──────────────────────────────────────────────────────────── */
  console.log("\nAdmins only")
  {
    const route = code("app/api/app/community/[id]/chat/automations/route.ts")
    check("automations: communities on first, the team reads, manage_settings writes, rate limited", (route.match(/const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/g) ?? []).length === 2 && /requireCreatorCommunity\(id, "view"\)/.test(route) && /requireCreatorCommunity\(id, "manage_settings"\)/.test(route) && /const limited = await manageLimit\(gate\.ctx\.userId\)\s*if \(limited\) return limited/.test(route))
    check("a preview saves and sends nothing", (() => {
      const p = route.slice(route.indexOf('body.action === "preview"'), route.indexOf('body.action === "create"'))
      return !/createAutomation|insert\(|runChatAutomations/.test(p) && /renderAutomation\(/.test(p)
    })())
    const chat = code("app/api/app/community/[id]/chat/route.ts")
    check("who can post and the pin need manage_spaces and the limit", /body\.action === "channel_post" \|\| body\.action === "pin"\) \{\s*const gate = await requireCreatorCommunity\(id, "manage_spaces"\)/.test(chat) && /channelPostColumns\(/.test(chat))
    const server = code("lib/communities/server/chat-automations.ts")
    check("every automation read and write is the community's own", /automationOf\(db: Db, communityId: string, id: unknown\)[\s\S]{0,300}\.eq\("community_id", communityId\)/.test(server) && (server.match(/\.eq\("id", current\.id\)\.eq\("community_id", community\.id\)/g) ?? []).length >= 3)
    check("a claim is one conditional update (pending to sending), so two drains never send the same row", /\.update\(\{ status: "sending", claimed_at: nowIso\(\), attempts: \(d\.attempts \?\? 0\) \+ 1 \}\)\s*\.eq\("id", d\.id\)\s*\.eq\("status", "pending"\)/.test(server))
    check("pushes go through directPushWanted and pushDirectMessage (mutes, an open chat, quiet hours, the push switch)", /if \(await directPushWanted\(db, \{ conversationId: c\.id, senderId: sender, recipientId: recipient, recipientReadAt \}\)\)/.test(server) && /await pushDirectMessage\(db, \{/.test(server))
    const cron = code("app/api/cron/community/route.ts")
    check("the community cron runs them, within its own budget", /await runChatAutomations\(db, Date\.now\(\), 15_000\)/.test(cron))
    const hooks = [code("lib/communities/server/membership.ts"), code("lib/communities/server/points.ts"), code("lib/communities/server/membership-lifecycle.ts")]
    check("a join (and a paid one), a level reached and a cancelled membership start them, never failing the event", /automationsOnEvent\(db, row\.community_id, row\.user_id, PAID\.includes\(row\.source\) \? \[\{ kind: "join" \}, \{ kind: "paid_start" \}\] : \[\{ kind: "join" \}\]\)/.test(hooks[0]) && /automationsOnEvent\(db, communityId, userId, \[\{ kind: "level", before, after: level \}\]\)/.test(hooks[1]) && /automationsOnEvent\(db, communityId, row\.buyer_id, \[\{ kind: "paid_cancel" \}\]\)/.test(hooks[2]))
    check("Settings has the Automated messages panel, and its old names land on it", (SETTINGS_TABS as readonly string[]).includes("automations") && settingsTabOf("broadcasts") === "automations" && /value: "automations"[\s\S]{0,300}needs: "manage_settings"[\s\S]{0,300}<AutomationsPanel head=\{p\.head\} \/>/.test(code("components/community/creator/settings-section.tsx")))
  }

  /* ── SQL ─────────────────────────────────────────────────────────────── */
  console.log("\nPart 272")
  {
    const P = "supabase/sql/run-now/272_community_chat_automations.sql"
    const sql = read(P)
    check("its migration is the same bytes", read("supabase/migrations/20270211_community_chat_automations.sql") === sql)
    check("RLS on both new tables; nothing for members or visitors, the server only", ["community_chat_automations", "community_chat_automation_deliveries"].every((t) => sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)) && sql.includes("REVOKE ALL ON public.community_chat_automations, public.community_chat_automation_deliveries FROM PUBLIC, anon, authenticated;") && !/TO authenticated/.test(sql) && !/CREATE POLICY/.test(sql))
    check("each member once: unique on automation and member, and one channel row per automation", /CONSTRAINT community_chat_automation_deliveries_once UNIQUE \(automation_id, user_id\)/.test(sql) && /CREATE UNIQUE INDEX IF NOT EXISTS community_chat_automation_deliveries_channel_once ON public\.community_chat_automation_deliveries \(automation_id\) WHERE user_id IS NULL;/.test(sql))
    check("the new settings: level, days, members to the team, the Chat tab, its channel; channels: a level to post, a pinned message", ["dm_min_level", "dm_min_days", "dm_to_staff", "chat_tab", "main_space_id"].every((c) => sql.includes(`ADD COLUMN IF NOT EXISTS ${c} `)) && ["post_min_level", "pinned_message_id", "pinned_at", "pinned_by"].every((c) => sql.includes(`ADD COLUMN IF NOT EXISTS ${c} `)) && /CHECK \(dm_policy IN \('everyone', 'level', 'days', 'staff', 'off'\)\)/.test(sql))
    check("safe to run again: every create checks first, a constraint added once", sql.split("\n").filter((l) => /^CREATE (TABLE|INDEX|UNIQUE INDEX) /.test(l) && !/IF NOT EXISTS/.test(l)).length === 0 && /DROP CONSTRAINT IF EXISTS community_chat_settings_dm_policy, ADD CONSTRAINT community_chat_settings_dm_policy/.test(sql) && (sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = /g) ?? []).length === 3)
    check("one statement per line, the note first", sql.split("\n")[0].startsWith("/*") && sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
    check("a README row and a check column", read("supabase/sql/run-now/README.md").includes("| `272_community_chat_automations.sql` |") && /as p272_community_chat_automations;/.test(read("supabase/sql/run-now/99_check_after.sql")))
    const copy = [sql, code("components/community/creator/automations-panel.tsx"), code("components/community/creator/chat-panel.tsx"), code("lib/communities/chat-automations.ts"), code("lib/communities/chat-rules.ts")].join("\n")
    check("copy: no em dash, no banned word", !/—/.test(copy) && !/\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(copy))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
