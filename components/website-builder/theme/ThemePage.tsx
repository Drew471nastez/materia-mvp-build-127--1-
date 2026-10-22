"use client"

/**
 * ===========================================================================
 *  ONE PAGE, FOUR SURFACES
 * ===========================================================================
 * A Storelib page was being assembled from scratch in four places: the
 * editor's canvas, the storefront at /w/[username], the seller page at
 * /[sellername], and the product page. Each had its own announcement bar, its
 * own header-first-footer-last rule, its own wrapper. Two of the four did not
 * even go through PageSections.
 *
 * They had already drifted. The three public routes applied the theme's
 * background colour and body font; THE EDITOR DID NOT — so the preview a
 * creator designs against was on a white page in Inter whatever they had
 * chosen. And every setting added to one copy had to be remembered in three
 * others, which is why the announcement bar's link, its scrolling option and
 * its dismiss button were in the panel and on none of the four.
 *
 * This is the page. Chrome, ordering, the theme's own CSS: one place, and the
 * editor cannot drift from what it publishes because it renders the same
 * component.
 *
 * WHAT STAYS AT THE CALL SITE: which sections. The storefront falls back to
 * draft sections so an owner who has never published still sees their work; a
 * public Site must not. That difference is deliberate and belongs to the route
 * that knows about it.
 */

import { SiteIntro } from "./site-intro"
import { SITE_COOKIE_TEXT } from "@/lib/consent/copy"
import { setSiteConsentTheme } from "@/lib/consent/site-theme"
import { StorefrontProvider, useAmountMoney, type Storefront } from "./storefront-context"
import { ReturnFacts, useShopCommerce } from "./shop-commerce"
import { freeShippingLine, siteCommerce } from "@/lib/website-builder/site-commerce"
import { SectionSandboxProvider } from "../sections/section-sandbox"
import { SiteCartProvider, useSiteCart } from "../site-cart"
import { SiteWishlistProvider } from "../site-wishlist"
import { CartNotice } from "./cart-notice"
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { preconnect, preload } from "react-dom"
import { announcementMessages, announcementSeconds } from "@/lib/website-builder/announcement"
import { cn } from "@/lib/utils"

import { THEME_ROOT_ATTRIBUTE, themeCartType, themeCustomCss, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { fontStylesheetHref, sectionFamilies } from "@/lib/website-builder/font-link"
import { siteDirection, siteLanguage } from "@/lib/website-builder/site-language"
import { dirOf } from "@/lib/markets/locales"
import { LanguageSwitch } from "./language-switch"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import SectionRenderer from "../sections/SectionRenderer"
import { useSiteMotion } from "./use-site-motion"
import { splitGroups } from "@/lib/storelib-theme/section-groups"

export type SectionRole = "header" | "body" | "footer" | "overlay"

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback
}

/**
 * Does the header sit against the very top of the page, or is there chrome
 * above it?
 *
 * The editor asks so it knows whether to round the corners of a selected
 * header's outline: the canvas card is rounded, and a ring that curves where
 * the page does not is a curve around nothing. It lives HERE because the
 * chrome does. Working it out from theme flags at the call site is exactly
 * how the announcement bar came to be implemented four times over.
 *
 * It cannot see a bar the visitor has dismissed, which is client state inside
 * the bar itself. That errs towards a square ring on a page whose bar has
 * been closed, and a square ring is the harmless way to be wrong.
 */
/**
 * ===========================================================================
 *  THE PAGE REACHES THE BOTTOM OF WHATEVER IT IS DRAWN IN
 * ===========================================================================
 * A page shorter than the space it is given used to stop where its content
 * stopped, and whatever was behind it showed below. In the builder that is
 * the canvas card, which is white — measured at 338px of white under a 362px
 * page in a 700px card, by scripts/check-short-page.mjs. So the tail of every
 * short page was a colour the published site never shows there, and on an
 * empty page it was most of the screen.
 *
 * The page is a column that fills its container, so the background it paints
 * is its own, all the way down. Two containers, because there are two:
 *
 *   IN THE BUILDER the container is the canvas card, a flex column of a
 *   definite height, so the page grows as a flex item. A percentage height
 *   was tried first and does nothing there, because a percentage needs a
 *   parent whose height is definite and the canvas wrapper's is not.
 *
 *   PUBLISHED the container is the document, so it is the viewport. `dvh`
 *   rather than `vh` because a phone's toolbars move and `vh` leaves a band
 *   the colour of the browser under the footer as they do.
 *
 * The footer is still the last thing on the page. What grows is the empty
 * placeholder, and only when a page is empty — a page with sections keeps
 * natural flow, which is the rule the body deliberately kept: a short page is
 * short, and the space after it is the site's own background rather than a
 * filler wedged between the last section and the footer.
 */
function pageFill(inEditor: boolean): CSSProperties {
  return inEditor
    ? { display: "flex", flexDirection: "column", flex: "1 1 auto" }
    : { display: "flex", flexDirection: "column", minHeight: "100dvh" }
}

export function headerTouchesTop(theme: ThemeSettingsValues): boolean {
  const t = theme as Record<string, unknown>
  const announcement = t.announcement_bar_enabled === true && announcementMessages(t).length > 0
  const freeShipping =
    t.free_shipping_bar === true && typeof t.free_shipping_threshold === "number" && t.free_shipping_threshold > 0
  return !announcement && !freeShipping
}

// ── The announcement bar ────────────────────────────────────────────────────

/**
 * Four of its eight controls did nothing on every surface: the link, the link
 * text, "scrolling", and "dismissible". The bar is a client component because
 * two of those need state — dismissal has to be remembered, or a visitor
 * closes the same bar on every page they open.
 */
function AnnouncementBar({ theme }: { theme: ThemeSettingsValues }) {
  const t = theme as Record<string, unknown>
  /*
    ONE MESSAGE OR SEVERAL. Theme settings › Announcement bar › More
    messages adds lines that take turns with the first
    (lib/website-builder/announcement.ts). With one, nothing below differs
    from the bar every site already had, dismissal key included.
  */
  const messages = announcementMessages(t)
  const text = messages.length > 1 ? messages.join("\n") : (messages[0] ?? "")
  const dismissible = t.announcement_bar_dismissible === true
  const [dismissed, setDismissed] = useState(false)
  const scrolling = t.announcement_bar_scrolling === true
  const rotating = messages.length > 1 && !scrolling
  const seconds = announcementSeconds(t)
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!dismissible) return
    try {
      // Keyed by the text: a NEW announcement is a new announcement, and
      // should not stay hidden because somebody dismissed the last one.
      if (window.localStorage.getItem(`storelib:announcement:${text}`) === "1") setDismissed(true)
    } catch {
      // Storage blocked. The bar shows, which is the safe way to be wrong.
    }
  }, [dismissible, text])

  /*
    TAKING TURNS, ONLY WHILE SOMEBODY COULD BE READING IT. The timer does
    nothing while the bar is off screen or the tab is hidden, stops while
    the pointer or the keyboard is on the bar, and never starts for a
    visitor who asked their device for less motion: they get the arrows.
    The change itself is opacity and a 6px lift, on the compositor, and the
    messages share one grid cell so the bar never changes height.
  */
  useEffect(() => {
    if (!rotating || held || dismissed) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    let onScreen = true
    const el = barRef.current
    const io = el && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting })
      : null
    if (io && el) io.observe(el)
    const id = window.setInterval(() => {
      if (!onScreen || document.hidden) return
      setIndex((i) => (i + 1) % messages.length)
    }, seconds * 1000)
    return () => {
      window.clearInterval(id)
      io?.disconnect()
    }
  }, [rotating, held, dismissed, seconds, messages.length])

  if (!t.announcement_bar_enabled || !text || dismissed) return null

  const linkText = str(t.announcement_bar_link_text)
  const linkUrl = str(t.announcement_bar_link_url, "#")

  const link = !!linkText && (
    <a href={linkUrl} className="ml-2 underline underline-offset-2 font-semibold">
      {linkText}
    </a>
  )
  const body = (
    <>
      <span>{messages.join("   ·   ")}</span>
      {link}
    </>
  )
  const shown = index % Math.max(1, messages.length)
  const step = (d: number) => setIndex((i) => (i + d + messages.length) % messages.length)
  const arrow = (d: number) => (
    <button
      type="button"
      aria-label={d < 0 ? "Previous message" : "Next message"}
      onClick={() => step(d)}
      className="absolute top-0 bottom-0 flex w-9 items-center justify-center opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      style={d < 0 ? { left: 0 } : { right: dismissible ? 28 : 0 }}
    >
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d < 0 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  )

  return (
    <div
      ref={barRef}
      className={cn("relative w-full overflow-hidden py-2 text-center text-sm font-medium", rotating && "max-sm:min-h-[44px] max-sm:py-3")}
      style={{
        background: str(t.announcement_bar_bg, "#6366f1"),
        color: str(t.announcement_bar_color, "#ffffff"),
      }}
      onPointerEnter={rotating ? () => setHeld(true) : undefined}
      onPointerLeave={rotating ? () => setHeld(false) : undefined}
      onFocusCapture={rotating ? () => setHeld(true) : undefined}
      onBlurCapture={rotating ? () => setHeld(false) : undefined}
    >
      {scrolling ? (
        <>
          <style>{`@keyframes storelibAnnouncementScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
          {/*
            The content is rendered TWICE and moved by exactly half the width,
            so the loop lands on an identical frame instead of snapping back.
          */}
          <div
            className="flex w-max gap-16 whitespace-nowrap motion-reduce:animate-none"
            style={{ animation: "storelibAnnouncementScroll 24s linear infinite" }}
          >
            <span className="flex items-center">{body}</span>
            <span className="flex items-center" aria-hidden="true">
              {body}
            </span>
          </div>
        </>
      ) : rotating ? (
        <>
          <div className="grid px-10" aria-roledescription="announcements">
            {messages.map((m, i) => (
              <p
                key={i}
                aria-hidden={i !== shown}
                className="col-start-1 row-start-1 m-0 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none"
                style={{
                  opacity: i === shown ? 1 : 0,
                  transform: i === shown ? "translateY(0)" : "translateY(6px)",
                  pointerEvents: i === shown ? "auto" : "none",
                }}
              >
                <span>{m}</span>
                {link}
              </p>
            ))}
          </div>
          {arrow(-1)}
          {arrow(1)}
        </>
      ) : (
        <div className="px-10">
          <span>{messages[0]}</span>
          {link}
        </div>
      )}
      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss"
          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 transition-opacity hover:opacity-100"
          onClick={() => {
            setDismissed(true)
            try {
              window.localStorage.setItem(`storelib:announcement:${text}`, "1")
            } catch {
              // The close still works for this page view.
            }
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── The free shipping bar ───────────────────────────────────────────────────

/**
 * "Show free shipping progress bar" and the threshold behind it were two more
 * controls read by nothing. A creator setting a $75 threshold got no bar and
 * no mention of it anywhere on their site.
 *
 * It reads the site's own cart (../site-cart), which wraps the page, so it
 * says how much further somebody has to go rather than only stating the
 * rule. It listened for a `storelib:cart-count` event once, which nothing
 * sent, so the bar said "Spend $75 more" over a full basket.
 */
function FreeShippingBar({ theme }: { theme: ThemeSettingsValues }) {
  const c = siteCommerce(theme as Record<string, unknown>)
  const subtotalCents = useSiteCart().subtotalCents
  /* No amount typed: where the shop's own rates make shipping free (Settings › Shipping and delivery), so the banner and the checkout agree. */
  const facts = useShopCommerce(c.freeShippingBar && c.freeShippingAmount === null)
  const fromCents = c.freeShippingAmount !== null ? Math.round(c.freeShippingAmount * 100) : (facts?.freeShippingFromCents ?? null)
  /* The amount left in the visitor's market's currency when the page shows one, at the rate as checkout converts shipping, else the store's own. */
  const money = useAmountMoney()
  const said = c.freeShippingBar ? freeShippingLine(subtotalCents, fromCents, money) : null

  if (!said) return null
  const progress = said.progress

  return (
    <div
      className="w-full px-4 py-2 text-center text-[13px]"
      style={{ background: "var(--theme-surface)", color: "var(--theme-text-secondary)" }}
      data-free-shipping-bar=""
    >
      <span>{said.text}</span>
      <span
        aria-hidden="true"
        className="mx-auto mt-1.5 block h-1 max-w-xs overflow-hidden rounded-full"
        style={{ background: "var(--theme-border)" }}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${progress * 100}%`, background: "var(--theme-primary)" }}
        />
      </span>
    </div>
  )
}

// ── The cookie banner ───────────────────────────────────────────────────────

/**
 * THE SITE'S WORDS AND COLOURS FOR THE ONE COOKIE BANNER.
 *
 * This drew a second banner of its own, which stored an answer nothing read,
 * under the platform banner that also asked. Now there is one banner and one
 * record (components/cookie-consent-banner.tsx, lib/consent): with "Use my
 * own cookie banner" on, it speaks with this site's text and colours.
 */
function SiteCookieStyle({ theme }: { theme: ThemeSettingsValues }) {
  const t = theme as Record<string, unknown>
  /* On unless the creator switched it off: Website Settings › Policies. */
  const hidden = t.cookie_banner_show === false
  /* The site's own words always, its own starting sentence when it has none. */
  const text = str(t.cookie_banner_text, "")
  const accept = str(t.cookie_accept_text, "")
  const decline = str(t.cookie_decline_text, "")
  /* Colours only when "Use my own colours" is on: an unset one is Storelib's
     own banner, not a navy panel the creator never chose. */
  const ownColours = Boolean(t.cookie_banner_enabled)
  const bg = ownColours ? str(t.cookie_bg, "") : ""
  const color = ownColours ? str(t.cookie_text_color, "") : ""
  const accent = str(t.primary_color, "#6366f1")
  useEffect(() => {
    setSiteConsentTheme({
      hidden,
      /* Rich text in the setting; the banner shows it as words. */
      text: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || SITE_COOKIE_TEXT,
      acceptText: accept || undefined,
      declineText: decline || undefined,
      background: bg || undefined,
      color: bg ? color || undefined : undefined,
      accent: ownColours ? accent : undefined,
    })
    return () => setSiteConsentTheme(null)
  }, [hidden, text, accept, decline, bg, color, accent, ownColours])
  return null
}

// ── The page ────────────────────────────────────────────────────────────────

export function ThemePage({
  storefront,
  theme,
  chromeTheme,
  sections,
  renderSection,
  renderGap,
  emptyTitle = "This website is being set up",
  emptyDetail = "Check back soon.",
  className,
  style,
  children,
}: {
  theme: ThemeSettingsValues
  /**
   * The theme the bars above the header are drawn with, when it is not
   * `theme`: the editor keeps `theme` the committed one (a value under a
   * finger restyles the sections on screen by hand), and the announcement
   * and free shipping bars, which are drawn here and are no section, never
   * saw a colour or a text moving until the finger lifted (round 35). They
   * are two small components; drawing them with each value costs nothing.
   */
  chromeTheme?: ThemeSettingsValues
  sections: SectionInstance[]
  /**
   * Whose site this is. The two sections that send something somewhere, the
   * newsletter and the contact form, need it; everything else ignores it.
   * Absent in the editor's canvas, which is how those sections know not to
   * send anything while somebody is designing the page.
   */
  storefront?: Storefront
  /**
   * How to render one section. The published routes leave this out and get the
   * plain renderer; the editor passes its own so it can add selection,
   * hovering and the device mode — WITHOUT taking over ordering or chrome,
   * which is where the four copies drifted apart.
   */
  /**
   * `atTop` is true only for a header with no chrome drawn above it. The
   * editor uses it for the selected section's outline; every other caller
   * ignores it.
   */
  renderSection?: (section: SectionInstance, role: SectionRole, atTop: boolean, pageIndex?: number) => ReactNode
  /**
   * What to draw in the gaps BETWEEN body sections, and after the last one.
   *
   * The editor uses it for the strip you hover to insert a section there. It
   * lives here rather than in the editor's `renderSection` for the same
   * reason that one does not do its own ordering: the index a new section
   * would land at is a fact about the order, and the order is this file's.
   * An editor computing it from its own copy of the list is how the four
   * renderers drifted apart in the first place.
   *
   * `at` counts body sections: 0 is above the first, `body.length` below the
   * last. The published routes leave this out and get nothing.
   */
  renderGap?: (at: number) => ReactNode
  emptyTitle?: string
  emptyDetail?: string
  className?: string
  style?: CSSProperties
  /** Anything the surface puts inside the page — the editor's skeletons. */
  children?: ReactNode
}) {
  /**
   * HEADER FIRST, FOOTER LAST, whatever order they were saved in. A header is
   * chrome, not content: an editor that lets you drag it into the middle of
   * the page should not produce a page with a navigation bar halfway down it.
   *
   * By GROUP, not by type: the Header group is the header and whatever was
   * placed above or below it (an announcement bar, a marquee, a header
   * written as a section file), and the Footer group likewise
   * (lib/storelib-theme/section-groups.ts).
   */
  const { header: headers, footer: footers, template: body, overlay: overlays } = splitGroups(sections)

  const render =
    renderSection ??
    ((section: SectionInstance, _role: SectionRole, _atTop: boolean, pageIndex?: number) => (
      /**
       * A STABLE ID PER SECTION, so `/#section-<id>` reaches it. The published
       * page had none at all — only the editor put ids on its sections — so a
       * menu item pointing at a section on the same page had nothing to scroll
       * to.
       */
      <SectionRenderer
        key={section.id}
        wrapperId={`section-${section.id}`}
        section={section}
        theme={theme}
        pageIndex={pageIndex}
      />
    ))

  /**
   * LINKS TO A SECTION SCROLL TO IT, AND SECTIONS ARRIVE AS THEY COME INTO
   * VIEW, here and therefore everywhere this page is drawn: the canvas and
   * every published route alike. See lib/website-builder/section-motion.ts.
   */
  const rootRef = useRef<HTMLDivElement | null>(null)
  useSiteMotion(rootRef, theme, sections, storefront?.inEditor === true)
  /* The page's language and its direction (right to left for Arabic, Hebrew, Persian, Urdu: lib/markets/locales dirOf). */
  const pageLang = storefront?.language?.code ?? siteLanguage(theme as Record<string, unknown>)
  const pageDir = storefront?.language ? dirOf(storefront.language.code) : siteDirection(theme as Record<string, unknown>)
  /*
    ON THE WHOLE DOCUMENT, on a live page: the cart drawer, the phone menu
    and search are drawn at the end of <body>, outside the theme root, and
    read their direction from <html>, which said lang="en" and nothing else.
    Never in the editor, whose document is the editor's.
  */
  useEffect(() => {
    if (storefront?.inEditor || typeof document === "undefined") return
    const html = document.documentElement
    const before = { lang: html.getAttribute("lang"), dir: html.getAttribute("dir") }
    if (pageLang) html.setAttribute("lang", pageLang)
    html.setAttribute("dir", pageDir ?? "ltr")
    return () => {
      if (before.lang === null) html.removeAttribute("lang")
      else html.setAttribute("lang", before.lang)
      if (before.dir === null) html.removeAttribute("dir")
      else html.setAttribute("dir", before.dir)
    }
  }, [pageLang, pageDir, storefront?.inEditor])

  const fontHref = fontStylesheetHref(theme as unknown as Record<string, unknown>, sectionFamilies(sections))
  /*
    THE FONTS ARE ASKED FOR FROM THE HEAD. The stylesheet below is drawn where
    the page starts, so the browser only met it, then its font files on
    another host, after reading that far. React writes these into the
    document's <head> on the server: the two hosts are connected to and the
    stylesheet fetched while the rest of the page is still arriving. The
    stylesheet itself says display=swap (font-link.ts): text shows in the
    fallback face at once, never invisible.
  */
  if (fontHref) {
    preconnect("https://fonts.googleapis.com")
    preconnect("https://fonts.gstatic.com", { crossOrigin: "anonymous" })
    preload(fontHref, { as: "style" })
  }
  /**
   * The theme's stylesheet, built and handed to React once per theme. Inline,
   * it was rebuilt on every render and, because React 19 compares the prop
   * object rather than the string, written into the <style> again each time:
   * a re-parse of the whole theme and a style recalculation of the page, on
   * every keystroke in the builder. See ../sections/stable-html.
   */
  /*
    BY ITS TEXT, NOT BY THE THEME OBJECT. In the builder a colour or a slider
    under a finger is a new theme object on every move, and the stylesheet
    reads nearly everything through the theme's CSS variables, so its text
    almost never changes. Keyed on the object, the <style> was written again
    on each move all the same, and the browser parsed it and restyled the
    whole page for nothing (scripts/check-editor-live-edit.mjs).
  */
  const themeCssText = useMemo(() => themeStylesheet(theme), [theme])
  const themeCss = useMemo(() => ({ __html: themeCssText }), [themeCssText])
  /* Theme settings › Custom CSS, cleaned and scoped (lib/storelib-theme/custom-css.ts). Null when there is none. */
  const customCssText = useMemo(() => themeCustomCss(theme), [theme])
  const customCss = useMemo(() => (customCssText ? { __html: customCssText } : null), [customCssText])
  const pageColor = typeof (theme as Record<string, unknown>).background_color === "string" ? String((theme as Record<string, unknown>).background_color).trim() : ""
  const documentBackground = useMemo(
    () =>
      storefront?.inEditor !== true && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s]+\)|[a-z]+)$/i.test(pageColor)
        ? { __html: `html,body{background-color:${pageColor};}` }
        : null,
    [storefront?.inEditor, pageColor],
  )

  /* Website settings › Commerce, read once from the theme and handed to every section (lib/website-builder/site-commerce.ts). */
  /*
    By what Commerce says, not by the theme object: every section that reads
    the storefront renders again when this value changes, past its memo, so a
    colour dragged in the builder rendered every section on the page on every
    move, whatever it had to do with them (scripts/check-editor-live-edit.mjs).
  */
  const commerceKey = JSON.stringify(siteCommerce(theme as Record<string, unknown>))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const storefrontValue = useMemo(() => ({ ...(storefront ?? {}), commerce: siteCommerce(theme as Record<string, unknown>) }), [storefront, commerceKey])

  return (
    <StorefrontProvider value={storefrontValue}>
    {/*
      One sandbox for the page, created only if a section on it has a
      script. See components/website-builder/sections/section-sandbox.tsx
      for why a section's code does not run in this document.
    */}
    <SectionSandboxProvider inEditor={storefront?.inEditor === true}>
    {/*
      THE CART WRAPS THE WHOLE PAGE, not the header, because both ends of it
      are on the page: the bag and its drawer are in the header, and the Add
      to cart buttons are in the sections below. Keyed by the creator rather
      than by the site's name so renaming a shop does not empty a visitor's
      basket, and absent in the editor's canvas, where the cart is memory
      only and nothing is written to the browser.
    */}
    <SiteCartProvider shopId={storefront?.inEditor ? undefined : storefront?.creatorId} cartType={themeCartType(theme)} currency={storefront?.currency}>
    {/*
      THE SAVED LIST, beside the cart and for the same reason: the heart in
      the header and the hearts on the products are both on the page. Keyed
      by the creator, memory only in the canvas. See ../site-wishlist.
    */}
    <SiteWishlistProvider shopId={storefront?.inEditor ? undefined : storefront?.creatorId}>
    <div
      ref={rootRef}
      {...{ [THEME_ROOT_ATTRIBUTE]: "" }}
      /* Theme settings › Cart › Cart type, where the cart and Add to cart read it. */
      data-cart-type={themeCartType(theme)}
      /* Website Settings › General › Language. Absent until one is chosen,
         so the document's own `lang` stands. */
      lang={pageLang}
      dir={pageDir}
      className={className}
      /*
        A WIDTH CONTAINER, on the live page and in the canvas alike. The
        theme's tablet and phone sizes are container queries, and every body
        section has a box of its own to answer them; the header has none,
        because a box around it would stop it sticking. So in the canvas the
        header answered to the canvas frame, and on the live site to nothing
        at all: a phone preview showed the header's phone sizes, and a phone
        never did. It answers to the page now, on both.
      */
      style={{ ...(themeVars(theme) as CSSProperties), containerType: "inline-size", ...pageFill(storefront?.inEditor === true), ...style }}
    >
      {/*
        The theme's own rules, scoped to this root. Inline rather than in a
        stylesheet because they are per-install: two creators' pages can be
        open in the same document — the editor canvas is one — and a global
        rule would leak from one to the other.
      */}
      <style dangerouslySetInnerHTML={themeCss} />
      {/*
        THE DOCUMENT IS THE PAGE'S COLOUR TOO, on the live site. Only the
        theme root was painted; <html> and <body> stayed white, so a phone's
        overscroll bounce and its safe areas showed white around a dark site.
        Not in the canvas, whose document is the editor's.
      */}
      {documentBackground ? <style dangerouslySetInnerHTML={documentBackground} /> : null}
      {/*
        Theme settings › Animations: the intro screen and the page
        transition. A live page only, so never over the builder's canvas or
        in the cover screenshot (which has no creator). See ./site-intro.
      */}
      {storefront?.creatorId && storefront.inEditor !== true ? (
        <SiteIntro theme={theme} siteKey={storefront.installId ?? storefront.creatorId} />
      ) : null}
      {/* The families the stylesheet above names. Without this they were
          names only: see lib/website-builder/font-link.ts. */}
      {fontHref && <link rel="stylesheet" href={fontHref} />}

      <AnnouncementBar theme={chromeTheme ?? theme} />
      <FreeShippingBar theme={chromeTheme ?? theme} />

      {headers.map((section, i) => render(section, "header", i === 0 && headerTouchesTop(theme)))}

      {/*
        THE HEADER IS ALWAYS THE TOP OF THE PAGE.

        `children` used to render above it. The editor passes its "Empty page,
        add a section" placeholder through here, so an empty page drew the
        placeholder first and the site's own header BELOW it — which is not
        what the page looks like, and is the one moment somebody is deciding
        what the page should be.

        It belongs where the body belongs: after the header, before the
        footer. On a page with sections it is nothing, so this changes only
        the empty case, which is the case it exists for.
      */}
      {children}

      {/*
        No `flex-1` filler between the body and the footer. It was tried and it
        produces a visible gap on a short page — the footer pushed to the
        bottom of the viewport with nothing between it and the last section.
        Natural flow leaves a short page short, which is correct.
      */}
      {body.map((section, i) => (
        <Fragment key={`slot-${section.id}`}>
          {renderGap?.(i)}
          {render(section, "body", false, i)}
        </Fragment>
      ))}
      {/* And below the last one, so a page can be added to at the end. */}
      {body.length > 0 && renderGap?.(body.length)}
      {/* The refund policy says what the store's return settings say today (./shop-commerce). */}
      {storefront?.pageKey === "refund-policy" && storefront.inEditor !== true ? <ReturnFacts /> : null}

      {sections.length === 0 && (
        <div className="flex flex-1 min-h-[50vh] items-center justify-center">
          <div className="text-center text-gray-400">
            <p className="text-lg font-medium">{emptyTitle}</p>
            <p className="mt-1 text-sm">{emptyDetail}</p>
          </div>
        </div>
      )}

      {footers.map((section) => render(section, "footer", false))}
      {/* The website's other languages, under its footer (./language-switch). */}
      {/* In the builder's canvas too, as the website draws it, where a choice changes the preview (storefront.preview). */}
      {storefront?.language && (!storefront.inEditor || storefront.preview) ? <LanguageSwitch choice={storefront.language} preview={storefront.inEditor ? storefront.preview : undefined} /> : null}
      {/* The Overlay group: what floats over every page (a popup, a bar fixed to the bottom of a phone), after everything it floats over. */}
      {overlays.map((section) => render(section, "overlay", false))}

      <SiteCookieStyle theme={theme} />
      {/* Cart type Notification: what Add to cart just added (./cart-notice). */}
      <CartNotice />

      {/* After every section, so the creator's own rules win a tie with a section's. */}
      {customCss ? <style data-storelib-custom-css="" dangerouslySetInnerHTML={customCss} /> : null}
    </div>
    </SiteWishlistProvider>
    </SiteCartProvider>
    </SectionSandboxProvider>
    </StorefrontProvider>
  )
}

export default ThemePage
