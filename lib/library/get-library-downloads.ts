import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { fillOwnedProducts } from "@/lib/library/owned-products"

type EntitlementRow = {
  id: string
  product_id: string
  created_at: string
  product: any
  creator: any
}

type DownloadRow = {
  id: string
  productId: string
  title: string
  thumbnailUrl: string | null
  creatorName: string
  createdAt: string
  purchasedAtLabel: string
  files: Array<{ id: string; fileName: string }>
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
        creator:creators(*, profile:profiles!creators_user_id_fkey(*))
      `)
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
      .select("id, user_id, slug")
      .in("id", uniqueCreatorIds)

    const userIds = (creators || []).map((c) => c.user_id).filter(Boolean)
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] as any[] }

    const profileByUserId = new Map((profiles || []).map((p: any) => [p.id, p.display_name]))

    ;(creators || []).forEach((creator: any) => {
      creatorProfileMap.set(creator.id, profileByUserId.get(creator.user_id) || creator.slug || "Creator")
    })
  }

  const [, { data: assets }] = await Promise.all([
    namesForMissingCreators(),
    admin
      .from("digital_assets")
      .select("id, product_id, file_name, created_at")
      .in("product_id", productIds)
      .order("created_at", { ascending: true }),
  ])

  const filesByProduct = new Map<string, Array<{ id: string; fileName: string }>>()
  ;(assets || []).forEach((asset: any) => {
    const current = filesByProduct.get(asset.product_id) || []
    current.push({ id: asset.id, fileName: asset.file_name || "File" })
    filesByProduct.set(asset.product_id, current)
  })

  return rows
    .map((row) => {
      const creatorName =
        row.creator?.profile?.display_name ||
        creatorProfileMap.get(row.product?.creator_id) ||
        "Creator"

      return {
        id: row.id,
        productId: row.product_id,
        title: row.product?.title || "Untitled product",
        thumbnailUrl: row.product?.thumbnail_url || null,
        creatorName,
        createdAt: row.created_at,
        purchasedAtLabel: formatDate(row.created_at),
        files: filesByProduct.get(row.product_id) || [],
      }
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
}
