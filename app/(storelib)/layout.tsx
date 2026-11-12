import type React from "react"
import { APPEARANCE_BOOT, APP_FROM_DARK_BOOT } from "@/lib/appearance/site-appearance"
import { COOKIE_ASK_BOOT } from "@/lib/consent/early-ask"
import { SiteAppearance } from "@/components/platform/site-appearance"
import { AppRouterHandle } from "@/lib/navigation/app-router-handle"
import "../theme-dark.css"
import "../website-settings-light.css"
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
import "../globals.css"
import { LocaleProvider } from "@/components/locale-provider"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { ViewportVars } from "@/components/viewport-vars"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import { NativeCookieKillSwitch } from "@/components/native-cookie-killswitch"
import { SWRProvider } from "@/lib/swr-config"
import { PrefetchLinks } from "@/components/shared/prefetch-links"
import { WarmBehind } from "@/components/navigation/warm-behind"
import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"
import { ElasticOverscroll } from "@/components/ui/elastic-overscroll"
import { NavLanding } from "@/components/ui/nav-landing"
import { ArrivalNote } from "@/components/auth/arrival-note"
import { StuckLayerGuard } from "@/components/platform/stuck-layer-guard"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { RotationGuard } from "@/components/platform/rotation-guard"
import { AppHistoryTracker } from "@/components/platform/app-history-tracker"
import { NativeLinkGuard } from "@/components/platform/native-link-guard"
import { AppLinkOpener } from "@/components/platform/app-link-opener"
import { OpenInAppCard } from "@/components/platform/open-in-app-card"
import { NativePlaceKeeper } from "@/components/platform/native-place-keeper"
import { NativeChrome } from "@/components/platform/native-chrome"
/* Loaded on demand, and not at all on a creator's published website (components/platform/app-only.tsx). */
import { AccessSheet, AccountCommunityChrome, NativeOAuthBridge, NativePushInit, NotificationsAsk, SettingsSubpageHost } from "@/components/platform/app-only"
import { SWITCH_FIRST_PAINT_SCRIPT } from "@/lib/businesses/switch-screen"
import { EXPLORE_SCROLL_BOOT_SCRIPT } from "@/lib/explore/explore-scroll-boot"
import { IMAGE_FALLBACK_SCRIPT } from "@/lib/media/image-fallback"
import { ExploreMarketplaceRoot } from "@/components/platform/explore-marketplace-root"
import { PerfBeacon } from "@/components/perf/perf-beacon"
import { MissingImageGuard } from "@/components/media/missing-image"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { siteVerification } from "@/lib/seo/site-verification"
import { STORELIB_PAGE_LANG } from "@/lib/seo/page-language"
import { CapturePlatformTouch } from "@/components/attribution/capture-platform-touch"

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
  /* google-site-verification and msvalidate.01, only when GOOGLE_SITE_VERIFICATION or BING_SITE_VERIFICATION is set (lib/seo/site-verification.ts). */
  verification: siteVerification(),
}

export const viewport: Viewport = {
  /* The band's default, white like every Storelib header (app/globals.css --native-band). A dark page (/app) moves it after it commits (components/platform/native-chrome.tsx). It was black on every page, the black strip above a white header in a phone's browser. */
  themeColor: "#ffffff",
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
    <html lang={STORELIB_PAGE_LANG} className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
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
               /app. See lib/businesses/switch-screen.ts.
            5. The website builder's editor (round 12): the document's ground is
               the editor's own surround from the first frame, and the browser
               draws nothing until the editor's frame (its dark bar and its
               surround, components/website-builder/editor-frame.tsx) has been
               read. A white frame came first on every opening, measured
               (scripts/check-wb-first-paint-r12.mjs).
            0. Round AT: the OnePage editor's preview (/onepage-preview inside
               the editor's frame) is marked data-onepage-embedded first, and
               is never given the "capacitor" class. The frame sits under the
               editor's own bar, yet WebKit hands a frame the screen's insets:
               the status bar shield and the page's top bar padded by the notch
               drew a second band under the editor's (the owner's image 145).
               The page reads --op-safe-top (app/globals.css), 0 in the frame. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(window.self!==window.top&&/^\\/onepage-preview(\\/|$)/.test(location.pathname)){document.documentElement.setAttribute('data-onepage-embedded','')}}catch(e){}try{if(/^\\/app(\\/|$)/.test(location.pathname)){document.documentElement.classList.add('app-layout','app-arriving')}}catch(e){}try{var _ua=navigator.userAgent||'';if(((window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||/StorelibApp|Capacitor/.test(_ua))&&!document.documentElement.hasAttribute('data-onepage-embedded')){var h=document.documentElement;h.classList.add('capacitor');try{var _p=location.pathname;if(_p==='/'||/^\\/(pricing|features|faq|blog|alternatives)(\\/|$)/.test(_p)){location.replace('/native-start')}}catch(e){}var _ow=window.open;window.open=function(u,t,f){if(u&&/stripe\\.com/.test(String(u))){var s={closed:false,close:function(){s.closed=true},focus:function(){},blur:function(){},postMessage:function(){},location:{href:String(u)},opener:window};return s}return _ow.apply(window,arguments)};var _stay=function(u){return u&&/https?:\\/\\/(connect|js)\\.stripe\\.com\\//.test(String(u))};try{var _as=location.assign.bind(location);location.assign=function(u){if(_stay(u))return;return _as(u)}}catch(e){}try{var _rp=location.replace.bind(location);location.replace=function(u){if(_stay(u))return;return _rp(u)}}catch(e){}try{if(window.navigation)navigation.addEventListener('navigate',function(e){try{var u=e.destination&&e.destination.url;if(_stay(u)&&e.cancelable)e.preventDefault()}catch(err){}})}catch(e){}}}catch(e){}try{var r=document.documentElement,vv=window.visualViewport;r.style.setProperty('--vv-h',Math.round(vv?vv.height:window.innerHeight)+'px');r.style.setProperty('--vv-top',Math.round(vv?vv.offsetTop:0)+'px');r.style.setProperty('--kb-inset',Math.max(0,Math.round(window.innerHeight-(vv?vv.offsetTop:0)-(vv?vv.height:window.innerHeight)))+'px')}catch(e){}try{var d=document.documentElement,v=localStorage.getItem('storelib_feed_view');if(v!=='reels'&&v!=='grid')v='grid';d.setAttribute('data-feed-view',v);d.style.setProperty('--feed-entry-bg',v==='reels'?'#000':'#fff');if(/(^|;\\s*)storelib_consent=2\\.p1/.test(document.cookie)&&document.cookie.indexOf('storelib_feed_view='+v)<0){document.cookie='storelib_feed_view='+v+'; path=/; max-age=31536000; samesite=lax'}}catch(e){}try{if(/^\\/website-builder\\/|^\\/store\\/[^/]+\\/themes\\/[^/]+\\/editor(\\/|$)/.test(location.pathname)){var _wb=document.documentElement;_wb.style.backgroundColor='#eef1f5';var _wl=document.createElement('link');_wl.rel='expect';_wl.setAttribute('blocking','render');_wl.href='#wb-frame';document.head.appendChild(_wl)}}catch(e){}${SWITCH_FIRST_PAINT_SCRIPT}`,
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
        {/* Round AG: a picture that fails is tried another way, then hidden; never a broken icon (lib/media/image-fallback). */}
        <script dangerouslySetInnerHTML={{ __html: IMAGE_FALLBACK_SCRIPT }} />
        {/* The person's light or dark look on Storelib's own pages, before the first paint (lib/appearance/site-appearance.ts). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
        {/* The dashboard opened after a dark page starts under a veil of its header's colour, never on a light field (round 30). */}
        <script dangerouslySetInnerHTML={{ __html: APP_FROM_DARK_BOOT }} />
        {/* Whether the cookie card in the server's HTML may show before React has run (lib/consent/early-ask, round 48). */}
        <script dangerouslySetInnerHTML={{ __html: COOKIE_ASK_BOOT }} />
        {/* ONE PAGE INTO THE NEXT, INSIDE THE APP (app/globals.css, round 16): a page load between /app and the rest crossfades
            in the app; a browser keeps its plain load. Read before the first frame, as pagereveal must be heard. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var _sw=function(){var u=navigator.userAgent||'';return !!((window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||/StorelibApp|Capacitor/.test(u))};addEventListener('pageswap',function(e){if(e.viewTransition&&!_sw())e.viewTransition.skipTransition()});addEventListener('pagereveal',function(e){var t=e.viewTransition;if(!t)return;if(!_sw()||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)){t.skipTransition();return}var h=document.documentElement;h.setAttribute('data-page-swap','');t.finished.finally(function(){h.removeAttribute('data-page-swap')})})}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${communityTitle.variable} font-sans antialiased bg-background text-foreground`}>
        <SWRProvider>
          <LocaleProvider>
            {ExploreMarketplaceRoot({ children: <>
              {/* Community bar for /account, already mounted, so a tab to Profile does not paint the page and then the header.
                  Inside the providers: its account menu reads the locale, and outside LocaleProvider it threw and took /account down. */}
              <SiteAppearance />
              <AppRouterHandle />
              <AccountCommunityChrome />
              {children}
              {/* Settings over the profile on a phone, an iPad and in the apps: no address of its own. Inside the providers
                  (round 15): its Preferences tab reads the locale, and mounted outside LocaleProvider it threw "useLocale must be
                  used within LocaleProvider", which took the whole page to "Something went wrong on this page". */}
              <SettingsSubpageHost />
              {/* "Account created" or "Welcome back", once, on the page a sign in lands on (lib/auth/arrival.ts). */}
              <ArrivalNote />
              {/* Where a visit to storelib.com came from, kept for a Storelib account made later (lib/attribution/browser notePlatformVisit). */}
              <CapturePlatformTouch />
            </> })}
          </LocaleProvider>
        </SWRProvider>
        {/* ONE buyer-protection subpage for the whole application.
            
            The shield beside a price is on every surface that shows one — the
            feed, the listing, the wishlist, the swipe cards — and a grid of
            sixty cards must not mount sixty subpages to serve one tap. They all
            open this. It renders nothing until one of them does. */}
        <PrefetchLinks />
        <WarmBehind />
        <BodyScrollRestorer />
        {/* One publisher of the visible viewport, at the root, so a route's
            loading skeleton and the screen that replaces it are sized from the
            same number. See components/viewport-vars.tsx. */}
        <ViewportVars />
        {/* Storelib's own speed, from one page load in five, for /admin/performance (lib/perf). */}
        <PerfBeacon />
        {/* A picture that is not there any more is a grey box with a camera, never a broken icon with its alt text spilling out (lib/media/missing-image.ts). */}
        <MissingImageGuard />
        <NativeCookieKillSwitch />
        <CapacitorBounceGuard />
        {/* The buyer's pages bounce at their ends again, and the bounce shows the page's own ground rather than white behind a dark bar (lib/ui/elastic-overscroll.ts). */}
        <ElasticOverscroll />
        {/* And they land on the app's one landing rather than cutting to the new page (lib/ui/landing.ts). */}
        <NavLanding />
        <StuckLayerGuard />
        <KeyboardGuard />
        <RotationGuard />
        <AppHistoryTracker />
        {/* Inside the phone app only: Storelib links stay in the app, and the page is kept for the next start. */}
        <NativeLinkGuard />
        {/* Inside the phone app only: a storelib.com link the phone opened in the app goes to its page (lib/platform/app-links). */}
        <AppLinkOpener />
        {/* Inside Instagram's, WhatsApp's or another app's web view only: the page handed to the Storelib app, which neither a Universal Link nor an App Link can do from in there. */}
        <OpenInAppCard />
        <NativePlaceKeeper />
        {/* The strip under the clock, the browser's bar and the status bar's text in the page's own top colour; the launch screen down on the first steady frame. */}
        <NativeChrome />
        {/*
          NO EDGE SWIPE IN THE APP (the owner: "remove the edge to edge slide navigation from the iOS and Android app; keep it
          only in the browser, which has its own"). Safari and Chrome keep their own swipe; the app's shell has none of its own.
          components/platform/edge-swipe-back.tsx stays, unmounted, should it ever come back.
        */}
        <NativePushInit /> 
        {/* After an install or a reinstall the phone has forgotten: ask once, in our own words, before the phone's prompt. */}
        <NotificationsAsk />
        <AccessSheet />
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
