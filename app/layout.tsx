import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Plus_Jakarta_Sans, Space_Grotesk, DM_Sans, Poppins, Montserrat } from "next/font/google"
import "./globals.css"
import { LocaleProvider } from "@/components/locale-provider"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import { NativeCookieKillSwitch } from "@/components/native-cookie-killswitch"
import { SWRProvider } from "@/lib/swr-config"
import { PrefetchLinks } from "@/components/shared/prefetch-links"
import NativeOAuthBridge from "@/app/NativeOAuthBridge"
import { NativeStartupRouter } from "@/components/native-startup-router"
import { NativeAuthHandler } from "@/components/native-auth-handler"

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
  icons: {
    icon: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg",
    apple: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg",
  },
  metadataBase: new URL("https://storelib.com"),
}

export const viewport: Viewport = {
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
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }}>
      <body className={`${inter.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${poppins.variable} ${montserrat.variable} font-sans antialiased bg-background text-foreground`}>
        {/* Native app loading screen — hidden on web, shown instantly in Capacitor iOS via sync UA check */}
        <div id="native-loading-screen" style={{position:"fixed",inset:0,background:"#f2f2f2",display:"none",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px",zIndex:99999}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/5135%20(1).svg?width=80&quality=80" width="40" height="40" alt="" />
          <div style={{width:"24px",height:"24px",border:"2.5px solid #e0e0e0",borderTopColor:"#7c3aed",borderRadius:"50%",animation:"nlsSpin .7s linear infinite"}} />
          <style>{`@keyframes nlsSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
        {/* Sync script: runs before first paint — shows overlay only in Capacitor iOS, hides on load */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){if(navigator.userAgent.indexOf('StorelibCapacitor')!==-1){var e=document.getElementById('native-loading-screen');if(e)e.style.display='flex';}function h(){var e=document.getElementById('native-loading-screen');if(e){e.style.transition='opacity 0.2s';e.style.opacity='0';setTimeout(function(){e.remove();},200);}}if(document.readyState==='complete')h();else window.addEventListener('load',h);})();` }} />
        <SWRProvider><LocaleProvider>{children}</LocaleProvider></SWRProvider>
        <PrefetchLinks />
        <BodyScrollRestorer />
        <NativeCookieKillSwitch />
        <CookieConsentBanner />
        <NativeStartupRouter />
        <NativeAuthHandler />
        <NativeOAuthBridge />
      </body>
    </html>
  )
}
