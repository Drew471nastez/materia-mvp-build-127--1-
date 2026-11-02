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
import { productCheckoutHref } from "./new-tab"
import { blogPath, categoryPath } from "@/lib/site-blog/urls"

export interface LinkTargetProduct {
  /** With an id, the product's checkout is offered as a place too (Checkout). */
  id?: string
  slug: string
  title: string
  thumbnail_url?: string | null
}

export interface LinkTargetCollection {
  handle: string
  title: string
  image?: string | null
}

/** The site's blog, once it has a post a visitor can open: its address and its categories (lib/site-blog). */
export interface LinkTargetBlog {
  handle: string
  categories?: { slug: string; name: string }[]
}

export function storeLinkTargets({
  customPages = [],
  products = [],
  collections = [],
  blog = null,
}: {
  customPages?: { key: string; name: string }[]
  products?: LinkTargetProduct[]
  collections?: LinkTargetCollection[]
  blog?: LinkTargetBlog | null
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
    /* The blog and its categories, under Pages: a blog is pages of the site, not a kind of its own (lib/website-builder/link-menu.ts). */
    ...(blog ? [{ href: blogPath(blog.handle), label: "Blog", kind: "page" as const }] : []),
    ...(blog?.categories ?? []).map((c) => ({ href: categoryPath(blog!.handle, c.slug), label: c.name, kind: "page" as const, context: "Blog" })),
    ...(collections.length > 0 ? [{ href: "/collections", label: "All collections", kind: "page" as const }] : []),
    ...collections.map((c) => ({ href: `/collections/${c.handle}`, label: c.title, kind: "collection" as const, image: c.image || undefined })),
    ...products.map((p) => ({ href: `/products/${p.slug}`, label: p.title, kind: "product" as const, image: p.thumbnail_url || undefined })),
    /* Straight to a product's checkout: not its page, not the cart (lib/website-builder/new-tab productCheckoutHref). */
    ...products.flatMap((p) => (p.id ? [{ href: productCheckoutHref(p.id), label: p.title, kind: "checkout" as const, context: "Checkout", image: p.thumbnail_url || undefined }] : [])),
  ]
}
