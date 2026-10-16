import "server-only"

/**
 * ===========================================================================
 *  A NEW MEMBER'S FIRST STEPS, ON THE SERVER (round 32)
 * ===========================================================================
 * Settings › Features › First steps writes the list and the welcome message
 * (saveOnboardingConfig, manage_settings, checked by the route). A member's
 * feed asks for their list (memberChecklist: an active member, not the
 * owner, in their first 30 days, list not finished or hidden). Steps a
 * member does anyway are read from community_activity (a post, a comment, a
 * lesson, an RSVP) and their community bio; the rest they mark by opening or
 * ticking them (markStep), and they can hide the list (dismiss).
 *
 * THE WELCOME MESSAGE goes once per member, from the owner, as a direct
 * message (welcomeNewMember, called from membership.ts when somebody becomes
 * active). It needs member messages (part 83) and Chat on; the progress row
 * `welcome_dm` is claimed first (its primary key makes the claim one), so two
 * activations at once send one message, and a member who leaves and comes
 * back is not welcomed twice. Nothing here ever throws into a join.
 *
 * Before part 193 every read answers "not ready" and nothing is shown or
 * sent.
 */
import { communityPath } from "@/components/community/public/paths"
import { ACTIVITY_OF, PROGRESS_DISMISSED, PROGRESS_WELCOME_DM, STEP_DEFAULT_LABEL, checkOnboarding, checklistWindow, manualStep, readOnboarding, welcomeText, type ChecklistItemView, type ChecklistView, type OnboardingConfig } from "../onboarding-checklist"
import type { CommunityRow, MemberRow } from "../types"
import type { Viewer } from "./context"
import { audit } from "./audit"
import { isUniqueViolation, missing, nowIso, reasonOf, type Db } from "./db"

export interface OnboardingState {
  /** Part 193 has run. */
  ready: boolean
  config: OnboardingConfig
}

const EMPTY: OnboardingConfig = { steps: [], dmEnabled: false, dmBody: "" }

export async function readOnboardingConfig(db: Db, communityId: string): Promise<OnboardingState> {
  try {
    const { data, error } = await db.from("community_onboarding").select("steps, dm_enabled, dm_body").eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] onboarding read: ${reasonOf(error)}`)
      return { ready: !missing(error), config: EMPTY }
    }
    return { ready: true, config: readOnboarding(data as { steps?: unknown; dm_enabled?: unknown; dm_body?: unknown } | null) }
  } catch (e) {
    console.error(`[communities] onboarding read: ${reasonOf(e)}`)
    return { ready: false, config: EMPTY }
  }
}

export type OnboardingResult = { ok: true; config: OnboardingConfig } | { ok: false; status: number; error: string; index?: number }

export async function saveOnboardingConfig(db: Db, a: { communityId: string; actorId: string; raw: unknown }): Promise<OnboardingResult> {
  const checked = checkOnboarding(a.raw)
  if (checked.ok === false) return { ok: false, status: 400, error: checked.error, index: checked.index }
  const c = checked.value
  const { error } = await db.from("community_onboarding").upsert({ community_id: a.communityId, steps: c.steps, dm_enabled: c.dmEnabled, dm_body: c.dmBody, updated_by: a.actorId, updated_at: nowIso() }, { onConflict: "community_id" })
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_ready" }
    console.error(`[communities] onboarding save: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "That did not save. Try again." }
  }
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "onboarding.saved", targetType: "community", targetId: a.communityId, detail: { steps: c.steps.map((s) => s.kind), welcomeMessage: c.dmEnabled } })
  return { ok: true, config: c }
}

async function progressOf(db: Db, communityId: string, userId: string): Promise<Set<string> | null> {
  const { data, error } = await db.from("community_onboarding_progress").select("step").eq("community_id", communityId).eq("user_id", userId).limit(50)
  if (error) {
    if (!missing(error)) console.error(`[communities] onboarding progress read: ${reasonOf(error)}`)
    return null
  }
  return new Set(((data as { step: string }[] | null) ?? []).map((r) => r.step))
}

/** Whether this member did one kind of thing in the community: one row on the (community, member, kind) index. */
async function didActivity(db: Db, communityId: string, userId: string, kind: string): Promise<boolean> {
  const { data, error } = await db.from("community_activity").select("id").eq("community_id", communityId).eq("user_id", userId).eq("kind", kind).limit(1)
  return !error && Array.isArray(data) && data.length > 0
}

/** Where a step sends the member. */
async function hrefOf(db: Db, community: Pick<CommunityRow, "id" | "slug">, userId: string, step: { kind: string; url: string }): Promise<string | null> {
  const home = communityPath(community.slug)
  switch (step.kind) {
    case "intro": {
      const { data } = await db.from("community_spaces").select("slug").eq("community_id", community.id).eq("slug", "introductions").is("archived_at", null).maybeSingle()
      return data ? `${home}/space/introductions` : home
    }
    case "profile":
      return `${home}/members/${userId}`
    case "rules":
      return `${home}/about#community-rules`
    case "learn":
      return `${home}/learn`
    case "event":
      return `${home}/events`
    case "custom":
      return step.url || null
    default:
      return home
  }
}

/**
 * The member's list, or null when there is nothing to show: no list, not an
 * active member, the owner, past their first 30 days, the list hidden, or
 * every step done.
 */
export async function memberChecklist(db: Db, community: CommunityRow, viewer: Viewer, now: number = Date.now()): Promise<ChecklistView | null> {
  const m = viewer.member
  if (!viewer.userId || !viewer.active || !m || viewer.isOwner || m.role === "owner") return null
  if (!checklistWindow(m.joined_at, now)) return null
  const { config } = await readOnboardingConfig(db, community.id)
  if (!config.steps.length) return null
  const progress = await progressOf(db, community.id, viewer.userId)
  if (!progress || progress.has(PROGRESS_DISMISSED)) return null
  const userId = viewer.userId
  const items: ChecklistItemView[] = await Promise.all(
    config.steps.map(async (s) => {
      const activity = ACTIVITY_OF[s.kind]
      const done = progress.has(s.id) || (s.kind === "profile" && !!m.bio?.trim()) || (activity ? await didActivity(db, community.id, userId, activity) : false)
      return { id: s.id, kind: s.kind, label: s.label || STEP_DEFAULT_LABEL[s.kind], href: await hrefOf(db, community, userId, s), done, manual: manualStep(s.kind) }
    }),
  )
  const done = items.filter((i) => i.done).length
  if (done === items.length) return null
  return { items, done, total: items.length }
}

export type StepResult = { ok: true } | { ok: false; status: number; error: string }

/** A step the member marked done (opened or ticked), or the list hidden. Only a step on the list now, and only one the member marks. */
export async function markStep(db: Db, community: CommunityRow, viewer: Viewer, step: unknown): Promise<StepResult> {
  if (!viewer.userId || !viewer.active) return { ok: false, status: 403, error: "not_member" }
  let key: string
  if (step === PROGRESS_DISMISSED) key = PROGRESS_DISMISSED
  else {
    const { config } = await readOnboardingConfig(db, community.id)
    const found = typeof step === "string" ? config.steps.find((s) => s.id === step) : undefined
    if (!found) return { ok: false, status: 404, error: "not_found" }
    if (!manualStep(found.kind)) return { ok: false, status: 409, error: "This step is done by doing it." }
    key = found.id
  }
  const { error } = await db.from("community_onboarding_progress").upsert({ community_id: community.id, user_id: viewer.userId, step: key, done_at: nowIso() }, { onConflict: "community_id,user_id,step", ignoreDuplicates: true })
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_ready" }
    console.error(`[communities] onboarding step: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "That did not save. Try again." }
  }
  return { ok: true }
}

/**
 * THE WELCOME MESSAGE, once per member (see the top of this file). Called
 * when a member row becomes active; never throws. Answers what happened,
 * for the tests and the log.
 */
type Direct = Pick<typeof import("./direct"), "directReady" | "openConversation" | "conversationOf" | "sendDirectMessage">

export async function welcomeNewMember(db: Db, row: Pick<MemberRow, "community_id" | "user_id" | "role" | "status">, given?: { direct?: Direct }): Promise<"sent" | "off" | "already" | "not_ready" | "failed"> {
  try {
    if (row.status !== "active" || row.role !== "member") return "off"
    const { config, ready } = await readOnboardingConfig(db, row.community_id)
    if (!ready) return "not_ready"
    if (!config.dmEnabled || !config.dmBody.trim()) return "off"
    const { loadCommunity, viewerContext, communityOpen } = await import("./context")
    const community = await loadCommunity(db, { id: row.community_id })
    if (!community || !communityOpen(community) || !community.chat_enabled || !community.owner_user_id || community.owner_user_id === row.user_id) return "off"
    const direct: Direct = given?.direct ?? (await import("./direct"))
    if (!(await direct.directReady(db, community))) return "off"
    /* The claim: one row per member, so this runs once whatever calls it. */
    const claim = await db.from("community_onboarding_progress").insert({ community_id: community.id, user_id: row.user_id, step: PROGRESS_WELCOME_DM, done_at: nowIso() })
    if (claim.error) return isUniqueViolation(claim.error) ? "already" : missing(claim.error) ? "not_ready" : "failed"
    const release = () => db.from("community_onboarding_progress").delete().eq("community_id", community.id).eq("user_id", row.user_id).eq("step", PROGRESS_WELCOME_DM)
    const owner = await viewerContext(db, community, community.owner_user_id)
    const sender: Viewer = { ...owner, role: "owner", active: true, isOwner: true }
    const opened = await direct.openConversation(db, community, sender, row.user_id)
    if (opened.ok === false) {
      await release()
      return "failed"
    }
    const conversation = await direct.conversationOf(db, community, sender, opened.value.id)
    const name = opened.value.other?.name ?? null
    const sent = conversation ? await direct.sendDirectMessage(db, community, sender, conversation, { body: welcomeText(config.dmBody, name) }) : null
    if (!sent?.ok) {
      await release()
      return "failed"
    }
    return "sent"
  } catch (e) {
    console.error(`[communities] welcome message: ${reasonOf(e)}`)
    return "failed"
  }
}
