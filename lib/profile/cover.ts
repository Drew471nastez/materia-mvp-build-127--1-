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
 * Pure apart from the types, so the route and tests/account-center.test.ts
 * ask the same question.
 */

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
