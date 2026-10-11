/**
 * ===========================================================================
 *  ONE SITE, DRAWN FOR WHICHEVER PAGE WAS ASKED FOR
 * ===========================================================================
 * `<name>.storelib.com` and `<name>.storelib.com/about` are the same website
 * and differ by one thing: which page of it to draw. So the work lives here
 * once and both routes hand it a page key.
 *
 * This is also where a long-standing hole was closed. The builder has always
 * offered an About page, a Contact page and pages of the creator's own, the
 * shipped header links to `/about`, and nothing has ever served any of them:
 * `app/(site)/w/` held a single route for the home page, so every other
 * address on every published site was a 404. Sub-pages were work a creator
 * could do and no visitor could see.
 */
import { siteIcons } from "@/lib/website-builder/site-icon"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { mayPreview, pageSections, previewTokenFrom, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { storeMenusOrNull, withStoreMenus } from "@/lib/website-builder/store-menus-server"
import { creatorByName, dressPage, ownerOf, publishedShopByName, publishedSiteByName } from "@/lib/website-builder/published-site"
import { SiteNotPublished } from "./not-published"
import { chromeOf, withUniversalChrome, type Chrome } from "@/lib/website-builder/universal-chrome"
import { kindLookup, repairChrome } from "@/lib/storelib-theme/section-groups"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { getMainDomain } from "@/lib/url-helpers"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
import { heroImage, jsonLdScript, pageUrl, siteSameAs, websiteJsonLd } from "@/lib/website-builder/site-seo"
import { pageSeoOf } from "@/lib/website-builder/page-seo"
import { builtSiteIndexable, websiteIndexable } from "@/lib/seo/indexing"
import { creatorAvatar, siteOrigin } from "@/lib/website-builder/site-seo-data"
import { pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { TrackView } from "@/components/analytics/track-view"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { renderAccountPage } from "./render-account"
import { contactSections } from "@/lib/website-builder/account-pages"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageAlternates, languageChoice, siteLanguages } from "@/lib/markets/live"
import { localizedPath } from "@/lib/markets/locales"

export type SiteSearchParams = Record<string, string | string[] | undefined>

function paramsToSearch(sp: SiteSearchParams | undefined): URLSearchParams {
  return new URLSearchParams(
    Object.entries(sp ?? {}).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  )
}

export async function siteMetadata(
  segment: string,
  searchParams: SiteSearchParams | undefined,
  pageKey = "home",
  /** Set when this is the preview route, which has the token in its path. */
  previewToken: string | null = null,
): Promise<Metadata> {
  /* "andrew~fr": the website in French (lib/markets/site-name.ts). */
  const { name: username, locale } = splitSiteName(segment)
  /**
   * A PREVIEW IS NOT FOR SEARCH ENGINES. The link is shared with a person,
   * and the page behind it is by definition not the one the creator has
   * decided on. Checked on the SHAPE of the token, not against the database:
   * the answer is the same either way, and it keeps a lookup out of here.
   */
  if (previewToken !== null || previewTokenFrom(paramsToSearch(searchParams)) !== null) {
    return { title: "Preview", robots: { index: false, follow: false } }
  }

  /**
   * THE SAME LOOKUP THE PAGE MAKES. This read `creators` by slug or username
   * and nothing else, so a site reached by the name it was given in Website
   * Settings › Domains was drawn by the page and described by nothing: a
   * title of "Not Found", no canonical, no description, no share card.
   * creatorByName and publishedShopByName are the page's own resolution
   * (lib/website-builder/published-site.ts), username, creator slug and
   * website name alike, and both are cached, so asking them here is free.
   *
   * THE ADMIN CLIENT, NOT THE VIEWER'S, is what they read through. A
   * published site's title, description and favicon are the same for
   * everybody, and reading them through the viewer's client meant calling
   * `cookies()`, which makes the whole route dynamic and uncacheable.
   */
  const creator = await creatorByName(username)
  if (!creator) return { title: "Not Found" }
  const found = await publishedShopByName(username)

  // Default format: "{username} | Storelib" — prefer the creator's platform
  // username/slug over the brand_name so the tab title matches the URL.
  const defaultHandle = creator.slug || username || creator.displayName || "Storelib"

  /* Nothing published: the page says so, and is not a page to index. */
  if (found.kind !== "site") {
    return { title: { absolute: `${defaultHandle} | Storelib` }, robots: { index: false, follow: true } }
  }

  // PUBLISHED ONLY. This fell back to `draft_settings` "so a freshly uploaded
  // favicon shows up before a re-publish", which is a draft title, description
  // and favicon on a public page — the same leak the body of this page was
  // fixed for. A favicon shows up when it is published, like everything else.
  // The published site is built from published values alone (buildSite).
  const settings: ThemeSettingsValues = found.site.themeSettings ?? {}
  const siteTitle = typeof settings.seo_title === "string" && settings.seo_title.trim()
    ? settings.seo_title.trim()
    : `${defaultHandle} | Storelib`
  const brand = typeof settings.brand_name === "string" && settings.brand_name
    ? settings.brand_name
    : defaultHandle
  /**
   * A sub-page says which page it is first. The site's own SEO title is one
   * title for the whole site, and using it unchanged on five pages gives a
   * visitor five identical tabs and a search engine five identical results.
   */
  /* A page's own title and description, when its creator gave it one in
     Pages & Navigation: lib/website-builder/page-seo.ts. */
  const own = pageSeoOf(settings as Record<string, unknown>, pageKey)
  const rawTitle = own.title ?? (pageKey === "home" ? siteTitle : `${pageTitleFromKey(pageKey)} | ${brand}`)
  const description = own.description ?? (typeof settings.seo_description === "string" && settings.seo_description
    ? settings.seo_description
    : `Visit ${brand}'s website on Storelib`)
  /* The favicon, or the store's logo when there is none (lib/website-builder/site-icon.ts). */
  const icons = siteIcons(settings as Record<string, unknown>, found.site.pages.home ?? found.site.sections)

  /**
   * ONE ADDRESS PER PAGE. The same page answers at `<name>.storelib.com` and
   * at a connected domain, and a search engine that finds both splits what
   * it knows between them. The canonical names the one the creator gives
   * out: lib/website-builder/site-seo-data.ts.
   */
  const origin = await siteOrigin(creator.creatorId, username)
  /*
    EVERY LANGUAGE OF THE PAGE, for search engines: hreflang for each
    published language and x-default for the website's own, and a page in
    another language is its own canonical (lib/markets/live.ts).
  */
  const ownPath = new URL(pageUrl(origin, pageKey)).pathname
  const [languages, langs] = await Promise.all([languageAlternates(creator.creatorId, origin, ownPath), siteLanguages(creator.creatorId)])
  const pageLocale = locale && langs.others.find((l) => l.toLowerCase() === locale) ? langs.others.find((l) => l.toLowerCase() === locale)! : null
  const url = pageLocale ? `${origin}${localizedPath(ownPath, pageLocale, langs.defaultLanguage)}` : pageUrl(origin, pageKey)

  /*
    A SHARE CARD WITH A PICTURE. og:image came only from the share image in
    SEO & Social, so most sites were shared as a bare line of text. Without
    one, the card takes the site's logo, then the first picture of the
    published front page's hero, then the creator's own avatar. A logo that
    is not a full address, or is an SVG, is passed over: the networks that
    draw share cards cannot fetch the one or draw the other.
  */
  const hasShareImage = !!own.image || (typeof settings.seo_og_image === "string" && settings.seo_og_image.trim() !== "")
  const logo =
    typeof settings.logo_url === "string" && /^https?:\/\//i.test(settings.logo_url.trim()) && !/\.svg(?:\?|$)/i.test(settings.logo_url.trim())
      ? settings.logo_url.trim()
      : ""
  const shareImage = hasShareImage
    ? undefined
    : logo || heroImage(found.site.pages.home ?? found.site.sections) || (await creatorAvatar(creator.creatorId)) || undefined

  return {
    title: { absolute: rawTitle },
    description,
    alternates: { canonical: url, ...(languages ? { languages } : {}) },
    icons,
    // The share image, the card type and — the one that matters — whether the
    // page may be indexed at all. All three were in the panel and read by
    // nothing, so "noindex" was a setting somebody trusted and did not have.
    /* A page's own share picture (Website settings › Pages) over the site's (lib/website-builder/page-seo.ts). */
    ...themeMetadata(own.image ? { ...settings, seo_og_image: own.image } : settings, { title: rawTitle, description, url, image: shareImage }),
    /* A page kept out of search on its own, whatever the site's setting. */
    ...(own.hidden ? { robots: { index: false, follow: true } } : {}),
    /*
      And a whole site under a handle the spam rules hold back, which its own
      sitemap already left out while each page said index. The one rule the
      site's robots.txt, its sitemap and storelib.com's read
      (lib/seo/indexing builtSiteIndexable); the creator's own switch is
      already in the robots above, as they set it.
    */
    ...(websiteIndexable(settings as Record<string, unknown>) && !builtSiteIndexable(settings as Record<string, unknown>, username)
      ? { robots: { index: false, follow: false } }
      : {}),
  }
}

/**
 * ===========================================================================
 *  THE WEBSITE, AT ITS OWN ADDRESS
 * ===========================================================================
 * `<name>.storelib.com` is rewritten here by the proxy. This is the page a
 * creator built in the website builder, and nothing else: their profile and
 * products live at `storelib.com/<name>`, which is a different thing.
 *
 * A creator with nothing published yet gets a coming soon page at the
 * address: what is true, a box to be told when it opens, and the creator
 * page as a link (./not-published.tsx). A published site is
 * served from the cache in lib/website-builder/published-site.ts; a
 * preview link (`?preview=<token>`) takes the slow, uncached path on
 * purpose, because it is one person looking at unpublished work.
 */
export async function renderSite(
  segment: string,
  searchParams: SiteSearchParams | undefined,
  pageKey = "home",
  /** Set when this is the preview route, which has the token in its path. */
  previewToken: string | null = null,
) {
  /* "andrew~fr": the website in French, sent here by the proxy for /fr/… (lib/markets/site-name.ts). */
  const { name: username, locale } = splitSiteName(segment)
  /**
   * `?preview=` is still read, so links already shared keep working, but the
   * preview has an address of its own now: `/preview/<token>`. The public
   * routes read no query string at all, which is what lets them be cached
   * for everybody rather than rendered for each visitor.
   */
  const wantedToken = previewToken ?? previewTokenFrom(paramsToSearch(searchParams))
  if (wantedToken) return await previewPage(username, wantedToken, pageKey)

  /*
    THE CONTACT PAGE IS EVERY WEBSITE'S. The one the creator saved when they
    made one, the generated one when they have not, and either way with the
    store's own details handed to its sections: ./render-account.tsx.
  */
  if (pageKey === "contact") return await renderAccountPage(username, "contact")

  const found = await publishedSiteByName(username, pageKey, locale)
  /* A renamed creator's site, at the new name for good (308), and at the same page of it rather than its front page. */
  if (found.kind === "renamed") permanentRedirect(pageUrl(`https://${found.to}.${getMainDomain()}`, pageKey))
  if (found.kind === "missing") notFound()
  /**
   * NOTHING PUBLISHED IS NOT THE SAME AS "GO TO THE CREATOR PAGE". This used
   * to redirect to storelib.com/<name>, which made the website's address and
   * the creator's page look like one address with two spellings: you typed
   * the site, you got the profile, and the bar rewrote itself to say you had
   * asked for the profile. The page below says the site is coming, takes an
   * email for when it opens, and offers the creator page as a link. See
   * app/(site)/w/[username]/not-published.tsx.
   */
  if (found.kind === "unpublished") return <SiteNotPublished username={username} displayName={found.displayName} creatorId={(await creatorByName(username))?.creatorId ?? null} />

  const { site } = found
  const template = templateForPage(pageKey)
  /* The website and whose it is, once, on the front page. */
  const [structured, language] = await Promise.all([pageKey === "home" ? homeStructuredData(site, username) : null, languageChoice(site.creatorId, locale)])
  return (
    <StorelibSourcesProvider prerendered={site.prerendered} page={{ template }}>
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structured }} />}
      <ThemePage
        theme={site.themeSettings}
        sections={site.sections}
        // Whose site this is, for the sections that send something somewhere.
        storefront={{ creatorId: site.creatorId, installId: site.installId, pages: Object.keys(site.pages), pageKey, language }}
        emptyDetail="Check back soon!"
      />
      {/* Every page of the published site is one view in Analytics, with its
          own path, placed on this website by the server from the address
          (lib/analytics/property). It was one view a visit, whatever was read.
          Previews and cover renders never reach this line. */}
      <TrackView type="store" creatorId={site.creatorId} />
      <StoreTracking creatorId={site.creatorId} />
      {/* How fast the page was for this visitor: LCP, INP and CLS, once, as
          they leave. Published pages only, like the line above. */}
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}

/**
 * The draft, for whoever holds the link. Uncached and unshared: it reads the
 * install directly so the token can be compared against it, in constant
 * time. A wrong token renders the published site and says nothing about
 * whether a link exists.
 */
/**
 * The install a preview link is about, and whether the link is the right
 * one. Shared by every page a preview can show: the site's pages here, and
 * the shop index in preview/[token]/products.
 */
export async function previewInstall(username: string, token: string) {
  const admin = createAdminClient()
  const lower = username.toLowerCase()

  let creatorId: string | null = null
  const { data: profile } = await admin.from("profiles").select("id").eq("username", lower).maybeSingle()
  if (profile) {
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", (profile as { id: string }).id).maybeSingle()
    if (creator) creatorId = (creator as { id: string }).id
  }
  if (!creatorId) {
    const { data: creator } = await admin.from("creators").select("id").eq("slug", lower).maybeSingle()
    if (creator) creatorId = (creator as { id: string }).id
  }
  if (!creatorId) notFound()

  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, name, status, preview_token, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!install) redirect(`https://${getMainDomain()}/${lower}`)

  const row = install as { id: string; preview_token?: string | null; store_theme_settings?: unknown }
  /**
   * Constant time, and a wrong token draws the published site rather than
   * saying anything about whether a link exists.
   */
  const preview = mayPreview(row.preview_token, token)
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const themeSettings = withStoreMenus((themeSettingsOf(settingsRow as never, preview) ?? {}) as ThemeSettingsValues, await storeMenusOrNull(admin, creatorId))

  return { admin, creatorId, installId: row.id, preview, themeSettings }
}

async function previewPage(username: string, token: string, pageKey: string) {
  const { admin, creatorId, installId, preview, themeSettings } = await previewInstall(username, token)

  const { data: pageData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", installId)
    .eq("page_key", pageKey)
    .maybeSingle()

  // A page the creator has not made is not a page, even with the link.
  // Contact is the exception: every website has one (./render-account.tsx).
  if (!pageData && pageKey !== "home" && pageKey !== "contact") notFound()

  /**
   * And again on the way out. The database already holds rich text saved
   * before anything sanitised it, and rows can arrive from an import. The
   * save path is the authority; this covers what is already there.
   */
  /**
   * A preview reads ONE page, so home's chrome has to be fetched for it.
   * Skipped when this IS home, which already has its own.
   */
  /* The shop, the creator's profile and the saved section files, read
     directly: a preview is one person's view and never shares a cache.
     First, because the files say which section is a header. */
  const { owner, products, productCount } = await ownerOf(creatorId, installId, themeSettings)
  /* One header and one footer drawn, whatever the rows hold: lib/storelib-theme/section-groups.ts. */
  const kinds = kindLookup(owner.sources, SECTION_SCHEMAS as never)
  let chrome: Chrome = {}
  if (pageKey !== "home") {
    const { data: homeRow } = await admin
      .from("store_theme_pages")
      .select("sections, draft_sections")
      .eq("install_id", installId)
      .eq("page_key", "home")
      .maybeSingle()
    chrome = chromeOf(repairChrome(sanitizeSections(pageSections<SectionInstance[]>(homeRow as never, preview) ?? []), kinds).sections)
  }
  const own = repairChrome(sanitizeSections(pageSections<SectionInstance[]>(pageData as never, preview) ?? []), kinds).sections
  const sections = withUniversalChrome(
    /* A contact page nobody has made yet is the generated one, like the live site's. */
    own.length === 0 && pageKey === "contact" ? contactSections([...(chrome.headerGroup ?? (chrome.header ? [chrome.header] : [])), ...(chrome.footerGroup ?? (chrome.footer ? [chrome.footer] : []))]) : own,
    chrome,
  )
  const template = templateForPage(pageKey)
  const dressed = await dressPage(owner, sections, products, productCount, template, pageTitleFromKey(pageKey), undefined, { cached: false })
  const prerendered = renderWithSources(owner.sources, dressed.sections, themeSettings, template, products, { title: pageTitleFromKey(pageKey) }, dressed.data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template }}>
      <ThemePage
        theme={themeSettings}
        sections={dressed.sections}
        // Whose site this is, for the sections that send something somewhere.
        storefront={{ creatorId, installId }}
        emptyDetail="Check back soon!"
      />
    </StorelibSourcesProvider>
  )
}

/**
 * ===========================================================================
 *  THE SAVED HOME PAGE, FOR THE BROWSER THAT PHOTOGRAPHS IT
 * ===========================================================================
 * What the website page's cover is a screenshot of. The same drafts, the same
 * sanitising, the same prerendered .storelib sections and the same ThemePage
 * as the preview link above — so the picture is the page a visitor would get
 * from this save, not an approximation of it — but found by INSTALL id, not
 * by the published install's username, because every site in the library
 * has a cover and only one of them is live.
 *
 * Reached only through app/(site)/cover-render/[pass], which has already
 * checked the signed pass for this install. `preview` is true: a cover is of
 * what was last saved, and that is the draft.
 *
 * The wrapper carries `data-snapshot-stage`, which turns off the theme's
 * section entrance animation (app/globals.css). A screenshot taken during it
 * would catch every section part way through fading in.
 */
export async function coverPage(installId: string) {
  const admin = createAdminClient()
  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, creator_id, store_theme_settings ( settings, draft_settings )")
    .eq("id", installId)
    .maybeSingle()
  if (!install) notFound()

  const row = install as { id: string; creator_id: string; store_theme_settings?: unknown }
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const themeSettings = withStoreMenus((themeSettingsOf(settingsRow as never, true) ?? {}) as ThemeSettingsValues, await storeMenusOrNull(admin, row.creator_id))

  const { data: pageData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", installId)
    .eq("page_key", "home")
    .maybeSingle()

  const { owner, products, productCount } = await ownerOf(row.creator_id, installId, themeSettings)
  const sections = withUniversalChrome(
    repairChrome(sanitizeSections(pageSections<SectionInstance[]>(pageData as never, true) ?? []), kindLookup(owner.sources, SECTION_SCHEMAS as never)).sections,
    {},
  )
  const dressed = await dressPage(owner, sections, products, productCount, "index", pageTitleFromKey("home"), undefined, { cached: false })
  const prerendered = renderWithSources(owner.sources, dressed.sections, themeSettings, "index", products, undefined, dressed.data)

  return (
    <div data-snapshot-stage="">
      <StorelibSourcesProvider prerendered={prerendered} page={{ template: "index" }}>
        <ThemePage
          theme={themeSettings}
          sections={dressed.sections}
          /* No creator: the newsletter and contact form must never send
             anything from a screenshot. */
          storefront={{ installId }}
          emptyDetail="Check back soon!"
        />
      </StorelibSourcesProvider>
    </div>
  )
}

async function homeStructuredData(
  site: { creatorId: string; displayName: string; themeSettings: ThemeSettingsValues },
  username: string,
): Promise<string> {
  const t = site.themeSettings as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  return jsonLdScript(
    websiteJsonLd({
      origin: await siteOrigin(site.creatorId, username),
      name: str(t.brand_name) ?? site.displayName,
      description: str(t.seo_description),
      logo: str(t.logo_url) ?? str(t.favicon_url),
      /* Social links in Website Settings: the owner's profiles elsewhere. */
      sameAs: siteSameAs(t),
    }),
  )
}
