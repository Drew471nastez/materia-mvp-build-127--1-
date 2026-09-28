import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { loadWishlist } from "./load-wishlist"

export const metadata: Metadata = {
  title: "Wishlist | Library",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

/**
 * The library's Wishlist tab. Read on the server (./load-wishlist.ts), so
 * the tab's prefetch carries the products and the cards are in the first
 * frame; the heading and the pills are the library's
 * (components/library/library-tabs).
 */
export default async function LibraryWishlistPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser, and the list is asked for there. */
  const items = user ? await loadWishlist(user.id) : null
  return <WishlistContent isLibrary initialItems={items} />
}
