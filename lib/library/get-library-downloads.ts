import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

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

export async function getLibraryDownloads(userId: string): Promise<DownloadRow[]> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: entitlements } = await supabase
    .from("entitlements")
    .select(`
      id,
      product_id,
      created_at,
      product:products(*),
      creator:creators(*, profile:profiles!creators_user_id_fkey(*))
    `)
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })

  const { data: orders } = await admin
    .from("orders")
    .select(`id, product_id, created_at, product:products(*)`)
    .eq("buyer_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })

  const map = new Map<string, any>()

  ;(entitlements as EntitlementRow[] | null)?.forEach((row) => {
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

  if (uniqueCreatorIds.length > 0) {
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

  const { data: assets } = await admin
    .from("digital_assets")
    .select("id, product_id, file_name, created_at")
    .in("product_id", productIds)
    .order("created_at", { ascending: true })

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
