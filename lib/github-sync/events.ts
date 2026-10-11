/**
 * The Connections activity list: one line for each thing that went to or
 * came from GitHub. Its own module, so the sync (sync.ts) and the builder's
 * mirror (mirror.ts) both write it without importing each other.
 */
import { statusLine } from "./core"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Write one line to the Connections activity list. Never throws. */
export async function recordEvent(
  db: Db,
  installId: string,
  e: { direction: "to_github" | "from_github"; ok: boolean; summary: string; commit_sha?: string | null },
) {
  try {
    await db.from("theme_github_events").insert({
      install_id: installId,
      direction: e.direction,
      ok: e.ok,
      summary: statusLine(e.summary).slice(0, 300),
      commit_sha: e.commit_sha ?? null,
    })
  } catch {
    /* the table may not exist yet */
  }
}
