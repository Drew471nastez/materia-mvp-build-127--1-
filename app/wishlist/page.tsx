import { Metadata } from "next"
import { PublicWishlistShell } from "@/components/wishlist/public-wishlist-shell"

export const metadata: Metadata = {
  title: "My Wishlist | Storelib",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

export default function WishlistPage() {
  return <PublicWishlistShell />
}
