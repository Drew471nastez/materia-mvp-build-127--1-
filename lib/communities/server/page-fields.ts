import "server-only"

/**
 * ===========================================================================
 *  THE PAGE EDITOR'S NEWER FIELDS, ON THE SERVER (round 26)
 * ===========================================================================
 * The short description (communities.summary) and the member links
 * (communities.member_links), both from run-now part 220, and the rule the
 * join button's words follow (../page-look.ts joinWordsProblem).
 *
 * READ APART FROM THE ROW. The community row every page reads
 * (COMMUNITY_COLUMNS) does not name the two columns, so a database where part
 * 220 has not run yet reads exactly as before; the editor asks for them on
 * their own and is told they are not ready (`ready: false`) instead of
 * failing. member_links is never in a public read: only the editor (here)
 * and the member side (for an active member) ask for it, with the service
 * role.
 */
import { checkMemberLinks, checkSummary, cleanMemberLinks, cleanSummary, type MemberLink } from "../member-links"
import { joinWordsProblem } from "../page-look"
import type { CommunityAccess } from "../types"
import { missing, reasonOf, type Db } from "./db"

export const PAGE_FIELDS_NOT_READY = "The short description and member links are waiting for a database update (run-now part 220)."

export interface PageFields {
  /** False until part 220 has run: the editor shows the two fields as waiting, and never sends them. */
  ready: boolean
  summary: string | null
  memberLinks: MemberLink[]
}

export async function loadPageFields(db: Db, communityId: string): Promise<PageFields> {
  const { data, error } = await db.from("communities").select("summary, member_links").eq("id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] page fields read ${communityId}: ${reasonOf(error)}`)
    return { ready: false, summary: null, memberLinks: [] }
  }
  const row = (data ?? {}) as { summary?: unknown; member_links?: unknown }
  return { ready: true, summary: cleanSummary(row.summary), memberLinks: cleanMemberLinks(row.member_links) }
}

type Refusal = { ok: false; error: string; field: string }

/** The two columns a settings body sets, checked; nothing when it names neither. */
export function pageFieldsPatch(b: Record<string, unknown>): { ok: true; patch: Record<string, unknown> } | Refusal {
  const patch: Record<string, unknown> = {}
  if (b.summary !== undefined) {
    const r = checkSummary(b.summary)
    if (!r.ok) return { ok: false, error: r.error, field: "summary" }
    patch.summary = r.value
  }
  if (b.memberLinks !== undefined) {
    const r = checkMemberLinks(b.memberLinks)
    if (!r.ok) return r
    patch.member_links = r.value
  }
  return { ok: true, patch }
}

/** Whether a patch writes a part 220 column (a failed write then names the update rather than "try again"). */
export function writesPageFields(patch: Record<string, unknown>): boolean {
  return "summary" in patch || "member_links" in patch
}

/** A way in that costs money, as far as the community's access says (custom access is decided tier by tier: not known). */
export function accessIsPaid(access: CommunityAccess | string | null | undefined): boolean {
  return access === "paid" || access === "product"
}

/**
 * The join button's words and the line under it, as sent: refused when they name a price, a currency with an amount
 * or a billing period, or say free on a page that charges (../page-look.ts). Read from the body before it is cleaned,
 * since cleaning would quietly drop such words and the creator would not know why their words were not saved.
 */
export function joinWordsRefusal(rawLook: unknown, access: CommunityAccess | string | null | undefined): Refusal | null {
  const r = rawLook && typeof rawLook === "object" ? (rawLook as Record<string, unknown>) : {}
  const paid = accessIsPaid(access)
  for (const key of ["joinLabel", "joinNote"] as const) {
    const v = typeof r[key] === "string" ? (r[key] as string) : ""
    const problem = joinWordsProblem(v, paid)
    if (problem === "money") return { ok: false, error: "Leave prices, currencies and billing periods out of the button. The real price is shown on the page.", field: `pageLook.${key}` }
    if (problem === "free") return { ok: false, error: "Joining costs money, so the button cannot say free.", field: `pageLook.${key}` }
  }
  return null
}
