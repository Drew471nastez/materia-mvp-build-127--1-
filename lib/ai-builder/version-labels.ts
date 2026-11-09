/**
 * Who wrote a version of a file, in the words the history and the conflict
 * prompt use. store_theme_file_versions.author (SQL part 401): `creator`
 * (somebody in the code editor or the builder), `ai` (the agent, Ask
 * Storelib), `import` (a GitHub push or a theme import), `restore` (a
 * version put back). Null is a row from before the column.
 *
 * Pure, for the code editor and the builder alike.
 */
import type { FileAuthor } from "./types"

export function versionAuthorLabel(author: FileAuthor | string | null | undefined): string {
  switch (author) {
    case "ai":
      return "AI"
    case "creator":
      return "You"
    case "import":
      return "GitHub"
    case "restore":
      return "Restored"
    default:
      return "Saved"
  }
}

/** The two buttons when a save meets a newer version: the newer one named by who wrote it. */
export function conflictChoiceLabels(author: FileAuthor | string | null | undefined): { mine: string; theirs: string } {
  if (author === "ai") return { mine: "Keep mine", theirs: "Use AI's" }
  if (author === "import") return { mine: "Keep mine", theirs: "Use GitHub's" }
  return { mine: "Keep mine", theirs: "Use theirs" }
}

/** The line over the two buttons. */
export function conflictLine(author: FileAuthor | string | null | undefined): string {
  if (author === "ai") return "The AI changed this file while you were editing it. Your version is still here."
  if (author === "import") return "A GitHub push changed this file while you were editing it. Your version is still here."
  return "Saved somewhere else while you were editing. Your version is still here."
}
