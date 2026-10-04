/**
 * ===========================================================================
 *  WHERE A LINK CAN GO: THE STORE'S OWN PAGES AND PRODUCTS
 * ===========================================================================
 * The list the link picker offers (components/website-builder/link-picker.tsx)
 * before anything is typed. One list, so the builder's sidebar and
 * /app/website-builder/navigation offer the same places under the same names.
 *
 * `/products`, not `/shop`: the shop index is /products on every address,
 * which is where the themes' own Shop link goes. The visitor's own pages
 * (account, sign in, wishlist) are on every site (lib/website-builder/
 * account-pages), so they are always offered.
 */
import type { LinkTarget } from "@/components/website-builder/link-picker"

export interface LinkTargetProduct {
  slug: string
  title: string
  thumbnail_url?: string | null
}

export interface LinkTargetCollection {
  handle: string
  title: string
  image?: string | null
}

export function storeLinkTargets({
  customPages = [],
  products = [],
  collections = [],
}: {
  customPages?: { key: string; name: string }[]
  products?: LinkTargetProduct[]
  collections?: LinkTargetCollection[]
}): LinkTarget[] {
  return [
    { href: "/", label: "Home", kind: "page" },
    { href: "/products", label: "Shop", kind: "page" },
    { href: "/about", label: "About", kind: "page" },
    { href: "/contact", label: "Contact", kind: "page" },
    { href: "/search", label: "Search", kind: "page" },
    { href: "/account", label: "Account", kind: "page" },
    { href: "/account/login", label: "Sign in", kind: "page" },
    { href: "/wishlist", label: "Wishlist", kind: "page" },
    ...customPages.map((p) => ({ href: `/${p.key}`, label: p.name, kind: "page" as const })),
    ...(collections.length > 0 ? [{ href: "/collections", label: "All collections", kind: "page" as const }] : []),
    ...collections.map((c) => ({ href: `/collections/${c.handle}`, label: c.title, kind: "collection" as const, image: c.image || undefined })),
    ...products.map((p) => ({ href: `/products/${p.slug}`, label: p.title, kind: "product" as const, image: p.thumbnail_url || undefined })),
  ]
}
