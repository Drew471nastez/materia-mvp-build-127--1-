import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { MAX_DELETE_AT_ONCE, libraryUses, listLibrary, purgeLibraryFiles, removeFromLibrary, restoreToLibrary } from "@/lib/files/library"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Files (lib/files/library.ts): every picture the store has uploaded, where
 * each one is used, and taking one out of the list. Uploading goes straight
 * to storage from the page, into the owner's own folder, as every other
 * upload does.
 *
 *   GET                     the files, newest first (?kind=video for videos,
 *                           ?kind=media for pictures and videos together)
 *   POST { uses: [{ bucket, path }] }      where each one is used, by name
 *   POST { restore: [{ bucket, path }] }   put removed ones back in the list
 *   DELETE { bucket, path } REMOVE one from the list. The object stays, so
 *                           everything that still points at it keeps
 *                           drawing (lib/files/assets.ts).
 *   DELETE { files: [...] } several at once (Files, Select), every one
 *                           checked, refused whole if one is not theirs
 *   DELETE { files, permanent: true, confirm: "permanent" }
 *                           the bytes go. The dialog sends `confirm` only
 *                           after it has shown where the file is used.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  /* `?kind=video`: the videos a video setting can use, from the same folders; `?kind=media`: both. */
  const asked = new URL(request.url).searchParams.get("kind")
  const kind = asked === "video" ? "video" : asked === "media" ? "media" : "image"
  return physicalJson({ files: await listLibrary(c.db, { userId: c.userId, creatorId: c.creatorId }, kind) })
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const owner = { userId: c.userId, creatorId: c.creatorId }
  if (body && Array.isArray(body.uses)) {
    const out = await libraryUses(c.db, owner, body.uses)
    if (!out.ok) return physicalJson({ error: out.error }, out.status)
    return physicalJson({ uses: out.uses })
  }
  if (body && Array.isArray(body.restore)) {
    const out = await restoreToLibrary(c.db, owner, body.restore)
    if (!out.ok) return physicalJson({ error: out.error }, out.status)
    await recordActivity(c.db, c, { action: "file.restored", subjectType: "file", subjectLabel: `${out.restored} files` })
    return physicalJson({ ok: true, restored: out.restored })
  }
  return physicalJson({ error: "Nothing to do." }, 400)
}

export async function DELETE(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const owner = { userId: c.userId, creatorId: c.creatorId }
  const list: unknown[] | null = body && Array.isArray(body.files) ? (body.files as unknown[]) : body?.bucket || body?.path ? [{ bucket: body?.bucket, path: body?.path }] : null
  if (!list || list.length === 0 || list.length > MAX_DELETE_AT_ONCE) return physicalJson({ error: "Choose the files to remove." }, 400)
  const label = list.length === 1 ? String((list[0] as { path?: unknown })?.path ?? "").split("/").pop() : `${list.length} files`

  /* The bytes only go on a plain, confirmed permanent delete. */
  if (body?.permanent === true) {
    const out = await purgeLibraryFiles(c.db, owner, list, body?.confirm === "permanent")
    if (!out.ok) return physicalJson({ error: out.error }, out.status)
    await recordActivity(c.db, c, { action: "file.deleted", subjectType: "file", subjectLabel: label })
    return physicalJson({ ok: true, removed: out.removed, permanent: true })
  }

  const out = await removeFromLibrary(c.db, owner, list)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  await recordActivity(c.db, c, { action: out.retained ? "file.removed" : "file.deleted", subjectType: "file", subjectLabel: label })
  return physicalJson({ ok: true, removed: out.removed, retained: out.retained })
}
