import "server-only"

/**
 * ===========================================================================
 *  CHAT SETTINGS, RULES, RESTRICTIONS, BLOCKS AND MUTES (round 37, part 270)
 * ===========================================================================
 * Reads and writes for what decides who may chat, kept apart from the
 * messages themselves (./chat.ts, ./direct.ts, ./groups.ts). Every read here
 * survives part 270 not having run: the settings are the defaults, a member
 * has no chat restriction, nobody is blocked and nothing is muted, so chat
 * works exactly as it did before the part.
 *
 * chatGate is what every chat write calls first, after requireMember(...,
 * "chat"): chat on, no chat only ban or mute in force, and the chat rules
 * accepted when the community has them (409 with `code: "rules"`, which the
 * page answers by showing the rules once).
 */
import { chatRestriction, chatSettingsOf, chatSettingsPatch, memberDmsOf, rulesNeeded, type ChatKind, type ChatNotify, type ChatPref, type ChatSettings, type MemberDms } from "../chat-rules"
import { ROLE_RANK } from "../permissions"
import type { CommunityRow, Role } from "../types"
import { audit } from "./audit"
import type { Viewer } from "./context"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ChatMemberState {
  chatDms: MemberDms
  rulesVersion: number | null
  chatMutedUntil: string | null
  chatBannedAt: string | null
  role: Role | null
  active: boolean
}

export type ChatRefusal = { ok: false; error: string; status: number; code?: "rules" | "chat_banned" | "chat_muted" | "off" }

/** The community's chat settings; the defaults before part 270, or when the row is not there yet. */
export async function loadChatSettings(db: Db, communityId: string): Promise<ChatSettings & { ready: boolean }> {
  try {
    const { data, error } = await db.from("community_chat_settings").select("dm_policy, groups_policy, attachments_enabled, push_previews, rules, rules_version").eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] chat settings read: ${reasonOf(error)}`)
      return { ...chatSettingsOf(null), ready: !missing(error) }
    }
    return { ...chatSettingsOf(data as Record<string, unknown> | null), ready: true }
  } catch (e) {
    console.error(`[communities] chat settings read: ${reasonOf(e)}`)
    return { ...chatSettingsOf(null), ready: false }
  }
}

/** An admin's change to the settings (the route checked manage_settings). */
export async function saveChatSettings(db: Db, communityId: string, actorId: string, raw: unknown): Promise<{ ok: true; value: ChatSettings } | ChatRefusal> {
  const current = await loadChatSettings(db, communityId)
  if (!current.ready) return { ok: false, error: "Chat settings are not set up yet. Run the database update (part 270) first.", status: 503 }
  const patch = chatSettingsPatch(raw, current)
  if (!patch.ok) return { ok: false, error: patch.error, status: 400 }
  const { error } = await db.from("community_chat_settings").upsert({ community_id: communityId, ...patch.columns, updated_by: actorId, updated_at: nowIso() }, { onConflict: "community_id" })
  if (error) {
    console.error(`[communities] chat settings save: ${reasonOf(error)}`)
    return { ok: false, error: "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  }
  if (patch.next.rulesVersion !== current.rulesVersion) {
    await audit(db, { communityId, actorId, actorKind: "member", action: "chat.rules_changed", targetType: "community", targetId: communityId, targetLabel: "Chat rules", reason: null, detail: { version: patch.next.rulesVersion } })
  }
  return { ok: true, value: patch.next }
}

/** One member's chat columns (part 270), or the defaults before it ran. Null when they are not a member at all. */
export async function chatMemberState(db: Db, communityId: string, userId: string | null): Promise<ChatMemberState | null> {
  if (!userId || !UUID.test(userId)) return null
  try {
    const { data, error } = await db.from("community_members").select("role, status, banned_at, chat_dms, chat_rules_version, chat_muted_until, chat_banned_at").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
    if (error && missing(error)) {
      const plain = await db.from("community_members").select("role, status, banned_at").eq("community_id", communityId).eq("user_id", userId).maybeSingle()
      const p = plain.data as { role: Role; status: string; banned_at: string | null } | null
      return p ? { chatDms: "everyone", rulesVersion: null, chatMutedUntil: null, chatBannedAt: null, role: p.role, active: p.status === "active" && !p.banned_at } : null
    }
    const r = data as { role: Role; status: string; banned_at: string | null; chat_dms: unknown; chat_rules_version: number | null; chat_muted_until: string | null; chat_banned_at: string | null } | null
    if (!r) return null
    return { chatDms: memberDmsOf(r.chat_dms), rulesVersion: r.chat_rules_version ?? null, chatMutedUntil: r.chat_muted_until, chatBannedAt: r.chat_banned_at, role: r.role, active: r.status === "active" && !r.banned_at }
  } catch (e) {
    console.error(`[communities] chat member read: ${reasonOf(e)}`)
    return null
  }
}

/** The same for several people at once: who may be messaged, who is in good standing. */
export async function chatMemberStates(db: Db, communityId: string, userIds: string[]): Promise<Map<string, ChatMemberState>> {
  const out = new Map<string, ChatMemberState>()
  const ids = [...new Set(userIds.filter((id) => UUID.test(id)))].slice(0, 200)
  if (!ids.length) return out
  let { data, error } = await db.from("community_members").select("user_id, role, status, banned_at, chat_dms, chat_rules_version, chat_muted_until, chat_banned_at").eq("community_id", communityId).in("user_id", ids)
  if (error && missing(error)) ({ data, error } = await db.from("community_members").select("user_id, role, status, banned_at").eq("community_id", communityId).in("user_id", ids))
  for (const r of (data as Record<string, unknown>[] | null) ?? []) {
    out.set(String(r.user_id), {
      chatDms: memberDmsOf(r.chat_dms),
      rulesVersion: (r.chat_rules_version as number | null) ?? null,
      chatMutedUntil: (r.chat_muted_until as string | null) ?? null,
      chatBannedAt: (r.chat_banned_at as string | null) ?? null,
      role: r.role as Role,
      active: r.status === "active" && !r.banned_at,
    })
  }
  return out
}

/**
 * The gate for every chat write: chat on, no chat ban or mute, rules
 * accepted. Answers the settings and the member's state so the caller does
 * not read them again.
 */
export async function chatGate(db: Db, community: Pick<CommunityRow, "id" | "chat_enabled">, viewer: Viewer): Promise<{ ok: true; settings: ChatSettings; state: ChatMemberState | null } | ChatRefusal> {
  if (!community.chat_enabled) return { ok: false, error: "Chat is turned off in this community.", status: 403, code: "off" }
  const [settings, state] = await Promise.all([loadChatSettings(db, community.id), chatMemberState(db, community.id, viewer.userId)])
  const r = chatRestriction(state)
  if (r?.kind === "banned") return { ok: false, error: "You can't send messages in this community's chat.", status: 403, code: "chat_banned" }
  if (r?.kind === "muted") return { ok: false, error: `You can send messages again ${new Date(r.until).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`, status: 403, code: "chat_muted" }
  if (rulesNeeded(settings, state?.rulesVersion)) return { ok: false, error: "Read and accept the chat rules first.", status: 409, code: "rules" }
  return { ok: true, settings, state }
}

/** The member accepted the rules as they read now. */
export async function acceptChatRules(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer): Promise<{ ok: true; version: number } | ChatRefusal> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  const settings = await loadChatSettings(db, community.id)
  if (!settings.ready) return { ok: true, version: 0 }
  const { error } = await db.from("community_members").update({ chat_rules_version: settings.rulesVersion, chat_rules_accepted_at: nowIso() }).eq("community_id", community.id).eq("user_id", viewer.userId)
  if (error) return { ok: false, error: "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  return { ok: true, version: settings.rulesVersion }
}

/** What a member sees about chat before they write: the rules, whether they still need to accept them, and their own standing. */
export async function chatIntro(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer) {
  const [settings, state, me] = await Promise.all([
    loadChatSettings(db, community.id),
    chatMemberState(db, community.id, viewer.userId),
    viewer.userId ? authorViews(db, community.id, [viewer.userId]).then((m) => m.get(String(viewer.userId)) ?? null, () => null) : Promise.resolve(null),
  ])
  const r = chatRestriction(state)
  return {
    ready: settings.ready,
    rules: settings.rules,
    rulesVersion: settings.rulesVersion,
    needsRules: rulesNeeded(settings, state?.rulesVersion),
    dmPolicy: settings.dmPolicy,
    groupsPolicy: settings.groupsPolicy,
    attachments: settings.attachmentsEnabled,
    myDms: state?.chatDms ?? "everyone",
    restriction: r ? (r.kind === "banned" ? { kind: "banned" as const } : { kind: "muted" as const, until: r.until }) : null,
    /* The viewer's own name, for "Ana is typing" on the other screens. */
    myName: me?.name ?? null,
  }
}

/** The member's own choice of who may message them. */
export async function setMyDms(db: Db, community: Pick<CommunityRow, "id">, viewer: Viewer, raw: unknown): Promise<{ ok: true; value: MemberDms } | ChatRefusal> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  if (!["everyone", "staff", "nobody"].includes(raw as string)) return { ok: false, error: "Pick who can message you.", status: 400 }
  const { error } = await db.from("community_members").update({ chat_dms: raw }).eq("community_id", community.id).eq("user_id", viewer.userId)
  if (error) return { ok: false, error: "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  return { ok: true, value: raw as MemberDms }
}

/* ── Moderation: chat only mute and ban ─────────────────────────────────── */

export const CHAT_MUTE_CHOICES = [60, 24 * 60, 7 * 24 * 60] as const

/**
 * A moderator mutes or bans a member from chat, or lifts it. Never someone
 * at or above their own role, never the owner. Written to the audit log.
 */
export async function setChatRestriction(
  db: Db,
  community: Pick<CommunityRow, "id" | "owner_user_id">,
  actor: Pick<Viewer, "userId" | "role">,
  targetId: unknown,
  raw: unknown,
): Promise<{ ok: true; value: { chatMutedUntil: string | null; chatBannedAt: string | null } } | ChatRefusal> {
  if (!actor.userId || !actor.role) return { ok: false, error: "Sign in first.", status: 401 }
  if (typeof targetId !== "string" || !UUID.test(targetId)) return { ok: false, error: "That member is not here.", status: 400 }
  if (targetId === actor.userId) return { ok: false, error: "You cannot restrict yourself.", status: 400 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const action = r.action
  if (action !== "mute" && action !== "ban" && action !== "clear") return { ok: false, error: "Pick mute, ban or lift.", status: 400 }
  const target = await chatMemberState(db, community.id, targetId)
  if (!target) return { ok: false, error: "That member is not here.", status: 404 }
  const targetRole: Role = targetId === community.owner_user_id ? "owner" : (target.role ?? "member")
  if (ROLE_RANK[targetRole] >= ROLE_RANK[actor.role]) return { ok: false, error: "You cannot restrict someone at or above your role.", status: 403 }
  const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 500) || null : null
  let patch: Record<string, unknown>
  if (action === "clear") patch = { chat_muted_until: null, chat_banned_at: null, chat_restricted_by: actor.userId, chat_restriction_reason: null }
  else if (action === "ban") patch = { chat_banned_at: nowIso(), chat_muted_until: null, chat_restricted_by: actor.userId, chat_restriction_reason: reason }
  else {
    const minutes = Number(r.minutes)
    if (!CHAT_MUTE_CHOICES.includes(minutes as (typeof CHAT_MUTE_CHOICES)[number])) return { ok: false, error: "Pick how long.", status: 400 }
    patch = { chat_muted_until: nowIso(Date.now() + minutes * 60_000), chat_banned_at: null, chat_restricted_by: actor.userId, chat_restriction_reason: reason }
  }
  const { error } = await db.from("community_members").update(patch).eq("community_id", community.id).eq("user_id", targetId)
  if (error) return { ok: false, error: missing(error) ? "Chat moderation is not set up yet. Run the database update (part 270) first." : "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  await audit(db, { communityId: community.id, actorId: actor.userId, actorKind: "member", action: `chat.${action === "clear" ? "restriction_lifted" : action === "ban" ? "banned" : "muted"}`, targetType: "member", targetId, targetLabel: null, reason, detail: action === "mute" ? { minutes: Number(r.minutes) } : {} })
  return { ok: true, value: { chatMutedUntil: (patch.chat_muted_until as string | null) ?? null, chatBannedAt: (patch.chat_banned_at as string | null) ?? null } }
}

/** Members kept out of chat now, for the admin's Chat panel. */
export async function chatRestricted(db: Db, communityId: string): Promise<{ userId: string; chatMutedUntil: string | null; chatBannedAt: string | null; reason: string | null }[]> {
  try {
    const { data, error } = await db
      .from("community_members")
      .select("user_id, chat_muted_until, chat_banned_at, chat_restriction_reason")
      .eq("community_id", communityId)
      .or(`chat_banned_at.not.is.null,chat_muted_until.gt.${nowIso()}`)
      .limit(100)
    if (error) return []
    return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({ userId: String(r.user_id), chatMutedUntil: (r.chat_muted_until as string | null) ?? null, chatBannedAt: (r.chat_banned_at as string | null) ?? null, reason: (r.chat_restriction_reason as string | null) ?? null }))
  } catch {
    return []
  }
}

/* ── Blocks ────────────────────────────────────────────────────────────── */

/** Whether either of the two blocked the other. False before part 270. */
export async function blockedBetween(db: Db, a: string, b: string): Promise<boolean> {
  if (!UUID.test(a) || !UUID.test(b)) return false
  try {
    const { data, error } = await db.from("community_member_blocks").select("user_id").or(`and(user_id.eq.${a},blocked_id.eq.${b}),and(user_id.eq.${b},blocked_id.eq.${a})`).limit(1)
    if (error) return false
    return ((data as unknown[] | null) ?? []).length > 0
  } catch {
    return false
  }
}

/** The people this person blocked, or who blocked them, among `ids`. */
export async function blockedAmong(db: Db, me: string, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const list = ids.filter((id) => UUID.test(id) && id !== me).slice(0, 200)
  if (!list.length || !UUID.test(me)) return out
  try {
    const [mine, theirs] = await Promise.all([
      db.from("community_member_blocks").select("blocked_id").eq("user_id", me).in("blocked_id", list),
      db.from("community_member_blocks").select("user_id").eq("blocked_id", me).in("user_id", list),
    ])
    for (const r of (mine.data as { blocked_id: string }[] | null) ?? []) out.add(r.blocked_id)
    for (const r of (theirs.data as { user_id: string }[] | null) ?? []) out.add(r.user_id)
  } catch {
    /* Nobody is left out. */
  }
  return out
}

export async function iBlocked(db: Db, me: string, other: string): Promise<boolean> {
  if (!UUID.test(me) || !UUID.test(other)) return false
  const { data, error } = await db.from("community_member_blocks").select("user_id").eq("user_id", me).eq("blocked_id", other).maybeSingle()
  return !error && !!data
}

export async function setBlock(db: Db, me: string, other: unknown, on: boolean): Promise<{ ok: true; value: boolean } | ChatRefusal> {
  if (typeof other !== "string" || !UUID.test(other) || other === me) return { ok: false, error: "That person is not here.", status: 400 }
  const q = on ? db.from("community_member_blocks").upsert({ user_id: me, blocked_id: other }, { onConflict: "user_id,blocked_id" }) : db.from("community_member_blocks").delete().eq("user_id", me).eq("blocked_id", other)
  const { error } = await q
  if (error) return { ok: false, error: missing(error) ? "Blocking is not set up yet." : "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  return { ok: true, value: on }
}

/* ── A person's mute and notification choice per chat ───────────────────── */

const NOTIFY: readonly ChatNotify[] = ["default", "all", "mentions", "none"]

export async function chatPrefsFor(db: Db, chatType: ChatKind, chatId: string, userIds: string[]): Promise<Map<string, ChatPref>> {
  const out = new Map<string, ChatPref>()
  const ids = userIds.filter((id) => UUID.test(id)).slice(0, 500)
  if (!ids.length || !UUID.test(chatId)) return out
  try {
    const { data, error } = await db.from("community_chat_prefs").select("user_id, notify, muted_until").eq("chat_type", chatType).eq("chat_id", chatId).in("user_id", ids)
    if (error) return out
    for (const r of (data as { user_id: string; notify: ChatNotify; muted_until: string | null }[] | null) ?? []) out.set(r.user_id, { notify: NOTIFY.includes(r.notify) ? r.notify : "default", mutedUntil: r.muted_until })
  } catch {
    /* Defaults for everybody. */
  }
  return out
}

/** People who asked for every message of a channel (a channel's default is mentions only). */
export async function everyMessageListeners(db: Db, spaceId: string, limit = 300): Promise<string[]> {
  try {
    const { data, error } = await db.from("community_chat_prefs").select("user_id").eq("chat_type", "space").eq("chat_id", spaceId).eq("notify", "all").limit(limit)
    if (error) return []
    return ((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id)
  } catch {
    return []
  }
}

export async function myChatPref(db: Db, userId: string, chatType: ChatKind, chatId: string): Promise<ChatPref> {
  return (await chatPrefsFor(db, chatType, chatId, [userId])).get(userId) ?? { notify: "default", mutedUntil: null }
}

export async function setChatPref(db: Db, userId: string, communityId: string, chatType: unknown, chatId: unknown, raw: unknown): Promise<{ ok: true; value: ChatPref } | ChatRefusal> {
  if (!["space", "dm", "group"].includes(chatType as string) || typeof chatId !== "string" || !UUID.test(chatId)) return { ok: false, error: "That chat is not here.", status: 400 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const notify = NOTIFY.includes(r.notify as ChatNotify) ? (r.notify as ChatNotify) : "default"
  let mutedUntil: string | null = null
  if (r.muteMinutes !== undefined && r.muteMinutes !== null) {
    const m = Number(r.muteMinutes)
    if (!Number.isFinite(m) || m < 0 || m > 60 * 24 * 365 * 10) return { ok: false, error: "Pick how long.", status: 400 }
    mutedUntil = m > 0 ? nowIso(Date.now() + m * 60_000) : null
  }
  const { error } = await db.from("community_chat_prefs").upsert({ user_id: userId, community_id: communityId, chat_type: chatType, chat_id: chatId, notify, muted_until: mutedUntil, updated_at: nowIso() }, { onConflict: "user_id,chat_type,chat_id" })
  if (error) return { ok: false, error: missing(error) ? "Muting is not set up yet." : "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  return { ok: true, value: { notify, mutedUntil } }
}
