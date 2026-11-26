/**
 * Which websites this browser has seen are imported themes (a Materia
 * template, a Shopify-format upload), so the editor knows from its first
 * frame that the theme's files are about 30 MB and asks for them once its
 * own small read has answered (round 65). A convenience only: a missing or
 * wrong answer means the install says so itself, one read later.
 */
export const compatHintKey = (installId: string): string => `wb-compat:${installId}`

/** Every website the marketplace adds is an imported theme: remembered before the editor opens it. */
export function rememberCompatInstall(installId: string): void {
  try {
    window.localStorage.setItem(compatHintKey(installId), "1")
  } catch {
    /* no storage: the editor learns it from the install */
  }
}

export function knownCompatInstall(installId: string): boolean {
  try {
    return window.localStorage.getItem(compatHintKey(installId)) === "1"
  } catch {
    return false
  }
}
