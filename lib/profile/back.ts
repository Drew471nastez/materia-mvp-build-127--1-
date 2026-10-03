/**
 * Whether a profile was reached from somewhere its back bar should return
 * to: a community, Explore, or search (components/profile/profile-back-bar).
 * Pure, so the server (from the Referer) and the browser (from the page it
 * came from) ask the same question.
 */
export function cameFromBrowsing(path: string | null | undefined): boolean {
  if (!path) return false
  return /^\/(community|explore|search)(\/|$|\?)/.test(path)
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
