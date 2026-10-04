/**
 * ===========================================================================
 *  A PERSON'S OWN COVER (profiles.cover_url)
 * ===========================================================================
 * "Users can add a cover image to their profile like creators do." The
 * picture goes up through the same pipeline a creator's cover does
 * (components/app/image-upload.tsx: bucket `covers`, resized in the browser
 * by its bucket's rule, checked on the server by lib/storage/confirm-upload),
 * and only its public address is saved here, by PATCH /api/profile/cover.
 *
 * THE ADDRESS IS CHECKED, NOT TRUSTED. It ends up in an <img> on a public
 * page, so it has to be a public object in Storelib's own `covers` bucket,
 * in the uploader's own folder (`<userId>/...`, which is where the upload
 * writes it). Anything else is refused rather than stored.
 *
 * READ WITH THE SERVICE ROLE. The column comes from
 * supabase/sql/RUN_PROFILE_COVER_BIO.sql. Run-now part 63 grants the public
 * columns of profiles from a list of private ones, and cover_url is not on
 * that list, so it is public; but a grant is only made when
 * storelib_share_public_columns() runs after the column exists. The server
 * reads it for the page instead (lib/profile/member-profile-data.ts), so a
 * visitor sees it whichever order those two scripts ran in, and nothing
 * here needs new SQL.
 *
 * WHICH PART OF IT SHOWS. The cover is placed the way a creator places
 * theirs (components/app/image-upload.tsx `reposition`, the model in
 * lib/images/cover-crop.ts: x and y as object-position percentages and a
 * zoom). A creator's crop lives in their page's settings; profiles have no
 * column for one, and the owner asked for no SQL here, so it rides on the
 * address the column already holds, as its fragment:
 *
 *   https://<project>.supabase.co/storage/v1/object/public/covers/<user>/<file>#crop=42.5,30,1.25
 *
 * A fragment is never sent to a server, so the stored address still fetches
 * exactly the same file, and an address with none is a centred cover at its
 * own size, which is every cover saved before this. Everything that draws
 * the cover reads it through `parseProfileCover`, so the picture's address
 * and its crop are always taken apart in one place.
 *
 * Pure apart from the types, so the route, the profile's header, Settings
 * and tests/account-center.test.ts ask the same question.
 */
import { DEFAULT_COVER_CROP, cropFromSettings, isDefaultCrop, type CoverCrop } from "@/lib/images/cover-crop"

const MAX_URL = 600

/** The public URL of an object in `covers` under this user's folder, or null. */
export function ownCoverUrl(value: unknown, userId: string, storageHost: string | null): string | null {
  if (typeof value !== "string" || !value || value.length > MAX_URL || !userId) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (storageHost ? host !== storageHost.toLowerCase() : !host.endsWith(".supabase.co")) return null
  const prefix = `/storage/v1/object/public/covers/${userId}/`
  if (!url.pathname.startsWith(prefix) || url.pathname.length <= prefix.length) return null
  if (url.pathname.includes("..")) return null
  return `${url.origin}${url.pathname}`
}

/** The storage host this deployment uploads to, from its Supabase URL. */
export function supabaseStorageHost(env: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  try {
    return env ? new URL(env).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

const MISSING = new Set(["42703", "PGRST204"])

/** PostgREST's or Postgres's way of saying the column has not been added. */
export function missingCoverColumn(error: { code?: string | null } | null | undefined): boolean {
  return MISSING.has(String(error?.code ?? ""))
}

/** A cover as stored, taken apart: the picture's own address and where it sits in the band. */
export interface ProfileCover {
  url: string | null
  crop: CoverCrop
}

const CROP_RE = /#crop=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/

/** The stored value, as the picture and its crop. Anything after a `#` that is not a crop is dropped. */
export function parseProfileCover(stored: string | null | undefined): ProfileCover {
  const value = (stored || "").trim()
  if (!value) return { url: null, crop: DEFAULT_COVER_CROP }
  const hash = value.indexOf("#")
  const url = hash >= 0 ? value.slice(0, hash) : value
  const m = hash >= 0 ? CROP_RE.exec(value.slice(hash)) : null
  const crop = m ? cropFromSettings({ x: Number(m[1]), y: Number(m[2]) }, Number(m[3])) : DEFAULT_COVER_CROP
  return { url: url || null, crop }
}

/** The value to store: the address, and its crop when it is not the centred default. */
export function profileCoverValue(url: string, crop: CoverCrop | null | undefined): string {
  const c = cropFromSettings(crop ?? null, crop?.zoom)
  return isDefaultCrop(c) ? url : `${url}#crop=${c.x},${c.y},${c.zoom}`
}

/** A crop sent by the browser, checked and rounded, or null for anything that is not one. */
export function cropFromBody(value: unknown): CoverCrop | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (![v.x, v.y, v.zoom].every((n) => typeof n === "number" && Number.isFinite(n))) return null
  return cropFromSettings({ x: v.x, y: v.y }, v.zoom)
}

/**
 * THE BAND'S SHAPE AT A GIVEN WIDTH. The profile's cover runs edge to edge
 * at a fixed height (components/profile/profile-hero.tsx: 128px on a phone,
 * 192 from 640px, 256 from 1024px), so its shape is the window's width over
 * that height. Settings previews the crop in a frame of exactly that shape:
 * a crop depends only on the frame's shape, never its size.
 */
export const PROFILE_COVER_HEIGHTS = { phone: 128, sm: 192, lg: 256 } as const

export function profileBandAspect(viewportWidth: number): number {
  const w = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 390
  const h = w >= 1024 ? PROFILE_COVER_HEIGHTS.lg : w >= 640 ? PROFILE_COVER_HEIGHTS.sm : PROFILE_COVER_HEIGHTS.phone
  return Math.round(Math.min(12, Math.max(1.5, w / h)) * 1000) / 1000
}
