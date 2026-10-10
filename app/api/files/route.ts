import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { deleteLibraryFile, listLibrary } from "@/lib/files/library"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Files (lib/files/library.ts): every picture the store has uploaded, and
 * deleting one. Uploading goes straight to storage from the page, into the
 * owner's own folder, as every other upload does.
 *
 *   GET                     the files, newest first
 *   DELETE { bucket, path } delete one of the owner's own
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson({ files: await listLibrary(c.db, { userId: c.userId, creatorId: c.creatorId }) })
}

export async function DELETE(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const out = await deleteLibraryFile(c.db, { userId: c.userId, creatorId: c.creatorId }, body?.bucket, body?.path)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  await recordActivity(c.db, c, { action: "file.deleted", subjectType: "file", subjectLabel: String(body?.path ?? "").split("/").pop() })
  return physicalJson({ ok: true })
}
