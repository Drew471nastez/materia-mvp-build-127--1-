import "server-only"

/**
 * ===========================================================================
 *  THEIR STORELIB PAGE'S COVER AND WORDS, READ IN ONE PLACE
 * ===========================================================================
 * A creator puts their cover and their words on their page (the page
 * builder's header: the published headerSettings' coverImageUrl with its
 * focal point and zoom, and bio), not on profiles.cover_url, which is the
 * person's own cover from Settings. The creator page's own order
 * (app/(marketing)/u/[username]): the published header first, then the
 * creators row.
 *
 * Round 25 read this for a member's profile inside a community only
 * (lib/communities/server/member-profile.ts). Round J1, the owner: "the covers
 * of users in their account can also be their cover from the creator page,
 * and also in the edit profile". So it lives here now and the account page
 * (app/account/layout.tsx) and Settings (lib/account/load-account-settings.ts)
 * ask the same question, and every surface shows the same cover:
 *
 *   their own cover (Settings) > their creator page's cover > none
 *
 * `personCover` is that order, as the stored value the account page and
 * Settings already take (the address with its crop as a fragment,
 * lib/profile/cover.ts).
 *
 * Two small reads, the second only for somebody with a store row, with the
 * service role the caller hands in. Never an error on a page: a read that
 * fails is "no cover".
 */
import { DEFAULT_COVER_CROP, cropFromSettings, type CoverCrop } from "@/lib/images/cover-crop"
import { parseProfileCover, profileCoverValue, publicCoverUrl } from "@/lib/profile/cover"

/** The service role client the caller hands in (the communities' own loose type for it). */
type Db = import("@/lib/communities/server/db").Db

async function one<T>(run: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run()
    return error ? null : ((data as T | null) ?? null)
  } catch {
    return null
  }
}

export interface PageLook {
  hasStorefront: boolean
  cover: { url: string; crop: CoverCrop } | null
  bio: string | null
}

type HeaderLook = { coverImageUrl?: unknown; coverFocalPoint?: { x?: unknown; y?: unknown } | null; coverZoom?: unknown; bio?: unknown }

type CreatorRow = { id: string; onboarding_completed?: boolean | null; cover_url?: string | null; bio?: string | null }

/** Their creators row: the full read, and if that one fails (an older column set), just what the cover needs. */
async function creatorOf(db: Db, userId: string): Promise<CreatorRow | null> {
  const full = await one<CreatorRow>(() => db.from("creators").select("id, onboarding_completed, cover_url, bio").eq("user_id", userId).limit(1).maybeSingle())
  if (full?.id) return full
  return one<CreatorRow>(() => db.from("creators").select("id, cover_url").eq("user_id", userId).limit(1).maybeSingle())
}

export async function pageLookOf(db: Db, userId: string): Promise<PageLook> {
  const creator = await creatorOf(db, userId)
  if (!creator?.id) return { hasStorefront: false, cover: null, bio: null }
  const config = await one<{ header?: HeaderLook | null }>(() =>
    db.from("store_builder_configs").select("header:published_config->headerSettings").eq("creator_id", creator.id).eq("page_type", "shop").order("published_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  )
  const header = config?.header && typeof config.header === "object" ? config.header : null
  const words = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const fromHeader = publicCoverUrl(header?.coverImageUrl)
  const url = fromHeader ?? publicCoverUrl(creator.cover_url)
  const crop = fromHeader ? cropFromSettings(header?.coverFocalPoint ?? null, header?.coverZoom) : DEFAULT_COVER_CROP
  return {
    hasStorefront: !!creator.onboarding_completed,
    cover: url ? { url, crop: { x: crop.x, y: crop.y, zoom: crop.zoom } } : null,
    bio: words(header?.bio) ?? words(creator.bio),
  }
}

/** Their own cover from Settings (profiles.cover_url), as stored, when it is a picture that can be drawn. */
export async function ownCoverValue(db: Db, userId: string): Promise<string | null> {
  const row = await one<{ cover_url?: string | null }>(() => db.from("profiles").select("cover_url").eq("id", userId).maybeSingle())
  const cover = parseProfileCover(row?.cover_url ?? null)
  const url = publicCoverUrl(cover.url)
  return url ? profileCoverValue(url, cover.crop) : null
}

export interface PersonCover {
  /** The cover to draw, as a stored value (address and crop), or null for none. */
  value: string | null
  /** Where it came from. */
  source: "own" | "page" | null
  /** Their creator page's cover as a stored value, whether or not it is the one drawn (Settings offers it back). */
  page: string | null
}

/** The order every surface follows: their own cover, else their creator page's. Pure, for a caller that read both itself. */
export function chooseCover(own: string | null, look: PageLook): PersonCover {
  const page = look.cover ? profileCoverValue(look.cover.url, look.cover.crop) : null
  if (own) return { value: own, source: "own", page }
  if (page) return { value: page, source: "page", page }
  return { value: null, source: null, page: null }
}

/** The one cover a person shows everywhere: their own, else their creator page's. Both reads at once. */
export async function personCover(db: Db, userId: string): Promise<PersonCover> {
  const [own, look] = await Promise.all([ownCoverValue(db, userId), pageLookOf(db, userId)])
  return chooseCover(own, look)
}
