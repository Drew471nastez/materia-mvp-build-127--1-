import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { readSessionAuth } from "@/lib/auth/current-user"
import { senderCarrierId } from "@/lib/shipping/create-awb"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import DeliveryStepClient from "./_client"

/**
 * The delivery step that runs BEFORE payment.
 *
 * A separate route rather than a section inside the checkout client, on
 * purpose: that file is 2,300 lines of payment handling, and the safest change
 * to a payment path is one that does not touch it. This page owns the delivery
 * choice completely, and hands control back to the untouched checkout with a
 * redirect.
 */

export const metadata: Metadata = {
  title: "Livrare | Storelib",
  robots: { index: false, follow: false },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Rebuild the checkout URL from exactly the parameters we were given, with
 *  `deliverySet` added so the gate does not bounce the buyer straight back. */
function checkoutUrl(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  q.set("deliverySet", "1")
  return `/checkout?${q}`
}

export default async function DeliveryStepPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const productId = params.productId
  if (!productId || !UUID_RE.test(productId)) redirect("/explore")

  const next = checkoutUrl(params)

  const supabase = await createClient()
  const auth = await readSessionAuth(supabase)

  // Shown for reassurance only — the buyer should see what they are about to
  // pay for. Read with the admin client so a listing that has just sold does
  // not blank the header out mid-purchase.
  let title: string | null = null
  let price: string | null = null
  try {
    const { data } = await createAdminClient()
      .from("products")
      .select("title, price_cents, type")
      .eq("id", productId)
      .maybeSingle()
    const p = data as { title?: string; price_cents?: number; type?: string } | null
    // Nothing to deliver: a digital product has no parcel, so this step is not
    // just unnecessary, it is wrong. Straight through to payment.
    if (p && p.type !== "physical") redirect(next)
    title = p?.title ?? null
    if (typeof p?.price_cents === "number") {
      price = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(p.price_cents / 100)
    }
  } catch {
    // A failed lookup costs the header, not the step.
  }

  return (
    <DeliveryStepClient
      nextUrl={next}
      carrierId={senderCarrierId()}
      initialEmail=""
      signedIn={Boolean(auth.userId)}
      productTitle={title}
      productPrice={price}
    />
  )
}
