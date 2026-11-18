import "server-only"

/**
 * An email signup that gives one of the creator's own digital products
 * (round AR, lib/onepage/signup-fields signupProductId): the joiner gets a
 * download link to that product's files, the same token link a free
 * product's lead magnet sends (subscriber_digital_products,
 * lib/storage/token-download: limited, scanned files only, short lived
 * signed addresses).
 *
 * The product is read from the PUBLISHED block, never from the request, and
 * has to be the page's creator's own, published, and a kind delivered as
 * files (not one that ships or bills monthly). The creator chose to give
 * it, so a paid product can be given too; nothing else of theirs can.
 * The same address asking again gets its own link back, not a second one.
 */
import { randomUUID } from "node:crypto"
import { isPubliclyVisible, publicOnly } from "@/lib/products/visibility"
import { givableProductType } from "./signup-fields"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function grantSignupProduct(db: Db, a: { productId: string; creatorId: string; onepageId: string; email: string; baseUrl: string }): Promise<{ link: string; title: string } | null> {
  try {
    const { data: product } = await publicOnly(db.from("products").select("id, title, type, status, creator_id").eq("id", a.productId).eq("creator_id", a.creatorId)).maybeSingle()
    if (!product || !isPubliclyVisible(product) || !givableProductType((product as { type?: string | null }).type)) return null
    const { data: had } = await db.from("subscriber_digital_products").select("download_token").eq("subscriber_email", a.email).eq("onepage_id", a.onepageId).eq("product_id", a.productId).limit(1)
    let token = Array.isArray(had) && had[0]?.download_token ? String(had[0].download_token) : null
    if (!token) {
      token = randomUUID()
      const expires = new Date(Date.now() + 30 * 86_400_000).toISOString()
      const { error } = await db.from("subscriber_digital_products").insert({ subscriber_email: a.email, onepage_id: a.onepageId, product_id: a.productId, download_token: token, max_downloads: 10, expires_at: expires })
      if (error) return null
    }
    return { link: `${a.baseUrl.replace(/\/+$/, "")}/api/onepage/download/${token}`, title: String((product as { title?: string }).title || "") }
  } catch {
    return null
  }
}
