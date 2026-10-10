/**
 * ===========================================================================
 *  WHY A SAVE DID NOT GO THROUGH, IN A LINE, AND WHAT TO DO
 * ===========================================================================
 * The editor used to show the server's own words in a red toast for four
 * seconds: "Invalid body", "Theme not found". Neither says what happened or
 * what to do. This turns an answer into a short title, one line of what to
 * do about it, and the one action that does it, for the save banner
 * (components/website-builder/editor/save-problem-banner.tsx).
 */

export type SaveAction = "retry" | "reload" | "signin" | "undo" | "back"

export interface SaveProblem {
  title: string
  fix: string
  action: SaveAction
}

type Issue = { path?: (string | number)[]; message?: string }

/** The section an "Invalid body" answer points at, by its place in what was sent. */
function sectionNamed(issues: Issue[] | undefined, sections: { name?: string; type: string }[] | undefined): string | null {
  const at = issues?.find((i) => i.path?.[0] === "sections" && typeof i.path?.[1] === "number")?.path?.[1]
  if (typeof at !== "number" || !sections?.[at]) return null
  const s = sections[at]
  return (s.name || s.type || "").replace(/[_-]+/g, " ").trim() || null
}

export function explainSaveProblem(
  status: number | null,
  body: { error?: unknown; issues?: Issue[] } | null,
  sections?: { name?: string; type: string }[],
): SaveProblem {
  const said = typeof body?.error === "string" ? body.error : ""
  if (status === null) return { title: "You're offline", fix: "Your changes are kept here. Saving resumes when you're back.", action: "retry" }
  if (status === 401) return { title: "You're signed out", fix: "Sign in again to keep saving. Your changes stay here.", action: "signin" }
  if (status === 403) return { title: "No access to this website", fix: "Switch to the account that owns it.", action: "back" }
  if (status === 404) return { title: "This website wasn't found", fix: "It may have been deleted. Go back to your websites.", action: "back" }
  if (status === 409) return { title: "Changed somewhere else", fix: "Reload to get the latest version, then redo your last change.", action: "reload" }
  if (status === 413) return { title: "Too much to save", fix: said && !/body|json/i.test(said) ? said : "Remove a section or some blocks, then save again.", action: "undo" }
  if (status === 429) return { title: "Saving too fast", fix: "Wait a moment, it saves again on its own.", action: "retry" }
  if (status === 400) {
    const where = sectionNamed(body?.issues, sections)
    return {
      title: where ? `"${where}" couldn't be saved` : "Your last change couldn't be saved",
      fix: "Undo it or try again. If it keeps happening, reload the editor.",
      action: "undo",
    }
  }
  if (status >= 500) return { title: "Storelib didn't answer", fix: "Your changes are kept here. Try again in a moment.", action: "retry" }
  return { title: "Couldn't save", fix: said && said.length < 120 ? said : "Try again in a moment.", action: "retry" }
}
