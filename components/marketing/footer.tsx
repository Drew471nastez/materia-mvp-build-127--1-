"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useState, useEffect, type FormEvent, type JSX, type MouseEvent, type ReactNode } from "react"
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

const PRODUCT = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/explore" },
  { label: "Blog", href: "/blog" },
  { label: "Sign In", href: "/login" },
  { label: "Pricing", href: "/pricing" },
  { label: "Compare", href: "/alternatives" },
  { label: "Features", href: "/features" },
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

const linkClass = "block text-left text-[14px] leading-6 text-white/60 transition-colors duration-150 hover:text-white"
const legalClass = "text-[13px] leading-6 text-white/55 transition-colors duration-150 hover:text-white"

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
        className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-[14px] text-white/80 transition-colors hover:border-white/40 hover:text-white"
        data-footer-language=""
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.25" />
          <path d="M2.75 12h18.5M12 2.75c2.6 2.6 3.9 5.68 3.9 9.25s-1.3 6.65-3.9 9.25c-2.6-2.6-3.9-5.68-3.9-9.25S9.4 5.35 12 2.75z" />
        </svg>
        <span className="sr-only">Language: </span>
        {current}
      </button>
      {asked && locale ? <LanguageModal open={open} onOpenChange={setOpen} /> : null}
    </>
  )
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h2 className="text-[14px] font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-2.5">{children}</div>
    </nav>
  )
}

/**
 * The storelib.com footer (wave 12: dark, link groups in columns, the app,
 * the language, a legal row, after the large footers of the big commerce
 * sites). Drawn on every marketing page by ConditionalFooter. The sign-up is
 * real: it posts to /api/newsletter, which keeps the address with the time
 * and the wording agreed to.
 */
export function MarketingFooter() {
  const [logoHref, setLogoHref] = useState("/")
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNativeApp()) setLogoHref("/explore")
  }, [])

  const subscribe = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || state === "sending") return
    setState("sending")
    setError(null)
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(typeof data?.error === "string" ? data.error : "That did not go through. Try again in a moment.")
        setState("idle")
        return
      }
      setState("done")
    } catch {
      setError("No connection. Try again in a moment.")
      setState("idle")
    }
  }

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
          <div className="space-y-7 lg:col-span-4 lg:pr-8">
            <Link href={logoHref} scroll={true} className="inline-flex items-center gap-3 transition-opacity hover:opacity-80">
              <StorelibLogo size={40} />
              <span className="text-xl font-bold text-white">Storelib</span>
            </Link>
            <p className="max-w-[34ch] text-[15px] leading-relaxed text-white/60">
              The all-in-one platform for creators: your store, your page and your audience, in one place.
            </p>

            <div className="space-y-3">
              <h2 className="text-[14px] font-semibold text-white">Join Our Community!</h2>
              <p className="text-[14px] leading-relaxed text-white/55">Receive weekly assets and future templates for free by joining our community.</p>

              {state === "done" ? (
                <p className="flex h-12 items-center gap-2 text-sm text-emerald-400" role="status">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Thanks for subscribing!
                </p>
              ) : (
                <form onSubmit={subscribe} className="flex max-w-[440px] gap-2" noValidate>
                  <label htmlFor="footer-email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="footer-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    placeholder="Enter your email..."
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError(null)
                    }}
                    className="storelib-footer-field h-12 min-w-0 flex-1 rounded-xl px-4 text-[15px] text-white placeholder:text-white/35 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={state === "sending"}
                    className="storelib-footer-cta h-12 shrink-0 rounded-xl px-6 text-[15px] font-semibold text-white disabled:opacity-70"
                  >
                    {state === "sending" ? "Sending" : "Sign Up"}
                  </button>
                </form>
              )}
              {error ? (
                <p className="text-[13px] text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:col-span-8 lg:gap-x-10">
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

        {/* The app, the language and Storelib's profiles: one row on a computer, stacked on a phone. */}
        <div className="mt-14 flex flex-col gap-6 border-t border-white/[0.08] pt-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3" data-footer-apps="">
            <AppStoreBadge />
            <GooglePlayBadge />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <LanguageButton />
            {SOCIAL.length ? (
              <div className="flex items-center gap-1" data-storelib-social="">
                {SOCIAL.map(({ label, href, Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="me noopener"
                    aria-label={label}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-4 border-t border-white/[0.08] pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-[13px] text-white/45">
            &copy; {year} Storelib Inc. All rights reserved.{" "}
            <a href="mailto:team@storelib.com" className="whitespace-nowrap transition-colors hover:text-white">
              team@storelib.com
            </a>
          </p>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {LEGAL.map((l) => (
              <Link key={l.href} href={l.href} className={legalClass}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
