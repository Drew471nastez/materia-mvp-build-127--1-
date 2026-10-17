import "server-only"

/**
 * ===========================================================================
 *  LEARN: A COMMUNITY'S PROGRAMS, READ, OPENED AND BUILT BY THE SERVER
 * ===========================================================================
 * The rules are lib/communities/learn.ts (pure). This is everything around
 * them that needs the database:
 *
 *   READ       readPrograms: the community's rows of community_courses,
 *              read whole after part 102 and in the older shape before it
 *              (then every row is an attached course, its id the product's).
 *   CARDS      listPrograms: one card per program for the Learn page, with
 *              the lessons, the member's own progress, what they bought and
 *              the lock in words. A fixed handful of reads whatever the
 *              number of programs.
 *   LESSONS    programLessonLevel: lib/courses/server.ts asks it for every
 *              lesson, video, file and progress write of a program (a
 *              course with no product), so the course player works for a
 *              program exactly as for a course, decided afresh each time.
 *   BUILDER    loadLearnBuilder, createProgram, updateProgram,
 *              deleteProgram, reorderPrograms, attachCourseProgram, and
 *              programManager (lib/courses/manage.ts asks it before any
 *              change to a program's lessons).
 *   BUYING     grantProgram: a paid program's checkout (./learn-checkout.ts)
 *              ends here, from the buyer's page or Stripe's webhook,
 *              whichever is first, once per checkout session.
 *   POINTS     onProgramProgress: finishing a program earns course_completed
 *              points once (key program:<id>), as a course does.
 *
 * Everything degrades quietly before part 102: programs cannot be made or
 * sold, and the attached courses show as they always did. Before part 200
 * (round 33) the rows are read without access_mode, member_ids and
 * description: a program keeps its free, level, paid or drip choice and a
 * plain description, and cannot be made private.
 *
 * A PRIVATE PROGRAM IS NOT THERE for anybody but its members and staff: not
 * a card, not a page, not a lesson, not a free preview. Every one of those
 * reads goes through programGate, so the list is checked each time.
 */
import { communitiesEnabled } from "../flag"
import { can } from "../permissions"
import { parseAccessRule } from "../access"
import { MAX_PROGRAMS, PROGRAM_DESCRIPTION_MAX, PROGRAM_SUMMARY_MAX, accessForMode, checkProgramInput, contentKey, programGate, programHref, programMemberIds, programMode, programPrice, uniqueContentKey, type ProgramGate, type ProgramInput, type ProgramMode, type ProgramRule, type ProgramStatus, type ProgramViewer } from "../learn"
import { cleanStoredHtml, htmlToPlainText, isBlankHtml, looksLikeHtml } from "@/lib/rich-text/html"
import type { CommunityRow, Role } from "../types"
import type { BuilderProgram, LearnBuilderData, ProgramCard, ProgramLock } from "@/components/community/learn/model"
import { opensOnLabel } from "@/components/community/learn/model"
import type { ProductLevel } from "@/lib/courses/access"
import type { ProductRow } from "@/lib/courses/server"
import type { Viewer } from "./context"
import { isUniqueViolation, missing, reasonOf, type Db } from "./db"
import { audit } from "./audit"
import { recordActivity } from "./activity"
import { awardPoints } from "./points"
import { ownPicture } from "./gallery"

export const PROGRAM_COMPLETED_POINTS = 10
const STAFF: readonly Role[] = ["owner", "admin", "moderator"]

const FULL_COLUMNS = "id, community_id, product_id, course_id, title, summary, cover_url, status, price_cents, currency, access, drip_days, position, added_at"
/* Part 200 (round 33): who opens it, a private program's members, the rich description. */
const ACCESS_COLUMNS = `${FULL_COLUMNS}, access_mode, member_ids, description`
const OLD_COLUMNS = "community_id, product_id, access, drip_days, position, added_at"

type Filtered = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>

/**
 * One read of community_courses with part 200's columns, and again without
 * them on a database where part 200 has not run. `accessReady` says which.
 */
async function programRead(db: Db, query: (select: Db) => Filtered): Promise<{ data: unknown; error: { code?: string; message?: string } | null; accessReady: boolean }> {
  const first = await query(db.from("community_courses").select(ACCESS_COLUMNS))
  if (!first.error || !missing(first.error)) return { ...first, accessReady: !first.error }
  const second = await query(db.from("community_courses").select(FULL_COLUMNS))
  return { ...second, accessReady: false }
}

export interface ProgramRow {
  id: string
  communityId: string
  productId: string | null
  courseId: string | null
  title: string | null
  summary: string | null
  coverUrl: string | null
  status: ProgramStatus
  priceCents: number | null
  currency: string | null
  access: unknown
  dripDays: number | null
  position: number
  /** Part 200: the creator's choice, the members of a private program, the description as cleaned HTML. */
  accessMode: ProgramMode | null
  memberIds: string[]
  description: string | null
}

type RawRow = {
  id?: string
  community_id: string
  product_id: string | null
  course_id?: string | null
  title?: string | null
  summary?: string | null
  cover_url?: string | null
  status?: string | null
  price_cents?: number | null
  currency?: string | null
  access: unknown
  drip_days: number | null
  position: number | null
  access_mode?: string | null
  member_ids?: string[] | null
  description?: string | null
}

function toRow(r: RawRow): ProgramRow {
  return {
    id: r.id ?? (r.product_id as string),
    communityId: r.community_id,
    productId: r.product_id,
    courseId: r.course_id ?? null,
    title: r.title ?? null,
    summary: r.summary ?? null,
    coverUrl: r.cover_url ?? null,
    status: r.status === "draft" ? "draft" : "published",
    priceCents: typeof r.price_cents === "number" && r.price_cents > 0 ? r.price_cents : null,
    currency: r.currency ?? null,
    access: r.access ?? {},
    dripDays: r.drip_days,
    position: Number(r.position) || 0,
    accessMode: ["free", "level", "paid", "time", "private"].includes(r.access_mode ?? "") ? (r.access_mode as ProgramMode) : null,
    memberIds: programMemberIds(r.member_ids),
    description: typeof r.description === "string" && r.description ? r.description : null,
  }
}

/** The community's programs in the creator's order, whether part 102 has run, and whether part 200 has. */
export async function readPrograms(db: Db, communityId: string): Promise<{ ready: boolean; accessReady: boolean; rows: ProgramRow[] }> {
  const full = await programRead(db, (q) => q.eq("community_id", communityId).order("position", { ascending: true }).order("added_at", { ascending: true }).limit(MAX_PROGRAMS))
  if (!full.error) return { ready: true, accessReady: full.accessReady, rows: ((full.data as RawRow[] | null) ?? []).map(toRow) }
  if (!missing(full.error)) {
    console.error(`[communities] learn read: ${reasonOf(full.error)}`)
    return { ready: false, accessReady: false, rows: [] }
  }
  const old = await db.from("community_courses").select(OLD_COLUMNS).eq("community_id", communityId).order("position", { ascending: true }).order("added_at", { ascending: true }).limit(MAX_PROGRAMS)
  if (old.error) {
    if (!missing(old.error)) console.error(`[communities] learn read: ${reasonOf(old.error)}`)
    return { ready: false, accessReady: false, rows: [] }
  }
  return { ready: false, accessReady: false, rows: ((old.data as RawRow[] | null) ?? []).filter((r) => !!r.product_id).map(toRow) }
}

/** One program of this community by its id, an attached course's product id, or its public title key. */
export async function findProgram(db: Db, communityId: string, id: string): Promise<ProgramRow | null> {
  const { rows } = await readPrograms(db, communityId)
  const byId = rows.find((r) => r.id === id) ?? rows.find((r) => r.productId === id)
  if (byId || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return byId ?? null
  const facts = await courseFacts(db, rows)
  const want = id.toLowerCase()
  const taken = new Set<string>()
  for (const r of rows) {
    const title = facts.get(r.id)?.title || r.title
    const key = uniqueContentKey(title, r.id, taken)
    taken.add(key)
    if (key === want || contentKey(title) === want) return r
  }
  return null
}

/** The programs of these ids this person bought or was given, and still has. Empty before part 102. */
export async function ownedPrograms(db: Db, userId: string | null, programIds: string[]): Promise<Set<string>> {
  if (!userId || programIds.length === 0) return new Set()
  const { data, error } = await db.from("community_program_access").select("program_id").eq("user_id", userId).in("program_id", programIds).is("revoked_at", null)
  if (error) return new Set()
  return new Set(((data as { program_id: string }[] | null) ?? []).map((r) => r.program_id))
}

export function programViewer(viewer: Pick<Viewer, "role" | "active" | "tierId" | "ownedProductIds" | "level" | "member"> & { userId?: string | null }, purchased: boolean): ProgramViewer {
  return {
    userId: viewer.userId ?? viewer.member?.user_id ?? null,
    role: viewer.role,
    active: viewer.active,
    tierId: viewer.tierId,
    ownedProductIds: viewer.ownedProductIds,
    level: viewer.level,
    joinedAt: viewer.member?.joined_at ?? viewer.member?.created_at ?? null,
    purchased,
  }
}

function plural(name: string): string {
  return /members?$/i.test(name.trim()) ? name.trim() : `${name.trim()} members`
}

const ROLE_WORDS: Record<Role, string> = { owner: "The owner", admin: "Admins", moderator: "Moderators", member: "Members" }

type Names = { tier: Map<string, string>; product: Map<string, string> }

async function lockNames(db: Db, communityId: string, gates: ProgramGate[]): Promise<Names> {
  const need = (reason: string) => [...new Set(gates.filter((g) => !g.open && (g as { reason?: string }).reason === reason).map((g) => (g as { need?: string | null }).need).filter((n): n is string => !!n))]
  const tierIds = need("tier")
  const productIds = need("product")
  const [tiers, products] = await Promise.all([
    tierIds.length ? db.from("community_tiers").select("id, name").eq("community_id", communityId).in("id", tierIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : Promise.resolve({ data: [] }),
  ])
  return {
    tier: new Map(((tiers.data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name])),
    product: new Map(((products.data as { id: string; title: string | null }[] | null) ?? []).map((p) => [p.id, p.title || "a product"])),
  }
}

/** The lock as words, or null when the program is open. A draft never gets here for a member: it is not listed. */
export function lockOf(open: ProgramGate, names: Names, program: Pick<ProgramRow, "currency">, timeZone?: string, viewerLevel?: number): ProgramLock | null {
  if (open.open) return null
  /* Narrowed by hand: the test build compiles without strict, where a boolean tag does not narrow. */
  const gate = open as Exclude<ProgramGate, { open: true }>
  const base = { opensAt: null, priceCents: null, currency: null }
  switch (gate.reason) {
    case "level":
      return { ...base, reason: "level", label: `Level ${gate.level}`, ...(viewerLevel !== undefined ? { viewerLevel } : {}) }
    case "private":
      return { ...base, reason: "private", label: "Members picked" }
    case "paid":
      return { ...base, reason: "paid", label: programPrice(gate.priceCents, program.currency), priceCents: gate.priceCents, currency: program.currency ?? "usd" }
    case "drip":
      return { ...base, reason: "drip", label: opensOnLabel(gate.opensAt, timeZone), opensAt: gate.opensAt }
    case "tier":
      return { ...base, reason: "tier", label: plural(names.tier.get(gate.need ?? "") ?? "Paid") }
    case "product":
      return { ...base, reason: "product", label: `Owners of ${names.product.get(gate.need ?? "") ?? "a product"}` }
    case "role":
      return { ...base, reason: "role", label: ROLE_WORDS[(gate.need as Role) ?? "member"] ?? "Staff" }
    default:
      return { ...base, reason: "not_member", label: "Members" }
  }
}

/** A program's course, as the cards need it: its lessons and their length. */
interface CourseFacts {
  courseId: string | null
  title: string | null
  coverUrl: string | null
  lessons: { id: string; duration_seconds: number | null }[]
}

/* A description fit to draw: cleaned again on the way out, whatever the row holds. Null for a plain one or an empty one. */
function descriptionHtmlOf(r: Pick<ProgramRow, "description">): string | null {
  if (!r.description || !looksLikeHtml(r.description)) return null
  const clean = cleanStoredHtml(r.description)
  return isBlankHtml(clean) ? null : clean
}

/** The courses behind these programs, in one pass: the attached products' and the programs' own. */
async function courseFacts(db: Db, rows: ProgramRow[]): Promise<Map<string, CourseFacts>> {
  const out = new Map<string, CourseFacts>()
  const productIds = rows.map((r) => r.productId).filter((id): id is string => !!id)
  const [{ data: productRows }, { data: byProduct }] = await Promise.all([
    productIds.length ? db.from("products").select("id, title, thumbnail_url, type").in("id", productIds).eq("type", "course") : Promise.resolve({ data: [] }),
    productIds.length ? db.from("courses").select("id, product_id").in("product_id", productIds) : Promise.resolve({ data: [] }),
  ])
  const products = new Map(((productRows as { id: string; title: string | null; thumbnail_url: string | null }[] | null) ?? []).map((p) => [p.id, p]))
  const courseOfProduct = new Map(((byProduct as { id: string; product_id: string }[] | null) ?? []).map((c) => [c.product_id, c.id]))
  const courseIds = [...new Set([...courseOfProduct.values(), ...rows.map((r) => r.courseId).filter((id): id is string => !!id)])]
  const { data: moduleRows } = courseIds.length ? await db.from("course_modules").select("id, course_id").in("course_id", courseIds) : { data: [] }
  const modules = (moduleRows as { id: string; course_id: string }[] | null) ?? []
  const { data: lessonRows } = modules.length ? await db.from("course_lessons").select("id, module_id, duration_seconds").in("module_id", modules.map((m) => m.id)) : { data: [] }
  const lessons = (lessonRows as { id: string; module_id: string; duration_seconds: number | null }[] | null) ?? []
  const lessonsOf = (courseId: string | null) => {
    if (!courseId) return []
    const ids = new Set(modules.filter((m) => m.course_id === courseId).map((m) => m.id))
    return lessons.filter((l) => ids.has(l.module_id))
  }
  for (const r of rows) {
    if (r.productId) {
      const p = products.get(r.productId)
      /* An attached product that is not a course (or is gone) is not shown. */
      if (!p) continue
      const courseId = courseOfProduct.get(r.productId) ?? null
      out.set(r.id, { courseId, title: p.title, coverUrl: p.thumbnail_url, lessons: lessonsOf(courseId) })
    } else {
      out.set(r.id, { courseId: r.courseId, title: r.title, coverUrl: r.coverUrl, lessons: lessonsOf(r.courseId) })
    }
  }
  return out
}

/**
 * EVERY PROGRAM ON THE LEARN PAGE, as cards: the cover, how many lessons,
 * the member's own progress (course_enrollments), the price of a paid one
 * and the lock in words. Drafts only for the people who run Learn.
 */
export async function listPrograms(db: Db, community: CommunityRow, viewer: Viewer, opts: { now?: number; timeZone?: string } = {}): Promise<ProgramCard[]> {
  const now = opts.now ?? Date.now()
  const { rows: all } = await readPrograms(db, community.id)
  const staff = !!viewer.role && STAFF.includes(viewer.role)
  const rows = all.filter((r) => staff || r.status === "published")
  if (rows.length === 0) return []
  const [facts, owned] = await Promise.all([courseFacts(db, rows), ownedPrograms(db, viewer.userId, rows.filter((r) => r.priceCents).map((r) => r.id))])
  const courseIds = [...new Set([...facts.values()].map((f) => f.courseId).filter((id): id is string => !!id))]
  const { data: enrollmentRows } =
    viewer.userId && courseIds.length
      ? await db.from("course_enrollments").select("course_id, percent, completed_lessons, completed_at, last_lesson_id").eq("buyer_id", viewer.userId).in("course_id", courseIds)
      : { data: [] }
  const enrollments = new Map(
    ((enrollmentRows as { course_id: string; percent: number | null; completed_lessons: number | null; completed_at: string | null; last_lesson_id: string | null }[] | null) ?? []).map((e) => [e.course_id, e]),
  )
  const gates = new Map(rows.map((r) => [r.id, programGate(r, programViewer(viewer, owned.has(r.id)), now)]))
  const names = await lockNames(db, community.id, [...gates.values()])

  const out: ProgramCard[] = []
  const takenKeys = new Set<string>()
  for (const r of rows) {
    const f = facts.get(r.id)
    if (!f) continue
    /* Private and not on its list: not there at all. Its key is still taken, so the others' addresses do not move when it is. */
    if (privateToThem(gates.get(r.id) as ProgramGate)) {
      takenKeys.add(uniqueContentKey(f.title || "Program", r.id, takenKeys))
      continue
    }
    const enrollment = f.courseId ? enrollments.get(f.courseId) : undefined
    const percent = Math.max(0, Math.min(100, Math.round(Number(enrollment?.percent) || 0)))
    const status: ProgramCard["status"] = enrollment?.completed_at ? "completed" : percent > 0 || (enrollment?.completed_lessons ?? 0) > 0 ? "in_progress" : "not_started"
    const gate = gates.get(r.id) as ProgramGate
    const locked = lockOf(gate, names, r, opts.timeZone, viewer.level || 1)
    const resume = !locked && status === "in_progress" ? (enrollment?.last_lesson_id ?? null) : null
    const title = f.title || (r.productId ? "Course" : "Program")
    const key = uniqueContentKey(title, r.id, takenKeys)
    takenKeys.add(key)
    out.push({
      id: r.id,
      kind: r.productId ? "course" : "program",
      title,
      summary: r.summary,
      descriptionHtml: descriptionHtmlOf(r),
      coverUrl: f.coverUrl,
      lessons: f.lessons.length,
      completedLessons: Math.min(f.lessons.length, Math.max(0, Number(enrollment?.completed_lessons) || 0)),
      percent: status === "completed" ? 100 : percent,
      status,
      totalSeconds: f.lessons.reduce((s, l) => s + (Number(l.duration_seconds) || 0), 0),
      draft: r.status === "draft",
      mode: programMode(r),
      priceLabel: r.priceCents ? programPrice(r.priceCents, r.currency) : null,
      owned: owned.has(r.id),
      locked,
      href: programHref(community.slug, key, resume),
    })
  }
  return out
}

/** A private program this viewer is not on the list of: hidden, not locked. */
function privateToThem(gate: ProgramGate): boolean {
  return !gate.open && (gate as { reason?: string }).reason === "private"
}

/** One program's card for its own page (found by its id or an old course link's product id), or null when it is not here. */
export async function programCard(db: Db, community: CommunityRow, viewer: Viewer, id: string, opts: { now?: number; timeZone?: string } = {}): Promise<ProgramCard | null> {
  const list = await listPrograms(db, community, viewer, opts)
  const direct = list.find((c) => c.id === id)
  if (direct) return direct
  const row = await findProgram(db, community.id, id)
  return row ? (list.find((c) => c.id === row.id) ?? null) : null
}

/* ── A program's own page ───────────────────────────────────────────────── */

/** The module and lesson titles of a program (its own course, or the attached course's), with each module's cover, for its locked page. */
export async function programOutline(db: Db, program: ProgramRow): Promise<{ modules: { id: string; title: string; coverUrl?: string | null; lessons: string[]; priceCents?: number | null }[] } | null> {
  const { readCourseTree, readCourseTreeById } = await import("@/lib/courses/server")
  const tree = program.productId ? await readCourseTree(db, program.productId) : program.courseId ? await readCourseTreeById(db, program.courseId) : null
  if (!tree) return null
  /* Round AG: a module of a program made here may be sold on its own (./module-sales.ts); its price is on the outline. */
  const prices = program.productId ? new Map<string, number | null>() : new Map((await (await import("./module-sales")).modulePrices(db, program.courseId)).map((m) => [m.id, m.priceCents] as const))
  return { modules: tree.modules.map((m) => ({ id: m.id, title: m.title, coverUrl: coverOf(m), lessons: m.lessons.map((l) => l.title), priceCents: prices.get(m.id) ?? null })) }
}

/* A module's or a lesson's cover (part 200), only ever an https address. */
function coverOf(row: unknown): string | null {
  const url = (row as { cover_url?: unknown } | null)?.cover_url
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null
}

/**
 * THE PLAYER FOR A PROGRAM MADE HERE: the course player's own data
 * (lib/courses/load.ts playerFromTree), with the community standing where a
 * product's creator would, and no contact form or reminder emails (a
 * program has no product to hang them on). Null while it has no lessons.
 * Only asked for once the page has found the program open to this viewer.
 */
export async function programPlayer(db: Db, community: CommunityRow, viewer: Viewer, program: ProgramRow, askedLessonId: string | null, openModules?: ReadonlySet<string>) {
  if (!program.courseId) return null
  const [{ readCourseTreeById }, { playerFromTree }] = await Promise.all([import("@/lib/courses/server"), import("@/lib/courses/load")])
  const tree = await readCourseTreeById(db, program.courseId)
  if (!tree || !tree.modules.some((m) => m.lessons.length > 0)) return null
  /* Round AG: a member with only some modules bought plays those (and the previews); everything else stays locked. */
  const level: ProductLevel = can(viewer.role, "manage_classroom") ? "creator" : openModules && openModules.size ? "public" : "owner"
  return playerFromTree(db, {
    userId: viewer.userId,
    tree,
    level,
    openModules,
    askedLessonId,
    meta: {
      productId: program.id,
      title: program.title || "Program",
      thumbnailUrl: program.coverUrl,
      productHref: null,
      creator: { name: community.name, avatarUrl: community.logo_url ?? null, storeHref: null },
      contact: false,
    },
  })
}

/* ── The course player's question, for a program's lesson ───────────────── */

/**
 * WHO THIS PERSON IS TO A PROGRAM'S LESSONS (lib/courses/server.ts
 * lessonContext, for a course with no product): "creator" for someone who
 * runs Learn in its community, "owner" for a member it is open to, "public"
 * for an active member it is not open to yet (they may play its free
 * previews), "none" for anybody else, a draft, a closed community, or
 * communities switched off. Null when the course is no program's.
 */
export async function programLessonLevel(
  db: Db,
  userId: string | null,
  courseId: string,
  opts: { enabled?: boolean; now?: number } = {},
): Promise<{ level: ProductLevel; programId: string; creatorId: string; product: ProductRow } | null> {
  const { data, error } = await programRead(db, (q) => q.eq("course_id", courseId).maybeSingle())
  if (error || !data) return null
  const program = toRow(data as RawRow)
  const { loadCommunity, communityOpen, viewerContext } = await import("./context")
  const community = await loadCommunity(db, { id: program.communityId })
  if (!community || !community.creator_id) return null
  const product: ProductRow = {
    id: program.id,
    title: program.title,
    slug: null,
    status: program.status === "published" ? "published" : "draft",
    type: "course",
    creator_id: community.creator_id,
    thumbnail_url: program.coverUrl,
  }
  const found = (level: ProductLevel) => ({ level, programId: program.id, creatorId: community.creator_id as string, product })
  const enabled = opts.enabled ?? (await communitiesEnabled())
  if (!enabled || !communityOpen(community) || !community.classroom_enabled || !userId) return found("none")
  const viewer = await viewerContext(db, community, userId)
  if (!viewer.active) return found("none")
  if (can(viewer.role, "manage_classroom")) return found("creator")
  const owned = program.priceCents ? await ownedPrograms(db, userId, [program.id]) : new Set<string>()
  const gate = programGate(program, programViewer(viewer, owned.has(program.id)), opts.now)
  if (gate.open) return found("owner")
  /* A private program is not there for the others: not even its free previews. */
  if (privateToThem(gate)) return found("none")
  return found(program.status === "published" ? "public" : "none")
}

/**
 * THE COMMUNITY GRANT FOR AN ATTACHED COURSE (lib/courses/server.ts
 * ownsProduct, through classroom.ts communityGrantsCourse): an active
 * member of an open community with the course in its Learn, published, and
 * open to them by the same gate the page uses (a price set on it in Learn
 * means bought there).
 */
export async function attachedCourseOpen(db: Db, userId: string, productId: string, opts: { now?: number } = {}): Promise<boolean> {
  const full = await programRead(db, (q) => q.eq("product_id", productId).limit(50))
  const rows = !full.error
    ? ((full.data as RawRow[] | null) ?? []).map(toRow)
    : missing(full.error)
      ? (((await db.from("community_courses").select(OLD_COLUMNS).eq("product_id", productId).limit(50)).data as RawRow[] | null) ?? []).map(toRow)
      : []
  if (rows.length === 0) return false
  const { data: memberRows } = await db
    .from("community_members")
    .select("community_id, role, tier_id, level, joined_at, created_at, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("community_id", rows.map((r) => r.communityId))
  const members = (memberRows as { community_id: string; role: Role; tier_id: string | null; level: number; joined_at: string | null; created_at: string }[] | null) ?? []
  if (members.length === 0) return false
  const { data: communityRows } = await db.from("communities").select("id, status, suspended_at, deleted_at").in("id", members.map((m) => m.community_id))
  const open = new Set(
    ((communityRows as { id: string; status: string; suspended_at: string | null; deleted_at: string | null }[] | null) ?? [])
      .filter((c) => !c.deleted_at && !c.suspended_at && c.status !== "suspended")
      .map((c) => c.id),
  )
  const owned = await ownedPrograms(db, userId, rows.filter((r) => r.priceCents).map((r) => r.id))
  for (const m of members) {
    if (!open.has(m.community_id)) continue
    const row = rows.find((r) => r.communityId === m.community_id)
    if (!row) continue
    const rule = parseAccessRule(row.access)
    const { ownedProductIds } = await import("./membership")
    const productsOwned = rule.productIds?.length ? await ownedProductIds(db, userId, rule.productIds) : []
    const gate = programGate(row, { userId, role: m.role, active: true, tierId: m.tier_id, ownedProductIds: productsOwned, level: m.level || 1, joinedAt: m.joined_at ?? m.created_at, purchased: owned.has(row.id) }, opts.now)
    if (gate.open) return true
  }
  return false
}

/* ── Points ─────────────────────────────────────────────────────────────── */

/**
 * After a member's progress in a program moves (lib/courses/server.ts
 * syncEnrollment): the lessons they finished go into the community's
 * activity, and the first finish earns course_completed points once (key
 * program:<id>). Never throws.
 */
export async function onProgramProgress(db: Db, p: { userId: string; programId: string; lessonsBefore: number; lessonsNow: number; finished: boolean }, opts: { enabled?: boolean } = {}): Promise<{ awarded: boolean }> {
  const newLessons = Math.max(0, p.lessonsNow - p.lessonsBefore)
  if (newLessons === 0 && !p.finished) return { awarded: false }
  try {
    const { data } = await db.from("community_courses").select("community_id").eq("id", p.programId).maybeSingle()
    const communityId = (data as { community_id?: string } | null)?.community_id
    if (!communityId) return { awarded: false }
    if (!(opts.enabled ?? (await communitiesEnabled()))) return { awarded: false }
    const { data: member } = await db.from("community_members").select("community_id").eq("community_id", communityId).eq("user_id", p.userId).eq("status", "active").maybeSingle()
    if (!member) return { awarded: false }
    for (let i = 0; i < Math.min(newLessons, 5); i++) await recordActivity(db, { communityId, userId: p.userId, kind: "lesson_completed", targetType: "program", targetId: p.programId })
    if (!p.finished) return { awarded: false }
    const award = await awardPoints(db, { communityId, userId: p.userId, points: PROGRAM_COMPLETED_POINTS, reason: "course_completed", sourceKey: `program:${p.programId}` })
    if (award.awarded) await recordActivity(db, { communityId, userId: p.userId, kind: "course_completed", targetType: "program", targetId: p.programId })
    return { awarded: award.awarded }
  } catch (e) {
    console.error(`[communities] program progress ${p.programId}: ${reasonOf(e)}`)
    return { awarded: false }
  }
}

/* ── Buying ─────────────────────────────────────────────────────────────── */

export interface ProgramGrant {
  programId: string
  userId: string
  communityId: string
  source: "purchase" | "grant"
  checkoutSessionId?: string | null
  paymentIntentId?: string | null
  amountCents?: number | null
  currency?: string | null
}

/**
 * THE PROGRAM IS THEIRS: one row per person and program. A second call for
 * the same checkout session (the buyer's page and the webhook both arrive)
 * changes nothing; a new purchase after a revoked one opens it again.
 */
export async function grantProgram(db: Db, g: ProgramGrant): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const { data: existing, error: readError } = await db
    .from("community_program_access")
    .select("program_id, revoked_at, checkout_session_id")
    .eq("program_id", g.programId)
    .eq("user_id", g.userId)
    .maybeSingle()
  if (readError) return { ok: false, error: missing(readError) ? "not_set_up" : "failed" }
  const row = {
    community_id: g.communityId,
    source: g.source,
    checkout_session_id: g.checkoutSessionId ?? null,
    payment_intent_id: g.paymentIntentId ?? null,
    amount_cents: g.amountCents ?? null,
    currency: g.currency ?? null,
    revoked_at: null,
  }
  if (existing) {
    const e = existing as { revoked_at: string | null; checkout_session_id: string | null }
    if (!e.revoked_at) return { ok: true, created: false }
    const { error } = await db.from("community_program_access").update({ ...row, created_at: new Date().toISOString() }).eq("program_id", g.programId).eq("user_id", g.userId)
    if (error && !isUniqueViolation(error)) return { ok: false, error: "failed" }
    return { ok: true, created: !error }
  }
  const { error } = await db.from("community_program_access").insert({ program_id: g.programId, user_id: g.userId, ...row })
  if (error) {
    if (isUniqueViolation(error)) return { ok: true, created: false }
    return { ok: false, error: missing(error) ? "not_set_up" : "failed" }
  }
  await audit(db, { communityId: g.communityId, actorId: g.userId, actorKind: "member", action: "program.bought", targetType: "program", targetId: g.programId, detail: { amountCents: g.amountCents ?? null, currency: g.currency ?? null } })
  return { ok: true, created: true }
}

/* ── The builder ────────────────────────────────────────────────────────── */

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; status: number; error: string; field?: string }

const no = (status: number, error: string, field?: string): { ok: false; status: number; error: string; field?: string } => ({ ok: false, status, error, ...(field ? { field } : {}) })

/**
 * WHO MAY CHANGE A PROGRAM'S LESSONS (lib/courses/manage.ts ownerOf): the
 * community's owner, or a member whose role may manage Learn. Answers the
 * community creator's id and plan, whose storage the lessons' files use.
 */
export async function programManager(db: Db, userId: string, programId: string): Promise<{ creatorId: string; planId: string | null; communityId: string } | null> {
  try {
    const { data, error } = await db.from("community_courses").select("id, community_id, product_id").eq("id", programId).maybeSingle()
    if (error || !data || (data as { product_id: string | null }).product_id) return null
    const communityId = (data as { community_id: string }).community_id
    const { loadCommunity, viewerContext } = await import("./context")
    const community = await loadCommunity(db, { id: communityId })
    if (!community?.creator_id) return null
    const viewer = await viewerContext(db, community, userId)
    if (!(community.owner_user_id === userId || (viewer.active && can(viewer.role, "manage_classroom")))) return null
    const { data: creator } = await db.from("creators").select("subscription_plan_id").eq("id", community.creator_id).maybeSingle()
    return { creatorId: community.creator_id, planId: (creator as { subscription_plan_id?: string | null } | null)?.subscription_plan_id ?? null, communityId }
  } catch {
    return null
  }
}

/** Everything the builder shows: the programs, the levels, the creator's courses not attached yet, and whether selling is possible. */
export async function loadLearnBuilder(db: Db, community: CommunityRow, opts: { currency: string; canSell: boolean }): Promise<LearnBuilderData> {
  const { ready, accessReady, rows } = await readPrograms(db, community.id)
  const facts = await courseFacts(db, rows)
  const paid = rows.filter((r) => r.priceCents).map((r) => r.id)
  const picked = [...new Set(rows.flatMap((r) => r.memberIds))]
  const [{ data: levelRows }, { data: courseRows }, buyers, people] = await Promise.all([
    db.from("community_levels").select("level, name").eq("community_id", community.id).order("level", { ascending: true }).limit(20),
    community.creator_id
      ? db.from("products").select("id, title, status, thumbnail_url").eq("creator_id", community.creator_id).eq("type", "course").neq("status", "archived").order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    buyerCounts(db, paid),
    picked.length ? import("./moderation").then((m) => m.peopleOf(db, picked)) : Promise.resolve(new Map<string, { name: string; avatarUrl: string | null }>()),
  ])
  const attached = new Set(rows.map((r) => r.productId).filter(Boolean))
  const programs: BuilderProgram[] = rows
    .filter((r) => facts.has(r.id))
    .map((r) => {
      const f = facts.get(r.id) as CourseFacts
      const rule = parseAccessRule(r.access)
      return {
        id: r.id,
        kind: r.productId ? "course" : "program",
        productId: r.productId,
        title: f.title || (r.productId ? "Course" : "Program"),
        summary: descriptionHtmlOf(r) ?? r.summary ?? "",
        coverUrl: f.coverUrl,
        status: r.status,
        mode: programMode(r),
        level: rule.minLevel ?? 2,
        priceCents: r.priceCents,
        currency: r.currency || opts.currency,
        dripDays: r.dripDays,
        members: r.memberIds.map((userId) => ({ userId, name: people.get(userId)?.name ?? "Member", avatarUrl: people.get(userId)?.avatarUrl ?? null })),
        lessons: f.lessons.length,
        buyers: buyers.get(r.id) ?? 0,
        editHref: r.productId ? `/app/products/${r.productId}/edit` : null,
      }
    })
  return {
    communityId: community.id,
    slug: community.slug,
    ready,
    accessReady,
    enabled: community.classroom_enabled,
    currency: opts.currency,
    canSell: opts.canSell,
    programs,
    levels: ((levelRows as { level: number; name: string }[] | null) ?? []).map((l) => ({ level: l.level, name: l.name })),
    courses: ((courseRows as { id: string; title: string | null; status: string; thumbnail_url: string | null }[] | null) ?? [])
      .filter((p) => !attached.has(p.id))
      .map((p) => ({ id: p.id, title: p.title || "Course", coverUrl: p.thumbnail_url, status: p.status })),
  }
}

async function buyerCounts(db: Db, programIds: string[]): Promise<Map<string, number>> {
  if (programIds.length === 0) return new Map()
  const { data, error } = await db.from("community_program_access").select("program_id").in("program_id", programIds).is("revoked_at", null).limit(10_000)
  if (error) return new Map()
  const out = new Map<string, number>()
  for (const r of (data as { program_id: string }[] | null) ?? []) out.set(r.program_id, (out.get(r.program_id) ?? 0) + 1)
  return out
}

async function nextPosition(db: Db, communityId: string): Promise<number> {
  const { data } = await db.from("community_courses").select("position").eq("community_id", communityId).order("position", { ascending: false }).limit(1)
  const top = ((data as { position: number }[] | null) ?? [])[0]?.position
  return typeof top === "number" ? top + 1 : 0
}

/** A new program, as a draft at the end of the list. */
export async function createProgram(db: Db, a: { communityId: string; actorId: string; title: unknown }): Promise<Result<{ id: string }>> {
  const checked = checkProgramInput({ title: a.title }, { requireTitle: true })
  if (checked.ok === false) return no(400, checked.error, checked.field)
  const { count } = await db.from("community_courses").select("community_id", { count: "exact", head: true }).eq("community_id", a.communityId)
  if ((count ?? 0) >= MAX_PROGRAMS) return no(400, `A community holds up to ${MAX_PROGRAMS} programs.`)
  const { data, error } = await db
    .from("community_courses")
    .insert({ community_id: a.communityId, product_id: null, title: checked.patch.title, status: "draft", position: await nextPosition(db, a.communityId) })
    .select("id")
    .single()
  if (error || !data) return missing(error) ? no(409, "Programs need the latest database update (part 102). Attached courses work meanwhile.") : no(500, "The program could not be made. Try again.")
  const id = (data as { id: string }).id
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "program.created", targetType: "program", targetId: id, targetLabel: checked.patch.title })
  return { ok: true, id }
}

/** One of the creator's course products into Learn, published, at the end. */
export async function attachCourseProgram(db: Db, a: { communityId: string; creatorId: string; productId: unknown; actorId: string }): Promise<Result<{ id: string }>> {
  const productId = typeof a.productId === "string" ? a.productId : ""
  const { data: p } = productId ? await db.from("products").select("id, title, creator_id, type").eq("id", productId).maybeSingle() : { data: null }
  const product = p as { id: string; title: string | null; creator_id: string; type: string } | null
  if (!product || product.creator_id !== a.creatorId || product.type !== "course") return no(404, "That course is not yours.")
  const { error } = await db.from("community_courses").insert({ community_id: a.communityId, product_id: product.id, position: await nextPosition(db, a.communityId) })
  if (error && !isUniqueViolation(error)) return no(500, "The course could not be added. Try again.")
  const row = await findProgram(db, a.communityId, product.id)
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "course.attached", targetType: "course", targetId: product.id, targetLabel: product.title })
  return { ok: true, id: row?.id ?? product.id }
}

/**
 * The builder's Save: the name, description and cover of a program made
 * here (an attached course's are the product's), whether it is published,
 * who opens it (free, a level, or a price) and the drip days. Only the
 * fields sent change.
 */
export async function updateProgram(db: Db, a: { communityId: string; programId: string; actorId: string; input: ProgramInput & { coverUrl?: unknown }; currency: string }): Promise<Result> {
  const row = await findProgram(db, a.communityId, a.programId)
  if (!row || row.id !== a.programId) return no(404, "That program is not in this community.")
  const checked = checkProgramInput(a.input)
  if (checked.ok === false) return no(400, checked.error, checked.field)
  const c = checked.patch
  const patch: Record<string, unknown> = {}
  if (c.summary !== undefined) Object.assign(patch, descriptionPatch(c.summary))
  if (!row.productId) {
    if (c.title !== undefined) patch.title = c.title
    if (a.input.coverUrl !== undefined) {
      if (a.input.coverUrl === null || a.input.coverUrl === "") patch.cover_url = null
      else {
        const url = ownPicture(a.input.coverUrl)
        if (!url) return no(400, "Upload the cover here.", "cover")
        patch.cover_url = url
      }
    }
  }
  if (c.status !== undefined) patch.status = c.status
  if (c.mode !== undefined) {
    patch.access = accessForMode(row.access, c.mode, c.level)
    patch.price_cents = c.mode === "paid" ? c.priceCents : null
    patch.currency = c.mode === "paid" ? a.currency : null
    patch.access_mode = c.mode
    /* Only people who are members here (whatever their state today) go on a private program's list. */
    patch.member_ids = c.mode === "private" ? await membersHere(db, a.communityId, c.memberIds ?? []) : []
  }
  if (c.dripDays !== undefined) patch.drip_days = c.dripDays
  if (Object.keys(patch).length === 0) return { ok: true }
  patch.updated_at = new Date().toISOString()
  let { error } = await db.from("community_courses").update(patch).eq("community_id", a.communityId).eq("id", row.id)
  if (error && missing(error) && PART_200_FIELDS.some((k) => k in patch)) {
    /* Before part 200: a private program cannot be kept; everything else saves as it did, the description as plain text. */
    if (c.mode === "private") return no(409, "Private programs need the latest database update (part 200).", "mode")
    for (const k of PART_200_FIELDS) delete patch[k]
    ;({ error } = await db.from("community_courses").update(patch).eq("community_id", a.communityId).eq("id", row.id))
  }
  if (error) return missing(error) ? no(409, "Programs need the latest database update (part 102).") : no(500, "That did not save. Try again.")
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "program.updated", targetType: "program", targetId: row.id, detail: { fields: Object.keys(patch).filter((k) => k !== "updated_at") } })
  /* Published for the first time (or again from a draft): the members who can see it hear once (notify.ts, idempotent per program). */
  /* A private program is told to nobody: the members it is for are picked by hand, and the others must not hear of it. */
  const privateNow = (c.mode ?? programMode(row)) === "private"
  if (c.status === "published" && row.status !== "published" && !privateNow) await announceProgram(db, { ...row, ...(c.title ? { title: c.title } : {}), access: patch.access ?? row.access, priceCents: patch.price_cents !== undefined ? (patch.price_cents as number | null) : row.priceCents }, a.actorId)
  return { ok: true }
}

const PART_200_FIELDS = ["access_mode", "member_ids", "description"] as const

/**
 * THE DESCRIPTION, AS THE RICH TEXT FIELD WROTE IT: the HTML through the
 * same allow list as a product's description (lib/rich-text/html
 * cleanStoredHtml) into `description`, and its words as plain text into
 * `summary` for the cards and the checkout. Plain text stays plain.
 */
export function descriptionPatch(input: string | null): { summary: string | null; description: string | null } {
  const raw = (input ?? "").trim()
  if (!raw) return { summary: null, description: null }
  if (!looksLikeHtml(raw)) return { summary: raw.slice(0, PROGRAM_SUMMARY_MAX), description: null }
  const html = cleanStoredHtml(raw).slice(0, PROGRAM_DESCRIPTION_MAX)
  if (isBlankHtml(html)) return { summary: null, description: null }
  const plain = htmlToPlainText(html).replace(/\n{3,}/g, "\n\n").trim().slice(0, PROGRAM_SUMMARY_MAX)
  return { summary: plain || null, description: html }
}

/* The ids among these that belong to members of this community, in the order given. */
async function membersHere(db: Db, communityId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("community_members").select("user_id").eq("community_id", communityId).in("user_id", ids.slice(i, i + 200))
    for (const r of (data as { user_id: string }[] | null) ?? []) found.add(r.user_id.toLowerCase())
  }
  return ids.filter((id) => found.has(id))
}

/* The members' bell and push for a program just published. A paid one is told to every member (anyone can buy it); a level or tier one only to those its rule lets see it. Never throws. */
async function announceProgram(db: Db, program: ProgramRow, actorId: string): Promise<void> {
  try {
    const { data } = await db.from("communities").select("slug").eq("id", program.communityId).maybeSingle()
    const slug = (data as { slug?: string } | null)?.slug
    if (!slug) return
    let title = program.title
    if (!title && program.productId) {
      const { data: p } = await db.from("products").select("title").eq("id", program.productId).maybeSingle()
      title = (p as { title?: string | null } | null)?.title ?? null
    }
    const rule = parseAccessRule(program.access)
    const { notifyProgramPublished } = await import("./notify")
    await notifyProgramPublished(db, {
      communityId: program.communityId,
      programId: program.id,
      title: title || "A new program",
      url: programHref(slug, program.id),
      actorId,
      access: program.priceCents ? null : Object.keys(rule).length ? (rule as Record<string, unknown>) : null,
    })
  } catch (e) {
    console.error(`[communities] program announce: ${reasonOf(e)}`)
  }
}

/** Every program, in the new order. */
export async function reorderPrograms(db: Db, a: { communityId: string; actorId: string; ids: unknown }): Promise<Result> {
  const ids = Array.isArray(a.ids) ? a.ids.filter((id): id is string => typeof id === "string") : []
  const { ready, rows } = await readPrograms(db, a.communityId)
  const own = new Set(rows.map((r) => r.id))
  if (ids.length === 0 || ids.length !== own.size || ids.some((id) => !own.has(id)) || new Set(ids).size !== ids.length) return no(400, "Send every program once.")
  const key = ready ? "id" : "product_id"
  await Promise.all(ids.map((id, i) => db.from("community_courses").update({ position: i }).eq("community_id", a.communityId).eq(key, id)))
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "program.reordered", targetType: "community", targetId: a.communityId })
  return { ok: true }
}

/**
 * Out of Learn. An attached course leaves the course product and its buyers
 * untouched. A program made here goes with its lessons, and its lessons'
 * files leave storage. A program members bought is not deleted (they paid
 * for it): it can be moved back to draft instead.
 */
export async function deleteProgram(db: Db, a: { communityId: string; programId: string; actorId: string }): Promise<Result> {
  const row = await findProgram(db, a.communityId, a.programId)
  if (!row || (row.id !== a.programId && row.productId !== a.programId)) return no(404, "That program is not in this community.")
  if (!row.productId) {
    const buyers = await buyerCounts(db, [row.id])
    if ((buyers.get(row.id) ?? 0) > 0) return no(409, "Members bought this program. Move it to draft instead.")
  }
  const key = row.productId && row.id === row.productId ? "product_id" : "id"
  const { error } = await db.from("community_courses").delete().eq("community_id", a.communityId).eq(key, row.id)
  if (error) return no(500, "That did not go. Try again.")
  if (!row.productId && row.courseId) await removeProgramCourse(db, row.courseId)
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: row.productId ? "course.detached" : "program.deleted", targetType: row.productId ? "course" : "program", targetId: row.productId ?? row.id, targetLabel: row.title })
  return { ok: true }
}

/* A program's own course and its lessons' files. Never throws: the rows go even if a file will not. */
async function removeProgramCourse(db: Db, courseId: string): Promise<void> {
  try {
    const { data: modules } = await db.from("course_modules").select("id").eq("course_id", courseId)
    const moduleIds = ((modules as { id: string }[] | null) ?? []).map((m) => m.id)
    const { data: lessons } = moduleIds.length ? await db.from("course_lessons").select("id, video_path, captions_path").in("module_id", moduleIds) : { data: [] }
    const ls = (lessons as { id: string; video_path?: string | null; captions_path?: string | null }[] | null) ?? []
    const { data: atts } = ls.length ? await db.from("lesson_attachments").select("file_path").in("lesson_id", ls.map((l) => l.id)) : { data: [] }
    const paths = [...ls.flatMap((l) => [l.video_path, l.captions_path]), ...((atts as { file_path: string }[] | null) ?? []).map((x) => x.file_path)].filter((p): p is string => !!p && p.includes("/course-media/"))
    if (paths.length) {
      const { STORAGE_BUCKET } = await import("@/lib/storage/plans")
      await db.storage.from(STORAGE_BUCKET).remove(paths).then(() => undefined, () => undefined)
    }
    await db.from("courses").delete().eq("id", courseId).is("product_id", null)
  } catch (e) {
    console.error(`[communities] program course removal: ${reasonOf(e)}`)
  }
}
