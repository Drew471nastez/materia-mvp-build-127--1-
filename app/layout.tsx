import type React from "react"
import type { Metadata, Viewport } from "next"
/**
 * ===========================================================================
 *  TWO FONTS THROUGH next/font, AND FIVE THROUGH A STYLESHEET
 * ===========================================================================
 *
 * `next/font/google` FETCHES FROM fonts.gstatic.com AT BUILD TIME, and a blip
 * there fails the whole build with
 *
 *   Module not found: Can't resolve '@vercel/turbopack-next/internal/font/…'
 *
 * This shipped six families, so every production build had six chances to die
 * on somebody else's network — and it took three of them in one afternoon,
 * each time on a different font, each time with a diff that had nothing to do
 * with typography. A failed build looks exactly like a change that was never
 * pushed, which is the worst way for this to fail.
 *
 * Inter stays: it IS the interface, it is what `font-sans` resolves to, and
 * self-hosting it is worth a build-time dependency.
 *
 * Roboto 500 is the second, by the owner's choice, for community card titles
 * only (one weight, see `communityTitle` below): small, and self hosted like
 * Inter so the strict CSP needs no new host.
 *
 * The other five — Plus Jakarta Sans, Space Grotesk, DM Sans, Poppins,
 * Montserrat — are used by NOTHING in the marketplace. They exist for the
 * OnePage builder's theme picker, which writes them as raw CSS family names
 * (`font_family: "'Poppins', sans-serif"`) rather than through the CSS
 * variables next/font provides. So they need the family to be AVAILABLE and do
 * not care where it came from, which makes them a runtime concern rather than
 * a build one.
 *
 * They load from a single stylesheet below, appended from script with the
 * media="print" trick so it is NOT render-blocking — see the long note beside
 * it. The cost is one request; what it buys is that Google being slow can
 * neither stop this product shipping nor hold its first paint hostage.
 */
import { Inter, Roboto } from "next/font/google"
import "./globals.css"
import { LocaleProvider } from "@/components/locale-provider"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { ViewportVars } from "@/components/viewport-vars"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import { NativeCookieKillSwitch } from "@/components/native-cookie-killswitch"
import { SWRProvider } from "@/lib/swr-config"
import { PrefetchLinks } from "@/components/shared/prefetch-links"
import NativeOAuthBridge from "@/app/NativeOAuthBridge"
import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"
import { StuckLayerGuard } from "@/components/platform/stuck-layer-guard"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { RotationGuard } from "@/components/platform/rotation-guard"
import { AppHistoryTracker } from "@/components/platform/app-history-tracker"
import { NativePushInit } from "@/components/native-push-init"
import { SWITCH_FIRST_PAINT_SCRIPT } from "@/lib/businesses/switch-screen"
import { EXPLORE_SCROLL_BOOT_SCRIPT } from "@/lib/explore/explore-scroll-boot"
import { ExploreMarketplaceRoot } from "@/components/platform/explore-marketplace-root"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"

// Primary font — loaded eagerly with display swap for fast text rendering
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
})

/*
  ROBOTO 500, FOR COMMUNITY CARD TITLES AND NOTHING ELSE. The owner set the
  title face of every community card (components/explore/community-card.tsx
  COMMUNITY_TITLE) to Roboto 500, 18px on a 24px line. One weight, Latin and
  Latin Extended (Romanian names need the second), self hosted by next/font
  under /_next/static/media, so the CSP's font-src 'self' already allows it
  and no page asks Google for anything. Not preloaded: a page without a
  community card never downloads it; a page with one fetches it with the
  card, and display swap keeps the name readable in the fallback meanwhile.
*/
const communityTitle = Roboto({
  weight: ["500"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-community-title",
  display: "swap",
  preload: false,
})

// Secondary fonts — used only in OnePage theme system.
// preload: false defers network requests until the font is actually referenced
// in CSS, keeping initial page load fast. display: swap prevents FOIT.





export const metadata: Metadata = {
  title: {
    default: "Storelib - Sell Products & Grow Your Audience",
    template: "%s | Storelib",
  },
  description: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience.",
  generator: "Storelib",
  keywords: ["sell digital products", "creator platform", "online courses", "digital downloads", "grow audience", "creator economy", "ecommerce platform", "online store"],
  authors: [{ name: "Storelib" }],
  creator: "Storelib",
  publisher: "Storelib",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://storelib.com",
    siteName: "Storelib",
    title: "Storelib - Sell Products & Grow Your Audience",
    description: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience.",
    images: [
      {
        url: storelibAssetUrl(STORELIB_OG_IMAGE),
        width: 1200,
        height: 630,
        alt: "Storelib - Sell Products & Grow Your Audience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib - Sell Products & Grow Your Audience",
    description: "The all-in-one ecommerce platform to sell digital products, build your online store & grow your audience.",
    images: [storelibAssetUrl(STORELIB_OG_IMAGE)],
  },
  metadataBase: new URL("https://storelib.com"),
}

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // `lang` must match DEFAULT_LANGUAGE (components/locale-provider.tsx) and
  // DEFAULT_LOCALE (lib/i18n/server.ts). LocaleProvider rewrites the attribute
  // on the client once a stored or detected choice resolves.
  /*
   * suppressHydrationWarning, on this element only (it does not reach the
   * children). The inline script below writes --vv-h, --vv-top, --kb-inset,
   * data-feed-view and the capacitor class onto <html> before React loads,
   * by design, so every page reported a hydration mismatch that was not one.
   */
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        {/* Synchronous native-app intercept — runs before React hydrates.
            1. Add the "capacitor" class to <html> immediately so all
               html.capacitor CSS rules (overscroll, touch-action, etc.) activate,
               and — in the same breath — send the native app off any marketing
               route to /native-start.

               THE SECOND HALF IS A BELT-AND-BRACES COPY OF THE SERVER GATE.
               proxy.ts already redirects these routes when the request carries
               "Capacitor" in its User-Agent, which is the right place to do it
               because nothing is rendered at all. But it depends on that header
               arriving: appendUserAgent is native-side config, and a response
               served from a cache never reaches the proxy to be redirected. If
               either of those fails, the fallback must not be "the app shows
               the marketing site".

               This runs in <head>, synchronously, before <body> paints — so
               there is no flash of the page it is navigating away from — and it
               uses the runtime Capacitor bridge rather than the UA string, so it
               holds even when the header does not. /native-start is deliberately
               not in the list, or this would loop.
               on the very first paint without waiting for NativeCookieKillSwitch.
            2. Legacy "/" redirect: the old shipped iOS app loads "/" — hide and
               redirect before any pixel paints.
            3. Feed view (grid | reels): resolved from localStorage BEFORE the
               first pixel, so the entry curtain is already the destination's
               colour. The server reads this from a cookie, but WKWebView drops
               JS-set cookies across app restarts — which is exactly why the app
               used to open on the grid and then jump to reels a second later.
               Re-writing the cookie here repairs it for every later request.
            4. Arriving from a switch of business: the screen the switch is
               showing is drawn by /app's own HTML, and a browser will paint
               this document before it has parsed that far — a white frame in
               the middle of the switch, measured. So before <body> is read
               at all, the canvas is made the screen's own surface and the
               browser is asked not to draw until the screen is there. It
               costs one regular expression over document.cookie on every
               other page, because the switch's cookie is only ever sent to
               /app. See lib/businesses/switch-screen.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var _ua=navigator.userAgent||'';if((window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||/StorelibApp|Capacitor/.test(_ua)){var h=document.documentElement;h.classList.add('capacitor');try{var _p=location.pathname;if(_p==='/'||/^\\/(pricing|features|faq|blog)(\\/|$)/.test(_p)){location.replace('/native-start')}}catch(e){}var _ow=window.open;window.open=function(u,t,f){if(u&&/stripe\\.com/.test(String(u)))return null;return _ow.apply(window,arguments)};}}catch(e){}try{var r=document.documentElement,vv=window.visualViewport;r.style.setProperty('--vv-h',Math.round(vv?vv.height:window.innerHeight)+'px');r.style.setProperty('--vv-top',Math.round(vv?vv.offsetTop:0)+'px');r.style.setProperty('--kb-inset',Math.max(0,Math.round(window.innerHeight-(vv?vv.offsetTop:0)-(vv?vv.height:window.innerHeight)))+'px')}catch(e){}try{var d=document.documentElement,v=localStorage.getItem('storelib_feed_view');if(v!=='reels'&&v!=='grid')v='grid';d.setAttribute('data-feed-view',v);d.style.setProperty('--feed-entry-bg',v==='reels'?'#000':'#fff');if(/(^|;\\s*)storelib_consent=2\\.p1/.test(document.cookie)&&document.cookie.indexOf('storelib_feed_view='+v)<0){document.cookie='storelib_feed_view='+v+'; path=/; max-age=31536000; samesite=lax'}}catch(e){}${SWITCH_FIRST_PAINT_SCRIPT}`,
          }}
        />
        {/* ═══════════════════════════════════════════════════════════════════
            THE FIVE BUILDER FAMILIES, LOADED SO THEY CANNOT BLANK THE PAGE
            ═══════════════════════════════════════════════════════════════════

            This was a plain <link rel="stylesheet"> to fonts.googleapis.com,
            and that is RENDER-BLOCKING: the browser will not paint a single
            pixel of the document until a cross-origin stylesheet in <head> has
            been fetched and parsed. On a slow connection — or any moment
            Google is slow from Romania — that is a WHITE SCREEN for the whole
            of it, followed by the entire page appearing at once. Which is
            exactly what "I refresh storelib.com and it's empty, then everything
            bumps in" describes.

            Blocking first paint on five families that NOTHING on the
            marketplace uses is the worst possible trade. So the sheet is
            appended from script with `media="print"` — a stylesheet that does
            not apply to the screen is not on the critical path — and flipped to
            `all` on load. Same one request, same families available to the
            OnePage builder a few milliseconds later, and the marketplace paints
            the instant its own CSS is ready.

            The preconnects stay: they cost nothing and they warm the socket the
            script is about to use. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var bf=document.createElement('link');bf.rel='stylesheet';bf.media='print';bf.onload=function(){this.onload=null;this.media='all'};bf.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Montserrat:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';document.head.appendChild(bf)}catch(e){}`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: EXPLORE_SCROLL_BOOT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${communityTitle.variable} font-sans antialiased bg-background text-foreground`}>
        <SWRProvider>
          <LocaleProvider>
            <ExploreMarketplaceRoot>{children}</ExploreMarketplaceRoot>
          </LocaleProvider>
        </SWRProvider>
        {/* ONE buyer-protection subpage for the whole application.
            
            The shield beside a price is on every surface that shows one — the
            feed, the listing, the wishlist, the swipe cards — and a grid of
            sixty cards must not mount sixty subpages to serve one tap. They all
            open this. It renders nothing until one of them does. */}
        <PrefetchLinks />
        <BodyScrollRestorer />
        {/* One publisher of the visible viewport, at the root, so a route's
            loading skeleton and the screen that replaces it are sized from the
            same number. See components/viewport-vars.tsx. */}
        <ViewportVars />
        <NativeCookieKillSwitch />
        <CapacitorBounceGuard />
        <StuckLayerGuard />
        <KeyboardGuard />
        <RotationGuard />
        <AppHistoryTracker />
        <NativePushInit /> 
        <CookieConsentBanner />
        {/*
          NativeOAuthBridge owns the appUrlOpen deep link on its own. It used to
          share it with NativeAuthHandler, and both handlers called
          exchangeCodeForSession() on the same callback — but an OAuth
          authorization code is single-use, so whichever one lost the race got
          "invalid flow state" back from Supabase for a sign-in that had in fact
          just succeeded, and sent the user to /login?error=oauth_failed. The
          bridge is also the only one of the two that finishes the job: it
          routes through /auth/sync-session so the WebView gets the cookies the
          server needs, handles the recovery and cold-start launch URLs, and
          holds a guard against re-entering itself.
        */}
        <NativeOAuthBridge />
      </body>
    </html>
  )
}
