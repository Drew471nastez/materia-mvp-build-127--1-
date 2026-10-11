/**
 * ===========================================================================
 *  A CUSTOMER'S DOWNLOADS, ON THE WEBSITE THEY BOUGHT FROM
 * ===========================================================================
 * The account page on a creator's website lists the customer's orders
 * (./account-data.ts). An order with files opens its own page on the same
 * website, /account/orders/<id>, and each file downloads from there, through
 * the website's own host (/api/site-account/download). Nobody is sent to a
 * storelib.com receipt.
 *
 * WHO MAY. The website's own session proves an email on this website (the
 * code they typed). An order is theirs when it was placed with that email,
 * compared exactly, on THIS creator's website, and is one a customer is shown
 * (paid, or paid then refunded). Nothing in the address is trusted: the order
 * id only says which of their orders, and an order that is not theirs is the
 * same "not found" as one that does not exist.
 *
 * WHICH FILES. The receipt's own loader (lib/receipts/load.ts) decides, with
 * its variant rule and the payment state, so the files here are exactly the
 * ones the receipt would list; the download itself is decided again, file by
 * file, by the same door every download goes through (lib/receipts/
 * download-access.ts), with the order's own receipt token, read here on the
 * server and never shown.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadReceiptByToken } from "@/lib/receipts/load"
import { formatMoney, isPlausibleToken, normaliseCurrency } from "@/lib/receipts/rules"
import { likeExact, orderDate } from "./account-data"
import { UUID, type Db } from "./db"

/** Rows a customer is shown (as ./account-data.ts SHOWN). */
const SHOWN = new Set(["completed", "refunded", "partially_refunded", "disputed"])

export interface OrderFile {
  id: string
  name: string
  /** "2.4 MB", or "". */
  size: string
  /** Where it downloads from, on this website. */
  url: string
}

export interface OrderLine {
  /** The line's own order row: what a download is asked against. */
  orderId: string
  title: string
  variant: string
  image: string
  /** The product on this website, or "". */
  url: string
  files: OrderFile[]
  /** A refunded or unpaid line has no files; this says why, or "". */
  note: string
}

export interface CustomerOrderDetail {
  id: string
  number: string
  date: string
  total: string
  lines: OrderLine[]
}

/** What the server keeps: the detail, and each line's receipt token, which never leaves it. */
export interface CustomerOrderAccess {
  detail: CustomerOrderDetail
  tokens: Map<string, string>
}

export function fileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`
}

/** The address a file downloads from on the website. */
export function downloadPath(orderId: string, fileId: string): string {
  return `/api/site-account/download?order=${encodeURIComponent(orderId)}&file=${encodeURIComponent(fileId)}`
}

const NOTES: Record<string, string> = {
  refunded: "Refunded, so its files are closed.",
  pending: "The payment has not cleared yet. Files open as soon as it does.",
  held: "On hold while the payment is reviewed.",
  failed: "This payment did not go through.",
}

/**
 * One of THIS customer's orders on THIS creator's website, with its files,
 * or null when it is not theirs (or not there). `orderId` is any line of the
 * order: the account page links its first.
 */
export async function customerOrderAccess(db: Db, scope: { creatorId: string; email: string }, orderId: string): Promise<CustomerOrderAccess | null> {
  if (!UUID.test(scope.creatorId) || !UUID.test(orderId) || !scope.email) return null
  const email = scope.email.trim().toLowerCase()
  let row: Record<string, unknown> | null = null
  try {
    /* Whole row: creator_id is not in every database (part 32). The email is matched in the query AND again below. */
    const { data, error } = await db.from("orders").select("*").eq("id", orderId).ilike("buyer_email", likeExact(email)).maybeSingle()
    if (error) return null
    row = (data as Record<string, unknown> | null) ?? null
  } catch {
    return null
  }
  if (!row) return null
  if (String(row.buyer_email ?? "").trim().toLowerCase() !== email) return null
  if (!SHOWN.has(String(row.status ?? ""))) return null
  const token = typeof row.receipt_token === "string" ? row.receipt_token : ""
  if (!isPlausibleToken(token)) return null
  /* This creator's: by the order's own creator, or through its product on a database from before it. */
  let creator = typeof row.creator_id === "string" ? row.creator_id : ""
  if (!creator && typeof row.product_id === "string" && UUID.test(row.product_id)) {
    try {
      const { data } = await db.from("products").select("creator_id").eq("id", row.product_id).maybeSingle()
      creator = String((data as { creator_id?: unknown } | null)?.creator_id ?? "")
    } catch {
      creator = ""
    }
  }
  if (creator !== scope.creatorId) return null

  let loaded: Awaited<ReturnType<typeof loadReceiptByToken>> = null
  try {
    loaded = await loadReceiptByToken(db as unknown as SupabaseClient, token)
  } catch {
    loaded = null
  }
  if (!loaded) return null
  const view = loaded.view
  const tokens = new Map<string, string>()
  const lines: OrderLine[] = view.items.map((item) => {
    tokens.set(item.orderId, item.token)
    return {
      orderId: item.orderId,
      title: item.title,
      variant: item.variantName ?? "",
      image: item.thumbnailUrl ?? "",
      url: item.slug ? `/products/${item.slug}` : "",
      files: item.files.map((f) => ({ id: f.id, name: f.name || "Download", size: fileSize(f.sizeBytes), url: downloadPath(item.orderId, f.id) })),
      note: item.state === "open" ? "" : NOTES[item.state] ?? "",
    }
  })
  const total = view.totalCents > 0 ? formatMoney(view.totalCents, normaliseCurrency(view.currency), "en-US") : "Free"
  return { detail: { id: orderId, number: view.number, date: orderDate(view.createdAt), total, lines }, tokens }
}
