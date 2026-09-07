/**
 * A site's files.
 *
 * PUT takes only the files that changed. Validation and the ownership check
 * both live in `saveFiles`, so the agent's write_file will get exactly the same
 * rules without going through this route.
 */

import { type NextRequest, NextResponse } from "next/server"

import { MAX_FILES_PER_PROJECT } from "@/lib/sites/file-path"
import { readProject, saveFiles } from "@/lib/sites/projects"
import type { ProjectFiles } from "@/lib/sites/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params
  // An empty object is also what a site the caller cannot see looks like: RLS
  // returns no rows, and there is nothing here that could tell them apart.
  return NextResponse.json({ files: await readProject(siteId) })
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

  const result = await saveFiles(siteId, files)
  if (!result.ok) {
    // Not-yours is a 403 and a bad path is a 400, because the editor retries
    // one of those and must never retry the other.
    const status = result.error.includes("not yours") ? 403 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true, savedAt: result.savedAt })
}
