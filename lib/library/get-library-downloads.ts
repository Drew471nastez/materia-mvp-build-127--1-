import { personName } from "@/lib/profile/display-name"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { fillOwnedProducts } from "@/lib/library/owned-products"
import { CREATOR_WITH_PROFILE, PROFILE_CARD } from "@/lib/security/public-columns"

type EntitlementRow = {
  id: string
  product_id: string
  created_at: string
  product: any
  creator: any
}

export type DownloadRow = {
  id: string
  productId: string
  title: string
  thumbnailUrl: string | null
  creatorName: string
  createdAt: string
  purchasedAtLabel: string
  files: Array<{ id: string; fileName: string; sizeBytes: number | null }>
  /* What the library's creator filter and contact need. Read in the same
     queries as before: the page is still three waves deep. */
  creatorId: string | null
  creatorSlug: string | null
  creatorAvatarUrl: string | null
  productSlug: string | null
  /** "published" while it is on sale; anything else is still theirs, only not in the shop. */
  productStatus: string | null
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * The two clients this read needs. Passed in only by tests/library-depth, so
 * the number of round trips this makes can be measured instead of asserted
 * from reading the source. Nothing in the app passes it.
 */
export interface LibraryClients {
  supabase: any
  admin: any
}

export async function getLibraryDownloads(
  userId: string,
  clients?: LibraryClients,
): Promise<DownloadRow[]> {
  const supabase = clients ? clients.supabase : await createClient()
  const admin = clients ? clients.admin : createAdminClient()

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE TWO SOURCES ARE ASKED FOR AT THE SAME TIME
    ═══════════════════════════════════════════════════════════════════════
    Entitlements and orders are two independent lists of what this person
    owns, and they were awaited one after the other, so the page paid for both
    round trips end to end before it could do anything with either. Nothing in
    the second depends on the first.

    This is the first of three places in this file where that was true. The
    library is a `force-dynamic` route with no cache in front of it, so every
    visit pays every one of them, which is what "it takes so much and never
    loads" is made of.
  */
  const [{ data: entitlements }, { data: orders }] = await Promise.all([
    supabase
      .from("entitlements")
      .select(`
        id,
        product_id,
        created_at,
        product:products(*),
        creator:creators(${CREATOR_WITH_PROFILE})
      ` as const)
      .eq("buyer_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("orders")
      .select(`id, product_id, created_at, product:products(*)`)
      .eq("buyer_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
  ])

  const map = new Map<string, any>()

  /*
    AN ARCHIVED PRODUCT IS STILL THEIRS. The entitlement's embedded product
    is read through the products table's row level security, which hides a
    product that is no longer published, so the row came back with no
    product and the purchase left the library. Filled back in by id with the
    server's client, only when one is missing (lib/library/owned-products).
  */
  const owned = await fillOwnedProducts(admin, entitlements as EntitlementRow[] | null)

  owned.forEach((row) => {
    if (row.product?.type === "digital") {
      map.set(row.product_id, row)
    }
  })

  ;(orders || []).forEach((order: any) => {
    if (order.product?.type === "digital" && !map.has(order.product_id)) {
      map.set(order.product_id, {
        id: order.id,
        product_id: order.product_id,
        created_at: order.created_at,
        product: order.product,
        creator: null,
      })
    }
  })

  const rows = Array.from(map.values())
  const productIds = rows.map((r) => r.product_id)

  if (!productIds.length) return []

  const missingCreatorIds = rows
    .filter((r) => !r.creator?.profile?.display_name && r.product?.creator_id)
    .map((r) => r.product.creator_id)

  const uniqueCreatorIds = [...new Set(missingCreatorIds)]
  const creatorProfileMap = new Map<string, string>()
  const creatorCardMap = new Map<string, { slug: string | null; avatarUrl: string | null }>()

  /*
    AND THE FILES DO NOT WAIT FOR THE CREATOR NAMES.

    Both of these need the product ids that the step above produced, and
    neither needs anything the other returns — but the creator lookup, its
    profile lookup and the asset lookup were three more awaits in a row. The
    name chain still has to be serial, because the profiles are found by the
    user ids the creators carry; it just runs beside the files instead of in
    front of them.
  */
  const namesForMissingCreators = async () => {
    if (uniqueCreatorIds.length === 0) return
    const { data: creators } = await admin
      .from("creators")
      .select("id, user_id, slug, display_name")
      .in("id", uniqueCreatorIds)

    const userIds = (creators || []).map((c: any) => c.user_id).filter(Boolean)
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, display_name, avatar_url").in("id", userIds)
      : { data: [] as any[] }

    const profileByUserId = new Map((profiles || []).map((p: any) => [p.id, p]))

    ;(creators || []).forEach((creator: any) => {
      const profile: any = profileByUserId.get(creator.user_id)
      creatorProfileMap.set(creator.id, personName({ name: profile?.display_name || creator.display_name, slug: creator.slug }))
      creatorCardMap.set(creator.id, { slug: creator.slug || null, avatarUrl: profile?.avatar_url || null })
    })
  }

  const [, { data: assets }] = await Promise.all([
    namesForMissingCreators(),
    admin
      .from("digital_assets")
      /* Whole rows: upload_status and file_size arrived in later migrations. */
      .select("*")
      .in("product_id", productIds)
      .order("created_at", { ascending: true }),
  ])

  const filesByProduct = new Map<string, Array<{ id: string; fileName: string; sizeBytes: number | null }>>()
  ;(assets || []).forEach((asset: any) => {
    /* A file still uploading, or whose upload failed, has nothing to download yet (as on the receipt). */
    if (typeof asset.upload_status === "string" && asset.upload_status !== "completed") return
    const current = filesByProduct.get(asset.product_id) || []
    const size = Number(asset.file_size)
    current.push({ id: asset.id, fileName: asset.file_name || "File", sizeBytes: size > 0 ? size : null })
    filesByProduct.set(asset.product_id, current)
  })

  return rows
    .map((row) => {
      const creatorName =
        row.creator?.profile?.display_name ||
        creatorProfileMap.get(row.product?.creator_id) ||
        "Creator"

      const creatorId: string | null = row.creator?.id || row.product?.creator_id || null
      const card = creatorId ? creatorCardMap.get(creatorId) : undefined

      return {
        id: row.id,
        productId: row.product_id,
        title: row.product?.title || "Untitled product",
        thumbnailUrl: row.product?.thumbnail_url || null,
        creatorName,
        createdAt: row.created_at,
        purchasedAtLabel: formatDate(row.created_at),
        files: filesByProduct.get(row.product_id) || [],
        creatorId,
        creatorSlug: row.creator?.slug || card?.slug || null,
        /* The creator's profile photo, the one Explore and the receipt show (lib/account/avatar). */
        creatorAvatarUrl: row.creator?.profile?.avatar_url || card?.avatarUrl || null,
        productSlug: row.product?.slug || null,
        productStatus: row.product?.status || null,
      }
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
}
