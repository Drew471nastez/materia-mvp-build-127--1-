import { type NextRequest, NextResponse } from "next/server"
import { productCreator } from "@/lib/team/uploads"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DIGITAL_BUCKETS, updateCreatorStorageUsed } from "@/lib/storage"
import { UPLOAD_HEADERS } from "@/lib/storage/upload-guard"
import { sanitizeDisplayName } from "@/lib/security/uploads"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * DELETE /api/storage/upload-file?assetId=<id>
 *
 * Removes one of the caller's own digital files: the object in storage and
 * its record. Ownership is the product's creator, checked against the signed
 * in user; the bucket comes from the row and must be one of the private file
 * buckets, so a row can never point this at anything else.
 *
 * This route also had a POST that uploaded a whole file through the function
 * into product-files, with no type check, no scan, no quota and no limit
 * beyond Vercel's body size. Nothing called it (uploads go through
 * /api/v2/upload/prepare), so it is gone rather than kept as a second,
 * weaker way in.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })
    }

    const assetId = new URL(request.url).searchParams.get("assetId")
    if (!assetId || !UUID.test(assetId)) {
      return NextResponse.json({ error: "Asset ID is required" }, { status: 400, headers: UPLOAD_HEADERS })
    }

    /* Round 41: the store a team member with Products works in, or the owner's own (lib/team/uploads productCreator). */
    const creator = (await productCreator(adminSupabase, user.id, "id")) as { id: string } | null
    if (!creator) {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    const { data: asset } = await adminSupabase
      .from("digital_assets")
      .select("id, file_path, storage_bucket, product:products!inner(creator_id)")
      .eq("id", assetId)
      .maybeSingle()

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: UPLOAD_HEADERS })
    }
    const owner = (asset as { product?: { creator_id?: string } | { creator_id?: string }[] }).product
    const ownerId = Array.isArray(owner) ? owner[0]?.creator_id : owner?.creator_id
    if (ownerId !== creator.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers: UPLOAD_HEADERS })
    }

    /* The bucket the row names, when it is a file bucket; then the others,
       for rows from before storage_bucket was recorded. */
    const named = asset.storage_bucket && (DIGITAL_BUCKETS as readonly string[]).includes(asset.storage_bucket) ? asset.storage_bucket : null
    const buckets = named ? [named] : [...DIGITAL_BUCKETS]
    if (asset.file_path && !asset.file_path.split("/").includes("..")) {
      for (const bucket of buckets) {
        await adminSupabase.storage.from(bucket).remove([asset.file_path]).then(
          () => undefined,
          () => undefined,
        )
      }
    }

    const { error: dbError } = await adminSupabase.from("digital_assets").delete().eq("id", assetId)
    if (dbError) {
      console.error("[upload-file] delete failed:", dbError.message)
      return NextResponse.json({ error: "The file could not be removed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
    }

    await updateCreatorStorageUsed(adminSupabase, creator.id).catch(() => undefined)

    return NextResponse.json({ success: true }, { headers: UPLOAD_HEADERS })
  } catch (error) {
    console.error("Delete digital file error:", error)
    return NextResponse.json({ error: "The file could not be removed. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}

/**
 * PATCH /api/storage/upload-file?assetId=<id>  { name }
 *
 * Renames one of the caller's own digital files: the name a buyer's download
 * has. The product editor renames a file in its list and sends the new name
 * with Save (app/app/products/new/product-editor.tsx); before this the name
 * was only ever changed on the screen. Ownership is checked as DELETE checks
 * it; only the row's file_name changes, never the stored object or its path.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: UPLOAD_HEADERS })

    const assetId = new URL(request.url).searchParams.get("assetId")
    if (!assetId || !UUID.test(assetId)) return NextResponse.json({ error: "Asset ID is required" }, { status: 400, headers: UPLOAD_HEADERS })
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null
    const name = typeof body?.name === "string" ? sanitizeDisplayName(body.name) : ""
    if (!name) return NextResponse.json({ error: "Give the file a name." }, { status: 400, headers: UPLOAD_HEADERS })

    /* Round 41: the store a team member with Products works in, or the owner's own (lib/team/uploads productCreator). */
    const creator = (await productCreator(adminSupabase, user.id, "id")) as { id: string } | null
    if (!creator) return NextResponse.json({ error: "Access denied" }, { status: 403, headers: UPLOAD_HEADERS })
    const { data: asset } = await adminSupabase.from("digital_assets").select("id, product:products!inner(creator_id)").eq("id", assetId).maybeSingle()
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: UPLOAD_HEADERS })
    const owner = (asset as { product?: { creator_id?: string } | { creator_id?: string }[] }).product
    const ownerId = Array.isArray(owner) ? owner[0]?.creator_id : owner?.creator_id
    if (ownerId !== creator.id) return NextResponse.json({ error: "Access denied" }, { status: 403, headers: UPLOAD_HEADERS })

    const { error } = await adminSupabase.from("digital_assets").update({ file_name: name }).eq("id", assetId)
    if (error) {
      console.error("[upload-file] rename failed:", error.message)
      return NextResponse.json({ error: "The file name could not be saved. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
    }
    return NextResponse.json({ success: true, name }, { headers: UPLOAD_HEADERS })
  } catch (error) {
    console.error("Rename digital file error:", error)
    return NextResponse.json({ error: "The file name could not be saved. Try again." }, { status: 500, headers: UPLOAD_HEADERS })
  }
}
