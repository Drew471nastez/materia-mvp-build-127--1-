import "server-only"

/**
 * ===========================================================================
 *  THE CLASSROOM: A CREATOR'S COURSES, INSIDE THEIR COMMUNITY
 * ===========================================================================
 * A community attaches existing course products (community_courses: the
 * course, its place in the list, an access rule, and drip days counted from
 * the day the member joined). Nothing about the course is copied: the
 * lessons, the player, the signed video addresses and the progress rows are
 * the course's own (lib/courses/*).
 *
 * THE COMMUNITY GRANT. communityGrantsCourse is the one extra way into a
 * course that lib/courses/server.ts ownsProduct asks about, after the
 * purchase and the completed order: the person is an active member of an
 * open community that has the course attached, its access rule lets them
 * in (evaluateAccess, the same rule spaces and events use), and its drip day
 * has come. With communities switched off it never says yes. So the course
 * player, the lesson video, the captions, the attachments and the progress
 * all work for a member exactly as for a buyer, and stop the moment the
 * membership does.
 *
 * LOCKED COURSES are still listed, with the reason in words: "Pro members",
 * "Level 3", "Opens on Mar 4".
 *
 * FINISHING. When a member's progress in an attached course moves
 * (lib/courses/server.ts syncEnrollment), onCourseProgress records the
 * lessons finished for the community's activity and, the first time the
 * course is finished, awards course_completed points once per community
 * (key course:<productId>).
 */
import { communitiesEnabled } from "../flag"
import { evaluateAccess, parseAccessRule, type AccessResult } from "../access"
import type { CommunityRow, Role } from "../types"
import type { ClassroomCourse, CourseLock } from "@/components/community/classroom/model"
import { opensOnLabel } from "@/components/community/classroom/model"
import type { Viewer } from "./context"
import { missing, reasonOf, type Db } from "./db"
import { ownedProductIds } from "./membership"
import { recordActivity } from "./activity"
import { awardPoints } from "./points"

export const COURSE_COMPLETED_POINTS = 10
const DAY_MS = 86_400_000
const STAFF: readonly Role[] = ["owner", "admin", "moderator"]

export interface AttachedCourse {
  productId: string
  position: number
  access: unknown
  dripDays: number | null
}

/** When a drip course opens for a member: joined_at plus drip_days, or null when it does not drip. */
export function dripOpensAt(joinedAt: string | null | undefined, dripDays: number | null | undefined): string | null {
  const days = Math.floor(Number(dripDays) || 0)
  if (days <= 0) return null
  const joined = Date.parse(joinedAt ?? "")
  /* A member row with no join time is counted from now: it opens after the full wait, never early. */
  const from = Number.isFinite(joined) ? joined : Date.now()
  return new Date(from + days * DAY_MS).toISOString()
}

export interface LockViewer {
  role: Role | null
  active: boolean
  tierId: string | null
  ownedProductIds: readonly string[]
  level: number
  joinedAt: string | null
}

/**
 * Why a member may not open an attached course yet, or null when they may.
 * The access rule first (evaluateAccess), then the drip day. Staff are never
 * held by either.
 */
export function courseDenial(course: Pick<AttachedCourse, "access" | "dripDays">, v: LockViewer, now: number = Date.now()): (Exclude<AccessResult, { ok: true }> & { opensAt?: string }) | { ok: false; reason: "drip"; opensAt: string } | null {
  const access = evaluateAccess(parseAccessRule(course.access), v)
  if (access.ok === false) return access
  if (v.role && STAFF.includes(v.role)) return null
  const opensAt = dripOpensAt(v.joinedAt, course.dripDays)
  if (opensAt && Date.parse(opensAt) > now) return { ok: false, reason: "drip", opensAt }
  return null
}

function plural(name: string): string {
  return /members?$/i.test(name.trim()) ? name.trim() : `${name.trim()} members`
}

const ROLE_WORDS: Record<Role, string> = { owner: "The owner", admin: "Admins", moderator: "Moderators", member: "Members" }

/** The words for every lock on one page, with one read of tier names and one of product titles. */
async function lockLabels(db: Db, communityId: string, denials: { reason: string; need?: string }[]): Promise<{ tier: Map<string, string>; product: Map<string, string> }> {
  const tierIds = [...new Set(denials.filter((d) => d.reason === "tier" && d.need).map((d) => d.need as string))]
  const productIds = [...new Set(denials.filter((d) => d.reason === "product" && d.need).map((d) => d.need as string))]
  const [tiers, products] = await Promise.all([
    tierIds.length ? db.from("community_tiers").select("id, name").eq("community_id", communityId).in("id", tierIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : Promise.resolve({ data: [] }),
  ])
  return {
    tier: new Map(((tiers.data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name])),
    product: new Map(((products.data as { id: string; title: string | null }[] | null) ?? []).map((p) => [p.id, p.title || "a product"])),
  }
}

export function lockFor(denial: { reason: string; need?: string; opensAt?: string }, names: { tier: Map<string, string>; product: Map<string, string> }, timeZone?: string): CourseLock {
  switch (denial.reason) {
    case "drip":
      return { reason: "drip", label: opensOnLabel(denial.opensAt ?? "", timeZone), opensAt: denial.opensAt ?? null }
    case "tier":
      return { reason: "tier", label: plural(names.tier.get(denial.need ?? "") ?? "Paid"), opensAt: null }
    case "product":
      return { reason: "product", label: `Owners of ${names.product.get(denial.need ?? "") ?? "a product"}`, opensAt: null }
    case "level":
      return { reason: "level", label: `Level ${denial.need ?? ""}`.trim(), opensAt: null }
    case "role":
      return { reason: "role", label: ROLE_WORDS[(denial.need as Role) ?? "member"] ?? "Staff", opensAt: null }
    default:
      return { reason: "not_member", label: "Members", opensAt: null }
  }
}

/** The community's attached courses, in the creator's order. Empty before part 81. */
export async function attachedCourses(db: Db, communityId: string): Promise<AttachedCourse[]> {
  const { data, error } = await db
    .from("community_courses")
    .select("product_id, position, access, drip_days")
    .eq("community_id", communityId)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true })
    .limit(200)
  if (error) {
    if (!missing(error)) console.error(`[communities] classroom read: ${reasonOf(error)}`)
    return []
  }
  return ((data as { product_id: string; position: number; access: unknown; drip_days: number | null }[] | null) ?? []).map((r) => ({
    productId: r.product_id,
    position: r.position,
    access: r.access,
    dripDays: r.drip_days,
  }))
}

function lockViewer(viewer: Viewer): LockViewer {
  return { role: viewer.role, active: viewer.active, tierId: viewer.tierId, ownedProductIds: viewer.ownedProductIds, level: viewer.level, joinedAt: viewer.member?.joined_at ?? viewer.member?.created_at ?? null }
}

/**
 * Every course in the classroom, as cards: the cover, how many lessons,
 * the member's own progress (course_enrollments), and the lock in words.
 * A fixed handful of reads whatever the number of courses.
 */
export async function listClassroom(db: Db, community: CommunityRow, viewer: Viewer, opts: { now?: number; timeZone?: string } = {}): Promise<ClassroomCourse[]> {
  const now = opts.now ?? Date.now()
  const attached = await attachedCourses(db, community.id)
  if (attached.length === 0) return []
  const ids = attached.map((a) => a.productId)
  const { data: productRows } = await db.from("products").select("id, title, thumbnail_url, type").in("id", ids).eq("type", "course")
  const products = new Map(((productRows as { id: string; title: string | null; thumbnail_url: string | null }[] | null) ?? []).map((p) => [p.id, p]))
  if (products.size === 0) return []
  const { data: courseRows } = await db.from("courses").select("id, product_id").in("product_id", [...products.keys()])
  const courses = (courseRows as { id: string; product_id: string }[] | null) ?? []
  const courseIds = courses.map((c) => c.id)
  const { data: moduleRows } = courseIds.length ? await db.from("course_modules").select("id, course_id").in("course_id", courseIds) : { data: [] }
  const modules = (moduleRows as { id: string; course_id: string }[] | null) ?? []
  const { data: lessonRows } = modules.length ? await db.from("course_lessons").select("id, module_id, duration_seconds").in("module_id", modules.map((m) => m.id)) : { data: [] }
  const lessons = (lessonRows as { id: string; module_id: string; duration_seconds: number | null }[] | null) ?? []
  const { data: enrollmentRows } =
    viewer.userId && courseIds.length
      ? await db.from("course_enrollments").select("course_id, percent, completed_lessons, completed_at, last_lesson_id").eq("buyer_id", viewer.userId).in("course_id", courseIds)
      : { data: [] }
  const enrollments = new Map(
    ((enrollmentRows as { course_id: string; percent: number | null; completed_lessons: number | null; completed_at: string | null; last_lesson_id: string | null }[] | null) ?? []).map((e) => [e.course_id, e]),
  )

  const v = lockViewer(viewer)
  const denials = new Map(attached.map((a) => [a.productId, courseDenial(a, v, now)]))
  const names = await lockLabels(db, community.id, [...denials.values()].filter((d): d is NonNullable<typeof d> => !!d) as { reason: string; need?: string }[])

  const out: ClassroomCourse[] = []
  for (const a of attached) {
    const product = products.get(a.productId)
    if (!product) continue
    const course = courses.find((c) => c.product_id === a.productId)
    const moduleIds = new Set(modules.filter((m) => m.course_id === course?.id).map((m) => m.id))
    const own = lessons.filter((l) => moduleIds.has(l.module_id))
    const enrollment = course ? enrollments.get(course.id) : undefined
    const percent = Math.max(0, Math.min(100, Math.round(Number(enrollment?.percent) || 0)))
    const status: ClassroomCourse["status"] = enrollment?.completed_at ? "completed" : percent > 0 || (enrollment?.completed_lessons ?? 0) > 0 ? "in_progress" : "not_started"
    const denial = denials.get(a.productId)
    const resume = !denial && status === "in_progress" && enrollment?.last_lesson_id ? `?lesson=${enrollment.last_lesson_id}` : ""
    out.push({
      productId: a.productId,
      title: product.title || "Course",
      coverUrl: product.thumbnail_url,
      lessons: own.length,
      completedLessons: Math.min(own.length, Math.max(0, Number(enrollment?.completed_lessons) || 0)),
      percent: status === "completed" ? 100 : percent,
      status,
      totalSeconds: own.reduce((s, l) => s + (Number(l.duration_seconds) || 0), 0),
      locked: denial ? lockFor(denial as { reason: string; need?: string; opensAt?: string }, names, opts.timeZone) : null,
      href: `/community/${community.slug}/classroom/${a.productId}${resume}`,
    })
  }
  return out
}

/** One attached course for the course page: its card (with any lock), or null when it is not in this classroom. */
export async function classroomCourse(db: Db, community: CommunityRow, viewer: Viewer, productId: string, opts: { now?: number; timeZone?: string } = {}): Promise<ClassroomCourse | null> {
  const list = await listClassroom(db, community, viewer, opts)
  return list.find((c) => c.productId === productId) ?? null
}

/**
 * THE COMMUNITY GRANT (lib/courses/server.ts ownsProduct). True when this
 * person may take this course through a community: an active member of an
 * open community that has it attached, the access rule says yes, and the
 * drip day has come. Never throws; anything uncertain is no.
 */
export async function communityGrantsCourse(db: Db, userId: string, productId: string, opts: { enabled?: boolean; now?: number } = {}): Promise<boolean> {
  try {
    const { data: links, error } = await db.from("community_courses").select("community_id, access, drip_days").eq("product_id", productId).limit(50)
    if (error || !links || (links as unknown[]).length === 0) return false
    const enabled = opts.enabled ?? (await communitiesEnabled())
    if (!enabled) return false
    const rows = links as { community_id: string; access: unknown; drip_days: number | null }[]
    const { data: memberRows } = await db
      .from("community_members")
      .select("community_id, role, tier_id, level, joined_at, created_at, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("community_id", rows.map((r) => r.community_id))
    const members = (memberRows as { community_id: string; role: Role; tier_id: string | null; level: number; joined_at: string | null; created_at: string; status: string }[] | null) ?? []
    if (members.length === 0) return false
    const { data: communityRows } = await db.from("communities").select("id, status, suspended_at, deleted_at").in("id", members.map((m) => m.community_id))
    const open = new Set(
      ((communityRows as { id: string; status: string; suspended_at: string | null; deleted_at: string | null }[] | null) ?? [])
        .filter((c) => !c.deleted_at && !c.suspended_at && c.status !== "suspended")
        .map((c) => c.id),
    )
    for (const m of members) {
      if (!open.has(m.community_id)) continue
      const link = rows.find((r) => r.community_id === m.community_id)
      if (!link) continue
      const rule = parseAccessRule(link.access)
      const owned = rule.productIds?.length ? await ownedProductIds(db, userId, rule.productIds) : []
      const denial = courseDenial(
        { access: rule, dripDays: link.drip_days },
        { role: m.role, active: true, tierId: m.tier_id, ownedProductIds: owned, level: m.level || 1, joinedAt: m.joined_at ?? m.created_at },
        opts.now,
      )
      if (!denial) return true
    }
    return false
  } catch (e) {
    console.error(`[communities] course grant ${productId}: ${reasonOf(e)}`)
    return false
  }
}

/**
 * After a member's progress in a course moves (lib/courses/server.ts
 * syncEnrollment): the lessons they finished go into each community's
 * activity, and the first finish of the whole course earns
 * course_completed points there, once (key course:<productId>). Only in
 * communities that have the course attached and where they are an active
 * member. Never throws.
 */
export async function onCourseProgress(
  db: Db,
  p: { userId: string; productId: string; lessonsBefore: number; lessonsNow: number; finished: boolean },
  opts: { enabled?: boolean } = {},
): Promise<{ communities: number; awarded: number }> {
  const none = { communities: 0, awarded: 0 }
  const newLessons = Math.max(0, p.lessonsNow - p.lessonsBefore)
  if (newLessons === 0 && !p.finished) return none
  try {
    const { data: links, error } = await db.from("community_courses").select("community_id").eq("product_id", p.productId).limit(50)
    if (error || !links || (links as unknown[]).length === 0) return none
    if (!(opts.enabled ?? (await communitiesEnabled()))) return none
    const { data: memberRows } = await db
      .from("community_members")
      .select("community_id")
      .eq("user_id", p.userId)
      .eq("status", "active")
      .in("community_id", (links as { community_id: string }[]).map((l) => l.community_id))
    const communities = ((memberRows as { community_id: string }[] | null) ?? []).map((m) => m.community_id)
    let awarded = 0
    for (const communityId of communities) {
      for (let i = 0; i < Math.min(newLessons, 5); i++) await recordActivity(db, { communityId, userId: p.userId, kind: "lesson_completed", targetType: "course", targetId: p.productId })
      if (!p.finished) continue
      const award = await awardPoints(db, { communityId, userId: p.userId, points: COURSE_COMPLETED_POINTS, reason: "course_completed", sourceKey: `course:${p.productId}` })
      if (award.awarded) {
        awarded++
        await recordActivity(db, { communityId, userId: p.userId, kind: "course_completed", targetType: "course", targetId: p.productId })
      }
    }
    return { communities: communities.length, awarded }
  } catch (e) {
    console.error(`[communities] course progress ${p.productId}: ${reasonOf(e)}`)
    return none
  }
}

/* ── The gate for the classroom and events pages ────────────────────────── */

/**
 * What every classroom and events page checks itself, whatever its layout
 * already did: communities switched on, the community there and open, the
 * section switched on, somebody signed in, and an active member (anyone
 * else goes to the community's own page, which is the sales page for them).
 * Answers null while the session cannot be read yet: the page then renders
 * <SessionRecovery />.
 */
export async function openMemberPage(db: Db, slug: string, section: "classroom" | "events", path: string): Promise<{ community: CommunityRow; viewer: Viewer } | null> {
  const [{ notFound, redirect }, { communitiesEnabled: on }, { loadCommunity, communityOpen, viewerContext }, { pageUser }] = await Promise.all([
    import("next/navigation"),
    import("../flag"),
    import("./context"),
    import("@/lib/auth/page-user"),
  ])
  if (!(await on())) return notFound()
  const community = await loadCommunity(db, { slug })
  if (!community || !communityOpen(community)) return notFound()
  if (section === "classroom" ? !community.classroom_enabled : !community.events_enabled) return notFound()
  const user = await pageUser(`/login?next=${encodeURIComponent(path)}`)
  if (!user) return null
  const viewer = await viewerContext(db, community, user.id)
  if (!viewer.active) return redirect(`/community/${community.slug}`)
  return { community, viewer }
}
