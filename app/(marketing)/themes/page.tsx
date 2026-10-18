import type { Metadata } from "next"

import { publishedListings } from "@/lib/themes/marketplace-server"
import { builtinListings } from "@/lib/themes/marketplace-shared"
import { ThemesMarketplace } from "./themes-marketplace"

/**
 * storelib.com/themes: the theme marketplace. The same page for everybody,
 * so it is built once and held at the edge; /admin/themes drops it the
 * moment a theme is saved (lib/themes/marketplace-server.ts). Who is signed
 * in is asked only when somebody presses Add.
 */
export const revalidate = 300

export const metadata: Metadata = {
  title: "Themes for your Storelib website",
  description: "Themes for Storelib websites: free, paid and Pro. Preview each one live and add it to your library.",
  alternates: { canonical: "/themes" },
}

export default async function ThemesPage() {
  const listings = await publishedListings().catch(() => builtinListings())
  return <ThemesMarketplace listings={listings} />
}
