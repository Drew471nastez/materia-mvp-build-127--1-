import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId, visiblePostRow } from "@/lib/communities/server/feed"
import { generateSignedDownloadUrl, SIGNED_DOWNLOAD_SECONDS } from "@/lib/storage/download"
import { gateDownload } from "@/lib/storage/scan-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; postId: string; assetId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/community/<id>/posts/<postId>/files/<assetId>
 * A file attached to a post, for an active member who may see the post's
 * space: the file must be named on that post, uploaded by its author for a
 * product of this community, and not refused by the file checks
 * (lib/storage/scan-gate). Then a signed address for a few minutes.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, postId, assetId } = await params
  if (!UUID.test(assetId)) return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const found = await visiblePostRow(db, gate.community, gate.viewer, postId)
  if (!found || found.row.status !== "published") return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  const named = found.row.media.find((m) => m.type === "file" && m.assetId === assetId.toLowerCase()) as { assetId: string; name?: string } | undefined
  if (!named) return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  const { data: products } = await db.from("products").select("id").eq("community_id", gate.community.id)
  const productIds = ((products as { id: string }[] | null) ?? []).map((p) => p.id)
  if (!productIds.length) return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  const { data: asset } = await db
    .from("digital_assets")
    .select("id, file_path, file_name, mime_type, file_size, storage_bucket, scan_status, product_id, uploaded_by")
    .eq("id", assetId)
    .in("product_id", productIds)
    .maybeSingle()
  if (!asset?.file_path || asset.uploaded_by !== found.row.author_id) return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  const ok = await gateDownload(db as SupabaseClient, asset, { isCreator: gate.viewer.userId === asset.uploaded_by })
  if (!ok.ok) return NextResponse.json({ error: ok.error }, { status: ok.status, headers: NO_STORE })
  const signed = await generateSignedDownloadUrl(db as SupabaseClient, asset.file_path, SIGNED_DOWNLOAD_SECONDS, asset.storage_bucket ?? undefined, named.name || asset.file_name)
  if (!signed) return NextResponse.json({ error: "The file could not be opened. Try again in a moment." }, { status: 502, headers: NO_STORE })
  return NextResponse.redirect(signed.url, { status: 302, headers: NO_STORE })
}
