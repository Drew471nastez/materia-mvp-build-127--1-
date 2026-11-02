import { NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { creatorPagesChanged } from "@/lib/storefront/creator-page-purge"
import { createAdminClient } from "@/lib/supabase/admin"
import { productTag } from "@/lib/commerce/product-page-cache"
import { uploadRateLimit } from "@/lib/storage/upload-guard"
import { ManageError, applyAction, completeUpload, editorTree, ownerOf, prepareUpload } from "@/lib/courses/manage"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"
import { teamStoreIdFor } from "@/lib/team/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /api/courses/manage: the course card in the product editor
 * (components/courses/course-editor.tsx). The creator of the product only;
 * everything it does is in lib/courses/manage.ts.
 *
 *   GET  ?productId=            the course as the editor shows it
 *   POST { productId, action }  one change, answered with the whole course
 *        action "upload-prepare"  a signed upload address for a lesson's video,
 *                                 captions or download (answered with that, not the course)
 *        action "upload-complete" the file checked where it landed, then kept
 *
 * A change also refreshes the product page's cached outline, so the lesson
 * list a visitor sees is the one just saved.
 */
export async function GET(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE })
  try {
    const db = createAdminClient()
    const owner = await ownerOf(db, userId, new URL(request.url).searchParams.get("productId"), await teamStoreIdFor(userId, "products"))
    return NextResponse.json({ tree: await editorTree(db, owner.productId) }, { headers: PRIVATE })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE })
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: PRIVATE })
  }
  try {
    const db = createAdminClient()
    const owner = await ownerOf(db, userId, body.productId, await teamStoreIdFor(userId, "products"))
    const action = typeof body.action === "string" ? body.action : ""

    if (action === "upload-prepare") {
      const limited = await uploadRateLimit(userId, owner.planId)
      if (limited) return limited
      return NextResponse.json(await prepareUpload(db, owner, body as never), { headers: PRIVATE })
    }
    if (action === "upload-complete") await completeUpload(db, owner, body as never)
    else await applyAction(db, owner, action, body)

    try {
      revalidateTag(productTag(owner.productId), "max")
    } catch {
      /* Outside a request that can revalidate: the outline refreshes on its own timer. */
    }
    /* The course's product page, which the CDN holds for everybody (round 49). */
    await creatorPagesChanged({ creatorId: owner.creatorId, tags: [productTag(owner.productId)] })
    return NextResponse.json({ tree: await editorTree(db, owner.productId) }, { headers: PRIVATE })
  } catch (error) {
    return failure(error)
  }
}

function failure(error: unknown): NextResponse {
  if (error instanceof ManageError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE })
  console.error("[courses/manage] failed:", error instanceof Error ? error.message : "unknown")
  return NextResponse.json({ error: "That did not save. Try again." }, { status: 500, headers: PRIVATE })
}
