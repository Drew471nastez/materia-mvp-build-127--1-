/**
 * ===========================================================================
 *  WHY A SAVE DID NOT LAND, AND WHAT TO DO ABOUT IT
 * ===========================================================================
 * A failed save used to show the server's own words in a red toast for four
 * seconds: "Invalid body", "Theme not found". Neither says what happened or
 * what to do, and both were gone before they were read. Each answer a save
 * route gives is read here into a short title and one fix, and the editor
 * keeps it on screen until a save lands (save-problem-banner.tsx).
 *
 * PURE: the editor, its probe and the tests read the same table.
 */

export type SaveFix = "retry" | "reload" | "sign-in" | "themes" | "trim"

export interface SaveProblem {
  /** One line: what happened. */
  title: string
  /** One line: what to do. */
  detail: string
  /** The one button the banner offers. */
  fix: SaveFix
  /** Whether the editor tries again by itself, a little later. */
  retries: boolean
}

/** The fix's button label. */
export const FIX_LABEL: Record<SaveFix, string> = {
  retry: "Try again",
  reload: "Reload editor",
  "sign-in": "Sign in",
  themes: "Your themes",
  trim: "Got it",
}

/**
 * `status` is the response's, or 0 when no answer came. `error` is the
 * route's own message, which is shown where it already says something a
 * person can act on (the limits, a rate limit).
 */
export function saveProblem(status: number, error: unknown, what: "page" | "settings" | "publish" = "page"): SaveProblem {
  const said = typeof error === "string" ? error.trim() : ""
  const thing = what === "settings" ? "Theme settings" : what === "publish" ? "Publishing" : "Your changes"
  if (status === 0) return { title: `${thing} did not save`, detail: "Connection dropped. Your edits are safe; trying again.", fix: "retry", retries: true }
  if (status === 401) return { title: "You were signed out", detail: "Sign in in a new tab, then save. Nothing is lost.", fix: "sign-in", retries: false }
  if (status === 403) return { title: "This store is not yours to edit", detail: "Switch to the account that owns it.", fix: "themes", retries: false }
  if (status === 404) return { title: "This theme is not in your account", detail: "It was removed, or this is another account. Open it from your themes.", fix: "themes", retries: false }
  if (status === 413) return { title: "This page is over a limit", detail: said || "Remove a section or some blocks, then save.", fix: "trim", retries: false }
  if (status === 429) return { title: "Saving a lot at once", detail: "Trying again in a few seconds.", fix: "retry", retries: true }
  if (status === 400) {
    return {
      title: `${thing} did not save`,
      detail: said && !/^invalid (body|json)$/i.test(said) ? said : "A value on this page can't be saved. Reload, or undo the last change.",
      fix: "reload",
      retries: false,
    }
  }
  return { title: `${thing} did not save`, detail: "Storelib did not answer. Trying again.", fix: "retry", retries: true }
}
