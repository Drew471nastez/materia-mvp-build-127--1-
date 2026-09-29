/**
 * Public member profiles live at `/@handle` in the browser. Next does not use
 * a literal `@` route folder; `next.config.mjs` rewrites `/@:handle` to
 * `/member/:handle`, which is reserved so no creator can claim it.
 */
export function memberProfilePublicPath(username: string): string {
  const handle = (username || "").trim().toLowerCase()
  return handle ? `/@${handle}` : "/"
}

/** In-app navigation (Capacitor, Link href). */
export function memberProfileInternalPath(username: string): string {
  const handle = (username || "").trim().toLowerCase()
  return handle ? `/member/${handle}` : "/"
}

export function hasActiveStorefront(creator: { onboarding_completed?: boolean | null } | null | undefined): boolean {
  return !!creator?.onboarding_completed
}
