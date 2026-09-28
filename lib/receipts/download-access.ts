import "server-only"

/**
 * The database half of a download decision. It gathers the evidence and
 * hands it to decideAccess() in ./rules, which is where the rule lives and
 * what the tests exercise. Both download routes call this, so there is one
 * door to a file however it is asked for.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { canDeliver, decideAccess, isPlausibleToken, type AccessDecision } from "./rules"

export interface DownloadAsset {
  id: string
  product_id: string
  file_name: string | null
  file_path: string | null
  storage_bucket: string | null
  scan_status: string | null
  creator_id: string | null
  /** For the phone app, which decides from the size how to save it (lib/downloads/native.ts). */
  file_size: number | null
  mime_type: string | null
}

export interface DownloadAccessResult {
  asset: DownloadAsset | null
  decision: AccessDecision
  /** For the download log. */
  orderId: string | null
  entitlementId: string | null
}

const NOT_FOUND: DownloadAccessResult = {
  asset: null,
  decision: { ok: false, reason: "denied" },
  orderId: null,
  entitlementId: null,
}

export async function resolveDownloadAccess(
  admin: SupabaseClient,
  input: { assetId: string; receiptToken?: string | null; userId?: string | null },
): Promise<DownloadAccessResult> {
  /* "*" on purpose: scan_status and storage_bucket arrived in later
     migrations, and this row never leaves the server. */
  const { data: row, error } = await admin.from("digital_assets").select("*").eq("id", input.assetId).maybeSingle()
  if (error || !row || !row.product_id) return NOT_FOUND
  /*
    A ROW AN UPLOAD PREPARED AND NEVER FINISHED IS NOT A FILE ANYBODY BOUGHT.
    It may name a path whose bytes were refused and removed, or one that never
    arrived. Read here rather than in the query, because the column arrived in
    a later migration and a row from before it has none: those are real files,
    and they still count.
  */
  const uploadState = typeof row.upload_status === "string" ? row.upload_status : ""
  if (uploadState && uploadState !== "completed") return NOT_FOUND

  const { data: product } = await admin.from("products").select("id, creator_id").eq("id", row.product_id).maybeSingle()

  const asset: DownloadAsset = {
    id: row.id,
    product_id: row.product_id,
    file_name: row.file_name ?? null,
    file_path: row.file_path ?? null,
    storage_bucket: row.storage_bucket ?? null,
    scan_status: row.scan_status ?? null,
    creator_id: product?.creator_id ?? null,
    file_size: typeof row.file_size === "number" && row.file_size > 0 ? row.file_size : Number(row.file_size) > 0 ? Number(row.file_size) : null,
    mime_type: typeof row.mime_type === "string" && row.mime_type ? row.mime_type : null,
  }

  let receiptOrder: { id: string; product_id: string; variant_id: string | null; status: string | null; amount_cents?: number | null; refund_amount_cents?: number | null } | null = null
  if (isPlausibleToken(input.receiptToken)) {
    const { data } = await admin
      .from("orders")
      /* Whole rows: the refund amount decides a partial refund, and its
         column is not in every database (naming a missing one fails the read). */
      .select("*")
      .eq("receipt_token", input.receiptToken)
      .maybeSingle()
    if (data) receiptOrder = data as any
  }

  let isCreator = false
  let accountOrders: Array<{ id: string; variant_id: string | null; status: string | null; amount_cents?: number | null; refund_amount_cents?: number | null }> = []
  let entitlements: Array<{ id: string; variant_id?: string | null }> = []
  if (input.userId) {
    const [creatorRes, ordersRes, entRes] = await Promise.all([
      asset.creator_id
        ? admin.from("creators").select("id").eq("id", asset.creator_id).eq("user_id", input.userId).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("orders").select("*").eq("buyer_id", input.userId).eq("product_id", asset.product_id),
      /* Whole rows, and no status or expiry filter: this database's
         entitlements have neither column. A refund DELETES the row
         (lib/stripe/refund-sync.ts), so an entitlement that is there is one
         that still stands. If an expiry is ever added, it is filtered here. */
      admin.from("entitlements").select("*").eq("buyer_id", input.userId).eq("product_id", asset.product_id),
    ])
    isCreator = !!(creatorRes as any).data
    accountOrders = ((ordersRes as any).data ?? []) as any[]
    entitlements = ((entRes as any).data ?? []) as any[]
  }

  /* Only the variants that are actually in play need their mapping read. */
  const variants = new Set<string>()
  if (receiptOrder?.variant_id) variants.add(receiptOrder.variant_id)
  for (const o of accountOrders) if (o.variant_id) variants.add(o.variant_id)
  for (const e of entitlements) if (e.variant_id) variants.add(e.variant_id)

  const variantFiles = new Map<string, string[]>()
  if (variants.size > 0) {
    const { data, error: mapError } = await admin
      .from("product_variant_files")
      .select("variant_id, digital_asset_id")
      .in("variant_id", [...variants])
    /* No mapping table (42P01) means no variant restricts anything, which is
       what an empty mapping means too (see filesForVariant). Any OTHER read
       error is refused: this map is what stops a buyer of the cheap option
       fetching the expensive option's files, and a check that errors open
       gives exactly that away. Fails closed, as checkout's own rule does. */
    if (mapError && (mapError as { code?: string }).code !== "42P01" && !isCreator) {
      console.error("[download] variant check failed, refusing:", mapError.message)
      return { ...NOT_FOUND, asset }
    }
    if (!mapError) {
      for (const m of (data ?? []) as any[]) {
        const list = variantFiles.get(m.variant_id) ?? []
        list.push(m.digital_asset_id)
        variantFiles.set(m.variant_id, list)
      }
    }
  }

  const decision = decideAccess({
    assetId: asset.id,
    assetProductId: asset.product_id,
    receiptOrder,
    accountOrders,
    entitlements,
    isCreator,
    variantFiles,
  })

  const orderId =
    decision.ok && decision.via === "receipt"
      ? receiptOrder?.id ?? null
      : decision.ok && decision.via === "account"
        ? accountOrders.find((o) => canDeliver(o))?.id ?? null
        : null

  return {
    asset,
    decision,
    orderId,
    entitlementId: decision.ok && decision.via === "account" ? entitlements[0]?.id ?? null : null,
  }
}
