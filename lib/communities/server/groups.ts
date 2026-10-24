import "server-only"

/**
 * ===========================================================================
 *  GROUP CHATS INSIDE A COMMUNITY (round 37, part 270)
 * ===========================================================================
 * A few members talking together, the way a Telegram group works, inside one
 * community: a name, its people (the one who made it is its owner), and its
 * messages. Who may start one is the admins' choice (Settings, Chat:
 * members, the team only, or off). The owner and the community's team rename
 * it and add or remove people; anyone in it can leave. The people in a group
 * are active members of the community, never somebody who blocked or was
 * blocked by whoever adds them, and at most GROUP_PEOPLE_MAX.
 *
 * Written only here; a member's browser listens to realtime for the rows of
 * groups it is in (part 270's policy, public.community_in_group) and asks
 * this module for the messages, the same as a conversation (./direct.ts).
 * A line about the group itself ("Ana added Ben") is a message of kind
 * "event", drawn in the middle of the chat.
 *
 * Before part 270 the tables are missing: the list answers empty with
 * `ready: false` and nothing offers to make a group.
 */
import { GROUP_NAME_MAX, GROUP_PEOPLE_MAX, attachmentLine, groupCreateAllowed, isStaffRole } from "../chat-rules"
import { LENGTHS, extractMentions } from "../limits"
import type { AuthorView, CommunityRow, PostMedia, Role } from "../types"
import type { ChatLine } from "@/components/community/member/view-types"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { cleanText, refused, type Checked } from "./feed"
import { touchMember } from "./activity"
import { screenEdit, screenWrite } from "./safety"
import { blockedAmong, chatGate, chatMemberStates, loadChatSettings } from "./chat-settings"
import { chatMediaOf, checkChatMedia } from "./chat-media"
import { checkPostShare, postCardOf, sharedPostViews, withPost } from "./chat-post"
import { pushChatMessage } from "./chat-push"
import { replyPreviews } from "./chat"
import { mutedOf } from "./direct"
import { resolveMentions } from "./mentions"
import { pushSoon } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const GROUP_PAGE = 50
const GROUP_COLUMNS = "id, community_id, name, created_by, member_count, last_message_at, last_author_id, last_body, archived_at, created_at"
const MESSAGE_COLUMNS = "id, group_id, community_id, author_id, kind, body, attachments, reply_to_id, client_id, status, created_at, edited_at"

export interface GroupRow {
  id: string
  community_id: string
  name: string
  created_by: string | null
  member_count: number
  last_message_at: string | null
  last_author_id: string | null
  last_body: string
  archived_at: string | null
  created_at: string
}

interface GroupMemberRow {
  group_id: string
  user_id: string
  role: "owner" | "member"
  last_read_at: string | null
  joined_at: string
}

interface GroupMessageRow {
  id: string
  group_id: string
  community_id: string
  author_id: string | null
  kind: "message" | "event"
  body: string
  attachments: unknown
  reply_to_id: string | null
  client_id: string | null
  status: "published" | "deleted" | "removed"
  created_at: string
  edited_at: string | null
}

export interface GroupView {
  id: string
  name: string
  memberCount: number
  lastBody: string
  lastAt: string | null
  lastFromMe: boolean
  unread: boolean
  muted: boolean
}

export interface GroupDetail {
  id: string
  name: string
  memberCount: number
  people: (AuthorView & { groupRole: "owner" | "member" })[]
  /** The viewer may rename it and add or remove people. */
  canManage: boolean
}

export interface GroupMessageView extends ChatLine {
  groupId: string
}

type Opened = { group: GroupRow; me: GroupMemberRow }

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function preview(text: string): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > 200 ? `${line.slice(0, 199)}…` : line
}

export function cleanGroupName(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX) : ""
}

/** Whether the viewer may rename the group and add or remove people: its owner, or the community's team. */
export function managesGroup(me: Pick<GroupMemberRow, "role"> | null, viewerRole: Role | null): boolean {
  return me?.role === "owner" || isStaffRole(viewerRole)
}

/** The group, when it is this community's, not archived, and the viewer is in it. */
export async function groupOf(db: Db, community: Pick<CommunityRow, "id" | "chat_enabled">, viewer: Viewer, groupId: string): Promise<Opened | null> {
  if (!viewer.userId || !UUID.test(groupId) || !community.chat_enabled) return null
  try {
    const [{ data: g, error }, { data: m }] = await Promise.all([
      db.from("community_chat_groups").select(GROUP_COLUMNS).eq("id", groupId).eq("community_id", community.id).maybeSingle(),
      db.from("community_chat_group_members").select("group_id, user_id, role, last_read_at, joined_at").eq("group_id", groupId).eq("user_id", viewer.userId).maybeSingle(),
    ])
    const group = (g as GroupRow | null) ?? null
    if (error || !group || group.archived_at || !m) return null
    return { group, me: m as GroupMemberRow }
  } catch {
    return null
  }
}

export async function listGroups(db: Db, community: CommunityRow, viewer: Viewer): Promise<{ ready: boolean; groups: GroupView[] }> {
  if (!viewer.userId || !community.chat_enabled) return { ready: false, groups: [] }
  const me = viewer.userId
  try {
    const { data, error } = await db.from("community_chat_group_members").select("group_id, last_read_at, joined_at").eq("user_id", me).eq("community_id", community.id).limit(100)
    if (error) return { ready: !missing(error), groups: [] }
    const mine = (data as { group_id: string; last_read_at: string | null; joined_at: string }[] | null) ?? []
    if (!mine.length) return { ready: true, groups: [] }
    const [{ data: rows }, muted] = await Promise.all([
      db.from("community_chat_groups").select(GROUP_COLUMNS).in("id", mine.map((m) => m.group_id)).is("archived_at", null).order("last_message_at", { ascending: false, nullsFirst: false }),
      mutedOf(db, me, "group", mine.map((m) => m.group_id)),
    ])
    const reads = new Map(mine.map((m) => [m.group_id, m.last_read_at ?? m.joined_at]))
    const groups = ((rows as GroupRow[] | null) ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.member_count,
      lastBody: g.last_body,
      lastAt: g.last_message_at ?? g.created_at,
      lastFromMe: g.last_author_id === me,
      unread: !!g.last_message_at && g.last_author_id !== me && Date.parse(g.last_message_at) > Date.parse(reads.get(g.id) ?? g.created_at),
      muted: muted.has(g.id),
    }))
    return { ready: true, groups }
  } catch (e) {
    console.error(`[communities] groups read: ${reasonOf(e)}`)
    return { ready: false, groups: [] }
  }
}

/** Who can be put in a group by this person: active members, nobody blocked either way. */
async function addable(db: Db, community: Pick<CommunityRow, "id">, by: string, ids: unknown): Promise<Checked<string[]>> {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === "string" && UUID.test(id) && id !== by))] : []
  if (list.length > GROUP_PEOPLE_MAX) return { ok: false, error: `Up to ${GROUP_PEOPLE_MAX} people in a group.`, status: 400 }
  if (!list.length) return { ok: true, value: [] }
  const [states, blocked] = await Promise.all([chatMemberStates(db, community.id, list), blockedAmong(db, by, list)])
  const fine = list.filter((id) => states.get(id)?.active && !states.get(id)?.chatBannedAt && !blocked.has(id))
  if (fine.length !== list.length) return { ok: false, error: list.length === 1 ? "That member can't be added." : "Some of those members can't be added.", status: 403 }
  return { ok: true, value: fine }
}

async function writeEvent(db: Db, group: Pick<GroupRow, "id" | "community_id">, actorId: string, text: string): Promise<void> {
  const at = nowIso()
  await db.from("community_chat_group_messages").insert({ group_id: group.id, community_id: group.community_id, author_id: actorId, kind: "event", body: text.slice(0, 400), created_at: at }).then(
    () => undefined,
    () => undefined,
  )
  await db.from("community_chat_groups").update({ last_message_at: at, last_author_id: actorId, last_body: preview(text), updated_at: at }).eq("id", group.id).then(
    () => undefined,
    () => undefined,
  )
}

async function nameOf(db: Db, communityId: string, userId: string): Promise<string> {
  return (await authorViews(db, communityId, [userId])).get(userId)?.name ?? "A member"
}

function namesLine(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export async function createGroup(db: Db, community: CommunityRow, viewer: Viewer, raw: unknown): Promise<Checked<{ id: string; name: string }>> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  const gate = await chatGate(db, community, viewer)
  if ("error" in gate) return gate
  const role: Role | null = viewer.userId === community.owner_user_id ? "owner" : viewer.role
  if (!groupCreateAllowed(gate.settings.groupsPolicy, role)) return { ok: false, error: gate.settings.groupsPolicy === "off" ? "Groups are turned off in this community." : "Only the team can start groups in this community.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const name = cleanGroupName(r.name)
  if (!name) return { ok: false, error: "Give the group a name.", status: 400 }
  const people = await addable(db, community, viewer.userId, r.userIds)
  if (!people.ok) return refused(people)
  if (!people.value.length) return { ok: false, error: "Add at least one person.", status: 400 }
  const made = await db.from("community_chat_groups").insert({ community_id: community.id, name, created_by: viewer.userId }).select(GROUP_COLUMNS).single()
  if (made.error || !made.data) {
    if (missing(made.error)) return { ok: false, error: "Groups are not set up yet.", status: 503 }
    console.error(`[communities] group not made: ${reasonOf(made.error)}`)
    return { ok: false, error: "The group was not made. Try again.", status: 500 }
  }
  const group = made.data as GroupRow
  const rows = [{ group_id: group.id, user_id: viewer.userId, community_id: community.id, role: "owner", added_by: viewer.userId, last_read_at: nowIso() }, ...people.value.map((id) => ({ group_id: group.id, user_id: id, community_id: community.id, role: "member", added_by: viewer.userId }))]
  const { error } = await db.from("community_chat_group_members").insert(rows)
  if (error) {
    await db.from("community_chat_groups").delete().eq("id", group.id)
    return { ok: false, error: "The group was not made. Try again.", status: 500 }
  }
  await writeEvent(db, group, viewer.userId, `${await nameOf(db, community.id, viewer.userId)} started the group`)
  return { ok: true, value: { id: group.id, name } }
}

export async function groupDetail(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, opened: Opened): Promise<GroupDetail> {
  const { data } = await db.from("community_chat_group_members").select("user_id, role, joined_at").eq("group_id", opened.group.id).order("joined_at", { ascending: true }).limit(GROUP_PEOPLE_MAX + 1)
  const rows = (data as { user_id: string; role: "owner" | "member" }[] | null) ?? []
  const people = await authorViews(db, community.id, rows.map((r) => r.user_id))
  return {
    id: opened.group.id,
    name: opened.group.name,
    memberCount: opened.group.member_count,
    people: rows.map((r) => ({ ...(people.get(r.user_id) ?? { id: r.user_id, name: "Former member", username: null, avatarUrl: null, role: null, level: null }), groupRole: r.role })),
    canManage: managesGroup(opened.me, viewer.role),
  }
}

/** Rename, add people, remove one: the owner and the community's team. */
export async function updateGroup(db: Db, community: CommunityRow, viewer: Viewer, opened: Opened, raw: unknown): Promise<Checked<true>> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  if (!managesGroup(opened.me, viewer.role)) return { ok: false, error: "Only the group's owner can change it.", status: 403 }
  const gate = await chatGate(db, community, viewer)
  if ("error" in gate) return gate
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const me = await nameOf(db, community.id, viewer.userId)
  if (r.name !== undefined) {
    const name = cleanGroupName(r.name)
    if (!name) return { ok: false, error: "Give the group a name.", status: 400 }
    if (name !== opened.group.name) {
      const { error } = await db.from("community_chat_groups").update({ name, updated_at: nowIso() }).eq("id", opened.group.id)
      if (error) return { ok: false, error: "That did not save. Try again.", status: 500 }
      await writeEvent(db, opened.group, viewer.userId, `${me} renamed the group to ${name}`)
    }
  }
  if (r.add !== undefined) {
    const people = await addable(db, community, viewer.userId, r.add)
    if (!people.ok) return refused(people)
    if (opened.group.member_count + people.value.length > GROUP_PEOPLE_MAX) return { ok: false, error: `Up to ${GROUP_PEOPLE_MAX} people in a group.`, status: 400 }
    if (people.value.length) {
      const { error } = await db.from("community_chat_group_members").upsert(people.value.map((id) => ({ group_id: opened.group.id, user_id: id, community_id: community.id, role: "member", added_by: viewer.userId })), { onConflict: "group_id,user_id", ignoreDuplicates: true })
      if (error) return { ok: false, error: "They were not added. Try again.", status: 500 }
      const names = await authorViews(db, community.id, people.value)
      await writeEvent(db, opened.group, viewer.userId, `${me} added ${namesLine(people.value.map((id) => names.get(id)?.name ?? "a member"))}`)
    }
  }
  if (r.remove !== undefined) {
    if (typeof r.remove !== "string" || !UUID.test(r.remove) || r.remove === viewer.userId) return { ok: false, error: "That person is not in the group.", status: 400 }
    const { data: removed, error } = await db.from("community_chat_group_members").delete().eq("group_id", opened.group.id).eq("user_id", r.remove).select("user_id")
    if (error) return { ok: false, error: "That did not save. Try again.", status: 500 }
    if ((removed as unknown[] | null)?.length) await writeEvent(db, opened.group, viewer.userId, `${me} removed ${await nameOf(db, community.id, r.remove)}`)
  }
  return { ok: true, value: true }
}

/** The viewer leaves. An owner who leaves hands the group to whoever has been in it longest; the last one out archives it. */
export async function leaveGroup(db: Db, community: CommunityRow, viewer: Viewer, opened: Opened): Promise<Checked<true>> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  const { error } = await db.from("community_chat_group_members").delete().eq("group_id", opened.group.id).eq("user_id", viewer.userId)
  if (error) return { ok: false, error: "That did not work. Try again.", status: 500 }
  const { data } = await db.from("community_chat_group_members").select("user_id, role").eq("group_id", opened.group.id).order("joined_at", { ascending: true }).limit(GROUP_PEOPLE_MAX + 1)
  const left = (data as { user_id: string; role: string }[] | null) ?? []
  if (!left.length) {
    await db.from("community_chat_groups").update({ archived_at: nowIso() }).eq("id", opened.group.id)
    return { ok: true, value: true }
  }
  if (opened.me.role === "owner" && !left.some((p) => p.role === "owner")) await db.from("community_chat_group_members").update({ role: "owner" }).eq("group_id", opened.group.id).eq("user_id", left[0].user_id)
  await writeEvent(db, opened.group, viewer.userId, `${await nameOf(db, community.id, viewer.userId)} left the group`)
  return { ok: true, value: true }
}

async function toViews(db: Db, communityId: string, rows: GroupMessageRow[], viewer: Viewer, manage: boolean): Promise<GroupMessageView[]> {
  const me = viewer.userId ?? ""
  const [authors, replies, posts] = await Promise.all([
    authorViews(db, communityId, rows.map((r) => r.author_id)),
    replyPreviews(db, communityId, "community_chat_group_messages", rows.map((r) => r.reply_to_id), new Map(rows.map((r) => [r.id, r]))),
    sharedPostViews(db, communityId, viewer, rows.map((r) => (r.status === "published" ? r.attachments : null))),
  ])
  return rows.map((r) => {
    const live = r.status === "published"
    const mine = !!me && r.author_id === me
    const message = r.kind !== "event"
    return {
      id: r.id,
      groupId: r.group_id,
      kind: r.kind,
      authorId: r.author_id,
      author: r.author_id ? (authors.get(r.author_id) ?? null) : null,
      mine,
      body: live ? r.body : "",
      attachments: live ? chatMediaOf(r.attachments) : [],
      ...withPost(postCardOf(posts, r.attachments, live)),
      replyTo: r.reply_to_id ? (replies.get(r.reply_to_id) ?? null) : null,
      clientId: r.client_id,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      canEdit: live && mine && message,
      canDelete: live && mine && message,
      canModerate: live && message && !mine && manage,
    }
  })
}

export async function listGroupMessages(db: Db, opened: Opened, viewer: Viewer, opts: { before?: unknown; after?: unknown }): Promise<{ messages: GroupMessageView[]; hasMore: boolean }> {
  const manage = managesGroup(opened.me, viewer.role)
  try {
    const before = isoOrNull(opts.before)
    const after = isoOrNull(opts.after)
    let q = db.from("community_chat_group_messages").select(MESSAGE_COLUMNS).eq("group_id", opened.group.id).eq("status", "published")
    if (after) {
      const { data, error } = await q.gt("created_at", after).order("created_at", { ascending: true }).limit(GROUP_PAGE * 2 + 1)
      if (error) return { messages: [], hasMore: false }
      const rows = (data as GroupMessageRow[] | null) ?? []
      return { messages: await toViews(db, opened.group.community_id, rows.slice(0, GROUP_PAGE * 2), viewer, manage), hasMore: rows.length > GROUP_PAGE * 2 }
    }
    if (before) q = q.lt("created_at", before)
    const { data, error } = await q.order("created_at", { ascending: false }).limit(GROUP_PAGE + 1)
    if (error) return { messages: [], hasMore: false }
    const rows = (data as GroupMessageRow[] | null) ?? []
    return { messages: await toViews(db, opened.group.community_id, rows.slice(0, GROUP_PAGE).reverse(), viewer, manage), hasMore: rows.length > GROUP_PAGE }
  } catch (e) {
    console.error(`[communities] group messages read: ${reasonOf(e)}`)
    return { messages: [], hasMore: false }
  }
}

/**
 * Round 39: how far each other person in the group has the chat, as the latest page and a catch up carry it, so the
 * sender's own messages say delivered, seen, and "Seen by N". Read marks before part 275 (no delivered column yet),
 * nothing on any other failure. By id, so a mark that moves over realtime replaces its own.
 */
export async function groupMarks(db: Db, opened: Opened, viewer: Viewer): Promise<{ userId: string; read: string | null; delivered: string | null }[]> {
  try {
    const ask = (columns: string) => db.from("community_chat_group_members").select(columns).eq("group_id", opened.group.id).neq("user_id", viewer.userId ?? "").limit(GROUP_PEOPLE_MAX)
    let { data, error } = await ask("user_id, last_read_at, delivered_at")
    if (error && missing(error)) ({ data, error } = await ask("user_id, last_read_at"))
    if (error) return []
    return ((data as { user_id: string; last_read_at: string | null; delivered_at?: string | null }[] | null) ?? []).map((r) => ({ userId: r.user_id, read: r.last_read_at ?? null, delivered: r.delivered_at ?? null }))
  } catch {
    return []
  }
}

export async function markGroupRead(db: Db, opened: Opened, viewer: Viewer): Promise<void> {
  if (!viewer.userId) return
  await db.from("community_chat_group_members").update({ last_read_at: nowIso() }).eq("group_id", opened.group.id).eq("user_id", viewer.userId).then(
    () => undefined,
    () => undefined,
  )
}

export async function sendGroupMessage(db: Db, community: CommunityRow, viewer: Viewer, opened: Opened, raw: unknown): Promise<Checked<GroupMessageView>> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const clientId = typeof r.clientId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(r.clientId) ? r.clientId : null
  const manage = managesGroup(opened.me, viewer.role)
  if (clientId) {
    const { data } = await db.from("community_chat_group_messages").select(MESSAGE_COLUMNS).eq("author_id", viewer.userId).eq("client_id", clientId).maybeSingle()
    if (data && (data as GroupMessageRow).group_id === opened.group.id) return { ok: true, value: (await toViews(db, community.id, [data as GroupMessageRow], viewer, manage))[0] }
  }
  const gate = await chatGate(db, community, viewer)
  if ("error" in gate) return gate
  const body = cleanText(r.body, LENGTHS.messageBody.max)
  const media = await checkChatMedia(db, community, viewer, r.attachments, gate.settings)
  if (!media.ok) return refused(media)
  const attachments: PostMedia[] = media.value
  /* Round 39: a post the sender may see, kept by its id alone (./chat-post.ts). */
  const shared = await checkPostShare(db, community, viewer, r.attachments)
  if (!shared.ok) return refused(shared)
  const stored = shared.value ? [...attachments, shared.value] : attachments
  if (!body && !stored.length) return { ok: false, error: "Write a message first.", status: 400 }
  if (body.length > LENGTHS.messageBody.max) return { ok: false, error: "Keep the message under 4,000 characters.", status: 400 }
  let replyTo: { id: string; author_id: string | null } | null = null
  if (typeof r.replyToId === "string" && UUID.test(r.replyToId)) {
    const { data } = await db.from("community_chat_group_messages").select("id, group_id, status, author_id").eq("id", r.replyToId).maybeSingle()
    if (data && data.group_id === opened.group.id && data.status === "published") replyTo = { id: data.id, author_id: data.author_id }
  }
  const screen = await screenWrite({ db, community, viewer }, "dm", { text: body, media: attachments })
  if (!screen.ok) return refused(screen)
  const { data, error } = await db
    .from("community_chat_group_messages")
    .insert({ group_id: opened.group.id, community_id: community.id, author_id: viewer.userId, body, ...(stored.length ? { attachments: stored } : {}), reply_to_id: replyTo?.id ?? null, client_id: clientId })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error?.code === "23505" && clientId) {
    const { data: first } = await db.from("community_chat_group_messages").select(MESSAGE_COLUMNS).eq("author_id", viewer.userId).eq("client_id", clientId).maybeSingle()
    if (first) return { ok: true, value: (await toViews(db, community.id, [first as GroupMessageRow], viewer, manage))[0] }
  }
  if (error || !data) {
    console.error(`[communities] group message not written: ${reasonOf(error)}`)
    return { ok: false, error: "The message did not send. Try again.", status: missing(error) ? 503 : 500 }
  }
  const row = data as GroupMessageRow
  const line = body || attachmentLine(stored) || "Message"
  await Promise.all([
    db.from("community_chat_groups").update({ last_message_at: row.created_at, last_author_id: viewer.userId, last_body: preview(line), updated_at: row.created_at }).eq("id", opened.group.id).then(
      () => undefined,
      () => undefined,
    ),
    db.from("community_chat_group_members").update({ last_read_at: row.created_at }).eq("group_id", opened.group.id).eq("user_id", viewer.userId).then(
      () => undefined,
      () => undefined,
    ),
    touchMember(db, community.id, viewer.userId),
  ])
  const [view] = await toViews(db, community.id, [row], viewer, manage)
  const senderId = viewer.userId
  const senderName = view.author?.name ?? "A member"
  const previews = gate.settings.pushPreviews
  await pushSoon(async () => {
    const { data: people } = await db.from("community_chat_group_members").select("user_id, last_read_at").eq("group_id", opened.group.id).limit(GROUP_PEOPLE_MAX + 1)
    const names = extractMentions(body)
    const named = names.length ? new Set((await resolveMentions(db, community.id, names)).values()) : new Set<string>()
    const recipients = ((people as { user_id: string; last_read_at: string | null }[] | null) ?? []).filter((p) => p.user_id !== senderId).map((p) => ({ userId: p.user_id, readAt: p.last_read_at, addressed: named.has(p.user_id) || p.user_id === replyTo?.author_id }))
    await pushChatMessage(db, { kind: "group", communityId: community.id, chatId: opened.group.id, chatName: opened.group.name, url: `/community/${community.slug}?group=${opened.group.id}`, senderId, senderName, text: body, media: attachments, previews, recipients })
  })
  return { ok: true, value: view }
}

export async function editGroupMessage(db: Db, community: CommunityRow, viewer: Viewer, opened: Opened, messageId: string, raw: unknown): Promise<Checked<GroupMessageView>> {
  if (!viewer.userId || !UUID.test(messageId)) return { ok: false, error: "That message is gone.", status: 404 }
  const { data: found } = await db.from("community_chat_group_messages").select(MESSAGE_COLUMNS).eq("id", messageId).eq("group_id", opened.group.id).maybeSingle()
  const row = found as GroupMessageRow | null
  if (!row || row.status !== "published" || row.kind === "event") return { ok: false, error: "That message is gone.", status: 404 }
  if (row.author_id !== viewer.userId) return { ok: false, error: "Only the author can edit a message.", status: 403 }
  const body = cleanText((raw as { body?: unknown } | null)?.body, LENGTHS.messageBody.max)
  if (!body && !chatMediaOf(row.attachments).length) return { ok: false, error: "Write a message first.", status: 400 }
  const edited = await screenEdit({ db, community, viewer }, "dm", { text: body, before: row.body })
  if (!edited.ok) return refused(edited)
  const { data, error } = await db.from("community_chat_group_messages").update({ body, edited_at: nowIso() }).eq("id", messageId).eq("author_id", viewer.userId).select(MESSAGE_COLUMNS).single()
  if (error || !data) return { ok: false, error: "The change did not save. Try again.", status: 500 }
  return { ok: true, value: (await toViews(db, community.id, [data as GroupMessageRow], viewer, managesGroup(opened.me, viewer.role)))[0] }
}

/** The author deletes their message, or the group's owner or the team removes it; its words are blanked in the same update. */
export async function deleteGroupMessage(db: Db, community: CommunityRow, viewer: Viewer, opened: Opened, messageId: string): Promise<Checked<true>> {
  if (!viewer.userId || !UUID.test(messageId)) return { ok: false, error: "That message is gone.", status: 404 }
  const { data } = await db.from("community_chat_group_messages").select("id, author_id, status, kind, created_at").eq("id", messageId).eq("group_id", opened.group.id).maybeSingle()
  const row = data as { id: string; author_id: string | null; status: string; kind: string } | null
  if (!row || row.status !== "published" || row.kind === "event") return { ok: false, error: "That message is gone.", status: 404 }
  const own = row.author_id === viewer.userId
  if (!own && !managesGroup(opened.me, viewer.role)) return { ok: false, error: "Only the author can delete a message.", status: 403 }
  const { error } = await db.from("community_chat_group_messages").update({ status: own ? "deleted" : "removed", body: "", attachments: [], deleted_at: nowIso() }).eq("id", messageId)
  if (error) return { ok: false, error: "The message was not deleted. Try again.", status: 500 }
  return { ok: true, value: true }
}

/** Whether this community lets this viewer start groups, for the New group button. */
export async function canStartGroups(db: Db, community: CommunityRow, viewer: Viewer): Promise<boolean> {
  if (!community.chat_enabled || !viewer.userId) return false
  const s = await loadChatSettings(db, community.id)
  return s.ready && groupCreateAllowed(s.groupsPolicy, viewer.userId === community.owner_user_id ? "owner" : viewer.role)
}
