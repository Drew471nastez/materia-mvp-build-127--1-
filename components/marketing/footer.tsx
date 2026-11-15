"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useState, useEffect, type JSX, type MouseEvent, type ReactNode } from "react"
import { useLocale } from "@/components/locale-provider"
import { openCookiePreferences } from "@/lib/consent/client"
import { isNativeApp } from "@/lib/platform-utils"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { publicHelpUrl } from "@/lib/help/paths"
import { SELL_PAGES, useCasePath } from "@/lib/marketing/sell-links"
import { STORELIB_SOCIAL, type StorelibSocialNetwork } from "@/lib/seo/storelib-social"

// Social media icons
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  )
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}


/*
  STORELIB'S PROFILES, ONLY THE CONFIRMED ONES (lib/seo/storelib-social
  STORELIB_SOCIAL, the same list as the Organization's sameAs). The icons
  used to link to bare facebook.com, instagram.com and so on, which are not
  Storelib. A network with no confirmed profile draws no icon; with none,
  the row is not drawn. How to add one is written beside the list.
*/
const SOCIAL_ICONS: Record<StorelibSocialNetwork, { label: string; Icon: (p: { className?: string }) => JSX.Element }> = {
  facebook: { label: "Storelib on Facebook", Icon: FacebookIcon },
  instagram: { label: "Storelib on Instagram", Icon: InstagramIcon },
  x: { label: "Storelib on X", Icon: XIcon },
  tiktok: { label: "Storelib on TikTok", Icon: TikTokIcon },
  youtube: { label: "Storelib on YouTube", Icon: YouTubeIcon },
}
const SOCIAL = STORELIB_SOCIAL.filter((p) => /^https:\/\//.test(p.url) && p.network in SOCIAL_ICONS).map((p) => ({ href: p.url, ...SOCIAL_ICONS[p.network] }))

/* Round 3: the same links as before, in four columns after the large commerce sites' footers (the owner's picture). */
const PRODUCT = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/alternatives" },
  { label: "Sign In", href: "/login" },
]

const RESOURCES = [
  { label: "Discover", href: "/explore" },
  { label: "Blog", href: "/blog" },
  { label: "Developers", href: "/developers" },
]

/*
  The /sell/<use case> pages (lib/marketing/sell-links), so every one is a
  link on every marketing page. One behind a platform switch (communities)
  is linked from the pages that know the switch (/features, /alternatives)
  instead: this footer is drawn in the browser and cannot ask.
*/
const SELL = SELL_PAGES.filter((u) => !("flag" in u)).map((u) => ({ label: u.nav, href: useCasePath(u.slug) }))

const SUPPORT = [
  /* The Help Center's own address: storelib.com/help is a 308 to it, a hop on every page's footer link. */
  { label: "Help", href: publicHelpUrl() },
  { label: "FAQ", href: "/faq" },
  /* There is no affiliate page yet; asking by email is the real way in. */
  { label: "Affiliate Program", href: "mailto:team@storelib.com?subject=Affiliate%20Program" },
  { label: "Contact us", href: "mailto:team@storelib.com" },
]

/* The legal row along the bottom, with Cookie Preferences beside them. */
const LEGAL = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
]

const linkClass = "block text-left text-[15px] leading-6 text-white/60 transition-colors duration-150 hover:text-white"
const legalClass = "text-[14px] leading-6 text-white/60 transition-colors duration-150 hover:text-white"

/*
  THE APP. The App Store page is the one the rest of the site uses
  (lib/communities/setup-checklist appStoreUrl, read the same way here so the
  footer does not carry that module): NEXT_PUBLIC_IOS_APP_STORE_ID, or a full
  NEXT_PUBLIC_IOS_APP_STORE_URL. Google Play is not live yet: its badge is
  drawn greyed, marked Coming soon, and is not a link.
*/
const IOS_ID = (process.env.NEXT_PUBLIC_IOS_APP_STORE_ID || "").trim()
const IOS_URL_ENV = (process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || "").trim()
/* TODO(owner): set NEXT_PUBLIC_IOS_APP_STORE_ID on Vercel; until then the badge points nowhere ("#"). */
export const APP_STORE_HREF = /^\d+$/.test(IOS_ID) ? `https://apps.apple.com/app/id${IOS_ID}` : /^https:\/\//.test(IOS_URL_ENV) ? IOS_URL_ENV : "#"

/* Apple's mark (Simple Icons, CC0), in the black badge Apple's guidelines describe: white mark and words, a grey hairline. */
const APPLE_PATH =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
const PLAY_PATH =
  "M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"

export function AppStoreBadge({ href = APP_STORE_HREF, className = "" }: { href?: string; className?: string }) {
  return (
    <a
      href={href}
      {...(href === "#" ? { onClick: (e: MouseEvent<HTMLAnchorElement>) => e.preventDefault() } : { target: "_blank", rel: "noopener" })}
      aria-label="Download on the App Store"
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-[9px] border border-[#a6a6a6] bg-black pl-2.5 pr-3.5 text-white transition-colors hover:border-white ${className}`}
      data-app-badge="ios"
    >
      <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="currentColor" aria-hidden="true">
        <path d={APPLE_PATH} />
      </svg>
      <span className="flex flex-col items-start leading-none" aria-hidden="true">
        <span className="text-[10px] font-medium tracking-[0.01em]">Download on the</span>
        <span className="mt-[2px] text-[19px] font-semibold tracking-[-0.02em]">App Store</span>
      </span>
    </a>
  )
}

export function GooglePlayBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Google Play: coming soon"
      className={`inline-flex h-11 shrink-0 cursor-default select-none items-center gap-2 rounded-[9px] border border-white/15 bg-white/[0.04] pl-2.5 pr-3.5 text-white/45 ${className}`}
      data-app-badge="android"
    >
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
        <path d={PLAY_PATH} />
      </svg>
      <span className="flex flex-col items-start leading-none" aria-hidden="true">
        <span className="text-[10px] font-medium uppercase tracking-[0.06em]">Coming soon</span>
        <span className="mt-[2px] text-[17px] font-semibold tracking-[-0.01em]">Google Play</span>
      </span>
    </span>
  )
}

/* The language picker the header opens (components/platform/language-modal), loaded only when asked for. */
const LanguageModal = dynamic(() => import("@/components/platform/language-modal").then((m) => m.LanguageModal), { ssr: false })

/* The locale, or English outside a LocaleProvider (a fixture or a probe); the hook's own hooks run either way, in the same order. */
function useLocaleOrNull() {
  try {
    return useLocale()
  } catch {
    return null
  }
}

function LanguageButton() {
  const locale = useLocaleOrNull()
  const language = locale?.language
  const languages = locale?.languages ?? []
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const current = languages.find((l) => l.code === language)?.label ?? "English"
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAsked(true)
          setOpen(true)
        }}
        className="-ml-1 inline-flex h-11 items-center gap-2 rounded-md px-1 text-[14px] text-white transition-colors hover:text-white/75"
        data-footer-language=""
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.25" />
          <path d="M2.75 12h18.5M12 2.75c2.6 2.6 3.9 5.68 3.9 9.25s-1.3 6.65-3.9 9.25c-2.6-2.6-3.9-5.68-3.9-9.25S9.4 5.35 12 2.75z" />
        </svg>
        <span className="sr-only">Language: </span>
        {current}
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {asked && locale ? <LanguageModal open={open} onOpenChange={setOpen} /> : null}
    </>
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h2 className="text-[17px] font-medium tracking-[-0.01em] text-white">{title}</h2>
      <div className="mt-5 space-y-3">{children}</div>
    </nav>
  )
}

/**
 * The storelib.com footer. Round 3, the owner's picture: black, the logo at
 * the left with the app badges under it, the links in four columns, a
 * hairline, then one row with the language, the legal links and Storelib's
 * profiles as round icons. The newsletter box is gone (the owner). Drawn on
 * every marketing page by ConditionalFooter.
 */
export function MarketingFooter() {
  const [logoHref, setLogoHref] = useState("/")

  useEffect(() => {
    if (isNativeApp()) setLogoHref("/explore")
  }, [])

  const year = new Date().getFullYear()

  return (
    <footer
      className="storelib-footer relative isolate overflow-hidden text-white"
      data-footer="storelib"
      style={{
        /* Extend dark bg into body's safe-area-inset-bottom padding so
           there is no white strip above the iOS home indicator */
        marginBottom: "calc(-1 * env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="relative mx-auto max-w-[1400px] px-5 pb-8 pt-14 sm:px-8 md:pt-20 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-3" data-footer-brand="">
            <Link href={logoHref} scroll={true} aria-label="Storelib" className="inline-flex items-center gap-3 transition-opacity hover:opacity-80">
              {/* Landing round 11, the owner: "the Storelib icon in the footer should not be outlined like that". The app icon itself, as everywhere else. */}
              <StorelibLogo size={40} />
              <span className="text-xl font-bold text-white">Storelib</span>
            </Link>
            {/* The app, under the logo: side by side on a phone, one under the other beside the columns. */}
            <div className="mt-7 flex flex-wrap items-center gap-3 lg:flex-col lg:items-start" data-footer-apps="">
              <AppStoreBadge />
              <GooglePlayBadge />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:col-span-9 lg:gap-x-10">
            <Column title="Product">
              {PRODUCT.map((l) => (
                <Link key={l.label} href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              ))}
            </Column>
            <Column title="Sell">
              {SELL.map((l) => (
                <Link key={l.href} href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              ))}
            </Column>
            <Column title="Resources">
              {RESOURCES.map((l) => (
                <Link key={l.label} href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              ))}
            </Column>
            <Column title="Support">
              {SUPPORT.map((l) =>
                l.href.startsWith("mailto:") ? (
                  <a key={l.label} href={l.href} className={linkClass}>
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.label} href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                ),
              )}
              {/* One of the Support links: the same class, so the same size,
                  colour, line height and left edge as the links above it. */}
              <button type="button" onClick={() => openCookiePreferences()} className={`${linkClass} cursor-pointer p-0`} data-cookie-preferences>
                Cookie Preferences
              </button>
            </Column>
          </div>
        </div>

        {/* Under the hairline: the language, the legal links, and Storelib's profiles at the right. One row on a computer, stacked on a phone. */}
        <div className="mt-14 flex flex-col gap-5 border-t border-white/[0.1] pt-7 md:flex-row md:items-center md:gap-10" data-footer-bottom="">
          <LanguageButton />
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-8 gap-y-2">
            {LEGAL.map((l) => (
              <Link key={l.href} href={l.href} className={legalClass}>
                {l.label}
              </Link>
            ))}
          </nav>
          {SOCIAL.length ? (
            <div className="flex items-center gap-3 md:ml-auto" data-storelib-social="">
              {SOCIAL.map(({ label, href, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="me noopener"
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-opacity hover:opacity-80"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          ) : null}
          <p className={`text-[13px] text-white/45 ${SOCIAL.length ? "" : "md:ml-auto"}`}>
            &copy; {year} Storelib Inc. All rights reserved.{" "}
            <a href="mailto:team@storelib.com" className="whitespace-nowrap transition-colors hover:text-white">
              team@storelib.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
