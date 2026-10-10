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
 *   customer   /account, the signed-in customer and their orders
 *   wishlist   /account and /wishlist, what they saved
 *
 * and, as `page.*`, what one visit to a page knows:
 *
 *   notice     /account/login and /account: why the last step did not
 *              finish, or that it did, as a fixed sentence
 *   edit       /account: "name" while the profile's name is being changed
 *   step       /account/login: "email" or "code"
 *   email      /account/login on the code step: where the code went
 *   return_to  /account/login: the path on this website to land on after
 *
 * The published site and its catalogue come from the same cache every page
 * uses (lib/website-builder/published-site), so nothing here is a second
 * copy of the site to keep in step.
 */
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { ACCOUNT_PAGE_PATHS, accountPageSections } from "@/lib/website-builder/account-pages"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { withoutChrome } from "@/lib/website-builder/universal-chrome"
import { pageWithLiveLinks } from "@/lib/website-builder/live-links"
import { pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import { getMainDomain } from "@/lib/url-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import type { StorefrontGlobals } from "@/lib/storelib-theme/globals"
import type { SectionInstance } from "@/lib/website-builder/types"

export type AccountPageKey = "account" | "login" | "wishlist" | "contact" | "password"

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
  extras: {
    customer?: Record<string, unknown> | null
    wishlist?: StorefrontGlobals["wishlist"]
    notice?: string | null
    signIn?: { step: "email" | "code"; email: string; returnTo: string }
    /** /account: the profile field open for editing. */
    edit?: "name" | null
    /** /password: where to land once in, and the owner's way in (lib/site-password). */
    password?: { returnTo: string; ownerUrl: string }
  } = {},
) {
  const found = await publishedShopByName(username)
  /* Renamed for good: the same page at the new name, permanently (308), as every other page of a website. */
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}${ACCOUNT_PAGE_PATHS[key] ?? "/"}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products, productCount } = found
  const stored = site.pages[key]
  const own = stored && stored.length > 0 ? stored : (accountPageSections(key, site.pages.home ?? site.sections) ?? [])
  /*
    AN IMPORTED SHOPIFY THEME draws its own header and footer around this
    page (lib/storelib-theme/compat/site.ts, accountShell), and this page is
    shown inside it: the theme's chrome cannot be drawn here, so none is.
  */
  const base = compatOf(site.themeSettings) ? withoutChrome(own) : own
  /* Drawn like every other page: live links, then the shop's own facts (placeholders, menus, picked products). */
  const linked = pageWithLiveLinks(base, new Set(Object.keys(site.pages)))
  const template = templateForPage(key)
  const { sections, data } = await dressPage(site, linked, products, productCount, template, pageTitleFromKey(key))

  const globals: StorefrontGlobals = {
    shop: { name: site.displayName, email: wantsEmail(sections) ? await supportEmail(site.creatorId) : "" },
    customer: extras.customer ?? null,
    wishlist: extras.wishlist ?? null,
  }
  const page: Record<string, unknown> = {}
  if (extras.notice) page.notice = extras.notice
  if (extras.edit) page.edit = extras.edit
  if (extras.signIn) {
    page.step = extras.signIn.step
    page.email = extras.signIn.email
    page.return_to = extras.signIn.returnTo
  }
  if (extras.password) {
    page.return_to = extras.password.returnTo
    page.owner_url = extras.password.ownerUrl
  }
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, template, products, page, data, globals)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
      />
      {/* The contact page and the wishlist are pages of the website like any
          other, and a visit to either counts in Analytics, with its path. The
          account pages (sign in, orders, profile) are private. */}
      {(key === "contact" || key === "wishlist") && <TrackView type="store" creatorId={site.creatorId} />}
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}
