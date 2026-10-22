/**
 * ===========================================================================
 *  COMMUNITY CHAT, THE DECISIONS (round 37)
 * ===========================================================================
 * Everything about chat that is a rule rather than a read: what the admins'
 * Chat settings mean, who may message whom, when a phone is told about a
 * message, and how a list of messages stays in order with no duplicates when
 * the same message arrives from the send, from realtime and from a catch up.
 * Pure: the server (lib/communities/server/chat-*.ts) and the browser
 * (components/community/member/chat-*.ts) both import it, and
 * tests/community-chat-r37.test.ts checks it directly.
 */

export type DmPolicy = "everyone" | "staff" | "off"
export type GroupsPolicy = "members" | "staff" | "off"
/** What a member lets others do: anyone here, only the team, or nobody but the team. */
export type MemberDms = "everyone" | "staff" | "nobody"
export type ChatKind = "space" | "dm" | "group"
export type ChatNotify = "default" | "all" | "mentions" | "none"

export interface ChatSettings {
  dmPolicy: DmPolicy
  groupsPolicy: GroupsPolicy
  attachmentsEnabled: boolean
  pushPreviews: boolean
  rules: string
  rulesVersion: number
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  dmPolicy: "everyone",
  groupsPolicy: "members",
  attachmentsEnabled: true,
  pushPreviews: true,
  rules: "",
  rulesVersion: 0,
}

export const CHAT_RULES_MAX = 4000
export const GROUP_NAME_MAX = 80
export const GROUP_PEOPLE_MAX = 50
export const CHAT_ATTACHMENTS_MAX = 10
/** A channel's slow mode, in seconds, as the admin picks it. */
export const SLOW_MODE_CHOICES = [0, 10, 30, 60, 300, 900, 3600] as const
/** A read mark this fresh means the person has the chat open on a screen right now (the page renews it every 20s). */
export const VIEWING_MS = 45_000
export const VIEWING_BEAT_MS = 20_000
/** At most this many pushes for one chat to one person in PUSH_BURST_SECONDS; the rest are on the badge. */
export const PUSH_BURST = 3
export const PUSH_BURST_SECONDS = 10

const DM_POLICIES: readonly DmPolicy[] = ["everyone", "staff", "off"]
const GROUP_POLICIES: readonly GroupsPolicy[] = ["members", "staff", "off"]
const MEMBER_DMS: readonly MemberDms[] = ["everyone", "staff", "nobody"]
const STAFF = new Set(["owner", "admin", "moderator"])

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF.has(role)
}

export function memberDmsOf(v: unknown): MemberDms {
  return MEMBER_DMS.includes(v as MemberDms) ? (v as MemberDms) : "everyone"
}

/** A stored row (snake case, any shape) as settings, every value checked. */
export function chatSettingsOf(row: Record<string, unknown> | null | undefined): ChatSettings {
  if (!row) return { ...DEFAULT_CHAT_SETTINGS }
  return {
    dmPolicy: DM_POLICIES.includes(row.dm_policy as DmPolicy) ? (row.dm_policy as DmPolicy) : "everyone",
    groupsPolicy: GROUP_POLICIES.includes(row.groups_policy as GroupsPolicy) ? (row.groups_policy as GroupsPolicy) : "members",
    attachmentsEnabled: row.attachments_enabled !== false,
    pushPreviews: row.push_previews !== false,
    rules: typeof row.rules === "string" ? row.rules.slice(0, CHAT_RULES_MAX) : "",
    rulesVersion: Number.isInteger(row.rules_version) && (row.rules_version as number) > 0 ? (row.rules_version as number) : 0,
  }
}

/**
 * What an admin sent, as the columns to write. Unknown keys are ignored; a
 * value of the wrong kind is an error. New rules words bump the version, so
 * every member is asked to accept them again before their next message.
 */
export function chatSettingsPatch(raw: unknown, current: ChatSettings): { ok: true; columns: Record<string, unknown>; next: ChatSettings } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const next: ChatSettings = { ...current }
  if ("dmPolicy" in r) {
    if (!DM_POLICIES.includes(r.dmPolicy as DmPolicy)) return { ok: false, error: "Pick who can send messages." }
    next.dmPolicy = r.dmPolicy as DmPolicy
  }
  if ("groupsPolicy" in r) {
    if (!GROUP_POLICIES.includes(r.groupsPolicy as GroupsPolicy)) return { ok: false, error: "Pick who can start a group." }
    next.groupsPolicy = r.groupsPolicy as GroupsPolicy
  }
  for (const k of ["attachmentsEnabled", "pushPreviews"] as const) {
    if (k in r) {
      if (typeof r[k] !== "boolean") return { ok: false, error: "That switch could not be saved." }
      next[k] = r[k] as boolean
    }
  }
  if ("rules" in r) {
    if (typeof r.rules !== "string") return { ok: false, error: "The rules could not be saved." }
    const rules = cleanRules(r.rules)
    if (rules.length > CHAT_RULES_MAX) return { ok: false, error: "Keep the chat rules under 4,000 characters." }
    if (rules !== current.rules) {
      next.rules = rules
      next.rulesVersion = rules ? current.rulesVersion + 1 : current.rulesVersion
    }
  }
  return {
    ok: true,
    next,
    columns: {
      dm_policy: next.dmPolicy,
      groups_policy: next.groupsPolicy,
      attachments_enabled: next.attachmentsEnabled,
      push_previews: next.pushPreviews,
      rules: next.rules,
      rules_version: next.rulesVersion,
    },
  }
}

export function cleanRules(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Whether a member must accept the chat rules before they send. */
export function rulesNeeded(settings: Pick<ChatSettings, "rules" | "rulesVersion">, acceptedVersion: number | null | undefined): boolean {
  if (!settings.rules.trim() || settings.rulesVersion <= 0) return false
  return !acceptedVersion || acceptedVersion < settings.rulesVersion
}

/** A chat only ban or mute that is in force now, or null. */
export function chatRestriction(state: { chatBannedAt?: string | null; chatMutedUntil?: string | null } | null | undefined, now: number = Date.now()): { kind: "banned" } | { kind: "muted"; until: string } | null {
  if (!state) return null
  if (state.chatBannedAt) return { kind: "banned" }
  if (state.chatMutedUntil && Date.parse(state.chatMutedUntil) > now) return { kind: "muted", until: state.chatMutedUntil }
  return null
}

export type DmRefusal = "off" | "blocked" | "staff_only" | "they_staff_only" | "they_nobody" | "self"

/**
 * May this person start or continue a conversation with that one? The
 * community's rule first, then a block either way, then the other person's
 * own choice. The team (owner, admins, moderators) can always reach a member
 * while messages are on, so a member who chose "nobody" can still be told
 * something by the people running the community.
 */
export function dmDecision(i: {
  policy: DmPolicy
  senderId: string
  senderRole: string | null
  recipientId: string
  recipientRole: string | null
  recipientDms: MemberDms
  blocked: boolean
}): { ok: true } | { ok: false; reason: DmRefusal; error: string } {
  if (i.senderId === i.recipientId) return { ok: false, reason: "self", error: "You cannot message yourself." }
  if (i.policy === "off") return { ok: false, reason: "off", error: "Messages between members are turned off in this community." }
  if (i.blocked) return { ok: false, reason: "blocked", error: "You can't message this person." }
  const senderStaff = isStaffRole(i.senderRole)
  if (senderStaff) return { ok: true }
  if (i.policy === "staff" && !isStaffRole(i.recipientRole)) return { ok: false, reason: "staff_only", error: "In this community you can message the admins and moderators only." }
  if (i.recipientDms === "nobody") return { ok: false, reason: "they_nobody", error: "This member is not taking messages." }
  if (i.recipientDms === "staff") return { ok: false, reason: "they_staff_only", error: "This member takes messages from the admins only." }
  return { ok: true }
}

export function groupCreateAllowed(policy: GroupsPolicy, role: string | null): boolean {
  if (policy === "off") return false
  if (policy === "staff") return isStaffRole(role)
  return true
}

/** Seconds still to wait before the next message in a slow channel, 0 when it may go now. */
export function slowModeWait(lastAtMs: number | null, seconds: number, now: number = Date.now()): number {
  if (!seconds || seconds <= 0 || lastAtMs === null || !Number.isFinite(lastAtMs)) return 0
  const left = lastAtMs + seconds * 1000 - now
  return left > 0 ? Math.ceil(left / 1000) : 0
}

export function slowModeOfSpace(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 && n <= 3600 ? n : 0
}

export function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`
  const m = Math.ceil(seconds / 60)
  return `${m} minute${m === 1 ? "" : "s"}`
}

/* ── Pushes ─────────────────────────────────────────────────────────────── */

export interface ChatPref {
  notify: ChatNotify
  mutedUntil: string | null
}

export type ChatPushVerdict = "push" | "self" | "viewing" | "muted" | "level"

/**
 * Whether one person's phone is told about one new message. Never their own
 * message; never while they have that chat open (a read mark renewed in the
 * last VIEWING_MS); not while they muted it, unless it names them or answers
 * them; and in a channel only when they asked for every message or it is
 * about them (a channel is many people, a conversation or a group is a few).
 */
export function chatPushVerdict(i: { kind: ChatKind; senderId: string; recipientId: string; readAt: string | null; pref: ChatPref | null; addressed: boolean; now?: number }): ChatPushVerdict {
  const now = i.now ?? Date.now()
  if (i.senderId === i.recipientId) return "self"
  if (i.readAt && now - Date.parse(i.readAt) < VIEWING_MS) return "viewing"
  const pref = i.pref
  if (pref?.notify === "none") return "muted"
  if (pref?.mutedUntil && Date.parse(pref.mutedUntil) > now && !i.addressed) return "muted"
  const level = !pref || pref.notify === "default" ? (i.kind === "space" ? "mentions" : "all") : pref.notify
  if (level === "mentions" && !i.addressed) return "level"
  return "push"
}

type MediaLike = { type?: unknown }

/** The words a phone's banner shows: the message, or what it carries, or nothing about it when previews are off. */
export function pushPreviewText(previews: boolean, text: string, media: readonly MediaLike[] = []): string {
  if (!previews) return "New message"
  const line = text.replace(/\s+/g, " ").trim()
  if (line) return line
  return attachmentLine(media) || "New message"
}

/** "Photo", "3 photos", "Video", "File": what a message with no words carries. */
export function attachmentLine(all: readonly MediaLike[]): string {
  /* A link's card (round 38) is about the words, not something the message carries. */
  const media = all.filter((m) => m.type !== "link")
  if (!media.length) return all.length ? "Link" : ""
  const pics = media.filter((m) => m.type === "image" || m.type === "gif").length
  const vids = media.filter((m) => m.type === "video").length
  const files = media.filter((m) => m.type === "file").length
  if (pics && !vids && !files) return pics === 1 ? "Photo" : `${pics} photos`
  if (vids && !pics && !files) return vids === 1 ? "Video" : `${vids} videos`
  if (files && !pics && !vids) return files === 1 ? "File" : `${files} files`
  return `${media.length} attachments`
}

/* ── The list in the browser ─────────────────────────────────────────────── */

export type SendState = "sending" | "failed"

export interface Orderable {
  id: string
  clientId?: string | null
  createdAt: string
  state?: SendState
}

/**
 * One list from what is shown and what just came: one row per message
 * (matched by id, or by the sender's client id for a message still being
 * sent), ordered by the server's time and then the id, so two people see the
 * same order. A message still sending or failed stays at the end, in the
 * order it was written, until the server's copy takes its place.
 */
export function mergeMessages<T extends Orderable>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>()
  const pending: T[] = []
  const clientIds = new Set<string>()
  for (const m of incoming) if (!m.state && m.clientId) clientIds.add(m.clientId)
  for (const m of [...current, ...incoming]) {
    if (m.state) {
      if (m.clientId && clientIds.has(m.clientId)) continue
      const at = pending.findIndex((p) => p.id === m.id)
      if (at >= 0) pending[at] = m
      else pending.push(m)
      continue
    }
    byId.set(m.id, m)
  }
  const settled = [...byId.values()].sort(compareMessages)
  return [...settled, ...pending]
}

export function compareMessages(a: Orderable, b: Orderable): number {
  const ta = Date.parse(a.createdAt)
  const tb = Date.parse(b.createdAt)
  if (ta !== tb) return ta - tb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The newest message the server has written, for asking what came after it. */
export function lastSettled<T extends Orderable>(list: readonly T[]): T | null {
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].state) return list[i]
  return null
}

export function firstSettled<T extends Orderable>(list: readonly T[]): T | null {
  for (const m of list) if (!m.state) return m
  return null
}

/** A sender's own id for one message: random, URL safe, 8 to 64 characters as part 270 asks. */
export function newClientId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

export function cleanClientId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null
}

/** The realtime topic a chat's typing travels on; part 270's community_chat_topic_ok checks it. */
export function typingTopic(kind: ChatKind, id: string): string {
  return `chat:${kind}:${id}`
}

/** Messages from one person this close together are one group of bubbles. */
export const BUBBLE_GROUP_MS = 5 * 60_000

export function sameBubbleGroup(a: { authorId: string | null; createdAt: string } | undefined, b: { authorId: string | null; createdAt: string } | undefined): boolean {
  if (!a || !b) return false
  if (a.authorId !== b.authorId) return false
  if (localDay(a.createdAt) !== localDay(b.createdAt)) return false
  return Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) <= BUBBLE_GROUP_MS
}

export function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** "Ana is typing", "Ana and Ben are typing", "3 people are typing". */
export function typingLine(names: readonly string[]): string {
  const n = names.filter(Boolean)
  if (!n.length) return ""
  if (n.length === 1) return `${n[0]} is typing`
  if (n.length === 2) return `${n[0]} and ${n[1]} are typing`
  return `${n.length} people are typing`
}
