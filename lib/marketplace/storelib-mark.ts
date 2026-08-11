/**
 * Storelib's own mark, as a URL.
 *
 * The same asset `lib/system-account.ts` puts on the official account's avatar,
 * lifted out of it for one reason: that module is `server-only` — it reads the
 * service key and resolves the system account — and the staff badge is drawn in
 * a client component. Importing the constant from there would drag a server
 * module into the browser bundle, which Next refuses outright.
 *
 * So the string lives here, where both sides can have it, and system-account.ts
 * re-exports it rather than holding a second copy. One asset, one URL, and the
 * badge beside a name cannot drift from the face on the thread.
 */
export const STORELIB_MARK_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"
