import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Plus_Jakarta_Sans, Space_Grotesk, DM_Sans, Poppins, Montserrat } from "next/font/google"
import "./globals.css"
import { LocaleProvider } from "@/components/locale-provider"
import { BuyerProtectionHost } from "@/components/marketplace/buyer-protection"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { ViewportVars } from "@/components/viewport-vars"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import { NativeCookieKillSwitch } from "@/components/native-cookie-killswitch"
import { SWRProvider } from "@/lib/swr-config"
import { PrefetchLinks } from "@/components/shared/prefetch-links"
import NativeOAuthBridge from "@/app/NativeOAuthBridge"
import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { RotationGuard } from "@/components/platform/rotation-guard"
import { NativePushInit } from "@/components/native-push-init"
import { CallHost } from "@/components/calls/call-host"

// Primary font — loaded eagerly with display swap for fast text rendering
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
})

// Secondary fonts — used only in OnePage theme system.
// preload: false defers network requests until the font is actually referenced
// in CSS, keeping initial page load fast. display: swap prevents FOIT.
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  preload: false,
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
})

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
})

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
  preload: false,
})

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
})

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
        url: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg",
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
    images: ["https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/89.jpg"],
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
  return (
    <html lang="ro" className="light" style={{ colorScheme: "light" }}>
      <head>
        {/* Synchronous native-app intercept — runs before React hydrates.
            1. Add the "capacitor" class to <html> immediately so all
               html.capacitor CSS rules (overscroll, touch-action, etc.) activate
               on the very first paint without waiting for NativeCookieKillSwitch.
            2. Legacy "/" redirect: the old shipped iOS app loads "/" — hide and
               redirect before any pixel paints.
            3. Feed view (grid | reels): resolved from localStorage BEFORE the
               first pixel, so the entry curtain is already the destination's
               colour. The server reads this from a cookie, but WKWebView drops
               JS-set cookies across app restarts — which is exactly why the app
               used to open on the grid and then jump to reels a second later.
               Re-writing the cookie here repairs it for every later request. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var _ua=navigator.userAgent||'';if((window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())||/StorelibApp|Capacitor/.test(_ua)){var h=document.documentElement;h.classList.add('capacitor');var _ow=window.open;window.open=function(u,t,f){if(u&&/stripe\\.com/.test(String(u)))return null;return _ow.apply(window,arguments)};}}catch(e){}try{var r=document.documentElement,vv=window.visualViewport;r.style.setProperty('--vv-h',Math.round(vv?vv.height:window.innerHeight)+'px');r.style.setProperty('--vv-top',Math.round(vv?vv.offsetTop:0)+'px')}catch(e){}try{var d=document.documentElement,v=localStorage.getItem('storelib_feed_view');if(v!=='reels'&&v!=='grid')v='grid';d.setAttribute('data-feed-view',v);d.style.setProperty('--feed-entry-bg',v==='reels'?'#000':'#fff');if(document.cookie.indexOf('storelib_feed_view='+v)<0){document.cookie='storelib_feed_view='+v+'; path=/; max-age=31536000; samesite=lax'}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${poppins.variable} ${montserrat.variable} font-sans antialiased bg-background text-foreground`}>
        {/* ONE call listener for the whole application.

            A call arrives while you are browsing listings, or reading a
            different conversation — so the thing that hears it cannot live in
            the conversation. And a call outlives the screen it was started
            from: every caller opens the listing they are calling about, and if
            the call belonged to that thread, navigating would hang up.

            It renders nothing at all until a phone rings. */}
        <CallHost>
          <SWRProvider><LocaleProvider>{children}</LocaleProvider></SWRProvider>
        </CallHost>
        {/* ONE buyer-protection subpage for the whole application.
            
            The shield beside a price is on every surface that shows one — the
            feed, the listing, the wishlist, the swipe cards — and a grid of
            sixty cards must not mount sixty subpages to serve one tap. They all
            open this. It renders nothing until one of them does. */}
        <BuyerProtectionHost />
        <PrefetchLinks />
        <BodyScrollRestorer />
        {/* One publisher of the visible viewport, at the root, so a route's
            loading skeleton and the screen that replaces it are sized from the
            same number. See components/viewport-vars.tsx. */}
        <ViewportVars />
        <NativeCookieKillSwitch />
        <CapacitorBounceGuard />
        <KeyboardGuard />
        <RotationGuard />
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
