/* The admin login's limit and its fallback warning (app/api/admin/blog/auth/route.ts), here so the route exports only handlers. */

/**
 * SAID LOUDLY, ONCE PER INSTANCE, while the fallback is what is in use. The
 * owner's decision in the route stands and nothing here changes it; the warning
 * only makes "the environment variables were never set in production" show
 * up in the logs instead of staying invisible. Setting BLOG_ADMIN_USER,
 * BLOG_ADMIN_PASSWORD and BLOG_ADMIN_SECRET in Vercel silences it.
 */
export function adminCredentialWarnings(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = []
  if (!env.BLOG_ADMIN_USER || !env.BLOG_ADMIN_PASSWORD) {
    out.push("BLOG_ADMIN_USER or BLOG_ADMIN_PASSWORD is not set: the admin login accepts the fallback credential written in the repository")
  }
  if (!env.BLOG_ADMIN_SECRET) out.push("BLOG_ADMIN_SECRET is not set: admin sessions are signed with the service role key")
  return out
}

/**
 * HOW OFTEN ONE ADDRESS MAY TRY. The login had no limit at all, so the one
 * password that opens the whole platform could be guessed as fast as the
 * function answered. Every try counts, right or wrong, per caller address:
 * far above an owner signing in, far below a guesser.
 */
export const ADMIN_LOGIN_LIMITS = [{ limit: 10, seconds: 300 }, { limit: 50, seconds: 86_400 }] as const
