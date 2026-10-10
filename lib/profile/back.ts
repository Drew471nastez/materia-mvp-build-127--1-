/**
 * Whether a profile was reached from somewhere its back bar should return
 * to: a community, Explore, or search (components/profile/profile-top-bar).
 * Pure, so the server (from the Referer) and the browser (from the page it
 * came from) ask the same question.
 */
export function cameFromBrowsing(path: string | null | undefined): boolean {
  if (!path) return false
  return /^\/(community|explore|search)(\/|$|\?)/.test(path)
}

/** Pages a way back should never return to: signing in is not a place somebody was. */
const NOT_A_PLACE = /^\/(login|signup|sign-up|register|auth|reset-password|forgot-password|verify|logout)(\/|$|\?)/

function samePage(a: string, b: string): boolean {
  const norm = (p: string) => (p.split(/[?#]/)[0].replace(/\/+$/, "") || "/").toLowerCase()
  return norm(a) === norm(b)
}

/**
 * Whether there is somewhere to go back to: any page of ours other than this
 * one (and other than signing in). The owner's rule for the creator page's
 * bar: the back chevron shows "only when arrived from somewhere". `here` is
 * every address this same page answers to (/<handle>, /u/<handle>, ...), so
 * a reload, whose Referer is the page itself, does not count.
 */
export function cameFromElsewhere(path: string | null | undefined, here: string | readonly string[]): boolean {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return false
  if (NOT_A_PLACE.test(path)) return false
  const own = typeof here === "string" ? [here] : here
  return !own.some((h) => samePage(path, h))
}

/** The path of a same origin Referer, or null. */
export function refererPath(referer: string | null | undefined, host: string | null | undefined): string | null {
  if (!referer || !host) return null
  try {
    const url = new URL(referer)
    return url.host === host ? url.pathname : null
  } catch {
    return null
  }
}

/**
 * WHERE THE WAY BACK LANDS WHEN THERE IS NO PAGE BEHIND (round 15). A
 * person's full page opened from their profile inside a community carries
 * that place in its address (`?from=community&back=/community/<slug>?profile=<handle>`,
 * components/community/member/member-profile.tsx fullPageHref), so the back
 * arrow returns to the community even when the page was opened cold (a
 * reload, the app's resume, a link shared from it) instead of to Explore.
 * Only a community address of ours is taken: a path, never a host, no
 * `//`, no backslash, nothing but the characters a community place has.
 */
export function communityBackTarget(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim()
  if (!v || v.length > 200 || v.includes("//") || v.includes("\\")) return null
  const m = /^\/community\/([a-z0-9][a-z0-9-]{0,47})(\/[a-z0-9/_-]{0,80})?(\?(?:profile|space)=[a-z0-9_.-]{1,40})?$/i.exec(v)
  if (!m) return null
  return v
}
