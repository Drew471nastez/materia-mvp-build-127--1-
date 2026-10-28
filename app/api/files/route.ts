import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { listLibrary } from "@/lib/files/library"
import { keptMessage, removeFromFiles } from "@/lib/files/keep"
import { fileDetails, saveAltText } from "@/lib/files/usage-server"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Files (lib/files/library.ts): every picture the store has uploaded, and
 * deleting one. Uploading goes straight to storage from the page, into the
 * owner's own folder, as every other upload does.
 *
 *   GET                     the files, newest first (?kind=video for videos,
 *                           ?kind=media for pictures and videos together),
 *                           without the ones taken out of Files and kept
 *                           because they still show somewhere (part 280)
 *   DELETE { bucket, path } take one of the owner's own out of Files
 *   DELETE { files: [{ bucket, path }] }  several at once (Files, Select),
 *                           every one checked, refused whole if one is not theirs
 *   PATCH { bucket, path, alt }  a picture's alt text (part 214), for one of
 *                           the owner's own
 *
 * DELETE NEVER BREAKS WHAT SHOWS A FILE (round 39, lib/files/keep.ts): a file
 * a product, a page or anything else of the shop's still shows is hidden
 * from Files and kept in storage; only a file nothing uses is removed. The
 * answer says which: { deleted: [id], hidden: [{ id, uses }], kept: [{ id,
 * uses }], note }, `kept` being files in use that stay in Files because
 * part 280 has not run.
 */
export async function GET(request: Request) {
  /* Round 41: the list is read too by the pickers of the OnePage editor and Store details (a team member with OnePage or Store settings); changing or removing a file stays Products'. */
  const c = await shopCaller(["products", "onepage", "settings"])
  if (c instanceof NextResponse) return c
  /* `?kind=video`: the videos a video setting can use, from the same folders; `?kind=media`: both. */
  const asked = new URL(request.url).searchParams.get("kind")
  const kind = asked === "video" ? "video" : asked === "media" ? "media" : "image"
  const [all, details] = await Promise.all([listLibrary(c.db, { userId: c.ownerUserId ?? c.userId, creatorId: c.creatorId }, kind), fileDetails(c.db, c.creatorId)])
  const files = details.hidden.size ? all.filter((f) => !details.hidden.has(f.id)) : all
  /* `folder`: for a team member (round 41), the store owner's account, whose folder an upload goes into so it is listed here. Not sent for the owner. */
  return physicalJson({ files: details.alts.size ? files.map((f) => (details.alts.has(f.id) ? { ...f, alt: details.alts.get(f.id) } : f)) : files, ...(c.isOwner === false && c.ownerUserId ? { folder: c.ownerUserId } : {}) })
}

export async function PATCH(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const out = await saveAltText(c.db, { userId: c.ownerUserId ?? c.userId, creatorId: c.creatorId }, body?.bucket, body?.path, body?.alt)
  if (out.ok === false) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ ok: true, alt: out.alt })
}

export async function DELETE(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const many = !!body && Array.isArray(body.files)
  const list = many ? body.files : [{ bucket: body?.bucket, path: body?.path }]
  const out = await removeFromFiles(c.db, { userId: c.ownerUserId ?? c.userId, creatorId: c.creatorId }, list)
  if (out.ok === false) return physicalJson({ error: out.error }, out.status)
  const taken = out.deleted.length + out.hidden.length
  if (taken) await recordActivity(c.db, c, { action: "file.deleted", subjectType: "file", subjectLabel: many ? `${taken} files` : String(body?.path ?? "").split("/").pop() })
  return physicalJson({ ok: true, removed: taken, deleted: out.deleted, hidden: out.hidden, kept: out.kept, note: keptMessage(out.kept) })
}
