import { Suspense } from "react"
import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { LibraryRouteSkeleton } from "@/components/library/library-route-skeleton"
import { TAB_SKELETON } from "../loading"
import { loadWishlist } from "./load-wishlist"

export const metadata: Metadata = {
  title: "Wishlist | Library",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE SAVED PRODUCTS STREAM IN; THE TAB DOES NOT WAIT FOR THEM
 * ===========================================================================
 * "When I click to reach the wishlist it takes very long, then shows that
 * clicky skeleton loading structure, and it shows after like 10 seconds."
 *
 * The page awaited the whole read before it returned anything, so the route
 * could not commit until all of it was done and the library's stage held
 * its shape over the screen for the entire time:
 *
 *   who is signed in                  one request, shared with the layout
 *   the saved rows and their products
 *   then, together, the sellers' faces, a membership's plans, which
 *   products have options, and which are already owned
 *
 * Three waves one after another, and on a cold function with a slow answer
 * from the auth service in front of them, that is the ten seconds.
 *
 * Only the first has to happen before the page can be drawn, and it is the
 * one the layout is already waiting on anyway. The rest is inside a
 * Suspense boundary now, the way app/account/page.tsx streams its overview:
 * the route commits as soon as it knows who is asking, the tab is on screen
 * with its heading and its pills, and the cards arrive under them. The
 * shape drawn while they come is the same one the route's own loading.tsx
 * draws, so a cold load and a press from inside the library look alike, and
 * it is `skeleton-deferred`, so a quick answer never draws a grey card at
 * all.
 */
async function savedBody(userId: string) {
  return <WishlistContent isLibrary initialItems={await loadWishlist(userId)} />
}

export default async function LibraryWishlistPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser, and the list is asked for there. */
  if (!user) return <WishlistContent isLibrary initialItems={null} />
  return (
    <Suspense fallback={<LibraryRouteSkeleton path="/account/library/wishlist" />}>
      {/* A promise as the child, as app/account/page.tsx does: React waits for it inside this boundary. */}
      {savedBody(user.id)}
    </Suspense>
  )
}
