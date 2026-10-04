import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { pageUser } from "@/lib/auth/page-user"
import { listCollections } from "@/lib/physical/collections-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { BUILT_IN_PAGE_KEYS, pageTitleFromKey } from "@/lib/website-builder/site-pages"
import { storeMenusFor } from "@/lib/website-builder/store-menus-server"
import type { SectionInstance } from "@/lib/website-builder/types"
import { NavigationClient } from "./navigation-client"

export const metadata: Metadata = {
  title: "Navigation",
}

/**
 * ===========================================================================
 *  /app/website-builder/navigation: THE STORE'S MENUS
 * ===========================================================================
 * Shopify keeps Navigation out of the theme: the menus are the store's, and
 * a theme only says where it shows one. Here too. The menus are saved to the
 * store (lib/website-builder/store-menus-server.ts) and every theme shows
 * the same ones, so they are edited here, beside the website and not inside
 * one of its themes' settings.
 *
 * The server reads what the page needs once: the menus, the live site's
 * header and footer (the Main menu is the header's own links until it is
 * first edited, and "where it shows" is read off them), and the places a
 * link can go (pages, collections, products).
 */
export default async function NavigationPage() {
  const user = await pageUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) redirect("/app")
  const creatorId = creator.id as string
  const admin = createAdminClient()

  const { data: installs } = await supabase
    .from("store_theme_installs")
    .select("id, name, status")
    .eq("creator_id", creatorId)
    .order("sort_order", { ascending: true })
  const list = (installs ?? []) as { id: string; name: string | null; status: string }[]
  const site = list.find((i) => i.status === "published") ?? list[0] ?? null

  const [menusRead, pagesRead, productsRead, collectionsRead] = await Promise.all([
    storeMenusFor(admin, creatorId, site?.id ?? null).catch(() => ({ available: false, stored: false, menus: {} })),
    site
      ? supabase.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", site.id)
      : Promise.resolve({ data: [] as { page_key: string; sections: unknown; draft_sections: unknown }[] }),
    supabase
      .from("products")
      .select("slug, title, thumbnail_url, status")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false })
      .limit(200),
    listCollections(admin, creatorId).catch(() => []),
  ])

  const pageRows = (pagesRead.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]
  const home = pageRows.find((p) => p.page_key === "home")
  const homeSections = (Array.isArray(home?.draft_sections) ? home?.draft_sections : Array.isArray(home?.sections) ? home?.sections : []) as SectionInstance[]
  const header = homeSections.find((s) => s?.type === "header") ?? null
  const footer = homeSections.find((s) => s?.type === "footer") ?? null

  const customPages = pageRows
    .map((p) => String(p.page_key))
    .filter((key) => key && !BUILT_IN_PAGE_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, name: pageTitleFromKey(key) }))

  const products = ((productsRead.data ?? []) as { slug: string | null; title: string | null; thumbnail_url: string | null; status: string | null }[])
    .filter((p) => p.slug && p.title && p.status !== "archived")
    .map((p) => ({ slug: p.slug as string, title: p.title as string, thumbnail_url: p.thumbnail_url }))

  const collections = collectionsRead
    .filter((c) => c.published)
    .map((c) => ({ handle: c.slug, title: c.title, image: c.imageUrl }))

  return (
    <NavigationClient
      available={menusRead.available}
      initialMenus={menusRead.menus}
      header={header ? { settings: header.settings ?? {}, blocks: (header.blocks ?? []) as never } : null}
      footer={footer ? { settings: footer.settings ?? {} } : null}
      site={site ? { id: site.id, name: site.name || "Website" } : null}
      targets={{ customPages, products, collections }}
    />
  )
}
