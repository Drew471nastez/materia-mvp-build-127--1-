import { personName } from "@/lib/profile/display-name"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fillOwnedProduct } from "@/lib/library/owned-products"
import { pageUser } from "@/lib/auth/page-user"
import { accessStateOf, canDeliver, decideAccess, orderNumberOf, overallState, type AccessState } from "@/lib/receipts/rules"
import { LibraryProduct, type LibraryProductData } from "@/components/library/library-product"
import { displayEmail } from "@/lib/businesses/email-alias"

interface ProductAccessPageProps {
  params: Promise<{ id: string }>
}

/**
 * ===========================================================================
 *  ONE PURCHASE, OPENED FROM THE LIBRARY
 * ===========================================================================
 * Everything about a thing they bought on one screen: its files with their
 * sizes and a Download that works in the app, their review (stars and words,
 * edit, delete), the receipt and its invoice, and the seller with a way to
 * write to them. The reads below are the same ones the page always made,
 * with the files now judged by the download rule itself
 * (lib/receipts/rules decideAccess), so a Download here is never one the
 * server would then refuse.
 */
export default async function ProductAccessPage({ params }: ProductAccessPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  /* What they own, by entitlement, and every order of theirs for it: asked for together. */
  const [{ data: entitlement }, { data: orderRows }, { data: me }, { data: ownCreator }] = await Promise.all([
    supabase
      .from("entitlements")
      .select(`
      id,
      product_id,
      creator_id,
      created_at,
      product:products(*)
    `)
      .eq("buyer_id", user.id)
      .eq("product_id", id)
      .limit(1)
      .maybeSingle(),
    admin
      .from("orders")
      /* Whole rows: the refund amount and the variant arrived in later migrations. */
      .select("*, product:products(*)")
      .eq("buyer_id", user.id)
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    /* Their own name and photo, for the review card. */
    admin.from("profiles").select("display_name, username, avatar_url").eq("id", user.id).maybeSingle(),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ])

  /* Archived or unpublished since it was bought: still theirs (lib/library/owned-products). */
  const owned = await fillOwnedProduct(admin, entitlement)
  const orders = (orderRows ?? []) as any[]
  const paidOrder = orders.find((o) => canDeliver(o)) ?? null
  const product: any = owned?.product || paidOrder?.product || orders[0]?.product || null
  /* Neither an entitlement nor any order of theirs: not theirs to open here. */
  if (!product || (!owned && orders.length === 0)) notFound()

  const creatorId: string | null = owned?.creator_id || product.creator_id || null
  const purchasedAt: string = owned?.created_at || paidOrder?.created_at || orders[0]?.created_at || ""
  const receiptOrder = paidOrder?.receipt_token ? paidOrder : orders.find((o) => o.receipt_token) ?? null
  const receiptToken: string | null = receiptOrder?.receipt_token || null
  const state: AccessState = orders.length === 0 ? "open" : overallState(orders.map((o) => accessStateOf(o)))
  const isOwn = !!ownCreator?.id && ownCreator.id === creatorId

  const variantIds = [...new Set(orders.map((o) => o.variant_id).filter(Boolean) as string[])]
  const [creatorRes, supportRes, assetsRes, variantRes] = await Promise.all([
    creatorId ? admin.from("creators").select("id, user_id, slug, display_name").eq("id", creatorId).maybeSingle() : Promise.resolve({ data: null }),
    /* Its own read: support_email came later, and a database without it must still show the product. */
    creatorId ? admin.from("creators").select("support_email").eq("id", creatorId).maybeSingle() : Promise.resolve({ data: null }),
    /* Whole rows: upload_status and file_size arrived in later migrations. */
    admin.from("digital_assets").select("*").eq("product_id", id).order("created_at", { ascending: true }),
    variantIds.length
      ? admin.from("product_variant_files").select("variant_id, digital_asset_id").in("variant_id", variantIds)
      : Promise.resolve({ data: [] }),
  ])

  const creator: any = (creatorRes as any)?.data ?? null
  const { data: creatorProfile } = creator?.user_id
    ? await admin.from("profiles").select("display_name, avatar_url").eq("id", creator.user_id).maybeSingle()
    : { data: null as any }
  const creatorName: string = personName({ name: creatorProfile?.display_name || creator?.display_name, slug: creator?.slug })

  const variantFiles = new Map<string, string[]>()
  for (const m of (((variantRes as any)?.error ? [] : (variantRes as any)?.data) ?? []) as any[]) {
    const list = variantFiles.get(m.variant_id) ?? []
    if (m.digital_asset_id) list.push(m.digital_asset_id)
    variantFiles.set(m.variant_id, list)
  }

  const files = (((assetsRes as any)?.data ?? []) as any[])
    /* A file still uploading, or whose upload failed, has nothing to download yet. */
    .filter((a) => !(typeof a.upload_status === "string" && a.upload_status !== "completed"))
    .filter(
      (a) =>
        decideAccess({
          assetId: a.id,
          assetProductId: id,
          accountOrders: orders.map((o) => ({ variant_id: o.variant_id ?? null, status: o.status, amount_cents: o.amount_cents, refund_amount_cents: o.refund_amount_cents })),
          entitlements: orders.length === 0 ? [{ variant_id: null }] : [],
          isCreator: isOwn,
          variantFiles,
        }).ok,
    )
    .map((a) => ({
      id: a.id as string,
      name: (a.file_name as string) || "File",
      sizeBytes: Number(a.file_size) > 0 ? Number(a.file_size) : null,
      /* A file the seller added after this purchase is marked, so an update is noticed. */
      addedAt: typeof a.created_at === "string" && purchasedAt && a.created_at > purchasedAt ? (a.created_at as string) : null,
    }))

  const support = displayEmail(String(((supportRes as any)?.error ? null : (supportRes as any)?.data?.support_email) ?? "")) ?? ""
  const invoice = orders.some((o) => canDeliver(o) && Number(o.amount_cents) > 0 && !!o.stripe_payment_intent_id)

  const data: LibraryProductData = {
    productId: id,
    title: product.title || "Product",
    thumbnailUrl: product.thumbnail_url || null,
    productSlug: product.slug || null,
    archived: !!product.status && product.status !== "published",
    purchasedAt,
    state,
    files,
    receiptToken,
    receiptNumber: receiptOrder ? orderNumberOf(receiptOrder.id) : null,
    invoice: invoice && !!receiptToken,
    isOwn,
    creator: {
      id: creatorId,
      name: creatorName,
      slug: creator?.slug || null,
      avatarUrl: creatorProfile?.avatar_url || null,
      supportEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) ? support : null,
      contactReceiptToken: receiptToken,
      count: 1,
    },
    reviewer: {
      name: (me?.display_name || me?.username || "").toString().trim() || null,
      avatarUrl: me?.avatar_url || null,
    },
  }

  return <LibraryProduct data={data} />
}
