/**
 * A site's uploaded media.
 *
 * GET lists what the site has. POST stores one file. DELETE removes one.
 *
 * Ownership is proved by `resolveSite` before anything is read or written, and
 * it is proved through the SIGNED-IN user's client so RLS answers the question
 * — a site somebody else owns reads as absent, which is the right answer to
 * both "it is not yours" and "it does not exist".
 *
 * The upload itself then goes through the admin client, because a creator who
 * could write to the bucket directly could put a file under another creator's
 * prefix and have it served from an address with our name on it.
 */

import { type NextRequest, NextResponse } from "next/server"

import { resolveSite } from "@/lib/sites/resolve"
import {
  deleteAsset,
  listAssets,
  MAX_ASSET_BYTES,
  uploadAsset,
} from "@/lib/sites/assets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A 25MB upload over a phone connection is not a fast request. */
export const maxDuration = 60

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId)
  if (!found.ok) return found.response

  return NextResponse.json(
    { assets: await listAssets(siteId) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId)
  if (!found.ok) return found.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Send the file as multipart form data." }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 })
  }

  /**
   * Refused on the declared size BEFORE the body is read into memory. Reading
   * a 400MB upload to find out it is too big is how a route gets killed by its
   * own memory limit instead of answering.
   */
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${Math.round(file.size / 1024 / 1024)}MB and the limit is ${
          MAX_ASSET_BYTES / 1024 / 1024
        }MB.`,
      },
      { status: 413 },
    )
  }

  const result = await uploadAsset({
    siteId,
    filename: file.name || "file",
    mime: file.type,
    body: await file.arrayBuffer(),
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json(
    { asset: result.asset },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  )
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId)
  if (!found.ok) return found.response

  const assetId = new URL(request.url).searchParams.get("id")
  if (!assetId) return NextResponse.json({ error: "Which file?" }, { status: 400 })

  /**
   * Scoped to THIS site inside `deleteAsset` as well as here. An id is a guess
   * somebody can make, and ownership of the site is not ownership of every id
   * they can type.
   */
  const removed = await deleteAsset(siteId, assetId)
  if (!removed) return NextResponse.json({ error: "That file is not here." }, { status: 404 })

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
