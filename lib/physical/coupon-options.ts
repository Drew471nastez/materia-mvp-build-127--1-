import "server-only"

import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

/** A code saved as free shipping, which may take nothing else off: only while physical commerce is on. */
export async function freeShippingCode(body: unknown): Promise<boolean> {
  if (!body || typeof body !== "object" || (body as { free_shipping?: unknown }).free_shipping !== true) return false
  return isPhysicalCommerceEnabled()
}
