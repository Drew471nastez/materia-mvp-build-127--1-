import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { gateDownload } from "@/lib/storage/scan-gate"
import { generateSignedDownloadUrl, SIGNED_DOWNLOAD_SECONDS } from "@/lib/storage/download"
import { canReadMembership } from "@/lib/memberships/access"
import { requestViewer } from "@/lib/memberships/viewer"
import { UUID } from "@/lib/memberships/server"
import { signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"

/**
 * GET /api/memberships/files/<postId>/<assetId>
 *
 * A file the creator attached to an update, for a member. The file is a
 * private upload of the membership product (digital_assets, uploaded through
 * /api/v2/upload/prepare like any product file), and this is the only way
 * out for it: signed in, a member with access now (or the creator), the file
 * named on that post, and not refused by the file checks
 * (lib/storage/scan-gate). Then a signed address valid for a few minutes,
 * saved as its own name. A member whose membership ended gets a 403, not
 * the file.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ postId: string; assetId: string }> }) {
  const { postId, assetId } = await params
  if (!UUID.test(postId) || !UUID.test(assetId)) return NextResponse.json({ error: "File not found" }, { status: 404 })
  const viewer = await requestViewer()
  if (!viewer) return signedOutOrRetry(NextResponse.json({ error: "Sign in to download this file." }, { status: 401 }), { full: true })
  const admin = createAdminClient()

  const { data: post } = await admin.from("membership_posts").select("id, product_id, attachments, deleted_at").eq("id", postId).maybeSingle()
  if (!post || post.deleted_at) return NextResponse.json({ error: "File not found" }, { status: 404 })
  const named = (Array.isArray(post.attachments) ? post.attachments : []).find((a: { assetId?: string }) => a?.assetId === assetId) as { assetId: string; name?: string } | undefined
  if (!named) return NextResponse.json({ error: "File not found" }, { status: 404 })

  const access = await canReadMembership(admin, viewer, post.product_id)
  if (!access.allowed) return NextResponse.json({ error: "This file is for members. Renew your membership to download it." }, { status: 403 })

  const { data: asset } = await admin
    .from("digital_assets")
    .select("id, file_path, file_name, mime_type, file_size, storage_bucket, scan_status, product_id, uploaded_by")
    .eq("id", assetId)
    .eq("product_id", post.product_id)
    .maybeSingle()
  if (!asset?.file_path) return NextResponse.json({ error: "File not found" }, { status: 404 })

  const gate = await gateDownload(admin as unknown as SupabaseClient, asset, { isCreator: access.creator })
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const signed = await generateSignedDownloadUrl(admin as unknown as SupabaseClient, asset.file_path, SIGNED_DOWNLOAD_SECONDS, asset.storage_bucket ?? undefined, named.name || asset.file_name)
  if (!signed) return NextResponse.json({ error: "The file could not be opened. Try again in a moment." }, { status: 502 })
  return NextResponse.redirect(signed.url, { status: 302, headers: { "Cache-Control": "no-store" } })
}
