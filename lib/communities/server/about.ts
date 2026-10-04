import "server-only"

/**
 * ===========================================================================
 *  WHAT ELSE A COMMUNITY'S ABOUT PAGE SAYS, FROM REAL ROWS
 * ===========================================================================
 * Round 10 (ask 32): the page somebody reads before joining says more:
 * who runs it (a creator card with their own line), how alive it is, and
 * what is in its classroom. Everything here is counted or read, never
 * guessed, and a part with nothing real to say is left out:
 *
 *   ACTIVITY   posts published in the last 30 days and members active in
 *              them (last_active_at), each only when it is above zero, and
 *              the month the community started.
 *   CLASSROOM  the courses attached to it (community_courses), the
 *              published ones, in the creator's order: title, picture and
 *              how many lessons. Titles only: nothing inside a course.
 *   CREATOR    the creator's own bio (profiles.bio), for the card.
 *
 * COST. A fixed handful of bounded reads whatever the size of the
 * community: two head counts on (community_id, created_at) and
 * (community_id, status, last_active_at), the attached courses (at most
 * ABOUT_COURSES drawn), their modules and lesson ids, and one profile.
 * Every read fails soft: a part that cannot be read is left out, the page
 * still draws.
 */
import type { AboutExtras } from "@/components/community/public/types"
import type { CommunityRow } from "../types"
import { attachedCourses } from "./classroom"
import { missing, reasonOf, type Db } from "./db"

/** Courses shown on the About page; the rest are counted. */
export const ABOUT_COURSES = 4
/** The window the activity line looks back over. */
export const ABOUT_DAYS = 30

const DAY_MS = 86_400_000

async function headCount(run: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await run()
    if (error) {
      if (!missing(error as never)) console.error(`[communities] about count: ${reasonOf(error)}`)
      return null
    }
    return typeof count === "number" ? count : null
  } catch (e) {
    console.error(`[communities] about count: ${reasonOf(e)}`)
    return null
  }
}

/** The published courses attached to the community, the first ABOUT_COURSES with their lesson counts, and how many there are in all. */
export async function aboutClassroom(db: Db, communityId: string): Promise<AboutExtras["classroom"]> {
  try {
    const attached = await attachedCourses(db, communityId)
    if (!attached.length) return null
    const ids = attached.map((a) => a.productId)
    const { data: productRows, error } = await db.from("products").select("id, title, thumbnail_url, type, status").in("id", ids)
    if (error) {
      if (!missing(error)) console.error(`[communities] about courses: ${reasonOf(error)}`)
      return null
    }
    const products = new Map(((productRows as { id: string; title: string | null; thumbnail_url: string | null; type: string | null; status: string | null }[] | null) ?? []).filter((p) => p.type === "course" && p.status === "published").map((p) => [p.id, p]))
    const ordered = attached.map((a) => products.get(a.productId)).filter((p): p is NonNullable<typeof p> => !!p)
    if (!ordered.length) return null
    const shown = ordered.slice(0, ABOUT_COURSES)
    const { data: courseRows } = await db.from("courses").select("id, product_id").in("product_id", shown.map((p) => p.id))
    const courses = (courseRows as { id: string; product_id: string }[] | null) ?? []
    const { data: moduleRows } = courses.length ? await db.from("course_modules").select("id, course_id").in("course_id", courses.map((c) => c.id)) : { data: [] }
    const modules = (moduleRows as { id: string; course_id: string }[] | null) ?? []
    const { data: lessonRows } = modules.length ? await db.from("course_lessons").select("id, module_id").in("module_id", modules.map((m) => m.id)).limit(5000) : { data: [] }
    const lessons = (lessonRows as { id: string; module_id: string }[] | null) ?? []
    const courseOfModule = new Map(modules.map((m) => [m.id, m.course_id]))
    const lessonsPerCourse = new Map<string, number>()
    for (const l of lessons) {
      const c = courseOfModule.get(l.module_id)
      if (c) lessonsPerCourse.set(c, (lessonsPerCourse.get(c) ?? 0) + 1)
    }
    return {
      total: ordered.length,
      courses: shown.map((p) => {
        const course = courses.find((c) => c.product_id === p.id)
        return { productId: p.id, title: p.title?.trim() || "Course", coverUrl: p.thumbnail_url, lessons: course ? lessonsPerCourse.get(course.id) ?? 0 : 0 }
      }),
    }
  } catch (e) {
    console.error(`[communities] about courses: ${reasonOf(e)}`)
    return null
  }
}

/** The creator's own line for the card, or null. */
async function creatorBio(db: Db, creatorId: string | null): Promise<string | null> {
  if (!creatorId) return null
  try {
    const { data: creator } = await db.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    const userId = (creator as { user_id?: string | null } | null)?.user_id
    if (!userId) return null
    const { data: profile, error } = await db.from("profiles").select("bio").eq("id", userId).maybeSingle()
    if (error) return null
    const bio = ((profile as { bio?: string | null } | null)?.bio || "").replace(/\s+/g, " ").trim()
    return bio ? bio.slice(0, 280) : null
  } catch {
    return null
  }
}

/** Everything the About page adds to the sales page's data, for this community. */
export async function aboutExtras(db: Db, community: Pick<CommunityRow, "id" | "creator_id" | "created_at" | "classroom_enabled">, now: number = Date.now()): Promise<AboutExtras> {
  const since = new Date(now - ABOUT_DAYS * DAY_MS).toISOString()
  const [posts, active, classroom, bio] = await Promise.all([
    headCount(() => db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", community.id).eq("status", "published").gte("created_at", since)),
    headCount(() => db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", community.id).eq("status", "active").gte("last_active_at", since)),
    community.classroom_enabled ? aboutClassroom(db, community.id) : Promise.resolve(null),
    creatorBio(db, community.creator_id ?? null),
  ])
  return {
    activity: { posts30: posts && posts > 0 ? posts : null, active30: active && active > 0 ? active : null, since: community.created_at ?? null },
    classroom,
    creatorBio: bio,
  }
}
