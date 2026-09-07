/**
 * What may be a path in a project.
 *
 * Enforced in ONE place because the answer must be the same for the editor, the
 * file API and — when it lands — the agent's write_file. A path rule that lives
 * at a call site is a path rule the next call site invents differently, and the
 * agent is exactly the caller that will one day propose `../../../etc/passwd`
 * because a model read it somewhere.
 *
 * Paths are project-relative and separator-normalised: `src/App.tsx`, never
 * `/src/App.tsx` and never `./src/App.tsx`.
 */

/** Not a hard limit anyone will hit; a limit so that nobody can post a novel. */
export const MAX_FILE_BYTES = 512 * 1024
export const MAX_FILES_PER_PROJECT = 200
export const MAX_PATH_LENGTH = 200

const ALLOWED_EXTENSIONS = [
  ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json", ".html", ".svg", ".txt", ".md",
]

/** The reason a path is refused, or null when it is fine. */
export function filePathError(path: string): string | null {
  if (!path) return "A file needs a path."
  if (path.length > MAX_PATH_LENGTH) return "That path is too long."

  // Checked before anything else: a backslash is a separator on the machine a
  // developer later exports this to, and a rule that only understands `/`
  // would wave `..\..\secrets` straight through.
  if (path.includes("\\")) return "Use / in paths."
  if (path.startsWith("/")) return "Paths are relative to the project root."
  if (path.includes("//")) return "That path has an empty segment."
  if (/^[a-zA-Z]+:/.test(path)) return "Paths are relative to the project root."

  const segments = path.split("/")
  if (segments.some((s) => s === "." || s === "..")) return "Paths cannot navigate up."
  if (segments.some((s) => s === "")) return "That path has an empty segment."
  if (segments.some((s) => s.trim() !== s)) return "A path segment cannot start or end with a space."

  // Control characters and NUL. Not a naming style — an attempt to make one
  // string look like two, in a log line or a file listing.
  if (/[\u0000-\u001f\u007f]/.test(path)) return "That path has characters that are not allowed."

  const extension = path.slice(path.lastIndexOf("."))
  if (!path.includes(".") || !ALLOWED_EXTENSIONS.includes(extension)) {
    return `Sites can hold ${ALLOWED_EXTENSIONS.join(", ")} files.`
  }
  return null
}

/** The reason a whole project is refused, or null. */
export function projectError(files: Record<string, string>): string | null {
  const paths = Object.keys(files)
  if (paths.length === 0) return "A project needs at least one file."
  if (paths.length > MAX_FILES_PER_PROJECT) return `A site can hold ${MAX_FILES_PER_PROJECT} files.`
  for (const path of paths) {
    const error = filePathError(path)
    if (error) return `${path}: ${error}`
    // Byte length, not string length: a project of emoji is bigger than it
    // looks and the column it lands in is measured in bytes.
    if (new TextEncoder().encode(files[path]).length > MAX_FILE_BYTES) {
      return `${path} is too large.`
    }
  }
  return null
}
