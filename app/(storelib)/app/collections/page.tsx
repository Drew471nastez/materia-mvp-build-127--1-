import { permanentRedirect } from "next/navigation"

/** Collections moved under Products (Shopify's Products › Collections); the old address keeps working. */
export default function CollectionsMoved() {
  permanentRedirect("/app/products/collections")
}
