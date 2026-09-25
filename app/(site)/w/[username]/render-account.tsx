/**
 * ===========================================================================
 *  THE ACCOUNT, SIGN IN, WISHLIST AND CONTACT PAGES, DRAWN
 * ===========================================================================
 * One renderer for the four pages every website has
 * (lib/website-builder/account-pages): the page the creator saved when they
 * have arranged it in the builder, the generated one until then, drawn with
 * the website's own header and footer.
 *
 * What differs per page is what the page knows, handed to the sections as
 * the template globals (lib/storelib-theme/globals):
 *
 *   shop       every page: the store's name, and its support email only when
 *              a section on the page asked to show it
 *   customer   /account, the signed-in visitor
 *   wishlist   /account and /wishlist, what they saved
 *   notice     /account/login, why the last sign in did not finish
 *
 * The published site and its catalogue come from the same cache every page
 * uses (lib/website-builder/published-site), so nothing here is a second
 * copy of the site to keep in step.
 */
import { notFound, redirect } from "next/navigation"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { publishedShopByName } from "@/lib/website-builder/published-site"
import { accountPageSections } from "@/lib/website-builder/account-pages"
import { pageWithLiveLinks } from "@/lib/website-builder/live-links"
import { templateForPage } from "@/lib/website-builder/site-pages"
import { getMainDomain } from "@/lib/url-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import type { StorefrontGlobals } from "@/lib/storelib-theme/globals"
import type { SectionInstance } from "@/lib/website-builder/types"

export type AccountPageKey = "account" | "login" | "wishlist" | "contact"

/** Whether any section on the page asked to show the store's support email. */
function wantsEmail(sections: SectionInstance[]): boolean {
  return sections.some((s) => (s.settings as Record<string, unknown> | undefined)?.show_email === true)
}

/**
 * The support email from Settings, read only for a page that shows it. Never
 * the account's own login email: that one is for Storelib, not for visitors.
 */
async function supportEmail(creatorId: string): Promise<string> {
  try {
    const { data } = await createAdminClient().from("creators").select("support_email").eq("id", creatorId).maybeSingle()
    const email = (data as { support_email?: string | null } | null)?.support_email
    return typeof email === "string" ? email.trim() : ""
  } catch {
    return ""
  }
}

export async function renderAccountPage(
  username: string,
  key: AccountPageKey,
  extras: { customer?: Record<string, unknown> | null; wishlist?: StorefrontGlobals["wishlist"]; notice?: string | null } = {},
) {
  const found = await publishedShopByName(username)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products } = found
  const stored = site.pages[key]
  const base = stored && stored.length > 0 ? stored : (accountPageSections(key, site.pages.home ?? site.sections) ?? [])
  const sections = pageWithLiveLinks(base, new Set(Object.keys(site.pages)))
  const template = templateForPage(key)

  const globals: StorefrontGlobals = {
    shop: { name: site.displayName, email: wantsEmail(sections) ? await supportEmail(site.creatorId) : "" },
    customer: extras.customer ?? null,
    wishlist: extras.wishlist ?? null,
  }
  const page = extras.notice ? { notice: extras.notice } : undefined
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, template, products, page, globals)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
      />
      {/* The contact page is a page of the website like any other, and a
          visit to it counts in Analytics. The account pages are private. */}
      {key === "contact" && <TrackView type="store" creatorId={site.creatorId} />}
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}
