/**
 * ===========================================================================
 *  A CREATOR PAGE WITH NO PRODUCTS YET
 * ===========================================================================
 * The owner, of a creator page with nothing published: "today an ugly empty
 * space". It was three holes stacked on each other:
 *
 *   THE FEATURED SECTION   draws nothing without products, but its wrapper
 *                          kept the section's spacing, so Home opened on a
 *                          band of blank page the height of that spacing
 *   AN EMPTY HOME TAB      a page never arranged in the builder handed the
 *                          strip a Home panel of `null`, so the strip offered
 *                          "Home" over nothing, beside Communities
 *   NOTHING FOR THE OWNER  the creator looking at their own page saw the
 *                          same blank, with no way from it to a product
 *
 * So the page reads with what it has. Without products the sections that
 * only ever show products are left out, Home is only a tab when something
 * is left in it, and when nothing is, the communities the creator made stand
 * on the page under a heading of their own (one panel is never a tab strip).
 * With neither, the page goes from the header to About, which is a page,
 * not a hole. The creator on their own page gets one quiet line above all
 * of it, "No products on your page yet", and the one button that changes
 * that. Visitors never see it.
 *
 * Every colour is the scheme's own token (--card, --border, --foreground,
 * --muted-foreground) and Follow's fill (the scheme's `action`), so it is
 * at home on a light, a tinted and a dark page alike
 * (scripts/check-creator-no-products.mjs draws three).
 *
 * No "use client": the creator page builds this on the server, and the probe
 * draws the same functions.
 */
import Link from "next/link"
import type React from "react"
import type { ReactNode } from "react"
import { ExploreCommunityGrid } from "@/components/explore/community-card"
import type { ActionScheme } from "@/components/profile/follow-button"
import type { CommunityCard } from "@/lib/communities/types"
import type { StorefrontTab } from "./storefront-tabs"

/** Where a creator adds a product. */
export const NEW_PRODUCT_HREF = "/app/products/new"

/** Section types that draw only products: without any, all they leave is their spacing. */
const PRODUCT_ONLY = new Set(["featured-products", "more-from-seller"])

/** The sections worth drawing on a page with no products. */
export function sectionsWithoutProducts<T extends { type: string }>(sections: T[], productCount: number): T[] {
  return productCount > 0 ? sections : sections.filter((s) => !PRODUCT_ONLY.has(s.type))
}

/**
 * ===========================================================================
 *  A SECTION THAT DRAWS NOTHING IS NOT A SECTION (the "Home" over a blank band)
 * ===========================================================================
 * The owner, with a screenshot of /calvin: newsletter bar, photo, Follow,
 * then a "Home" tab over an empty band and About under it. The rule above
 * caught the Featured rail, and this page had none. What its Home held was
 * a section of type "header", written into the sections list by an older
 * builder: no type the live page draws, no `visible` flag, so it rendered
 * nothing at all. But it was still a section, so Home was "not empty", the
 * strip offered Home over nothing, and the Communities tab beside it.
 *
 * Every other way to the same hole was the same mistake, counting sections
 * rather than what they draw:
 *
 *   HIDDEN           a section switched off in the builder (visible false)
 *   NOT DRAWN HERE   a type the live page has no drawing for (an old
 *                    "header", "custom-html", "subscribe-bar", "faq"), or a
 *                    Reviews block, which a creator page never hands reviews
 *   EMPTY            a text block with no words, an image and text with no
 *                    image and no words, benefits with no benefit written,
 *                    an announcement with no text
 *   GONE             a Community section whose community is unpublished,
 *                    deleted, made private or switched off (the server read
 *                    for it came back empty, so the card draws nothing)
 *   PRODUCTS         Featured and More from the seller with no products
 *
 * Each of those still painted its spacing, which is the blank band. So the
 * live page keeps only the sections that will draw something, Home is a tab
 * only when one is left, and a page with nothing in Home reads from the
 * header to About (or to the communities, when it has those).
 */
type SectionLike = { type: string; settings?: unknown }

/** Text worth drawing: not empty, and not only markup or spaces. */
function words(value: unknown): boolean {
  return typeof value === "string" && value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim().length > 0
}

export function drawsSomething(section: SectionLike, page: { productCount: number; communityBlocks?: Record<string, unknown> | null }): boolean {
  const s = (section.settings ?? {}) as Record<string, unknown>
  if (!section.settings || !s.visible) return false
  switch (section.type) {
    case "featured-products":
    case "more-from-seller":
      return page.productCount > 0
    case "text-block":
      return words(s.headline) || words(s.body)
    case "image-text":
      return words(s.imageUrl) || words(s.headline) || words(s.body)
    case "benefits":
      return Array.isArray(s.benefits) && (s.benefits as Array<Record<string, unknown>>).some((b) => b && (words(b.title) || words(b.description)))
    case "announcement-bar":
      return words(s.text)
    case "community": {
      const id = typeof s.communityId === "string" ? s.communityId.toLowerCase() : ""
      return !!id && !!page.communityBlocks?.[id]
    }
    case "about":
      return true
    default:
      return false
  }
}

/** The sections a creator page's Home will actually draw, in their order. */
export function drawableSections<T extends SectionLike>(sections: T[], page: { productCount: number; communityBlocks?: Record<string, unknown> | null }): T[] {
  return sections.filter((section) => drawsSomething(section, page))
}

/** The page's own column, as the tabs, the Products grid and the communities panel draw it. */
const COLUMN = "mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6"

/**
 * The tabs of a page with no products. `home` is null when nothing is left
 * to draw in it; `communitiesPanel` is the page's usual Communities tab (null
 * while communities are off) and `communities` the cards behind it.
 */
export function tabsWithoutProducts({
  home,
  communitiesPanel,
  communities,
}: {
  home: ReactNode | null
  communitiesPanel: ReactNode | null
  communities: CommunityCard[] | null
}): StorefrontTab[] {
  if (home) {
    const tabs: StorefrontTab[] = [{ id: "home", label: "Home", panel: home }]
    if (communitiesPanel) tabs.push({ id: "communities", label: "Communities", panel: communitiesPanel })
    return tabs
  }
  /* Nothing in Home: no strip. The communities they made stand on the page, or nothing does. */
  if (communities && communities.length > 0) {
    return [{ id: "communities", label: "Communities", panel: <CommunitiesOnPage cards={communities} /> }]
  }
  return []
}

/** The communities, when they are the page's only content: a heading in the page's ink, then Explore's cards in its scheme. */
function CommunitiesOnPage({ cards }: { cards: CommunityCard[] }) {
  return (
    <section className={`${COLUMN} pb-2 pt-6 sm:pt-8`} aria-labelledby="storefront-communities-heading" data-storefront-communities-only="">
      <h2 id="storefront-communities-heading" className="mb-4 text-[17px] font-semibold text-foreground sm:text-[19px]">
        Communities
      </h2>
      <div data-storefront-communities="">
        <ExploreCommunityGrid cards={cards} surface="storefront" priorityCount={2} />
      </div>
    </section>
  )
}

/**
 * Follow's fill as the variables the button reads. Not follow-button's
 * schemeVars: that module is "use client", and a server component calling a
 * client module's function throws.
 */
function fillVars(scheme: ActionScheme | null | undefined): React.CSSProperties | undefined {
  if (!scheme) return undefined
  return {
    "--sf-bg": scheme.background,
    "--sf-ink": scheme.text,
    "--sf-hover": scheme.hover || scheme.background,
    "--sf-press": scheme.press || scheme.hover || scheme.background,
  } as React.CSSProperties
}

/**
 * The owner's line on their own page while nothing is published: what is
 * true, and the button that changes it, in the page's own colours.
 *
 * It was a row the full width of the column, and the owner, with a
 * screenshot: a banner across the page that "looks very ugly". A page with
 * nothing on it does not want a strip of chrome over the emptiness; it wants
 * something standing in the empty place. So it is a small card in the middle
 * of the column, the width of a card rather than of the page, holding a
 * glyph, the line and the button, like every other "nothing here yet" panel
 * on Storelib. Visitors never see it.
 */
export function FirstProductPrompt({ scheme }: { scheme?: ActionScheme | null }) {
  return (
    <div className={`${COLUMN} pt-4 sm:pt-6`} data-first-product="">
      <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-3 rounded-2xl border border-border bg-card px-5 py-6 text-center text-card-foreground">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-[18px] w-[18px]">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </span>
        <div>
          <p className="text-[15px] font-semibold leading-snug">No products on your page yet</p>
          <p className="mx-auto mt-1 max-w-[300px] text-[13.5px] leading-snug text-muted-foreground">Only you see this. Publish one and it shows here.</p>
        </div>
        <Link
          href={NEW_PRODUCT_HREF}
          prefetch={false}
          data-first-product-add=""
          style={fillVars(scheme)}
          className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-transparent bg-[var(--sf-bg,var(--foreground))] px-4 text-[14px] font-semibold text-[var(--sf-ink,var(--background))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.3),0_1px_2px_rgba(16,24,40,0.2)] outline-none transition-[background-color] duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-bg,var(--foreground))] pointer-fine:hover:bg-[var(--sf-hover,var(--foreground))] active:bg-[var(--sf-press,var(--foreground))]"
        >
          Add a product
        </Link>
      </div>
    </div>
  )
}
