import "server-only"

/**
 * ===========================================================================
 *  A NEW COMMUNITY, READY TO OPEN
 * ===========================================================================
 * One call makes everything a community needs on its first day: its address
 * (unique; a name that is taken gets "-2", "-3" ... ), three spaces (General,
 * Announcements that only admins post in, Introductions), the six default
 * levels, a free "Members" tier when anyone may join free or by invite, the
 * owner's own member row, and the first line of its audit log. It starts as a
 * draft; publishing it is the creator's choice.
 *
 * Paid tiers are not made here: they are products (lib/memberships/creator.ts
 * for a monthly or yearly price, a community product for a one time price),
 * made by the creator's tier screen.
 *
 * If any of it cannot be written, the community row is taken away again so
 * there is never a half made community with no owner.
 */
import { COMMUNITY_ACCESS, COMMUNITY_COLUMNS, COMMUNITY_VISIBILITIES, isOneOf, type CommunityAccess, type CommunityRow, type CommunityVisibility } from "../types"
import { DEFAULT_FREE_TIER, DEFAULT_LEVELS, DEFAULT_SPACES, LENGTHS } from "../limits"
import { slugify, slugWithSuffix, validSlug } from "../slug"
import { audit } from "./audit"
import { grantMembership } from "./membership"
import { isUniqueViolation, missing, reasonOf, type Db } from "./db"
import { communityIdForOldSlug } from "./slug-history"

export interface CreateCommunityInput {
  creatorId: string
  ownerUserId: string
  name: string
  slug?: string | null
  tagline?: string | null
  access: CommunityAccess
  visibility: CommunityVisibility
  logoUrl?: string | null
  coverUrl?: string | null
}

export type CreateCommunityResult =
  | { ok: true; community: CommunityRow }
  | { ok: false; error: "not_set_up" | "invalid_name" | "invalid_tagline" | "invalid_slug" | "slug_taken" | "invalid_access" | "invalid_visibility" | "failed" }

const SUFFIX_TRIES = 6

function randomTail(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, "0")
}

/** The addresses to try, in order: the one asked for alone, or the name's with numbers and then a random tail. */
function candidates(input: CreateCommunityInput): { slugs: string[]; explicit: boolean } | null {
  if (input.slug) {
    const s = input.slug.trim().toLowerCase()
    return validSlug(s) ? { slugs: [s], explicit: true } : null
  }
  let base = slugify(input.name)
  if (!validSlug(base)) base = base.length >= 3 ? `${base}-community` : `community-${randomTail()}`
  if (!validSlug(base)) base = `community-${randomTail()}`
  const slugs = [base]
  for (let n = 2; n < 2 + SUFFIX_TRIES; n++) slugs.push(slugWithSuffix(base, n))
  slugs.push(slugWithSuffix(base, randomTail()))
  return { slugs, explicit: false }
}

export async function createCommunity(db: Db, input: CreateCommunityInput): Promise<CreateCommunityResult> {
  const name = (input.name ?? "").trim()
  if (name.length < LENGTHS.communityName.min || name.length > LENGTHS.communityName.max) return { ok: false, error: "invalid_name" }
  const tagline = input.tagline?.trim() || null
  if (tagline && tagline.length > LENGTHS.tagline.max) return { ok: false, error: "invalid_tagline" }
  if (!isOneOf(COMMUNITY_ACCESS, input.access)) return { ok: false, error: "invalid_access" }
  if (!isOneOf(COMMUNITY_VISIBILITIES, input.visibility)) return { ok: false, error: "invalid_visibility" }
  const tries = candidates(input)
  if (!tries) return { ok: false, error: "invalid_slug" }

  let community: CommunityRow | null = null
  for (const slug of tries.slugs) {
    /* Another community's old address stays theirs, so a link shared to it never opens this one (./slug-history.ts). */
    if (await communityIdForOldSlug(db, slug)) {
      if (tries.explicit) return { ok: false, error: "slug_taken" }
      continue
    }
    const { data, error } = await db
      .from("communities")
      .insert({
        creator_id: input.creatorId,
        owner_user_id: input.ownerUserId,
        slug,
        name,
        tagline,
        logo_url: input.logoUrl || null,
        cover_url: input.coverUrl || null,
        access: input.access,
        visibility: input.visibility,
        status: "draft",
      })
      .select(COMMUNITY_COLUMNS)
      .single()
    if (!error) {
      community = data as CommunityRow
      break
    }
    if (missing(error)) return { ok: false, error: "not_set_up" }
    if (isUniqueViolation(error)) {
      if (tries.explicit) return { ok: false, error: "slug_taken" }
      continue
    }
    console.error(`[communities] create: ${reasonOf(error)}`)
    return { ok: false, error: "failed" }
  }
  if (!community) return { ok: false, error: "slug_taken" }
  const made: CommunityRow = community

  try {
    const spaces = await db.from("community_spaces").insert(
      DEFAULT_SPACES.map((s, i) => ({ community_id: made.id, slug: s.slug, name: s.name, kind: s.kind, post_role: s.postRole, icon: s.icon, position: i })),
    )
    if (spaces.error) throw new Error(`spaces: ${reasonOf(spaces.error)}`)
    const levels = await db
      .from("community_levels")
      .insert(DEFAULT_LEVELS.map((l) => ({ community_id: made.id, level: l.level, name: l.name, min_points: l.minPoints })))
    if (levels.error) throw new Error(`levels: ${reasonOf(levels.error)}`)
    if (input.access === "free" || input.access === "invite_only") {
      const tier = await db.from("community_tiers").insert({ community_id: community.id, name: DEFAULT_FREE_TIER.name, kind: "free", is_default: true, position: 0 })
      if (tier.error) throw new Error(`free tier: ${reasonOf(tier.error)}`)
    }
    const owner = await grantMembership(db, { communityId: community.id, userId: input.ownerUserId, source: "owner", role: "owner", status: "active", actorId: input.ownerUserId })
    if (!owner) throw new Error("owner row not written")
  } catch (e) {
    console.error(`[communities] create ${community.slug}: ${reasonOf(e)}`)
    await db.from("communities").delete().eq("id", community.id)
    return { ok: false, error: "failed" }
  }

  await audit(db, {
    communityId: community.id,
    actorId: input.ownerUserId,
    actorKind: "member",
    action: "community.created",
    targetType: "community",
    targetId: community.id,
    targetLabel: community.name,
    detail: { slug: community.slug, access: community.access, visibility: community.visibility },
  })
  /* Read again: the owner's row has moved member_count to 1. */
  const { data: fresh } = await db.from("communities").select(COMMUNITY_COLUMNS).eq("id", community.id).maybeSingle()
  return { ok: true, community: (fresh as CommunityRow | null) ?? community }
}

/**
 * Round 33, the wizard's address check: whether this address is free for a
 * new community now (not another community's, now or before). Answers the
 * address as it would be stored. Create checks again, so a race only means
 * the person hears "taken" one step later.
 */
export async function addressFree(db: Db, raw: unknown): Promise<{ slug: string; available: boolean; reason: "invalid" | "taken" | null }> {
  const slug = slugify(typeof raw === "string" ? raw : "")
  if (!validSlug(slug)) return { slug, available: false, reason: "invalid" }
  const { data, error } = await db.from("communities").select("id").eq("slug", slug).limit(1)
  if (error) return { slug, available: true, reason: null }
  if (Array.isArray(data) && data.length) return { slug, available: false, reason: "taken" }
  if (await communityIdForOldSlug(db, slug)) return { slug, available: false, reason: "taken" }
  return { slug, available: true, reason: null }
}
