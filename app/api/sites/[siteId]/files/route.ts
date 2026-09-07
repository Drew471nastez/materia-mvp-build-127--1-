/**
 * A site's files.
 *
 * PUT takes only the files that changed. Validation and the ownership check
 * both live in `saveFiles`, so the agent's write_file will get exactly the same
 * rules without going through this route.
 */

import { type NextRequest, NextResponse } from "next/server"

import { MAX_FILES_PER_PROJECT } from "@/lib/sites/file-path"
import { readProject, saveFiles, siteRevision } from "@/lib/sites/projects"
import type { ProjectFiles } from "@/lib/sites/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params
  /**
   * The revision comes back with the files, because the two are only useful
   * together: it is the token the client sends on its next write to say "this
   * is the version I was looking at". Fetching them separately would leave a
   * window where the client holds a revision from before the files it holds.
   */
  const [files, revision] = await Promise.all([readProject(siteId), siteRevision(siteId)])
  // An empty object is also what a site the caller cannot see looks like: RLS
  // returns no rows, and there is nothing here that could tell them apart.
  return NextResponse.json({ files, revision })
}

export async function PUT(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const raw = (body as { files?: unknown })?.files
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Send { files: { path: content } }." }, { status: 400 })
  }

  const files: ProjectFiles = {}
  for (const [path, content] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof content !== "string") {
      return NextResponse.json({ error: `${path} is not text.` }, { status: 400 })
    }
    files[path] = content
  }

  if (Object.keys(files).length > MAX_FILES_PER_PROJECT) {
    return NextResponse.json({ error: "Too many files in one save." }, { status: 400 })
  }

  /**
   * The revision the client last read, if it sent one.
   *
   * This is the whole point of `site_commit_files`, and until now nothing sent
   * it — the lock serialised writes but two clients could still overwrite each
   * other's content, which is exactly the bug the mechanism exists to stop.
   * Optional, because a caller that has only ever read the current state has
   * nothing to compare; the lock still protects it.
   */
  const expected = typeof (body as { revision?: unknown }).revision === "number"
    ? ((body as { revision: number }).revision)
    : undefined

  const result = await saveFiles(siteId, files, expected)
  if (!result.ok) {
    // A conflict is 409 and must NOT be retried with the same body — the
    // editor reloads instead. A bad path is 400. Not-yours is 403.
    const status = result.conflict ? 409 : result.error.includes("not yours") ? 403 : 400
    return NextResponse.json({ error: result.error, conflict: result.conflict }, { status })
  }

  return NextResponse.json({ ok: true, savedAt: result.savedAt, revision: result.revision })
}
