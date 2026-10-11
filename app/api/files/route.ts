import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { deleteLibraryFile, deleteLibraryFiles, listLibrary } from "@/lib/files/library"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Files (lib/files/library.ts): every picture the store has uploaded, and
 * deleting one. Uploading goes straight to storage from the page, into the
 * owner's own folder, as every other upload does.
 *
 *   GET                     the files, newest first (?kind=video for videos)
 *   DELETE { bucket, path } delete one of the owner's own
 *   DELETE { files: [{ bucket, path }] }  several at once (Files, Select),
 *                           every one checked, refused whole if one is not theirs
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  /* `?kind=video`: the videos a video setting can use, from the same folders. */
  const kind = new URL(request.url).searchParams.get("kind") === "video" ? "video" : "image"
  return physicalJson({ files: await listLibrary(c.db, { userId: c.userId, creatorId: c.creatorId }, kind) })
}

export async function DELETE(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (body && Array.isArray(body.files)) {
    const many = await deleteLibraryFiles(c.db, { userId: c.userId, creatorId: c.creatorId }, body.files)
    if (!many.ok) return physicalJson({ error: many.error }, many.status)
    await recordActivity(c.db, c, { action: "file.deleted", subjectType: "file", subjectLabel: `${many.removed} files` })
    return physicalJson({ ok: true, removed: many.removed })
  }
  const out = await deleteLibraryFile(c.db, { userId: c.userId, creatorId: c.creatorId }, body?.bucket, body?.path)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  await recordActivity(c.db, c, { action: "file.deleted", subjectType: "file", subjectLabel: String(body?.path ?? "").split("/").pop() })
  return physicalJson({ ok: true })
}
